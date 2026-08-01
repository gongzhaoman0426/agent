import { Module, forwardRef } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '../schedule/schedule.module.js';
import { ToolkitModule } from '../toolkit/toolkit.module.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowDiscoveryService } from './workflow-discovery.service.js';
import { WorkflowService } from './workflow.service.js';
import { MorningBriefWorkflow } from './workflows/morning-brief.workflow.js';
import { ResearchSummaryWorkflow } from './workflows/research-summary.workflow.js';
import { TimeQueryWorkflow } from './workflows/time-query.workflow.js';
import { TodoNudgeWorkflow } from './workflows/todo-nudge.workflow.js';

@Module({
  imports: [
    DiscoveryModule,
    ToolkitModule,
    forwardRef(() => ScheduleModule),
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowDiscoveryService,
    WorkflowService,
    TimeQueryWorkflow,
    MorningBriefWorkflow,
    ResearchSummaryWorkflow,
    TodoNudgeWorkflow,
  ],
  exports: [WorkflowService],
})
export class WorkflowModule {}
