import { ModuleRef } from '@nestjs/core';
import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';
import { PrismaService } from 'src/prisma/prisma.service';

@toolkitId('workflow-toolkit-01')
export class WorkflowToolkit extends BaseToolkit {
  name = '工作流工具箱';
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
          '列出可用工作流及其 inputSchema。执行工作流前须先调用此工具获取 inputSchema',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }),

      // 2. executeWorkflow
      FunctionTool.from(this.executeWorkflow.bind(this), {
        name: 'executeWorkflow',
        description:
          '执行指定工作流。input 为必填参数，字段须与 listWorkflows 返回的 inputSchema 匹配',
        parameters: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: '工作流 ID，从 listWorkflows 返回结果中获取',
            },
            input: {
              type: 'object',
              description:
                '【必填】工作流输入参数，键值须与 inputSchema 一一对应',
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
          '查询 Temporal 异步工作流的执行状态（RUNNING/COMPLETED/FAILED 等）',
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
          '获取已完成的 Temporal 异步工作流结果。建议先用 getWorkflowStatus 确认状态为 COMPLETED',
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

      // 校验 input 字段是否匹配 DSL 的 inputSchema
      const workflow = await workflowService.getWorkflow(workflowId);
      const inputSchema = this.extractInputSchema(workflow.DSL);
      const schemaKeys = Object.keys(inputSchema);
      const inputKeys = Object.keys(input || {});
      const missingKeys = schemaKeys.filter((k) => !inputKeys.includes(k));
      if (missingKeys.length > 0) {
        return JSON.stringify({
          error: `input 缺少必需字段: ${missingKeys.join(', ')}。期望的 inputSchema: ${JSON.stringify(inputSchema)}，实际收到: ${JSON.stringify(input)}`,
        }, null, 2);
      }

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