import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  SCHEDULE_MAX_CONCURRENCY,
  SCHEDULE_POLL_INTERVAL_MS,
} from './schedule.constants.js';
import { ScheduleService } from './schedule.service.js';

/**
 * 进程内轮询调度器：到期任务 → 固定 session 对话 → 渠道回传。
 * 个人部署场景足够；多实例时依赖 DB 乐观锁 claim，避免双跑。
 */
@Injectable()
export class ScheduleRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleRunnerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly inflight = new Set<string>();

  constructor(private readonly scheduleService: ScheduleService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, SCHEDULE_POLL_INTERVAL_MS);
    // 不阻止进程退出
    this.timer.unref?.();
    this.logger.log(
      `定时任务调度已启动（每 ${SCHEDULE_POLL_INTERVAL_MS / 1000}s 轮询）`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const slots = SCHEDULE_MAX_CONCURRENCY - this.inflight.size;
      if (slots <= 0) return;

      const due = await this.scheduleService.claimDueTasks(slots);
      for (const task of due) {
        this.inflight.add(task.id);
        void this.scheduleService
          .executeTask(task)
          .catch((error: unknown) => {
            this.logger.error(
              `任务 ${task.id} 未捕获异常: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          })
          .finally(() => {
            this.inflight.delete(task.id);
          });
      }
    } catch (error) {
      this.logger.error(
        `调度轮询失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
