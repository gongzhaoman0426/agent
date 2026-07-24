import { Global, Module } from '@nestjs/common';
import { MastraService } from './mastra.service.js';

@Global()
@Module({
  providers: [MastraService],
  exports: [MastraService],
})
export class MastraModule {}
