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
  type CreateAgentDto,
  type UpdateAgentDto,
} from './agent.types.js';

const agentInclude = {
  agentToolkits: { include: { toolkit: true } },
  agentWorkflows: { include: { workflow: true } },
  agentSkills: true,
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

    await this.replaceMounts(agent.id, dto);
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

    await this.replaceMounts(agentId, dto);
    this.registry.invalidate(agentId);
    return this.findOwned(agentId, userId);
  }

  async remove(agentId: string, userId: string) {
    await this.findOwned(agentId, userId);
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { deleted: true },
    });
    this.registry.invalidate(agentId);
    return { success: true };
  }

  private async replaceMounts(agentId: string, dto: UpdateAgentDto) {
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
    });
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
