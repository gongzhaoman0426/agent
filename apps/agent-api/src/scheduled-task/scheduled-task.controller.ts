import { Controller, Get, Query } from '@nestjs/common';
import { ScheduledTaskService } from './scheduled-task.service';

@Controller('scheduled-tasks')
export class ScheduledTaskController {
  constructor(private readonly scheduledTaskService: ScheduledTaskService) {}

  /**
   * GET /api/scheduled-tasks/new-results?sessionPrefix=api:feishu-&since=2026-02-19T08:00:00Z
   * 供飞书 bot 轮询，查询有新执行结果的定时任务
   */
  @Get('new-results')
  async getNewResults(
    @Query('sessionPrefix') sessionPrefix: string,
    @Query('since') since: string,
  ) {
    const sinceDate = new Date(since || Date.now() - 60_000);
    return this.scheduledTaskService.getNewResults(
      sessionPrefix || 'api:feishu-',
      sinceDate,
    );
  }
}
