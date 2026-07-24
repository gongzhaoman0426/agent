import type { Workflow } from '@mastra/core/workflows';
import type { z } from 'zod';

/**
 * 代码定义工作流的 Provider 约定。
 * workflow 为 Mastra 原生 Workflow 实例（createWorkflow().then(...).commit()），
 * 挂载到 Agent 后由 Mastra 自动包装为 `workflow-<id>` 工具。
 */
export interface WorkflowProvider {
  readonly name: string;
  readonly description: string;
  /** 与 createWorkflow 中一致的输入 schema，用于同步到 DB 供前端试跑表单 */
  readonly inputSchema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly workflow: Workflow<any, any, any, any, any, any>;
}
