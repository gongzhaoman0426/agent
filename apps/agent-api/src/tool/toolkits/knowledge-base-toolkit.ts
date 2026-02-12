import { FunctionTool } from 'llamaindex';
import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { KnowledgeBaseService } from 'src/knowledge-base/knowledge-base.service';

@toolkitId('knowledge-base-toolkit-01')
export class KnowledgeBaseToolkit extends BaseToolkit {
  name = '知识库工具箱';
  description = '知识库工具包，提供知识库查询和管理功能';
  tools: FunctionTool<any, any>[] = [];
  settings = {};
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {
    super();
  }

  async getTools() {
    if (this.tools.length === 0) {
      // 获取智能体可访问的知识库列表工具
      const listKnowledgeBasesTool = FunctionTool.from(
        async () => {
          const startTime = Date.now();
          this.logger.log('[Tool:listAgentKnowledgeBases] Called, agentId=' + this.agentId);
          try {
            const agentKnowledgeBases = await this.knowledgeBaseService.getAgentKnowledgeBases(
              this.agentId as string,
            );
            const result = agentKnowledgeBases.map((akb: any) => ({
              id: akb.knowledgeBase.id,
              name: akb.knowledgeBase.name,
              description: akb.knowledgeBase.description,
            }));
            const elapsed = Date.now() - startTime;
            this.logger.log(`[Tool:listAgentKnowledgeBases] Found ${result.length} knowledge bases (${elapsed}ms)`);
            return JSON.stringify(result, null, 2);
          } catch (error: any) {
            this.logger.error(`[Tool:listAgentKnowledgeBases] Error: ${error.message}`, error.stack);
            return JSON.stringify({ error: error.message }, null, 2);
          }
        },
        {
          name: 'listAgentKnowledgeBases',
          description: '获取当前智能体可以访问的知识库列表',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        } as any,
      );

      // 知识库查询工具
      const queryKnowledgeBaseTool = FunctionTool.from(
        async ({ knowledgeBaseId, query }: { knowledgeBaseId: string; query: string }) => {
          const startTime = Date.now();
          this.logger.log(`[Tool:queryKnowledgeBase] Called, knowledgeBaseId=${knowledgeBaseId}, query="${query}"`);
          try {
            // 验证智能体是否有权限访问该知识库
            const agentKnowledgeBases = await this.knowledgeBaseService.getAgentKnowledgeBases(
              this.agentId as string,
            );
            const hasAccess = agentKnowledgeBases.some((akb: any) => akb.knowledgeBase.id === knowledgeBaseId);

            if (!hasAccess) {
              this.logger.warn(`[Tool:queryKnowledgeBase] Access denied for agent ${this.agentId} to knowledge base ${knowledgeBaseId}`);
              return JSON.stringify({ error: '智能体无权限访问该知识库' }, null, 2);
            }

            const answer = await this.knowledgeBaseService.chat(knowledgeBaseId, query);
            const elapsed = Date.now() - startTime;
            this.logger.log(`[Tool:queryKnowledgeBase] Completed (${elapsed}ms), sources: ${answer.sources?.length || 0}`);
            return JSON.stringify(answer, null, 2);
          } catch (error: any) {
            this.logger.error(`[Tool:queryKnowledgeBase] Error: ${error.message}`, error.stack);
            return JSON.stringify({ error: error.message }, null, 2);
          }
        },
        {
          name: 'queryKnowledgeBase',
          description: '在指定的知识库中查询信息。使用前请先调用 listAgentKnowledgeBases 获取可用的知识库列表',
          parameters: {
            type: 'object',
            properties: {
              knowledgeBaseId: {
                type: 'string',
                description: '知识库ID，从 listAgentKnowledgeBases 获取'
              },
              query: {
                type: 'string',
                description: '要查询的问题'
              },
            },
            required: ['knowledgeBaseId', 'query'],
          },
        } as any,
      );

      this.tools = [listKnowledgeBasesTool, queryKnowledgeBaseTool];
    }
    return this.tools;
  }

  validateSettings(): void {
    // agentId 由 setAgentContext 设置，不再通过 settings 校验
  }
}
