import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AgentModule } from './agent/agent.module';
import { LlamaIndexModule } from './llamaindex/llamaindex.module';
import { PrismaModule } from './prisma/prisma.module';
import { ToolsModule } from './tool/tools.module';
import { WorkflowModule } from './workflow/workflow.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ScheduledTaskModule } from './scheduled-task/scheduled-task.module';
import { AccessTokenModule } from './access-token/access-token.module';
import { SkillModule } from './skill/skill.module';
import { FeishuModule } from './feishu/feishu.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ToolsModule,
    WorkflowModule,
    AgentModule,
    LlamaIndexModule,
    KnowledgeBaseModule,
    HealthModule,
    ScheduledTaskModule,
    AccessTokenModule,
    SkillModule,
    FeishuModule,
  ],
  controllers: [],
  providers: [],
})

export class AppModule {}
