import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { ToolsService } from '../tool/tools.service';

import { EventBus } from './event-bus';
import { Workflow } from './workflow';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly toolsService: ToolsService,
    private readonly agentService: AgentService,
    private readonly prismaService: PrismaService,
  ) {}

  private stripMarkdownFences(text: string): string {
    if (typeof text !== 'string') return text;
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    return text;
  }

  private wrapAgentWithCleanup(agent: any): any {
    const originalRun = agent.run.bind(agent);
    const strip = this.stripMarkdownFences.bind(this);
    return {
      ...agent,
      run: async (...args: any[]) => {
        const response = await originalRun(...args);
        if (response?.data?.result && typeof response.data.result === 'string') {
          response.data.result = strip(response.data.result);
        }
        return response;
      },
    };
  }

  async fromDsl(
    dsl: any,
    workflowId?: string,
    userId?: string,
    initialContext: any = {},
  ): Promise<Workflow> {
    this.validateDsl(dsl);

    const workflow = new Workflow<any, any, any>(this.eventBus, initialContext);

    const toolsRegistry = new Map<string, any>();
    for (const tool of dsl.tools ?? []) {
      if (typeof tool === 'string') {
        toolsRegistry.set(tool, await this.toolsService.getToolByName(tool, userId));
      }
    }

    const agentsRegistry = new Map<string, any>();

    for (const agent of dsl.agents ?? []) {
      const prompt = agent.output && Object.keys(agent.output).length > 0
        ? `${agent.prompt}

永远按照下面的JSON结构生成内容，不要有其他无关的解释。
${JSON.stringify(agent.output, null, 2)}`
        : agent.prompt;

      let persistentAgent: any;
      let tools = agent.tools || [];

      if (workflowId) {
        const existingWorkflowAgent = await this.prismaService.workflowAgent.findFirst({
          where: {
            workflowId,
            agentName: agent.name,
          },
          include: {
            agent: true,
          },
        });

        if (existingWorkflowAgent) {
          persistentAgent = existingWorkflowAgent.agent;
          this.logger.log(`Found existing workflow agent: ${agent.name} (${persistentAgent.id})`);
        }
      }

      if (!persistentAgent) {
        persistentAgent = await this.prismaService.agent.create({
          data: {
            name: workflowId ? `${workflowId}_${agent.name}` : `workflow_${agent.name}_${Date.now()}`,
            description: agent.description || `工作流智能体: ${agent.name}`,
            prompt: agent.prompt,
            options: agent.output || {},
            createdById: 'workflow-system',
            isWorkflowGenerated: true,
          },
        });

        this.logger.log(`Created new workflow agent: ${agent.name} (${persistentAgent.id})`);

        if (workflowId) {
          await this.prismaService.workflowAgent.create({
            data: {
              workflowId,
              agentId: persistentAgent.id,
              agentName: agent.name,
            },
          });
        }
      }

      if (agent.knowledgeBases && agent.knowledgeBases.length > 0) {
        await this.prismaService.agentKnowledgeBase.deleteMany({
          where: { agentId: persistentAgent.id },
        });

        for (const kbId of agent.knowledgeBases) {
          try {
            await this.prismaService.agentKnowledgeBase.create({
              data: {
                agentId: persistentAgent.id,
                knowledgeBaseId: kbId,
              },
            });
          } catch (error) {
            this.logger.warn(`Failed to link knowledge base ${kbId} to agent ${persistentAgent.id}:`, error);
          }
        }

        const existingKbToolkit = await this.prismaService.agentToolkit.findFirst({
          where: {
            agentId: persistentAgent.id,
            toolkitId: 'knowledge-base-toolkit-01',
          },
        });

        if (!existingKbToolkit) {
          await this.prismaService.agentToolkit.create({
            data: {
              agentId: persistentAgent.id,
              toolkitId: 'knowledge-base-toolkit-01',
              settings: {},
            },
          });
        }

        const kbTools = await this.toolsService.getAgentTools(persistentAgent.id);
        const kbToolNames = kbTools.map(tool => tool.metadata?.name || tool.name);
        tools = [...tools, ...kbToolNames];
      }

      const rawAgent = await this.agentService.createAgentInstance(prompt, tools, undefined, userId);
      agentsRegistry.set(agent.name, this.wrapAgentWithCleanup(rawAgent));
    }

    function buildHandle(
      codeStr: string,
      toolNames: string[],
      agentNames: string[],
    ) {
      const params = ['event', 'context', ...toolNames, ...agentNames];
      return new Function(
        ...params,
        `return (${codeStr})(event, context, ${toolNames
          .concat(agentNames)
          .join(', ')});`,
      );
    }

    for (const step of dsl.steps ?? []) {
      const toolNames = Array.from(toolsRegistry.keys()).filter((name) =>
        step.handle.includes(name),
      );
      const agentNames = Array.from(agentsRegistry.keys()).filter((name) =>
        step.handle.includes(name),
      );

      const realHandle = buildHandle(step.handle, toolNames, agentNames);

      workflow.addStep({
        eventType: step.event,
        handle: async (event, context) => {
          const toolFns = toolNames.map((name) => toolsRegistry.get(name));
          const agentFns = agentNames.map((name) => agentsRegistry.get(name));
          return await realHandle(event, context, ...toolFns, ...agentFns);
        },
      });
    }

    return workflow;
  }

  async getAllWorkflows() {
    return this.prismaService.workFlow.findMany({
      where: {
        deleted: false,
        source: 'code',
      },
      orderBy: { name: 'asc' },
    });
  }

  async getWorkflow(id: string, _userId?: string) {
    const workflow = await this.prismaService.workFlow.findFirst({
      where: {
        id,
        deleted: false,
        source: 'code',
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with id ${id} not found`);
    }

    return workflow;
  }

  async executeWorkflow(
    id: string,
    input: any,
    context: any = {},
    userId?: string,
  ) {
    const workflowRecord = await this.getWorkflow(id, userId);
    const workflow = await this.fromDsl(workflowRecord.DSL, id, userId, context);
    const result = await workflow.execute(input);

    return {
      workflowId: id,
      input,
      context,
      output: result,
      engine: 'legacy',
      executedAt: new Date().toISOString(),
    };
  }

  async getWorkflowAgents(workflowId: string) {
    return this.prismaService.workflowAgent.findMany({
      where: { workflowId },
      include: {
        agent: {
          include: {
            agentKnowledgeBases: {
              include: {
                knowledgeBase: true,
              },
            },
            agentToolkits: {
              include: {
                toolkit: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteWorkflowAgents(workflowId: string) {
    const workflowAgents = await this.prismaService.workflowAgent.findMany({
      where: { workflowId },
      include: { agent: true },
    });

    for (const workflowAgent of workflowAgents) {
      await this.prismaService.agent.delete({
        where: { id: workflowAgent.agentId },
      });
    }

    await this.prismaService.workflowAgent.deleteMany({
      where: { workflowId },
    });
  }

  async updateWorkflowAgent(workflowId: string, agentName: string, agentData: any) {
    const workflowAgent = await this.prismaService.workflowAgent.findFirst({
      where: { workflowId, agentName },
      include: { agent: true },
    });

    if (!workflowAgent) {
      throw new Error(`Workflow agent ${agentName} not found`);
    }

    return this.prismaService.agent.update({
      where: { id: workflowAgent.agentId },
      data: {
        prompt: agentData.prompt,
        description: agentData.description,
        options: agentData.options,
        updatedAt: new Date(),
      },
    });
  }

  private validateDsl(dsl: any) {
    if (!dsl || typeof dsl !== 'object') {
      throw new Error('DSL must be a valid object');
    }

    const requiredFields = ['id', 'name', 'description', 'version', 'tools', 'events', 'steps'];
    for (const field of requiredFields) {
      if (!dsl[field]) {
        throw new Error(`DSL missing required field: ${field}`);
      }
    }

    if (!Array.isArray(dsl.events) || dsl.events.length < 2) {
      throw new Error('DSL must have at least 2 events');
    }

    const hasStart = dsl.events.some((event: any) => event.type === 'WORKFLOW_START');
    const hasStop = dsl.events.some((event: any) => event.type === 'WORKFLOW_STOP');

    if (!hasStart) {
      throw new Error('DSL must have WORKFLOW_START event');
    }

    if (!hasStop) {
      throw new Error('DSL must have WORKFLOW_STOP event');
    }

    if (!Array.isArray(dsl.steps) || dsl.steps.length === 0) {
      throw new Error('DSL must have at least 1 step');
    }

    return true;
  }
}
