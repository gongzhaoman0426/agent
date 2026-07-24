import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1, '提示词不能为空'),
  model: z.string().optional(),
  toolkitIds: z.array(z.string()).default([]),
  workflowIds: z.array(z.string()).default([]),
  skillNames: z.array(z.string()).default([]),
});

export const updateAgentSchema = createAgentSchema.partial();

export const chatSchema = z.object({
  message: z.string().min(1, '消息不能为空'),
  sessionId: z.string().min(1, '会话 ID 不能为空'),
});

export type CreateAgentDto = z.infer<typeof createAgentSchema>;
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;
export type ChatDto = z.infer<typeof chatSchema>;
