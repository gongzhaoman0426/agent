import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { ToolkitService } from './toolkit.service.js';

@Controller('toolkits')
export class ToolkitController {
  constructor(private readonly toolkitService: ToolkitService) {}

  @Get()
  list() {
    return this.toolkitService.list();
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
