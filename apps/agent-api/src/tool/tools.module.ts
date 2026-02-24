import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { CommonToolkit } from './toolkits/common-toolkit';
import { ToolExplorerToolkit } from './toolkits/tool-explorer-toolkit';
import { KnowledgeBaseToolkit } from './toolkits/knowledge-base-toolkit';
import { KnowledgeBaseExplorerToolkit } from './toolkits/knowledge-base-explorer-toolkit';
import { WorkflowToolkit } from './toolkits/workflow-toolkit';
import { FeishuBitableToolkit } from './toolkits/feishu-bitable-toolkit';
import { ScheduledTaskToolkit } from './toolkits/scheduled-task-toolkit';
import { TushareToolkit } from './toolkits/tushare-toolkit';
import { TavilyToolkit } from './toolkits/tavily-toolkit';
import { CoinGeckoToolkit } from './toolkits/coingecko-toolkit';
import { ToolkitsController } from './toolkits.controller';
import { ToolkitsService } from './toolkits.service';
import { ToolsService } from './tools.service';
import { LlamaIndexModule } from '../llamaindex/llamaindex.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScheduledTaskModule } from '../scheduled-task/scheduled-task.module';

@Module({
  imports: [DiscoveryModule, LlamaIndexModule, KnowledgeBaseModule, PrismaModule, ScheduledTaskModule],
  controllers: [ToolkitsController],
  providers: [
    ToolsService,
    ToolkitsService,
    CommonToolkit,
    ToolExplorerToolkit,
    KnowledgeBaseToolkit,
    KnowledgeBaseExplorerToolkit,
    WorkflowToolkit,
    FeishuBitableToolkit,
    ScheduledTaskToolkit,
    TushareToolkit,
    TavilyToolkit,
    CoinGeckoToolkit,
  ],
  exports: [ToolsService, ToolkitsService],
})
export class ToolsModule {}
