import { Module } from '@nestjs/common';
import { ToolkitModule } from '../toolkit/toolkit.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { SkillModule } from '../skill/skill.module.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';
import { AgentRegistryService } from './agent-registry.service.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [ToolkitModule, WorkflowModule, SkillModule],
  controllers: [AgentController],
  providers: [AgentService, AgentRegistryService, ChatService],
  exports: [AgentService, ChatService],
})
export class AgentModule {}
