import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { writeSseStream } from '../common/sse.js';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { AgentService } from './agent.service.js';
import { ChatService } from './chat.service.js';
import { chatSchema } from './agent.types.js';

@Controller('agents')
@Roles('builder')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly chatService: ChatService,
  ) {}

  // ---- 会话（静态路由需在 :id 之前声明） ----

  @Get('sessions/all')
  listAllSessions(@CurrentUser() user: CurrentUserPayload) {
    return this.chatService.listAllSessions(user.userId);
  }

  @Get('sessions/detail/:sessionId')
  getSessionDetailById(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatService.getSessionDetail(sessionId, user.userId);
  }

  @Delete('sessions/detail/:sessionId')
  deleteSessionById(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatService.deleteSession(sessionId, user.userId);
  }

  // ---- Agent CRUD ----

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.agentService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agentService.findOwned(id, user.userId);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    return this.agentService.create(body, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentService.update(id, body, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agentService.remove(id, user.userId);
  }

  // ---- 会话详情 / 删除 ----

  @Get(':id/sessions/:sessionId')
  getSessionDetail(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatService.getSessionDetail(sessionId, user.userId);
  }

  @Delete(':id/sessions/:sessionId')
  deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatService.deleteSession(sessionId, user.userId);
  }

  // ---- 对话 ----

  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const dto = this.parseChatDto(body);
    const agent = await this.agentService.findOwned(id, user.userId);
    return this.chatService.chat(agent, dto, user.userId);
  }

  @Post(':id/chat/stream')
  async chatStream(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const dto = this.parseChatDto(body);
    const agent = await this.agentService.findOwned(id, user.userId);

    await writeSseStream(
      res,
      this.chatService.chatStream(agent, dto, user.userId),
      this.logger,
    );
  }

  private parseChatDto(body: unknown) {
    const result = chatSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        `参数校验失败: ${result.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    return result.data;
  }
}
