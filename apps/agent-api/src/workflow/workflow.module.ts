import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ToolsModule } from '../tool/tools.module';

import { WorkflowController } from './workflow.controller';
import { WorkflowDiscoveryService } from './workflow-discovery.service';
import { WorkflowService } from './workflow.service';
import { TimeQueryWorkflow } from './workflows/time-query.workflow';
import { InvestmentReportWorkflow } from './workflows/investment-report.workflow';

@Module({
  controllers: [WorkflowController],
  imports: [ToolsModule, AgentModule, DiscoveryModule, PrismaModule],
  providers: [WorkflowService, WorkflowDiscoveryService, TimeQueryWorkflow, InvestmentReportWorkflow],
  exports: [WorkflowService, WorkflowDiscoveryService],
})
export class WorkflowModule {}
