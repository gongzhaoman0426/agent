import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ToolsInput } from '@mastra/core/agent';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolkitDiscoveryService } from './toolkit-discovery.service.js';
import type { ToolkitDefinition, ToolkitSettings } from './toolkit.types.js';

@Injectable()
export class ToolkitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: ToolkitDiscoveryService,
  ) {}

  async list() {
    return this.prisma.toolkit.findMany({
      where: { deleted: false },
      include: { tools: true },
      orderBy: { id: 'asc' },
    });
  }

  /** 合并多个 toolkit 的工具，供 AgentRegistry 构建 Agent 实例 */
  getToolsInput(toolkitIds: string[]): ToolsInput {
    const merged: ToolsInput = {};
    for (const toolkitId of toolkitIds) {
      const toolkit = this.discovery.getToolkit(toolkitId);
      if (!toolkit) continue;
      Object.assign(merged, toolkit.tools);
    }
    return merged;
  }

  async getUserSettings(userId: string, toolkitId: string) {
    const record = await this.prisma.userToolkitSettings.findUnique({
      where: { userId_toolkitId: { userId, toolkitId } },
    });
    return record?.settings ?? {};
  }

  async updateUserSettings(
    userId: string,
    toolkitId: string,
    settings: Record<string, unknown>,
  ) {
    const toolkit = this.discovery.getToolkit(toolkitId);
    if (!toolkit) {
      throw new NotFoundException(`Toolkit 不存在: ${toolkitId}`);
    }

    const normalized = this.normalizeSettings(toolkit, settings);

    return this.prisma.userToolkitSettings.upsert({
      where: { userId_toolkitId: { userId, toolkitId } },
      create: { userId, toolkitId, settings: normalized },
      update: { settings: normalized },
    });
  }

  /** 只保留声明过的字段、统一转成字符串，并校验必填项 */
  private normalizeSettings(
    toolkit: ToolkitDefinition,
    settings: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const fields = toolkit.settingsFields ?? [];
    if (fields.length === 0) {
      return {};
    }

    const normalized: ToolkitSettings = {};
    const missing: string[] = [];
    for (const field of fields) {
      const raw = settings[field.key];
      const value = raw === undefined || raw === null ? '' : String(raw).trim();
      if (field.required && !value) {
        missing.push(field.label);
        continue;
      }
      if (value) {
        normalized[field.key] = value;
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(`请填写必填项: ${missing.join('、')}`);
    }
    return normalized;
  }

  /** 一次性取用户所有 toolkit 配置，对话时放进 requestContext */
  async getSettingsMap(userId: string): Promise<Record<string, unknown>> {
    const records = await this.prisma.userToolkitSettings.findMany({
      where: { userId },
    });
    const map: Record<string, unknown> = {};
    for (const record of records) {
      map[record.toolkitId] = record.settings;
    }
    return map;
  }
}
