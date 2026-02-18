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
import { TemporalModule } from './temporal/temporal.module';
import { RedisModule } from './redis';
import { ScheduledTaskModule } from './scheduled-task/scheduled-task.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    PrismaModule,
    AuthModule,
    ToolsModule,
    WorkflowModule,
    AgentModule,
    LlamaIndexModule,
    KnowledgeBaseModule,
    HealthModule,
    TemporalModule,
    ScheduledTaskModule,
  ],
  controllers: [],
  providers: [],
})

export class AppModule {}
