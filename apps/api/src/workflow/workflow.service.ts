import { Injectable, NotFoundException } from '@nestjs/common';
import type { Workflow } from '@mastra/core/workflows';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowDiscoveryService } from './workflow-discovery.service.js';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: WorkflowDiscoveryService,
  ) {}

  async list() {
    return this.prisma.workflow.findMany({
      where: { deleted: false },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * 供 AgentRegistry 构建 Agent 实例：
   * 挂载的工作流以 { [id]: Workflow } 传入 Agent 构造器，
   * Mastra 自动生成 `workflow-<id>` 工具。
   */
  getWorkflowsInput(
    workflowIds: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, Workflow<any, any, any, any, any, any>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: Record<string, Workflow<any, any, any, any, any, any>> = {};
    for (const id of workflowIds) {
      const provider = this.discovery.getProvider(id);
      if (!provider) continue;
      map[id] = provider.workflow;
    }
    return map;
  }

  /** 管理页试跑 */
  async execute(id: string, inputData: Record<string, unknown>) {
    const provider = this.discovery.getProvider(id);
    if (!provider) {
      throw new NotFoundException(`工作流不存在: ${id}`);
    }

    const parsed = provider.inputSchema.safeParse(inputData ?? {});
    if (!parsed.success) {
      return {
        status: 'failed',
        error: `输入校验失败: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      };
    }

    const run = await provider.workflow.createRun();
    const result = await run.start({ inputData: parsed.data });
    return result;
  }
}
