import { Module, Global } from '@nestjs/common';

import { TemporalClientService } from './temporal-client.service';
import { TemporalWorkerService } from './temporal-worker.service';
import { ToolsModule } from '../tool/tools.module';
import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [ToolsModule, AgentModule, PrismaModule],
  providers: [TemporalClientService, TemporalWorkerService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
