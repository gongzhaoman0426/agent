import { z } from 'zod';

export const DEFAULT_AGENT_PROMPT =
  '你是一个乐于助人的智能体，请准确、简洁地回答用户的问题。';

/** 创建只需名字（+可选介绍），其余在编排页配置 */
export const createAgentSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).default(DEFAULT_AGENT_PROMPT),
  model: z.string().optional(),
  toolkitIds: z.array(z.string()).default([]),
  workflowIds: z.array(z.string()).default([]),
  skillNames: z.array(z.string()).default([]),
  subAgentIds: z.array(z.string()).default([]),
});

/**
 * 更新为真正的 partial：未传的挂载数组保持不变
 * （不能直接 createAgentSchema.partial()，default([]) 会把缺省字段填成空数组清空挂载）
 */
export const updateAgentSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100).optional(),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1, '提示词不能为空').optional(),
  model: z.string().optional(),
  toolkitIds: z.array(z.string()).optional(),
  workflowIds: z.array(z.string()).optional(),
  skillNames: z.array(z.string()).optional(),
  subAgentIds: z.array(z.string()).optional(),
});

export const chatSchema = z.object({
  message: z.string().min(1, '消息不能为空'),
  sessionId: z.string().min(1, '会话 ID 不能为空'),
});

export type CreateAgentDto = z.infer<typeof createAgentSchema>;
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;
export type ChatDto = z.infer<typeof chatSchema>;
