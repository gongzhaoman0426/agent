import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { ToolsService } from '../tool/tools.service';

import { CreateAgentDto, UpdateAgentDto, ChatWithAgentDto } from './agent.type';
import { ChatMemoryService } from './chat-memory.service';
import { LlamaindexService } from '../llamaindex/llamaindex.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llamaIndexService: LlamaindexService,
    private readonly toolsService: ToolsService,
    private readonly chatMemoryService: ChatMemoryService,
    private readonly redis: RedisService,
  ) {}

  async findAll(userId: string) {
    return this.redis.getOrSet(
      `user:${userId}:agents`,
      () => this.prisma.agent.findMany({
        where: {
          deleted: false,
          isWorkflowGenerated: false,
          createdById: userId,
        },
        include: {
          agentToolkits: {
            include: {
              toolkit: {
                include: {
                  tools: true,
                },
              },
            },
          },
          agentKnowledgeBases: {
            include: {
              knowledgeBase: true,
            },
          },
          agentWorkflows: {
            include: {
              workflow: true,
            },
          },
        },
      }),
      300,
    );
  }

  async findOne(id: string, userId?: string) {
    const agent = await this.redis.getOrSet(
      `agent:${id}:full`,
      () => this.prisma.agent.findUnique({
        where: { id, deleted: false },
        include: {
          agentTools: {
            include: {
              tool: true,
            },
          },
          agentToolkits: {
            include: {
              toolkit: {
                include: {
                  tools: true,
                },
              },
            },
          },
          agentKnowledgeBases: {
            include: {
              knowledgeBase: true,
            },
          },
          agentWorkflows: {
            include: {
              workflow: true,
            },
          },
        },
      }),
      3600,
    );

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }

    // 验证归属（工作流生成的智能体跳过验证）
    if (userId && !agent.isWorkflowGenerated && agent.createdById !== userId) {
      throw new ForbiddenException('无权访问此智能体');
    }

    return agent;
  }

  async create(createAgentDto: CreateAgentDto, userId: string) {
    // 创建智能体
    const agent = await this.prisma.agent.create({
      data: {
        name: createAgentDto.name,
        description: createAgentDto.description,
        prompt: createAgentDto.prompt,
        options: createAgentDto.options,
        createdById: userId,
      },
    });

    // 处理工具包分配
    await this.assignToolkitsToAgent(agent.id, createAgentDto);

    // 处理知识库分配
    await this.assignKnowledgeBasesToAgent(agent.id, createAgentDto);

    // 处理工作流分配
    await this.assignWorkflowsToAgent(agent.id, createAgentDto);

    // 失效用户 agent 列表缓存
    await this.redis.del(`user:${userId}:agents`);

    return agent;
  }

  private async assignToolkitsToAgent(agentId: string, dto: CreateAgentDto | UpdateAgentDto) {
    const commonToolkitId = 'common-toolkit-01';
    const toolkitConfigs: Array<{ toolkitId: string; settings: any }> = [];

    // 如果提供了工具包配置
    if (dto.toolkits && dto.toolkits.length > 0) {
      toolkitConfigs.push(...dto.toolkits.map(tk => ({
        toolkitId: tk.toolkitId,
        settings: tk.settings || {},
      })));
    }

    // 确保 common toolkit 总是被包含
    const hasCommonToolkit = toolkitConfigs.some(tk => tk.toolkitId === commonToolkitId);
    if (!hasCommonToolkit) {
      toolkitConfigs.unshift({
        toolkitId: commonToolkitId,
        settings: {},
      });
    }

    // 为智能体分配工具包
    for (const config of toolkitConfigs) {
      try {
        // 先检查工具包是否存在
        const toolkit = await this.prisma.toolkit.findUnique({
          where: { id: config.toolkitId },
        });

        if (toolkit) {
          await this.prisma.agentToolkit.create({
            data: {
              agentId: agentId,
              toolkitId: config.toolkitId,
              settings: { ...config.settings, agentId },
            },
          });
        } else {
          console.warn(`Warning: Toolkit ${config.toolkitId} not found, skipping...`);
        }
      } catch (error) {
        console.error(`Error assigning toolkit ${config.toolkitId} to agent:`, error);
      }
    }
  }

  private async assignKnowledgeBasesToAgent(agentId: string, dto: CreateAgentDto | UpdateAgentDto) {
    // 如果提供了知识库配置
    if (dto.knowledgeBases && dto.knowledgeBases.length > 0) {
      for (const kbId of dto.knowledgeBases) {
        try {
          // 先检查知识库是否存在
          const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
            where: { id: kbId },
          });

          if (knowledgeBase) {
            await this.prisma.agentKnowledgeBase.create({
              data: {
                agentId: agentId,
                knowledgeBaseId: kbId,
              },
            });
          } else {
            console.warn(`Warning: Knowledge base ${kbId} not found, skipping...`);
          }
        } catch (error) {
          console.error(`Error assigning knowledge base ${kbId} to agent:`, error);
        }
      }
    }
  }

  private async assignWorkflowsToAgent(agentId: string, dto: CreateAgentDto | UpdateAgentDto) {
    if (dto.workflows && dto.workflows.length > 0) {
      for (const workflowId of dto.workflows) {
        try {
          const workflow = await this.prisma.workFlow.findUnique({
            where: { id: workflowId },
          });

          if (workflow) {
            await this.prisma.agentWorkflow.create({
              data: {
                agentId: agentId,
                workflowId: workflowId,
              },
            });
          } else {
            console.warn(`Warning: Workflow ${workflowId} not found, skipping...`);
          }
        } catch (error) {
          console.error(`Error assigning workflow ${workflowId} to agent:`, error);
        }
      }
    }
  }

  async update(id: string, updateAgentDto: UpdateAgentDto, userId: string) {
    await this.findOne(id, userId);

    // 更新智能体基本信息
    await this.prisma.agent.update({
      where: { id },
      data: {
        name: updateAgentDto.name,
        description: updateAgentDto.description,
        prompt: updateAgentDto.prompt,
        options: updateAgentDto.options,
      },
    });

    // 如果提供了工具包配置，则更新工具包分配
    if (updateAgentDto.toolkits) {
      await this.prisma.agentToolkit.deleteMany({
        where: { agentId: id },
      });
      await this.assignToolkitsToAgent(id, updateAgentDto);
    }

    // 如果提供了知识库配置，则更新知识库分配
    if (updateAgentDto.knowledgeBases) {
      await this.prisma.agentKnowledgeBase.deleteMany({
        where: { agentId: id },
      });
      await this.assignKnowledgeBasesToAgent(id, updateAgentDto);
    }

    // 如果提供了工作流配置，则更新工作流分配
    if (updateAgentDto.workflows) {
      await this.prisma.agentWorkflow.deleteMany({
        where: { agentId: id },
      });
      await this.assignWorkflowsToAgent(id, updateAgentDto);
    }

    // 失效缓存
    await this.redis.del(`agent:${id}:full`, `user:${userId}:agents`, `agent:${id}:toolkit-assignments`);

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    const result = await this.prisma.agent.update({
      where: { id },
      data: { deleted: true },
    });

    // 失效缓存
    await this.redis.del(`agent:${id}:full`, `user:${userId}:agents`);

    return result;
  }

  private wrapToolWithLogging(tool: any): any {
    const logger = this.logger;
    const toolName = tool.metadata?.name || 'unknown';
    const originalCall = tool.call.bind(tool);

    return {
      get metadata() {
        return tool.metadata;
      },
      call: async (input: any) => {
        const startTime = Date.now();
        logger.log(
          `[ToolCall] ▶ ${toolName} | input: ${JSON.stringify(input)}`,
        );
        try {
          const result = await originalCall(input);
          const elapsed = Date.now() - startTime;
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
          logger.log(
            `[ToolCall] ✔ ${toolName} (${elapsed}ms) | output: ${truncated}`,
          );
          return result;
        } catch (error: any) {
          const elapsed = Date.now() - startTime;
          logger.error(
            `[ToolCall] ✘ ${toolName} (${elapsed}ms) | error: ${error.message}`,
          );
          throw error;
        }
      },
    };
  }

  async createAgentInstance(prompt: string, tools: string[], options?: any, userId?: string) {
    const toolsInstances = await Promise.all(
      tools.map(async (tool) => {
        const toolInstance = await this.toolsService.getToolByName(tool, userId);
        return this.wrapToolWithLogging(toolInstance);
      }),
    );
    const agent = await this.llamaIndexService.createAgent(
      toolsInstances,
      prompt,
    );

    return agent;
  }

  // ========== 会话 CRUD ==========

  async getAllSessions(userId: string) {
    return this.redis.getOrSet(
      `user:${userId}:sessions`,
      () => this.prisma.chatSession.findMany({
        where: {
          deleted: false,
          userId,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          agentId: true,
          agentName: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      120,
    );
  }

  async getAgentSessions(agentId: string, userId: string) {
    await this.findOne(agentId, userId);
    return this.redis.getOrSet(
      `agent:${agentId}:sessions:${userId}`,
      () => this.prisma.chatSession.findMany({
        where: { agentId, deleted: false, userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          agentId: true,
          agentName: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      120,
    );
  }

  async getSessionDetail(agentId: string, sessionId: string, userId: string) {
    await this.findOne(agentId, userId);
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, agentId, deleted: false, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return session;
  }

  async deleteSession(agentId: string, sessionId: string, userId: string) {
    await this.findOne(agentId, userId);
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, agentId, deleted: false, userId },
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // 删除该 session 在向量库中的记忆
    await this.chatMemoryService.deleteSessionMemory(agentId, sessionId);

    // 失效会话缓存
    await this.redis.del(`user:${userId}:sessions`, `agent:${agentId}:sessions:${userId}`);

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { deleted: true },
    });
  }

  // ========== 对话 ==========

  async chatWithAgent(agentId: string, chatDto: ChatWithAgentDto, userId: string) {
    const startTime = Date.now();

    // 获取智能体信息
    const agent = await this.findOne(agentId, userId);
    this.logger.log(`[Chat] Agent: ${agent.name} (${agentId})`);
    this.logger.log(`[Chat] User message: ${chatDto.message}`);

    // 会话不存在则创建
    let session = await this.prisma.chatSession.findUnique({
      where: { id: chatDto.sessionId },
    });
    if (!session) {
      session = await this.prisma.chatSession.create({
        data: {
          id: chatDto.sessionId,
          agentId,
          agentName: agent.name,
          userId,
        },
      });
      // 失效会话列表缓存
      await this.redis.del(`user:${userId}:sessions`, `agent:${agentId}:sessions:${userId}`);
    }

    // 保存用户消息到 DB
    await this.prisma.chatMessage.create({
      data: {
        role: 'user',
        content: chatDto.message,
        sessionId: chatDto.sessionId,
      },
    });

    // 从 DB 加载历史消息（排除刚添加的当前用户消息）
    const dbMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: chatDto.sessionId },
      orderBy: { createdAt: 'asc' },
    });
    // 排除最后一条（刚添加的用户消息）
    const fullHistory = dbMessages.slice(0, -1).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // 获取智能体的工具
    const tools = await this.toolsService.getAgentTools(agentId);
    this.logger.log(`[Chat] Available tools: ${tools.map((t: any) => t.metadata?.name || t.name).join(', ')}`);

    // 处理聊天记忆：裁剪历史 + RAG 检索 + 增强 prompt
    const { enhancedPrompt, recentHistory } =
      await this.chatMemoryService.processMemory(
        agentId,
        chatDto.sessionId,
        chatDto.message,
        fullHistory,
        agent.prompt,
      );

    // 创建智能体实例（使用增强后的 prompt）
    const agentInstance = await this.llamaIndexService.createAgent(
      tools,
      enhancedPrompt,
    );

    // 执行对话（只传入最近的历史消息）
    const response = await agentInstance.run(chatDto.message, {
      chatHistory: recentHistory,
    });
    const elapsed = Date.now() - startTime;
    this.logger.log(`[Chat] Response (${elapsed}ms): ${response.data.result.substring(0, 200)}${response.data.result.length > 200 ? '...' : ''}`);

    // 保存助手消息到 DB
    await this.prisma.chatMessage.create({
      data: {
        role: 'assistant',
        content: response.data.result,
        sessionId: chatDto.sessionId,
      },
    });

    const result: any = {
      agentId,
      agentName: agent.name,
      userMessage: chatDto.message,
      response: response.data.result,
      timestamp: new Date().toISOString(),
      context: chatDto.context || {},
    };

    // 第一次对话时生成标题
    if (chatDto.generateTitle) {
      try {
        const title = await this.generateTitle(chatDto.message);
        await this.prisma.chatSession.update({
          where: { id: chatDto.sessionId },
          data: { title },
        });
        result.title = title;
      } catch (error) {
        this.logger.warn(`[Chat] Failed to generate title: ${error}`);
        const fallbackTitle = chatDto.message.slice(0, 50);
        await this.prisma.chatSession.update({
          where: { id: chatDto.sessionId },
          data: { title: fallbackTitle },
        });
        result.title = fallbackTitle;
      }
    }

    // 异步向量化较早的 Q&A 对（fire-and-forget，不阻塞响应）
    const historyWithCurrentReply = [
      ...fullHistory,
      { role: 'user' as const, content: chatDto.message },
      { role: 'assistant' as const, content: response.data.result },
    ];
    this.chatMemoryService
      .vectorizeOlderPairs(agentId, chatDto.sessionId, historyWithCurrentReply)
      .catch((err) => this.logger.error(`[Chat] 异步向量化失败: ${err}`));

    return result;
  }

  async *chatWithAgentStream(agentId: string, chatDto: ChatWithAgentDto, userId: string) {
    const startTime = Date.now();

    // 获取智能体信息
    const agent = await this.findOne(agentId, userId);
    this.logger.log(`[ChatStream] Agent: ${agent.name} (${agentId})`);
    this.logger.log(`[ChatStream] User message: ${chatDto.message}`);

    // 会话不存在则创建
    let session = await this.prisma.chatSession.findUnique({
      where: { id: chatDto.sessionId },
    });
    if (!session) {
      session = await this.prisma.chatSession.create({
        data: {
          id: chatDto.sessionId,
          agentId,
          agentName: agent.name,
          userId,
        },
      });
      // 失效会话列表缓存
      await this.redis.del(`user:${userId}:sessions`, `agent:${agentId}:sessions:${userId}`);
    }

    // 保存用户消息到 DB
    await this.prisma.chatMessage.create({
      data: {
        role: 'user',
        content: chatDto.message,
        sessionId: chatDto.sessionId,
      },
    });

    // 从 DB 加载历史消息（排除刚添加的当前用户消息）
    const dbMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: chatDto.sessionId },
      orderBy: { createdAt: 'asc' },
    });
    const fullHistory = dbMessages.slice(0, -1).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // 获取智能体的工具
    const tools = await this.toolsService.getAgentTools(agentId);
    this.logger.log(`[ChatStream] Available tools: ${tools.map((t: any) => t.metadata?.name || t.name).join(', ')}`);

    // 处理聊天记忆
    const { enhancedPrompt, recentHistory } =
      await this.chatMemoryService.processMemory(
        agentId,
        chatDto.sessionId,
        chatDto.message,
        fullHistory,
        agent.prompt,
      );

    // 创建智能体实例
    const agentInstance = await this.llamaIndexService.createAgent(
      tools,
      enhancedPrompt,
    );

    // 使用 runStream 流式执行对话
    const { agentStreamEvent, stopAgentEvent, agentToolCallEvent, agentToolCallResultEvent } = await import('@llamaindex/workflow');
    const stream = agentInstance.runStream(chatDto.message, {
      chatHistory: recentHistory,
    });

    let fullResponse = '';
    for await (const event of stream) {
      if (agentToolCallEvent.include(event)) {
        yield {
          event: 'tool_call',
          data: {
            toolId: event.data.toolId,
            toolName: event.data.toolName,
            toolKwargs: event.data.toolKwargs,
          },
        };
      } else if (agentToolCallResultEvent.include(event)) {
        const output = event.data.toolOutput;
        const resultStr = typeof output === 'string' ? output : JSON.stringify(output);
        yield {
          event: 'tool_result',
          data: {
            toolId: event.data.toolId,
            toolName: event.data.toolName,
            result: resultStr.length > 1000 ? resultStr.slice(0, 1000) + '...' : resultStr,
          },
        };
      } else if (agentStreamEvent.include(event)) {
        const delta = event.data.delta;
        fullResponse = event.data.response;
        yield { event: 'delta', data: { delta } };
      } else if (stopAgentEvent.include(event)) {
        fullResponse = event.data.result as string;
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`[ChatStream] Response (${elapsed}ms): ${fullResponse.substring(0, 200)}${fullResponse.length > 200 ? '...' : ''}`);

    // 保存助手消息到 DB
    await this.prisma.chatMessage.create({
      data: {
        role: 'assistant',
        content: fullResponse,
        sessionId: chatDto.sessionId,
      },
    });

    // 生成标题
    let title: string | undefined;
    if (chatDto.generateTitle) {
      try {
        title = await this.generateTitle(chatDto.message);
        await this.prisma.chatSession.update({
          where: { id: chatDto.sessionId },
          data: { title },
        });
      } catch (error) {
        this.logger.warn(`[ChatStream] Failed to generate title: ${error}`);
        title = chatDto.message.slice(0, 50);
        await this.prisma.chatSession.update({
          where: { id: chatDto.sessionId },
          data: { title },
        });
      }
    }

    // 发送完成事件
    yield {
      event: 'done',
      data: {
        agentId,
        agentName: agent.name,
        response: fullResponse,
        title,
      },
    };

    // 异步向量化
    const historyWithCurrentReply = [
      ...fullHistory,
      { role: 'user' as const, content: chatDto.message },
      { role: 'assistant' as const, content: fullResponse },
    ];
    this.chatMemoryService
      .vectorizeOlderPairs(agentId, chatDto.sessionId, historyWithCurrentReply)
      .catch((err) => this.logger.error(`[ChatStream] 异步向量化失败: ${err}`));
  }

  private async generateTitle(userMessage: string): Promise<string> {
    const reply = await this.llamaIndexService.chat(
      userMessage,
      '根据用户的消息，生成一个简短的对话标题（不超过20个字）。只输出标题本身，不要加引号、标点或任何额外内容。',
    );
    return reply.trim().slice(0, 50);
  }

  async getAgentToolkits(agentId: string, userId: string) {
    await this.findOne(agentId, userId);

    return this.redis.getOrSet(
      `agent:${agentId}:toolkits-detail`,
      () => this.prisma.agentToolkit.findMany({
        where: { agentId },
        include: {
          toolkit: {
            include: {
              tools: true,
            },
          },
        },
      }),
      3600,
    );
  }

}
