import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  list() {
    return this.workflowService.list();
  }

  @Post(':id/execute')
  execute(
    @Param('id') id: string,
    @Body() body: { input?: Record<string, unknown> },
  ) {
    return this.workflowService.execute(id, body?.input ?? {});
  }
}
