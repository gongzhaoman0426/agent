import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller.js';
import { McpServerService } from './mcp-server.service.js';

@Module({
  controllers: [McpController],
  providers: [McpServerService],
  exports: [McpServerService],
})
export class McpModule {}
