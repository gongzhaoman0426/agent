import { Logger } from '@nestjs/common';
import { ToolsService } from '../../tool/tools.service';
import { AgentService } from '../../agent/agent.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityDeps {
  toolsService: ToolsService;
  agentService: AgentService;
  prismaService: PrismaService;
}

const logger = new Logger('TemporalActivities');

/**
 * 从可能包含 markdown 代码块的字符串中提取纯 JSON/文本内容
 * LLM 经常返回 ```json ... ``` 包裹的内容，导致 JSON.parse 失败
 */
function stripMarkdownFences(text: string): string {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  // 匹配 ```json ... ``` 或 ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text;
}

/**
 * 包装智能体实例，自动清理返回结果中的 markdown 代码块
 */
function wrapAgentWithCleanup(agent: any): any {
  const originalRun = agent.run.bind(agent);
  return {
    ...agent,
    run: async (...args: any[]) => {
      const response = await originalRun(...args);
      // 清理 response.data.result 中的 markdown fences
      if (response?.data?.result && typeof response.data.result === 'string') {
        response.data.result = stripMarkdownFences(response.data.result);
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

        const prompt = `${agentConfig.prompt}
永远按照下面的JSON结构生成内容，不要有其他无关的解释。
${JSON.stringify(agentConfig.output, null, 2)}`;

        const rawAgent = await deps.agentService.createAgentInstance(
            prompt,
            agentConfig.tools || [],
            undefined,
            userId,
          );
        agentsRegistry.set(agentConfig.name, wrapAgentWithCleanup(rawAgent));
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
