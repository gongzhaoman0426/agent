import { ModuleRef } from '@nestjs/core';
import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';
import { PrismaService } from 'src/prisma/prisma.service';

@toolkitId('workflow-toolkit-01')
export class WorkflowToolkit extends BaseToolkit {
  name = 'Workflow Toolkit';
  description = '工作流工具包，允许智能体发现、执行和查询工作流';
  tools: ToolsType[] = [];
  settings = {};

  constructor(
    private readonly prismaService: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  private async getWorkflowService() {
    // Dynamic import to avoid circular dependency (WorkflowModule -> ToolsModule)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WorkflowService } = require('../../workflow/workflow.service');
    return this.moduleRef.get(WorkflowService, { strict: false });
  }

  private async getTemporalClientService() {
    try {
      const { TemporalClientService } = require('../../temporal/temporal-client.service');
      return this.moduleRef.get(TemporalClientService, { strict: false });
    } catch {
      return null;
    }
  }

  private extractInputSchema(dsl: any): Record<string, string> {
    try {
      const startEvent = dsl?.events?.find(
        (e: any) => e.type === 'WORKFLOW_START',
      );
      return startEvent?.data || {};
    } catch {
      return {};
    }
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules = await this.llamaindexService.getLlamaindexModules();
    const FunctionTool = llamaindexModules.FunctionTool;

    this.tools = [
      // 1. listWorkflows
      FunctionTool.from(this.listWorkflows.bind(this), {
        name: 'listWorkflows',
        description:
          '列出当前智能体可用的所有工作流，返回工作流 ID、名称、描述和 inputSchema（输入参数结构）。执行工作流前必须先调用此工具，根据返回的 inputSchema 构造正确的 input 参数',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }),

      // 2. executeWorkflow
      FunctionTool.from(this.executeWorkflow.bind(this), {
        name: 'executeWorkflow',
        description: [
          '执行指定工作流。',
          '步骤：1) 先调用 listWorkflows 获取工作流列表；2) 从返回结果中找到目标工作流的 inputSchema；3) 按 inputSchema 的字段构造 input 对象。',
          '参数格式示例：若 listWorkflows 返回的 inputSchema 为 {"question":"string","lang":"string"}，',
          '则调用时必须传 input: {"question":"用户的问题","lang":"zh"}。',
          '注意：input 是一个嵌套对象，不要把 inputSchema 的字段平铺到顶层。',
        ].join(''),
        parameters: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: '工作流 ID，从 listWorkflows 返回结果中获取',
            },
            input: {
              type: 'object',
              description: '工作流输入参数对象。键值对必须与 listWorkflows 返回的 inputSchema 一一对应。例如 inputSchema={"question":"string"} 则传 {"question":"实际内容"}',
            },
            engine: {
              type: 'string',
              description: '执行引擎：legacy（同步）或 temporal（异步），默认 legacy',
              enum: ['legacy', 'temporal'],
            },
          },
          required: ['workflowId', 'input'],
        },
      }),
      // 3. getWorkflowStatus
      FunctionTool.from(this.getWorkflowStatus.bind(this), {
        name: 'getWorkflowStatus',
        description:
          '查询 Temporal 异步工作流的执行状态，返回状态（RUNNING/COMPLETED/FAILED 等）和时间信息',
        parameters: {
          type: 'object',
          properties: {
            temporalWorkflowId: {
              type: 'string',
              description:
                '执行 executeWorkflow 时返回的 temporalWorkflowId',
            },
          },
          required: ['temporalWorkflowId'],
        },
      }),

      // 4. getWorkflowResult
      FunctionTool.from(this.getWorkflowResult.bind(this), {
        name: 'getWorkflowResult',
        description:
          '获取已完成的 Temporal 异步工作流的最终结果。工作流未完成时会返回提示，建议先用 getWorkflowStatus 确认状态',
        parameters: {
          type: 'object',
          properties: {
            temporalWorkflowId: {
              type: 'string',
              description:
                '执行 executeWorkflow 时返回的 temporalWorkflowId',
            },
          },
          required: ['temporalWorkflowId'],
        },
      }),
    ];
  }

  async listWorkflows(): Promise<string> {
    const agentId = this.agentId;
    const agentWorkflows = await this.prismaService.agentWorkflow.findMany({
      where: { agentId },
      include: { workflow: true },
    });

    const workflows = agentWorkflows
      .map((aw: any) => aw.workflow)
      .filter((wf: any) => !wf.deleted)
      .map((wf: any) => {
        const inputSchema = this.extractInputSchema(wf.DSL);
        const exampleInput = Object.fromEntries(
          Object.entries(inputSchema).map(([k, v]) => [k, `<${v}>`]),
        );
        return {
          id: wf.id,
          name: wf.name,
          description: wf.description,
          inputSchema,
          executeExample: {
            workflowId: wf.id,
            input: exampleInput,
            engine: 'legacy',
          },
        };
      });

    return JSON.stringify(workflows, null, 2);
  }

  async executeWorkflow(params: {
    workflowId: string;
    input: Record<string, any>;
    engine?: string;
  }): Promise<string> {
    const { workflowId, input, engine = 'legacy' } = params;
    try {
      const workflowService = await this.getWorkflowService();
      const result = await workflowService.executeWorkflow(
        workflowId,
        input,
        {},
        undefined,
        engine,
      );
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      this.logger.error(
        `[executeWorkflow] Error: ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async getWorkflowStatus(params: {
    temporalWorkflowId: string;
  }): Promise<string> {
    try {
      const temporalClient = await this.getTemporalClientService();
      if (!temporalClient) {
        return JSON.stringify({ error: 'Temporal is not configured' });
      }
      const status = await temporalClient.getWorkflowStatus(
        params.temporalWorkflowId,
      );
      return JSON.stringify(status, null, 2);
    } catch (error: any) {
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async getWorkflowResult(params: {
    temporalWorkflowId: string;
  }): Promise<string> {
    try {
      const temporalClient = await this.getTemporalClientService();
      if (!temporalClient) {
        return JSON.stringify({ error: 'Temporal is not configured' });
      }
      // Check status first
      const status = await temporalClient.getWorkflowStatus(
        params.temporalWorkflowId,
      );
      if (status.status !== 'COMPLETED') {
        return JSON.stringify({
          message: `工作流尚未完成，当前状态: ${status.status}。请先用 getWorkflowStatus 确认状态，或使用 wait 工具等待后再查询。`,
          status: status.status,
        });
      }
      const result = await temporalClient.getWorkflowResult(
        params.temporalWorkflowId,
      );
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  validateSettings(): void {
    // agentId 由 setAgentContext 设置，不再通过 settings 校验
  }
}