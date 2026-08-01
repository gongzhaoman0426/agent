import { Agent } from '@mastra/core/agent';
import type { MastraService } from '../mastra/mastra.service.js';

/** 工作流内一次性文本生成（无记忆、无工具） */
export async function generateWorkflowText(
  mastra: MastraService,
  instructions: string,
  prompt: string,
): Promise<string> {
  const agent = new Agent({
    id: 'workflow-text-helper',
    name: 'workflow-text-helper',
    instructions,
    model: mastra.resolveModel(),
  });
  const result = await agent.generate(prompt, { maxSteps: 1 });
  return result.text?.trim() ?? '';
}
