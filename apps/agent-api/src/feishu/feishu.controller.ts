import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';
import { FeishuService } from './feishu.service';
import { UpsertFeishuBotBindingDto } from './feishu.type';

@Controller()
export class FeishuController {
  constructor(private readonly feishuService: FeishuService) {}

  @Get('agents/:agentId/feishu-bot')
  async getBinding(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.feishuService.getBinding(agentId, user.userId);
  }

  @Put('agents/:agentId/feishu-bot')
  async upsertBinding(
    @Param('agentId') agentId: string,
    @Body() dto: UpsertFeishuBotBindingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.feishuService.upsertBinding(agentId, user.userId, dto);
  }

  @Delete('agents/:agentId/feishu-bot')
  async deleteBinding(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.feishuService.deleteBinding(agentId, user.userId);
    return { success: true };
  }
}
