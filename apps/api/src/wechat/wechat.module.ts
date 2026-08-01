import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatController } from './wechat.controller.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [WechatController],
  providers: [
    WechatAccountService,
    WechatLoginService,
    WechatMonitorService,
    WechatOutboundService,
  ],
  exports: [WechatOutboundService, WechatAccountService, WechatMonitorService],
})
export class WechatModule {}
