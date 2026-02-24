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
      // 先把 data 读到本地变量，避免反复访问 getter
      const data = response?.data;
      const rawResult = data?.result;
      logger.log(`[AgentRun] Raw result (first 200 chars): ${String(rawResult).substring(0, 200)}`);

      let finalResult = rawResult;
      if (rawResult && typeof rawResult === 'string') {
        if (outputSchema && Object.keys(outputSchema).length > 0) {
          try {
            const extracted = await llamaindexService.structuredExtract(rawResult, outputSchema);
            finalResult = JSON.stringify(extracted);
            logger.log(`[AgentRun] structuredExtract result keys: ${JSON.stringify(Object.keys(extracted || {}))}`);
          } catch (e) {
            logger.error(`[AgentRun] structuredExtract failed: ${e.message}, using raw result`);
            const fallback: Record<string, string> = {};
            for (const key of Object.keys(outputSchema)) {
              fallback[key] = rawResult;
            }
            finalResult = JSON.stringify(fallback);
          }
        }
      }
      logger.log(`[AgentRun] Final result (first 200 chars): ${String(finalResult).substring(0, 200)}`);
      // 返回新对象，不 mutate 原始 response（LlamaIndex response.data 可能是 getter）
      return { data: { ...data, result: finalResult } };
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
        logger.log(`[resolveTools] ✓ ${name}`);
      }
      logger.log(`[resolveTools] Resolved ${resolved.length} tools: ${resolved.join(', ')}`);
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
          logger.log(`[${eventType}] Resolving tool: ${toolName}`);
          toolsRegistry.set(
            toolName,
            await deps.toolsService.getToolByName(toolName, userId),
          );
        }
      }
      logger.log(`[${eventType}] Tools resolved: ${Array.from(toolsRegistry.keys()).join(', ') || 'none'}`);

      // Resolve agents
      const agentsRegistry = new Map<string, any>();
      for (const agentConfig of agentConfigs) {
        if (!handleCode.includes(agentConfig.name)) continue;
        logger.log(`[${eventType}] Creating agent: ${agentConfig.name}`);

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

      logger.log(`[${eventType}] Executing step...`);
      logger.log(`[${eventType}] Event data keys: ${JSON.stringify(Object.keys(event.data))}`);
      try {
        const startTime = Date.now();
        const result = await realHandle(event, context, ...toolFns, ...agentFns);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.log(`[${eventType}] ✓ Completed in ${duration}s → next: ${result?.type || 'null'}`);
        return result || null;
      } catch (error) {
        logger.error(
          `[${eventType}] ✗ Failed: ${error.message}`,
        );
        throw error;
      }
    },
  };
}
