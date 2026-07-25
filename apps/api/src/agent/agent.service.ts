import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentRegistryService } from './agent-registry.service.js';
import {
  createAgentSchema,
  updateAgentSchema,
  type UpdateAgentDto,
} from './agent.types.js';

const agentInclude = {
  agentToolkits: { include: { toolkit: true } },
  agentWorkflows: { include: { workflow: true } },
  agentSkills: true,
  subAgents: {
    include: {
      child: { select: { id: true, name: true, description: true } },
    },
  },
} as const;

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AgentRegistryService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.agent.findMany({
      where: { createdById: userId, deleted: false },
      include: agentInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOwned(agentId: string, userId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deleted: false },
      include: agentInclude,
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    if (agent.createdById !== userId) {
      throw new ForbiddenException('无权访问该 Agent');
    }
    return agent;
  }

  async create(raw: unknown, userId: string) {
    const dto = this.parse(createAgentSchema, raw);

    const agent = await this.prisma.agent.create({
      data: {
        name: dto.name,
        description: dto.description,
        prompt: dto.prompt,
        model: dto.model,
        createdById: userId,
      },
    });

    await this.replaceMounts(agent.id, dto, userId);
    return this.findOwned(agent.id, userId);
  }

  async update(agentId: string, raw: unknown, userId: string) {
    await this.findOwned(agentId, userId);
    const dto = this.parse(updateAgentSchema, raw);

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.prompt !== undefined && { prompt: dto.prompt }),
        ...(dto.model !== undefined && { model: dto.model }),
        // 挂载关系变化也要刷新 updatedAt，用于 AgentRegistry 缓存失效
        updatedAt: new Date(),
      },
    });

    await this.replaceMounts(agentId, dto, userId);
    await this.invalidateWithAncestors(agentId);
    return this.findOwned(agentId, userId);
  }

  async remove(agentId: string, userId: string) {
    await this.findOwned(agentId, userId);
    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agentId },
        data: { deleted: true },
      }),
      // 软删后同步解除互挂关系
      this.prisma.agentSubAgent.deleteMany({
        where: { OR: [{ parentId: agentId }, { childId: agentId }] },
      }),
    ]);
    await this.invalidateWithAncestors(agentId);
    return { success: true };
  }

  private async replaceMounts(
    agentId: string,
    dto: UpdateAgentDto,
    userId: string,
  ) {
    if (dto.subAgentIds !== undefined) {
      await this.validateSubAgents(agentId, dto.subAgentIds, userId);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.toolkitIds !== undefined) {
        await tx.agentToolkit.deleteMany({ where: { agentId } });
        if (dto.toolkitIds.length > 0) {
          await tx.agentToolkit.createMany({
            data: dto.toolkitIds.map((toolkitId) => ({ agentId, toolkitId })),
          });
        }
      }

      if (dto.workflowIds !== undefined) {
        await tx.agentWorkflow.deleteMany({ where: { agentId } });
        if (dto.workflowIds.length > 0) {
          await tx.agentWorkflow.createMany({
            data: dto.workflowIds.map((workflowId) => ({
              agentId,
              workflowId,
            })),
          });
        }
      }

      if (dto.skillNames !== undefined) {
        await tx.agentSkill.deleteMany({ where: { agentId } });
        if (dto.skillNames.length > 0) {
          await tx.agentSkill.createMany({
            data: dto.skillNames.map((skillName) => ({ agentId, skillName })),
          });
        }
      }

      if (dto.subAgentIds !== undefined) {
        await tx.agentSubAgent.deleteMany({ where: { parentId: agentId } });
        if (dto.subAgentIds.length > 0) {
          await tx.agentSubAgent.createMany({
            data: dto.subAgentIds.map((childId) => ({
              parentId: agentId,
              childId,
            })),
          });
        }
      }
    });
  }

  /** 子智能体校验：归属本人、不可自挂、不可成环 */
  private async validateSubAgents(
    agentId: string,
    subAgentIds: string[],
    userId: string,
  ) {
    if (subAgentIds.length === 0) {
      return;
    }
    if (subAgentIds.includes(agentId)) {
      throw new BadRequestException('智能体不能挂载自己');
    }

    const children = await this.prisma.agent.findMany({
      where: { id: { in: subAgentIds }, deleted: false },
      select: { id: true, name: true, createdById: true },
    });
    const found = new Map(children.map((child) => [child.id, child]));
    for (const id of subAgentIds) {
      const child = found.get(id);
      if (!child) {
        throw new BadRequestException(`子智能体不存在: ${id}`);
      }
      if (child.createdById !== userId) {
        throw new ForbiddenException(`无权挂载智能体: ${child.name}`);
      }
    }

    // 环检测：从每个候选子节点沿「挂载」边下探，不允许回到本智能体
    const queue = [...subAgentIds];
    const visited = new Set<string>(subAgentIds);
    while (queue.length > 0) {
      const batch = queue.splice(0, queue.length);
      const edges = await this.prisma.agentSubAgent.findMany({
        where: { parentId: { in: batch } },
        select: { childId: true, parent: { select: { name: true } } },
      });
      for (const edge of edges) {
        if (edge.childId === agentId) {
          throw new BadRequestException(
            `挂载会形成循环调用（经由「${edge.parent.name}」），已阻止`,
          );
        }
        if (!visited.has(edge.childId)) {
          visited.add(edge.childId);
          queue.push(edge.childId);
        }
      }
    }
  }

  /** 配置变更后，本体与所有（间接）挂载了它的父级实例缓存都要失效 */
  private async invalidateWithAncestors(agentId: string) {
    const visited = new Set<string>([agentId]);
    let frontier = [agentId];
    while (frontier.length > 0) {
      const edges = await this.prisma.agentSubAgent.findMany({
        where: { childId: { in: frontier } },
        select: { parentId: true },
      });
      frontier = edges
        .map((edge) => edge.parentId)
        .filter((id) => !visited.has(id));
      for (const id of frontier) {
        visited.add(id);
      }
    }
    for (const id of visited) {
      this.registry.invalidate(id);
    }
  }

  private parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
    const result = schema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`参数校验失败: ${detail}`);
    }
    return result.data as z.infer<T>;
  }
}
