import { Module, Global } from '@nestjs/common';

import { TemporalClientService } from './temporal-client.service';
import { TemporalWorkerService } from './temporal-worker.service';
import { ToolsModule } from '../tool/tools.module';
import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LlamaIndexModule } from '../llamaindex/llamaindex.module';

@Global()
@Module({
  imports: [ToolsModule, AgentModule, PrismaModule, LlamaIndexModule],
  providers: [TemporalClientService, TemporalWorkerService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
