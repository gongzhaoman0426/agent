import { Logger } from '@nestjs/common';
import { ToolsService } from '../../tool/tools.service';
import { AgentService } from '../../agent/agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LlamaindexService } from '../../llamaindex/llamaindex.service';

export interface ActivityDeps {
  toolsService: ToolsService;
  agentService: AgentService;
  prismaService: PrismaService;
  llamaindexService: LlamaindexService;
}

const logger = new Logger('TemporalActivities');

/**
 * 包装智能体实例：
 * 如果有 outputSchema，用 LLM structuredExtract 提取结构化 JSON
 */
function wrapAgentWithStructuredOutput(
  agent: any,
  outputSchema: any,
  llamaindexService: LlamaindexService,
): any {
  const originalRun = agent.run.bind(agent);
  return {
    ...agent,
    run: async (...args: any[]) => {
      const response = await originalRun(...args);
      if (response?.data?.result && typeof response.data.result === 'string') {
        if (outputSchema && Object.keys(outputSchema).length > 0) {
          response.data.result = JSON.stringify(
            await llamaindexService.structuredExtract(response.data.result, outputSchema),
          );
        }
      }
      return response;
    },
  };
}

export function createActivities(deps: ActivityDeps) {
  return {
    resolveTools: async (params: {
      toolNames: string[];
      userId?: string;
    }): Promise<string[]> => {
      const resolved: string[] = [];
      for (const name of params.toolNames) {
        await deps.toolsService.getToolByName(name, params.userId);
        resolved.push(name);
      }
      logger.log(`Resolved ${resolved.length} tools`);
      return resolved;
    },

    resolveAgents: async (params: {
      agents: any[];
      workflowId?: string;
      userId?: string;
    }): Promise<
      Array<{
        name: string;
        prompt: string;
        output: any;
        tools: string[];
        knowledgeBases?: string[];
      }>
    > => {
      const result: any[] = [];

      for (const agent of params.agents || []) {
        if (params.workflowId) {
          const existing =
            await deps.prismaService.workflowAgent.findFirst({
              where: {
                workflowId: params.workflowId,
                agentName: agent.name,
              },
              include: { agent: true },
            });

          if (!existing) {
            const persistentAgent = await deps.prismaService.agent.create({
              data: {
                name: `${params.workflowId}_${agent.name}`,
                description:
                  agent.description || `工作流智能体: ${agent.name}`,
                prompt: agent.prompt,
                options: agent.output || {},
                createdById: 'workflow-system',
                isWorkflowGenerated: true,
              },
            });

            await deps.prismaService.workflowAgent.create({
              data: {
                workflowId: params.workflowId,
                agentId: persistentAgent.id,
                agentName: agent.name,
              },
            });

            logger.log(
              `Created workflow agent: ${agent.name} (${persistentAgent.id})`,
            );
          }
        }

        result.push({
          name: agent.name,
          prompt: agent.prompt,
          output: agent.output,
          tools: agent.tools || [],
          knowledgeBases: agent.knowledgeBases,
        });
      }

      return result;
    },
    executeDslStep: async (params: {
      handleCode: string;
      eventType: string;
      eventData: any;
      context: any;
      toolNames: string[];
      agentConfigs: Array<{
        name: string;
        prompt: string;
        output: any;
        tools: string[];
        knowledgeBases?: string[];
      }>;
      workflowId?: string;
      userId?: string;
    }): Promise<{ type: string; data: any } | null> => {
      const {
        handleCode,
        eventType,
        eventData,
        context,
        toolNames,
        agentConfigs,
        userId,
      } = params;

      // Resolve tools
      const toolsRegistry = new Map<string, any>();
      for (const toolName of toolNames) {
        if (handleCode.includes(toolName)) {
          toolsRegistry.set(
            toolName,
            await deps.toolsService.getToolByName(toolName, userId),
          );
        }
      }

      // Resolve agents
      const agentsRegistry = new Map<string, any>();
      for (const agentConfig of agentConfigs) {
        if (!handleCode.includes(agentConfig.name)) continue;

        const prompt = agentConfig.output && Object.keys(agentConfig.output).length > 0
          ? `${agentConfig.prompt}\n\n注意：你的最终回答中必须包含以下所有字段的信息：${Object.keys(agentConfig.output).join('、')}。确保每个字段都能从你的回答中提取到对应内容。`
          : agentConfig.prompt;

        const rawAgent = await deps.agentService.createAgentInstance(
            prompt,
            agentConfig.tools || [],
            undefined,
            userId,
          );
        agentsRegistry.set(agentConfig.name, wrapAgentWithStructuredOutput(rawAgent, agentConfig.output, deps.llamaindexService));
      }

      // Build handle function
      const usedToolNames = Array.from(toolsRegistry.keys());
      const usedAgentNames = Array.from(agentsRegistry.keys());
      const fnParams = [
        'event',
        'context',
        ...usedToolNames,
        ...usedAgentNames,
      ];
      const realHandle = new Function(
        ...fnParams,
        `return (${handleCode})(event, context, ${usedToolNames.concat(usedAgentNames).join(', ')});`,
      );

      const event = { type: eventType, data: eventData || {} };
      const toolFns = usedToolNames.map((n) => toolsRegistry.get(n));
      const agentFns = usedAgentNames.map((n) => agentsRegistry.get(n));

      logger.log(`Executing step: ${eventType}`);
      logger.log(`Event data keys: ${JSON.stringify(Object.keys(event.data))}`);
      try {
        const result = await realHandle(event, context, ...toolFns, ...agentFns);
        return result || null;
      } catch (error) {
        logger.error(
          `Step ${eventType} failed. event.data=${JSON.stringify(eventData)}, handleCode=${handleCode.substring(0, 200)}...`,
        );
        throw error;
      }
    },
  };
}
