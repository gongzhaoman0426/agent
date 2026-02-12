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
    return this.agentService.chatWithAgent(id, chatDto, user.userId);
  }

  @Post(':id/chat/stream')
  async chatStream(
    @Param('id') id: string,
    @Body() chatDto: ChatWithAgentDto,
    @Res() res: Response,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const chunk of this.agentService.chatWithAgentStream(id, chatDto, user.userId)) {
        res.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
      }
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`);
    }
    res.end();
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
