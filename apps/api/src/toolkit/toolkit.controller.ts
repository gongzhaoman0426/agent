import { Roles } from '../auth/auth.guard.js';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { ToolkitService } from './toolkit.service.js';

@Roles('builder')
@Controller('toolkits')
export class ToolkitController {
  constructor(private readonly toolkitService: ToolkitService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.toolkitService.listForUser(user.userId);
  }

  @Get(':id/settings')
  getSettings(
    @Param('id') toolkitId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.toolkitService.getUserSettings(user.userId, toolkitId);
  }

  @Put(':id/settings')
  updateSettings(
    @Param('id') toolkitId: string,
    @Body() settings: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.toolkitService.updateUserSettings(
      user.userId,
      toolkitId,
      settings ?? {},
    );
  }
}
