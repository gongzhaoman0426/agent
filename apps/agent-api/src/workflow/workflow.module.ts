import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ToolsModule } from '../tool/tools.module';

import { EventBus } from './event-bus';
import { WorkflowController } from './workflow.controller';
import { WorkflowDiscoveryService } from './workflow-discovery.service';
import { WorkflowService } from './workflow.service';
import { TimeQueryWorkflow } from './workflows/time-query.workflow';

@Module({
  controllers: [WorkflowController],
  imports: [ToolsModule, AgentModule, DiscoveryModule, PrismaModule],
  providers: [WorkflowService, EventBus, WorkflowDiscoveryService, TimeQueryWorkflow],
  exports: [WorkflowService, EventBus, WorkflowDiscoveryService],
})
export class WorkflowModule {}
