import { Body, Controller, Post, Get, Param, Delete, Put, ForbiddenException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

import { WorkflowDiscoveryService } from './workflow-discovery.service';
import { WorkflowService } from './workflow.service';
import dslSchema from './DSL_schema/dsl_schema_v1.json';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.type';

export class CreateWorkflowDslDto {
  @IsString()
  @IsNotEmpty()
  userMessage!: string;
}

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsNotEmpty()
  dsl!: any;
}

export class ExecuteWorkflowDto {
  @IsObject()
  @IsNotEmpty()
  input!: any;

  @IsObject()
  @IsOptional()
  context?: any;
}

export class UpdateWorkflowDslDto {
  @IsObject()
  @IsNotEmpty()
  dsl!: any;
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
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowDiscoveryService: WorkflowDiscoveryService,
  ) {}

  @Post('generate-dsl')
  async generateDsl(@Body() body: CreateWorkflowDslDto) {
    const dsl = await this.workflowService.generateDsl(
      dslSchema,
      body.userMessage,
    );

    return { dsl };
  }

  @Post()
  async createWorkflow(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowService.createWorkflow(createWorkflowDto, user.userId);
  }

  @Get()
  async getAllWorkflows(@CurrentUser() user: CurrentUserPayload) {
    return this.workflowService.getAllWorkflows(user.userId);
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

  @Get('temporal/:temporalWorkflowId/status')
  async getTemporalWorkflowStatus(
    @Param('temporalWorkflowId') temporalWorkflowId: string,
  ) {
    return this.workflowService.getTemporalWorkflowStatus(temporalWorkflowId);
  }

  @Get('temporal/:temporalWorkflowId/result')
  async getTemporalWorkflowResult(
    @Param('temporalWorkflowId') temporalWorkflowId: string,
  ) {
    return this.workflowService.getTemporalWorkflowResult(temporalWorkflowId);
  }

  @Post('temporal/:temporalWorkflowId/cancel')
  async cancelTemporalWorkflow(
    @Param('temporalWorkflowId') temporalWorkflowId: string,
  ) {
    await this.workflowService.cancelTemporalWorkflow(temporalWorkflowId);
    return { cancelled: true, temporalWorkflowId };
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



  @Delete(':id')
  async deleteWorkflow(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (this.workflowDiscoveryService.isCodeWorkflow(id)) {
      throw new ForbiddenException('Cannot delete a code-defined workflow');
    }
    // 先清理关联的智能体
    await this.workflowService.deleteWorkflowAgents(id);
    // 再删除工作流
    return this.workflowService.deleteWorkflow(id, user.userId);
  }
}
