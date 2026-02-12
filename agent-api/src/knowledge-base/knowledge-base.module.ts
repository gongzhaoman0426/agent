import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LlamaIndexModule } from '../llamaindex/llamaindex.module';

@Module({
  imports: [PrismaModule, LlamaIndexModule],
  providers: [KnowledgeBaseService],
  controllers: [KnowledgeBaseController],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
