import type { ToolsInput } from '@mastra/core/agent';
import type { z } from 'zod';

/**
 * Toolkit = 一组无状态 Mastra 工具（createTool 单例）。
 * 每请求的用户配置通过 requestContext 传入工具的 execute，
 * 不再像旧版那样每次对话实例化 toolkit 类。
 */
export interface ToolkitDefinition {
  readonly name: string;
  readonly description: string;
  /** 用户级配置的 zod schema（可选），用于校验 UserToolkitSettings */
  readonly settingsSchema?: z.ZodType;
  readonly tools: ToolsInput;
}

/** requestContext 中约定的 key */
export const REQUEST_CONTEXT_KEYS = {
  userId: 'userId',
  agentId: 'agentId',
  sessionId: 'sessionId',
  /** Record<toolkitId, settings> */
  toolkitSettings: 'toolkitSettings',
} as const;
