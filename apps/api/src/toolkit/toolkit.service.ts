import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type { ToolsInput } from '@mastra/core/agent';
import type { Prisma } from '@prisma/client';
import { McpServerService } from '../mcp/mcp-server.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolkitDiscoveryService } from './toolkit-discovery.service.js';
import type {
  SettingField,
  ToolkitDefinition,
  ToolkitSettings,
} from './toolkit.types.js';

@Injectable()
export class ToolkitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: ToolkitDiscoveryService,
    @Inject(forwardRef(() => McpServerService))
    private readonly mcpServers: McpServerService,
  ) {}

  async list() {
    return this.prisma.toolkit.findMany({
      where: { deleted: false },
      include: { tools: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 列表附带 settingsReady；代码 Toolkit 全员可见，
   * mcp_* 仅当前用户自己的连接可见。
   */
  async listForUser(userId: string) {
    const [toolkits, settingsMap, ownedMcpIds, mcpReady] = await Promise.all([
      this.list(),
      this.getSettingsMap(userId),
      this.mcpServers.listOwnedToolkitIds(userId),
      this.mcpServers.getReadyMap(userId),
    ]);

    return toolkits
      .filter((toolkit) => {
        if (!toolkit.id.startsWith('mcp_')) return true;
        return ownedMcpIds.has(toolkit.id);
      })
      .map((toolkit) => {
        if (toolkit.id.startsWith('mcp_')) {
          const state = mcpReady[toolkit.id];
          return {
            ...toolkit,
            settingsReady: state?.ready ?? false,
            source: 'mcp' as const,
            mcpError: state?.lastError ?? null,
          };
        }
        return {
          ...toolkit,
          settingsReady: this.isSettingsReady(
            toolkit.settingsFields,
            settingsMap[toolkit.id] as ToolkitSettings | undefined,
          ),
          source: 'code' as const,
          mcpError: null as string | null,
        };
      });
  }

  /**
   * 挂载前校验：必填 settings 须配齐；mcp_* 须属当前用户且同步成功。
   */
  async assertToolkitsConfigured(userId: string, toolkitIds: string[]) {
    if (toolkitIds.length === 0) return;

    await this.mcpServers.assertMcpToolkitsReady(userId, toolkitIds);

    const nonMcpIds = toolkitIds.filter((id) => !id.startsWith('mcp_'));
    if (nonMcpIds.length === 0) return;

    const toolkits = await this.prisma.toolkit.findMany({
      where: { id: { in: nonMcpIds }, deleted: false },
      select: { id: true, name: true, settingsFields: true },
    });
    const byId = new Map(toolkits.map((item) => [item.id, item]));
    const settingsMap = await this.getSettingsMap(userId);
    const blocked: string[] = [];

    for (const toolkitId of nonMcpIds) {
      const toolkit = byId.get(toolkitId);
      if (!toolkit) {
        throw new BadRequestException(`工具包不存在: ${toolkitId}`);
      }
      if (
        !this.isSettingsReady(
          toolkit.settingsFields,
          settingsMap[toolkitId] as ToolkitSettings | undefined,
        )
      ) {
        blocked.push(toolkit.name);
      }
    }

    if (blocked.length > 0) {
      throw new BadRequestException(
        `请先在「插件工具」页完成配置再挂载：${blocked.join('、')}`,
      );
    }
  }

  /** 无必填配置项 → 视为就绪；有必填则每一项都要有非空值 */
  isSettingsReady(
    settingsFields: unknown,
    settings: ToolkitSettings | undefined,
  ): boolean {
    const fields = this.parseSettingFields(settingsFields);
    const required = fields.filter((field) => field.required);
    if (required.length === 0) return true;
    const values = settings ?? {};
    return required.every((field) => Boolean(values[field.key]?.trim()));
  }

  private parseSettingFields(raw: unknown): SettingField[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is SettingField =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as SettingField).key === 'string' &&
        typeof (item as SettingField).label === 'string',
    );
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
