import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { WechatModule } from '../wechat/wechat.module.js';
import { ChannelDeliveryService } from './channel-delivery.service.js';
import { ScheduleController } from './schedule.controller.js';
import { ScheduleRunnerService } from './schedule-runner.service.js';
import { ScheduleService } from './schedule.service.js';
import { ScheduleToolkit } from './schedule.toolkit.js';

@Module({
  imports: [forwardRef(() => AgentModule), forwardRef(() => WechatModule)],
  controllers: [ScheduleController],
  providers: [
    ScheduleService,
    ScheduleRunnerService,
    ChannelDeliveryService,
    ScheduleToolkit,
  ],
  exports: [ScheduleService],
})
export class ScheduleModule {}
