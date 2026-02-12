import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ToolkitsService } from './toolkits.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

@Controller('toolkits')
export class ToolkitsController {
  constructor(private readonly toolkitsService: ToolkitsService) {}

  @Get()
  async getAllToolkits() {
    return this.toolkitsService.getAllToolkits();
  }

  @Get(':id/settings')
  async getToolkitSettings(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.toolkitsService.getUserToolkitSettings(user.userId, id);
  }

  @Put(':id/settings')
  async updateToolkitSettings(
    @Param('id') id: string,
    @Body() body: { settings: any },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.toolkitsService.updateUserToolkitSettings(user.userId, id, body.settings);
  }
}
