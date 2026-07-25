import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { TOOLKIT_ID_KEY } from './toolkit.decorator.js';
import type { ToolkitDefinition } from './toolkit.types.js';

/**
 * 启动时扫描所有带 @toolkitId 的 Provider，
 * 将 Toolkit / Tool 元数据同步到数据库（仅注册表，供前端展示与挂载），
 * 代码中已移除的 toolkit 做软删除。
 */
@Injectable()
export class ToolkitDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(ToolkitDiscoveryService.name);
  private readonly registry = new Map<string, ToolkitDefinition>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.discoverToolkits();
    await this.syncToDatabase();
  }

  getToolkit(id: string): ToolkitDefinition | undefined {
    return this.registry.get(id);
  }

  getAllToolkits(): Map<string, ToolkitDefinition> {
    return this.registry;
  }

  private discoverToolkits() {
    for (const wrapper of this.discoveryService.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const id = this.reflector.get<string>(TOOLKIT_ID_KEY, metatype);
      if (!id) continue;

      this.registry.set(id, instance as ToolkitDefinition);
      this.logger.log(`发现 Toolkit: ${id}`);
    }
  }

  private async syncToDatabase() {
    for (const [id, toolkit] of this.registry) {
      const settingsFields = toolkit.settingsFields?.length
        ? (toolkit.settingsFields as unknown as Prisma.InputJsonValue)
        : undefined;

      await this.prisma.toolkit.upsert({
        where: { id },
        create: {
          id,
          name: toolkit.name,
          description: toolkit.description,
          settingsFields: settingsFields ?? undefined,
        },
        update: {
          name: toolkit.name,
          description: toolkit.description,
          settingsFields: settingsFields ?? Prisma.DbNull,
          deleted: false,
        },
      });

      const toolNames = Object.keys(toolkit.tools);
      for (const toolName of toolNames) {
        const tool = toolkit.tools[toolName] as {
          description?: string;
          inputSchema?: z.ZodType;
        };
        await this.prisma.tool.upsert({
          where: { name: toolName },
          create: {
            name: toolName,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema
              ? this.toJsonSchema(tool.inputSchema)
              : undefined,
            toolkitId: id,
          },
          update: {
            description: tool.description ?? '',
            inputSchema: tool.inputSchema
              ? (this.toJsonSchema(tool.inputSchema) ?? Prisma.DbNull)
              : Prisma.DbNull,
            toolkitId: id,
          },
        });
      }

      // 清理该 toolkit 下已移除的工具
      await this.prisma.tool.deleteMany({
        where: { toolkitId: id, name: { notIn: toolNames } },
      });
    }

    // 软删除代码中已不存在的 toolkit
    const codeIds = [...this.registry.keys()];
    const obsolete = await this.prisma.toolkit.updateMany({
      where: { id: { notIn: codeIds }, deleted: false },
      data: { deleted: true },
    });
    if (obsolete.count > 0) {
      this.logger.log(`软删除 ${obsolete.count} 个已移除的 toolkit`);
    }

    this.logger.log(`Toolkit 同步完成，共 ${this.registry.size} 个`);
  }

  private toJsonSchema(schema: z.ZodType): Prisma.InputJsonValue | undefined {
    try {
      return z.toJSONSchema(schema) as Prisma.InputJsonValue;
    } catch (error) {
      this.logger.warn(`zod schema 转 JSON Schema 失败: ${String(error)}`);
      return undefined;
    }
  }
}
