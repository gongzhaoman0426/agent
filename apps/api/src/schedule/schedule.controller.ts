import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { ScheduleService } from './schedule.service.js';

const ackSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(50),
});

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /** Web 渠道：拉取尚未展示的定时任务结果 */
  @Get('inbox')
  listInbox(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : 20;
    return this.scheduleService.listWebInbox(
      user.userId,
      Number.isFinite(limit) ? limit : 20,
    );
  }

  /** Web 渠道：确认已读 / 已展示 */
  @Post('inbox/ack')
  ackInbox(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const parsed = ackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        `参数校验失败: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    return this.scheduleService.ackDelivered(user.userId, parsed.data.taskIds);
  }
}
