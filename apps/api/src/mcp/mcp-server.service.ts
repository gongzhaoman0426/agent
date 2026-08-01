import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import type { ToolsInput } from '@mastra/core/agent';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MinimalMcpClient,
  MinimalMcpError,
  type MinimalMcpTool,
} from './minimal-mcp.client.js';

const NAME_PATTERN = /^[\u4e00-\u9fa5a-zA-Z0-9][\u4e00-\u9fa5a-zA-Z0-9 _-]{0,63}$/;

function slugifyName(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return ascii || 'mcp';
}

function normalizeMcpUrl(raw: string): string {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new BadRequestException('URL 必须以 http:// 或 https:// 开头');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new BadRequestException('URL 格式无效');
  }
  return url.replace(/\/$/, '');
}

function dbToolName(toolkitId: string, original: string): string {
  const short = toolkitId.replace(/^mcp_/, '').slice(0, 12);
  return `mcp_${short}__${original}`;
}

function agentToolKey(slug: string, original: string): string {
  return `${slug}_${original}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const servers = await this.prisma.userMcpServer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (servers.length === 0) return [];

    const toolkits = await this.prisma.toolkit.findMany({
      where: { id: { in: servers.map((item) => item.toolkitId) } },
      include: { tools: true },
    });
    const toolkitMap = new Map(toolkits.map((item) => [item.id, item]));

    return servers.map((server) => {
      const toolkit = toolkitMap.get(server.toolkitId);
      return {
        ...server,
        ready: Boolean(server.lastSyncAt) && !server.lastError,
        tools: (toolkit?.tools ?? []).map((tool) => ({
          id: tool.id,
          name: tool.name.includes('__')
            ? tool.name.slice(tool.name.indexOf('__') + 2)
            : tool.name,
          description: tool.description,
        })),
      };
    });
  }

  async probe(url: string) {
    const client = new MinimalMcpClient(normalizeMcpUrl(url));
    await client.initialize();
    const tools = await client.listTools();
    return {
      ok: true,
      toolCount: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
      })),
    };
  }

  async create(userId: string, input: { name: string; url: string }) {
    const name = input.name.trim();
    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        '名称需为 1–64 字符，支持中英文、数字、空格、中划线、下划线',
      );
    }
    const url = normalizeMcpUrl(input.url);
    const toolkitId = `mcp_${randomBytes(12).toString('hex')}`;

    let tools: MinimalMcpTool[];
    try {
      const client = new MinimalMcpClient(url);
      await client.initialize();
      tools = await client.listTools();
    } catch (error) {
      throw new BadRequestException(this.formatError(error));
    }

    if (tools.length === 0) {
      throw new BadRequestException('MCP 未返回任何工具');
    }

    await this.syncToolkitRows({
      toolkitId,
      name,
      url,
      tools,
    });

    const record = await this.prisma.userMcpServer.create({
      data: {
        userId,
        name,
        url,
        toolkitId,
        toolCount: tools.length,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });

    this.logger.log(
      `MCP 已添加: ${name} toolkit=${toolkitId} tools=${tools.length}`,
    );
    return record;
  }

  async refresh(userId: string, id: string) {
    const server = await this.requireOwned(userId, id);
    try {
      const client = new MinimalMcpClient(server.url);
      await client.initialize();
      const tools = await client.listTools();
      if (tools.length === 0) {
        throw new BadRequestException('MCP 未返回任何工具');
      }
      await this.syncToolkitRows({
        toolkitId: server.toolkitId,
        name: server.name,
        url: server.url,
        tools,
      });
      await this.touchMountedAgents(server.toolkitId);
      return this.prisma.userMcpServer.update({
        where: { id: server.id },
        data: {
          toolCount: tools.length,
          lastSyncAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = this.formatError(error);
      await this.prisma.userMcpServer.update({
        where: { id: server.id },
        data: { lastError: message },
      });
      throw new BadRequestException(message);
    }
  }

  async remove(userId: string, id: string) {
    const server = await this.requireOwned(userId, id);
    await this.prisma.$transaction([
      this.prisma.agentToolkit.deleteMany({
        where: { toolkitId: server.toolkitId },
      }),
      this.prisma.userToolkitSettings.deleteMany({
        where: { toolkitId: server.toolkitId },
      }),
      this.prisma.tool.deleteMany({ where: { toolkitId: server.toolkitId } }),
      this.prisma.toolkit.deleteMany({ where: { id: server.toolkitId } }),
      this.prisma.userMcpServer.delete({ where: { id: server.id } }),
    ]);
    return { success: true };
  }

  /** 供 AgentRegistry：把已挂载的 mcp_* toolkit 转成可执行 Mastra tools */
  async getToolsInputForAgent(
    userId: string,
    toolkitIds: string[],
  ): Promise<ToolsInput> {
    const mcpIds = toolkitIds.filter((id) => id.startsWith('mcp_'));
    if (mcpIds.length === 0 || !userId) return {};

    const servers = await this.prisma.userMcpServer.findMany({
      where: { userId, toolkitId: { in: mcpIds } },
    });
    if (servers.length === 0) return {};

    const toolRows = await this.prisma.tool.findMany({
      where: { toolkitId: { in: servers.map((item) => item.toolkitId) } },
    });

    const serverByToolkit = new Map(
      servers.map((item) => [item.toolkitId, item]),
    );
    const merged: ToolsInput = {};

    for (const row of toolRows) {
      const server = serverByToolkit.get(row.toolkitId);
      if (!server) continue;

      const originalName = row.name.includes('__')
        ? row.name.slice(row.name.indexOf('__') + 2)
        : row.name;
      const slug = slugifyName(server.name);
      const key = agentToolKey(slug, originalName);
      const url = server.url;

      merged[key] = createTool({
        id: key,
        description:
          row.description ||
          `MCP 工具 ${originalName}（来自 ${server.name}）`,
        inputSchema: z.record(z.string(), z.unknown()),
        execute: async (input) => {
          const args =
            input && typeof input === 'object' && !Array.isArray(input)
              ? (input as Record<string, unknown>)
              : {};
          try {
            const client = new MinimalMcpClient(url);
            return await client.callTool(originalName, args);
          } catch (error) {
            throw new Error(this.formatError(error));
          }
        },
      });
    }

    return merged;
  }

  /**
   * MCP toolkit 是否可挂载：属于当前用户且最近一次同步成功（无 lastError）。
   */
  async assertMcpToolkitsReady(userId: string, toolkitIds: string[]) {
    const mcpIds = toolkitIds.filter((id) => id.startsWith('mcp_'));
    if (mcpIds.length === 0) return;

    const servers = await this.prisma.userMcpServer.findMany({
      where: { toolkitId: { in: mcpIds } },
    });
    const byToolkit = new Map(servers.map((item) => [item.toolkitId, item]));
    const blocked: string[] = [];

    for (const toolkitId of mcpIds) {
      const server = byToolkit.get(toolkitId);
      if (!server) {
        throw new BadRequestException(`MCP 工具包不存在: ${toolkitId}`);
      }
      if (server.userId !== userId) {
        throw new ForbiddenException(`无权挂载 MCP「${server.name}」`);
      }
      if (!server.lastSyncAt || server.lastError) {
        blocked.push(server.name);
      }
    }

    if (blocked.length > 0) {
      throw new BadRequestException(
        `请先在「插件工具」刷新 MCP 连接再挂载：${blocked.join('、')}`,
      );
    }
  }

  /** listForUser：仅当前用户可见的 mcp toolkit id 集合 */
  async listOwnedToolkitIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userMcpServer.findMany({
      where: { userId },
      select: { toolkitId: true },
    });
    return new Set(rows.map((row) => row.toolkitId));
  }

  async getReadyMap(
    userId: string,
  ): Promise<Record<string, { ready: boolean; lastError: string | null }>> {
    const rows = await this.prisma.userMcpServer.findMany({
      where: { userId },
      select: { toolkitId: true, lastSyncAt: true, lastError: true },
    });
    const map: Record<
      string,
      { ready: boolean; lastError: string | null }
    > = {};
    for (const row of rows) {
      map[row.toolkitId] = {
        ready: Boolean(row.lastSyncAt) && !row.lastError,
        lastError: row.lastError,
      };
    }
    return map;
  }

  private async requireOwned(userId: string, id: string) {
    const server = await this.prisma.userMcpServer.findUnique({
      where: { id },
    });
    if (!server) {
      throw new NotFoundException('MCP 连接不存在');
    }
    if (server.userId !== userId) {
      throw new ForbiddenException('无权操作该 MCP 连接');
    }
    return server;
  }

  /** 使挂载了该 MCP 的 Agent 缓存键失效（updatedAt） */
  private async touchMountedAgents(toolkitId: string) {
    const mounts = await this.prisma.agentToolkit.findMany({
      where: { toolkitId },
      select: { agentId: true },
    });
    if (mounts.length === 0) return;
    await this.prisma.agent.updateMany({
      where: { id: { in: mounts.map((item) => item.agentId) } },
      data: { updatedAt: new Date() },
    });
  }

  private async syncToolkitRows(params: {
    toolkitId: string;
    name: string;
    url: string;
    tools: MinimalMcpTool[];
  }) {
    const description = `远程 Minimal MCP：${params.url}`;
    await this.prisma.toolkit.upsert({
      where: { id: params.toolkitId },
      create: {
        id: params.toolkitId,
        name: params.name,
        description,
        deleted: false,
      },
      update: {
        name: params.name,
        description,
        deleted: false,
        settingsFields: Prisma.DbNull,
      },
    });

    // 清掉旧工具再写入，避免残留
    await this.prisma.tool.deleteMany({
      where: { toolkitId: params.toolkitId },
    });

    for (const tool of params.tools) {
      const name = dbToolName(params.toolkitId, tool.name);
      await this.prisma.tool.create({
        data: {
          name,
          description: tool.description ?? '',
          inputSchema: (tool.inputSchema ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          toolkitId: params.toolkitId,
        },
      });
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof MinimalMcpError || error instanceof BadRequestException) {
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
