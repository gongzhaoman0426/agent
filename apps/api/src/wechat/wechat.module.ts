import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { ToolkitModule } from '../toolkit/toolkit.module.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatAdminOpsService } from './wechat-admin-ops.service.js';
import { WechatAdminService } from './wechat-admin.service.js';
import { WechatController } from './wechat.controller.js';
import { WechatFriendRequestService } from './wechat-friend-request.service.js';
import { WechatInboundService } from './wechat-inbound.service.js';
import { WechatInboxService } from './wechat-inbox.service.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { WechatReplyGateService } from './wechat-reply-gate.service.js';
import { WechatToolkit } from './wechat.toolkit.js';
import { WechatTransferService } from './wechat-transfer.service.js';
import { WechatTtsService } from './wechat-tts.service.js';

@Module({
  imports: [forwardRef(() => AgentModule), ToolkitModule],
  controllers: [WechatController],
  providers: [
    WechatAccountService,
    WechatAdminService,
    WechatAdminOpsService,
    WechatFriendRequestService,
    WechatTransferService,
    WechatReplyGateService,
    WechatInboundService,
    WechatInboxService,
    WechatLoginService,
    WechatMonitorService,
    WechatTtsService,
    WechatOutboundService,
    WechatToolkit,
  ],
  exports: [WechatOutboundService, WechatAccountService, WechatMonitorService],
})
export class WechatModule {}
