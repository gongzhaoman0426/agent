import { Module } from '@nestjs/common';

import { LlamaindexService } from './llamaindex.service';
import { LlamaindexObserverService } from './llamaindex-observer.service';

@Module({
  providers: [LlamaindexObserverService, LlamaindexService],
  exports: [LlamaindexService],
})
export class LlamaIndexModule {}
