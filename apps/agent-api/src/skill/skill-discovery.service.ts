import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service';
import { BaseSkill } from './base-skill';
import { SKILL_ID_KEY } from './skill.decorator';

@Injectable()
export class SkillDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(SkillDiscoveryService.name);
  private readonly skills = new Map<string, BaseSkill>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.discoverAndSyncSkills();
  }

  private async discoverAndSyncSkills() {
    this.logger.log('Starting skill discovery and synchronization');
    this.discoverSkills();
    await this.syncSkillsToDatabase();
    await this.cleanupObsoleteSkills();
    this.logger.log('Skill discovery and synchronization completed');
  }

  private discoverSkills() {
    const names = new Set<string>();

    for (const wrapper of this.discoveryService.getProviders()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !(instance instanceof BaseSkill)) continue;

      const skillId = this.reflector.get(SKILL_ID_KEY, metatype);
      if (!skillId) continue;
      if (this.skills.has(skillId)) {
        throw new Error(`Skill with ID ${skillId} is already registered.`);
      }
      if (names.has(instance.name)) {
        throw new Error(`Skill with name "${instance.name}" is already registered.`);
      }

      this.skills.set(skillId, instance);
      names.add(instance.name);
      this.logger.log(`Discovered code-defined skill: ${skillId}`);
    }
  }

  private async syncSkillsToDatabase() {
    for (const [skillId, skill] of this.skills) {
      const existing = await this.prisma.skill.findUnique({
        where: { id: skillId },
      });

      if (existing && existing.deleted) {
        this.logger.log(`Reactivating previously deleted code skill: ${skillId}`);
      }

      await this.prisma.skill.upsert({
        where: { id: skillId },
        update: {
          name: skill.name,
          description: skill.description,
          content: skill.content,
          references: skill.references as any,
          scripts: skill.scripts as any,
          type: 'SYSTEM',
          createdById: null,
          deleted: false,
          updatedAt: new Date(),
        },
        create: {
          id: skillId,
          name: skill.name,
          description: skill.description,
          content: skill.content,
          references: skill.references as any,
          scripts: skill.scripts as any,
          type: 'SYSTEM',
          createdById: null,
        },
      });

      this.logger.log(`Synced code skill to database: ${skillId}`);
    }
  }

  private async cleanupObsoleteSkills() {
    const codeSkillIds = Array.from(this.skills.keys());
    const obsoleteSkills = await this.prisma.skill.findMany({
      where: {
        deleted: false,
        ...(codeSkillIds.length > 0 ? { id: { notIn: codeSkillIds } } : {}),
      },
      select: { id: true, name: true },
    });

    if (obsoleteSkills.length === 0) return;

    const obsoleteSkillIds = obsoleteSkills.map((skill) => skill.id);

    await this.prisma.agentSkill.deleteMany({
      where: { skillId: { in: obsoleteSkillIds } },
    });
    await this.prisma.skill.updateMany({
      where: { id: { in: obsoleteSkillIds } },
      data: { deleted: true },
    });

    this.logger.warn(
      `Marked obsolete DB skills as deleted: ${obsoleteSkills.map((skill) => skill.name).join(', ')}`,
    );
  }
}
