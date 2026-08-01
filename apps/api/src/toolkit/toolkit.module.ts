import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ToolkitDiscoveryService } from './toolkit-discovery.service.js';
import { ToolkitService } from './toolkit.service.js';
import { ToolkitController } from './toolkit.controller.js';
import { CommonToolkit } from './toolkits/common.toolkit.js';
import { HomeAssistantToolkit } from './toolkits/home-assistant.toolkit.js';
import { WebSearchToolkit } from './toolkits/web-search.toolkit.js';
import { WebSearchBrowserService } from './web-search/web-search-browser.service.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [ToolkitController],
  providers: [
    ToolkitDiscoveryService,
    ToolkitService,
    CommonToolkit,
    HomeAssistantToolkit,
    WebSearchBrowserService,
    WebSearchToolkit,
  ],
  exports: [ToolkitService, ToolkitDiscoveryService],
})
export class ToolkitModule {}
