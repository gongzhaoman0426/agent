import {  Module } from '@nestjs/common';

import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ChatMemoryService } from './chat-memory.service';
import { LlamaIndexModule } from '../llamaindex/llamaindex.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ToolsModule } from '../tool/tools.module';
import { SkillModule } from '../skill/skill.module';

@Module({
  imports: [PrismaModule, LlamaIndexModule, ToolsModule, SkillModule],
  controllers: [AgentController],
  providers: [AgentService, ChatMemoryService],
  exports: [AgentService],
})
export class AgentModule {}
