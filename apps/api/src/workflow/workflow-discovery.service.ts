import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { WORKFLOW_ID_KEY } from './workflow.decorator.js';
import type { WorkflowProvider } from './workflow.types.js';

/**
 * 启动时扫描所有带 @workflowId 的 Provider，
 * 同步元数据（id/name/description/inputSchema）到数据库供前端展示与挂载，
 * 工作流本体始终以代码为准。
 */
@Injectable()
export class WorkflowDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowDiscoveryService.name);
  private readonly registry = new Map<string, WorkflowProvider>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.discoverWorkflows();
    await this.syncToDatabase();
  }

  getProvider(id: string): WorkflowProvider | undefined {
    return this.registry.get(id);
  }

  getAllProviders(): Map<string, WorkflowProvider> {
    return this.registry;
  }

  private discoverWorkflows() {
    for (const wrapper of this.discoveryService.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const id = this.reflector.get<string>(WORKFLOW_ID_KEY, metatype);
      if (!id) continue;

      this.registry.set(id, instance as WorkflowProvider);
      this.logger.log(`发现工作流: ${id}`);
    }
  }

  private async syncToDatabase() {
    for (const [id, provider] of this.registry) {
      let inputSchema: Prisma.InputJsonValue | undefined;
      try {
        inputSchema = z.toJSONSchema(
          provider.inputSchema,
        ) as Prisma.InputJsonValue;
      } catch (error) {
        this.logger.warn(`工作流 ${id} inputSchema 转换失败: ${String(error)}`);
      }

      await this.prisma.workflow.upsert({
        where: { id },
        create: {
          id,
          name: provider.name,
          description: provider.description,
          inputSchema: inputSchema ?? undefined,
        },
        update: {
          name: provider.name,
          description: provider.description,
          inputSchema: inputSchema ?? Prisma.DbNull,
          deleted: false,
        },
      });
    }

    const codeIds = [...this.registry.keys()];
    const obsolete = await this.prisma.workflow.updateMany({
      where: { id: { notIn: codeIds }, deleted: false },
      data: { deleted: true },
    });
    if (obsolete.count > 0) {
      this.logger.log(`软删除 ${obsolete.count} 个已移除的工作流`);
    }

    this.logger.log(`工作流同步完成，共 ${this.registry.size} 个`);
  }
}
