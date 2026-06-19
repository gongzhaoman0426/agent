import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FeishuController } from './feishu.controller';
import { FeishuService } from './feishu.service';

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [FeishuController],
  providers: [FeishuService],
})
export class FeishuModule {}
