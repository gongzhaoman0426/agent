import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AgentService } from './agent.service';
import { CreateAgentDto, UpdateAgentDto, ChatWithAgentDto } from './agent.type';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.agentService.findAll(user.userId);
  }

  // 会话端点（必须在 :id 路由之前注册，避免路由冲突）
  @Get('sessions/all')
  async getAllSessions(@CurrentUser() user: CurrentUserPayload) {
    return this.agentService.getAllSessions(user.userId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.findOne(id, user.userId);
  }

  @Post()
  async create(
    @Body() createAgentDto: CreateAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.create(createAgentDto, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAgentDto: UpdateAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.update(id, updateAgentDto, user.userId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.remove(id, user.userId);
  }

  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @Body() chatDto: ChatWithAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.chatWithAgent(id, chatDto, user);
  }

  @Post(':id/chat/stream')
  async chatStream(
    @Param('id') id: string,
    @Body() chatDto: ChatWithAgentDto,
    @Res() res: Response,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 等代理的响应缓冲
    res.flushHeaders();

    // 检测客户端断开，及时中止后续生成，避免浪费 LLM 调用
    let clientClosed = false;
    res.on('close', () => {
      clientClosed = true;
    });

    // 心跳：防止空闲连接被代理/网关断开
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 15000);

    try {
      for await (const chunk of this.agentService.chatWithAgentStream(id, chatDto, user)) {
        if (clientClosed) break;
        res.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
      }
    } catch (error) {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  @Get(':id/toolkits')
  async getAgentToolkits(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.getAgentToolkits(id, user.userId);
  }

  @Get(':id/sessions')
  async getAgentSessions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.getAgentSessions(id, user.userId);
  }

  @Get(':id/sessions/:sessionId')
  async getSessionDetail(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.getSessionDetail(id, sessionId, user.userId);
  }

  @Delete(':id/sessions/:sessionId')
  async deleteSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.deleteSession(id, sessionId, user.userId);
  }
}
