import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MastraModule } from './mastra/mastra.module.js';
import { ToolkitModule } from './toolkit/toolkit.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { SkillModule } from './skill/skill.module.js';
import { AgentModule } from './agent/agent.module.js';
import { ScheduleModule } from './schedule/schedule.module.js';
import { WechatModule } from './wechat/wechat.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MastraModule,
    ToolkitModule,
    McpModule,
    WorkflowModule,
    SkillModule,
    AgentModule,
    ScheduleModule,
    WechatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
