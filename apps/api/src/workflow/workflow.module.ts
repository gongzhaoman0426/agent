import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { WorkflowDiscoveryService } from './workflow-discovery.service.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';
import { TimeQueryWorkflow } from './workflows/time-query.workflow.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [WorkflowController],
  providers: [WorkflowDiscoveryService, WorkflowService, TimeQueryWorkflow],
  exports: [WorkflowService],
})
export class WorkflowModule {}
