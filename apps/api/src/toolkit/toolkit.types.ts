import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';

/**
 * 工具包配置项声明：值统一为字符串，前端按此渲染表单（一行一个输入框），
 * 不需要 JSON Schema，也不需要用户手写 JSON。
 */
export interface SettingField {
  /** 配置键名，存储在 UserToolkitSettings.settings 里 */
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /** 敏感值：前端用密码框输入 */
  secret?: boolean;
}

/** 用户级工具包配置，值统一为字符串 */
export type ToolkitSettings = Record<string, string>;

/**
 * Toolkit = 一组无状态 Mastra 工具（createTool 单例）。
 * 每请求的用户配置通过 requestContext 传入工具的 execute，
 * 不再像旧版那样每次对话实例化 toolkit 类。
 */
export interface ToolkitDefinition {
  readonly name: string;
  readonly description: string;
  /** 用户级配置字段，留空表示该工具包无需配置 */
  readonly settingsFields?: SettingField[];
  readonly tools: ToolsInput;
}

/** requestContext 中约定的 key */
export const REQUEST_CONTEXT_KEYS = {
  userId: 'userId',
  agentId: 'agentId',
  sessionId: 'sessionId',
  /**
   * 对话来源渠道（web / wechat …）。
   * 定时任务创建时会写入任务，到期结果回传到同一渠道。
   */
  channel: 'channel',
  /**
   * 渠道附加元数据（如微信 accountId / peerWxid / agentId），
   * 创建定时任务时一并落库，供到期回传使用。
   */
  channelMeta: 'channelMeta',
  /** Record<toolkitId, ToolkitSettings> */
  toolkitSettings: 'toolkitSettings',
  /**
   * 微信媒体工具（语音/图片）已直接送达对端时置 true，
   * 渠道层应跳过本轮文本自动回复，避免「语音 + 文字」双发。
   */
  wechatMediaDelivered: 'wechatMediaDelivered',
} as const;

/** 已支持的对话 / 回传渠道 */
export const SCHEDULE_CHANNELS = ['web', 'wechat'] as const;
export type ScheduleChannel = (typeof SCHEDULE_CHANNELS)[number];

/**
 * 工具执行时读取当前用户的工具包配置。
 * 缺少必填项时抛出引导性错误，让模型把「去配置」的提示转达用户。
 */
export function readToolkitSettings(
  requestContext: RequestContext,
  toolkitId: string,
  toolkitName: string,
  requiredKeys: string[] = [],
): ToolkitSettings {
  const all = requestContext.get(REQUEST_CONTEXT_KEYS.toolkitSettings) as
    | Record<string, ToolkitSettings | undefined>
    | undefined;
  const settings = all?.[toolkitId] ?? {};

  const missing = requiredKeys.filter((key) => !settings[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `${toolkitName} 尚未配置（缺少 ${missing.join('、')}）：请在「插件工具」页完成配置后重试`,
    );
  }
  return settings;
}
