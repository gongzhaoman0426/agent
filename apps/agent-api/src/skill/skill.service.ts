import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis';
import { CreateSkillDto, UpdateSkillDto, SkillReference, SkillScript } from './skill.type';
import { executeInSandbox } from './script-sandbox';

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(userId: string) {
    return this.redis.getOrSet(
      `user:${userId}:skills`,
      async () => {
        // 查询系统级技能 + 用户自建技能
        return this.prisma.skill.findMany({
          where: {
            deleted: false,
            OR: [
              { type: 'SYSTEM' },
              { createdById: userId },
            ],
          },
          orderBy: [
            { type: 'asc' }, // SYSTEM 在前
            { createdAt: 'desc' },
          ],
        });
      },
      300,
    );
  }

  async findOne(id: string, userId?: string) {
    const skill = await this.redis.getOrSet(
      `skill:${id}:full`,
      () => this.prisma.skill.findUnique({
        where: { id, deleted: false },
      }),
      3600,
    );

    if (!skill) {
      throw new NotFoundException(`Skill with ID ${id} not found`);
    }

    // 验证权限：系统技能所有人可见，用户技能只能创建者可见
    if (userId && skill.type === 'USER' && skill.createdById !== userId) {
      throw new ForbiddenException('无权访问此技能');
    }

    return skill;
  }

  async findByName(name: string, userId: string) {
    // 优先查找用户自建技能，回退到系统技能
    const userSkill = await this.prisma.skill.findFirst({
      where: {
        name,
        createdById: userId,
        deleted: false,
      },
    });

    if (userSkill) return userSkill;

    const systemSkill = await this.prisma.skill.findFirst({
      where: {
        name,
        type: 'SYSTEM',
        deleted: false,
      },
    });

    if (!systemSkill) {
      throw new NotFoundException(`Skill "${name}" not found`);
    }

    return systemSkill;
  }

  async create(createSkillDto: CreateSkillDto, userId: string) {
    // 检查名称冲突（同一用户下技能名唯一）
    const existing = await this.prisma.skill.findFirst({
      where: {
        name: createSkillDto.name,
        createdById: userId,
        deleted: false,
      },
    });

    if (existing) {
      throw new BadRequestException(`技能名称 "${createSkillDto.name}" 已存在`);
    }

    const skill = await this.prisma.skill.create({
      data: {
        name: createSkillDto.name,
        description: createSkillDto.description,
        content: createSkillDto.content,
        references: (createSkillDto.references || []) as any,
        scripts: (createSkillDto.scripts || []) as any,
        createdById: userId,
        type: 'USER',
      },
    });

    // 失效缓存
    await this.redis.del(`user:${userId}:skills`);

    return skill;
  }

  async update(id: string, updateSkillDto: UpdateSkillDto, userId: string) {
    const skill = await this.findOne(id, userId);

    // 只能更新自己创建的技能
    if (skill.createdById !== userId) {
      throw new ForbiddenException('只能修改自己创建的技能');
    }

    // 如果修改名称，检查冲突
    if (updateSkillDto.name && updateSkillDto.name !== skill.name) {
      const existing = await this.prisma.skill.findFirst({
        where: {
          name: updateSkillDto.name,
          createdById: userId,
          deleted: false,
          id: { not: id },
        },
      });

      if (existing) {
        throw new BadRequestException(`技能名称 "${updateSkillDto.name}" 已存在`);
      }
    }

    const updated = await this.prisma.skill.update({
      where: { id },
      data: {
        name: updateSkillDto.name,
        description: updateSkillDto.description,
        content: updateSkillDto.content,
        references: updateSkillDto.references as any,
        scripts: updateSkillDto.scripts as any,
      },
    });

    // 失效缓存
    await this.redis.del(`skill:${id}:full`, `user:${userId}:skills`);
    await this.redis.delByPattern(`agent:*:skill-summaries`);

    return updated;
  }

  async remove(id: string, userId: string) {
    const skill = await this.findOne(id, userId);

    if (skill.createdById !== userId) {
      throw new ForbiddenException('只能删除自己创建的技能');
    }

    await this.prisma.skill.update({
      where: { id },
      data: { deleted: true },
    });

    // 失效缓存
    await this.redis.del(`skill:${id}:full`, `user:${userId}:skills`);
    await this.redis.delByPattern(`agent:*:skill-summaries`);

    return { success: true };
  }

  // ========== Agent 技能关联 ==========

  async getAgentSkills(agentId: string, userId: string) {
    return this.prisma.agentSkill.findMany({
      where: { agentId },
      include: {
        skill: true,
      },
    });
  }

  async getAgentSkillSummaries(agentId: string, userId: string): Promise<Array<{ name: string; description: string }>> {
    return this.redis.getOrSet(
      `agent:${agentId}:skill-summaries`,
      async () => {
        const agentSkills = await this.prisma.agentSkill.findMany({
          where: { agentId },
          include: {
            skill: true,
          },
        });

        return agentSkills
          .filter(as => as.skill && !as.skill.deleted) // 过滤已删除的技能
          .map(as => ({
            name: as.skill.name,
            description: as.skill.description,
          }));
      },
      300,
    );
  }

  async assignSkillsToAgent(agentId: string, skillIds: string[], userId: string) {
    // 验证所有技能存在且用户有权限访问
    for (const skillId of skillIds) {
      await this.findOne(skillId, userId);
    }

    // 删除现有关联
    await this.prisma.agentSkill.deleteMany({
      where: { agentId },
    });

    // 创建新关联
    if (skillIds.length > 0) {
      await this.prisma.agentSkill.createMany({
        data: skillIds.map(skillId => ({
          agentId,
          skillId,
        })),
        skipDuplicates: true,
      });
    }

    // 失效缓存
    await this.redis.del(`agent:${agentId}:skill-summaries`, `agent:${agentId}:full`);

    return { success: true };
  }

  async removeSkillFromAgent(agentId: string, skillId: string) {
    await this.prisma.agentSkill.deleteMany({
      where: { agentId, skillId },
    });

    await this.redis.del(`agent:${agentId}:skill-summaries`, `agent:${agentId}:full`);

    return { success: true };
  }

  // ========== 技能激活（完整内容 + 引用解析 + 脚本执行）==========

  async activateSkill(
    name: string,
    userId: string,
    runScripts: boolean = false,
    scriptInput: string = '',
  ): Promise<string> {
    const skill = await this.findByName(name, userId);

    const parts: string[] = [];
    parts.push(`# ${skill.name}\n\n${skill.content}`);

    // 解析引用
    if (skill.references && Array.isArray(skill.references) && skill.references.length > 0) {
      parts.push('\n\n---\n## 参考资料\n');
      const references = skill.references as unknown as SkillReference[];
      for (const ref of references) {
        const resolvedContent = await this.resolveReference(ref, userId);
        parts.push(`\n### ${ref.label || ref.uri}\n${resolvedContent}`);
      }
    }

    // 执行脚本
    if (runScripts && skill.scripts && Array.isArray(skill.scripts) && skill.scripts.length > 0) {
      parts.push('\n\n---\n## 脚本执行结果\n');
      const scripts = skill.scripts as unknown as SkillScript[];
      for (const script of scripts) {
        const result = executeInSandbox(script.code, scriptInput, script.timeout || 5000);
        parts.push(`\n### ${script.name}\n`);
        if (result.error) {
          parts.push(`错误: ${result.error}`);
        } else {
          parts.push(`结果: ${JSON.stringify(result.result)}`);
          if (result.logs.length > 0) {
            parts.push(`\n日志:\n${result.logs.join('\n')}`);
          }
        }
      }
    }

    return parts.join('');
  }

  private async resolveReference(ref: SkillReference, userId: string): Promise<string> {
    try {
      switch (ref.type) {
        case 'text':
          return ref.uri;

        case 'skill': {
          const referencedSkill = await this.findByName(ref.uri, userId);
          return referencedSkill.content;
        }

        case 'url': {
          // 简单的 URL 获取，带超时和大小限制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            const response = await fetch(ref.uri, {
              signal: controller.signal,
              headers: { 'User-Agent': 'SkillBot/1.0' },
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              return `[无法获取 URL 内容: HTTP ${response.status}]`;
            }

            const text = await response.text();
            // 限制大小 100KB
            return text.length > 100000 ? text.slice(0, 100000) + '\n...(内容过长已截断)' : text;
          } catch (error) {
            clearTimeout(timeoutId);
            return `[获取 URL 失败: ${error instanceof Error ? error.message : String(error)}]`;
          }
        }

        default:
          return '[未知引用类型]';
      }
    } catch (error) {
      this.logger.warn(`Failed to resolve reference: ${ref.type}:${ref.uri}`, error);
      return `[引用解析失败: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }
}
