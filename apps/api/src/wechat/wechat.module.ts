import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatController } from './wechat.controller.js';
import { WechatInboundService } from './wechat-inbound.service.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { WechatToolkit } from './wechat.toolkit.js';
import { WechatTtsService } from './wechat-tts.service.js';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [WechatController],
  providers: [
    WechatAccountService,
    WechatInboundService,
    WechatLoginService,
    WechatMonitorService,
    WechatTtsService,
    WechatOutboundService,
    WechatToolkit,
  ],
  exports: [WechatOutboundService, WechatAccountService, WechatMonitorService],
})
export class WechatModule {}
