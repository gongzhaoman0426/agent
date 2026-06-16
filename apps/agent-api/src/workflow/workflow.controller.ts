import { Body, Controller, Post, Get, Param, Put } from '@nestjs/common';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

import { WorkflowService } from './workflow.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

export class ExecuteWorkflowDto {
  @IsObject()
  @IsNotEmpty()
  input!: any;

  @IsObject()
  @IsOptional()
  context?: any;
}

export class UpdateWorkflowAgentDto {
  @IsString()
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  options?: any;
}

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  async getAllWorkflows() {
    return this.workflowService.getAllWorkflows();
  }

  @Get(':id')
  async getWorkflow(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowService.getWorkflow(id, user.userId);
  }

  @Post(':id/execute')
  async executeWorkflow(
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowService.executeWorkflow(
      id,
      executeDto.input,
      executeDto.context,
      user.userId,
    );
  }

  @Get(':id/agents')
  async getWorkflowAgents(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.workflowService.getWorkflow(id, user.userId);
    return this.workflowService.getWorkflowAgents(id);
  }

  @Put(':id/agents/:agentName')
  async updateWorkflowAgent(
    @Param('id') workflowId: string,
    @Param('agentName') agentName: string,
    @Body() updateDto: UpdateWorkflowAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.workflowService.getWorkflow(workflowId, user.userId);
    return this.workflowService.updateWorkflowAgent(workflowId, agentName, updateDto);
  }
}
