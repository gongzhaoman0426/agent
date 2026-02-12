import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { ToolkitsService } from './toolkits.service';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  constructor(
    private toolkitsService: ToolkitsService,
    private readonly prismaService: PrismaService,
  ) {}

  async getAgentTools(agentId: string): Promise<any[]> {
    const tools: any[] = [];

    const agentToolkitInstances =
      await this.toolkitsService.getAgentToolkitInstances(agentId);
    for (const agentToolkitInstance of agentToolkitInstances) {
      this.logger.log(
        `agentToolkitInstance ${agentToolkitInstance.name}'s
        tool number: ${(await agentToolkitInstance.getTools()).length}`,
      );
      tools.push(...(await agentToolkitInstance.getTools()));
    }

    return tools;
  }

  async getToolByName(name: string, userId?: string) {
    const tool = await this.prismaService.tool.findUnique({
      where: { name },
      include: { toolkit: true },
    });
    if (!tool) throw new NotFoundException(`Tool ${name} not found`);

    // 有 userId 时查用户级 settings，否则用 toolkit 默认 settings
    let settings = tool.toolkit.settings || {};
    if (userId) {
      const userSettings = await this.toolkitsService.getUserToolkitSettings(userId, tool.toolkitId);
      if (Object.keys(userSettings).length > 0) {
        settings = userSettings;
      }
    }

    const toolkit = await this.toolkitsService.getToolkitInstance(
      tool.toolkitId,
      settings,
      '',
    );
    const tools = await toolkit.getTools();
    const instancedTool = tools.find((t) => t.metadata.name === name);

    if (!instancedTool)
      throw new NotFoundException(
        `Tool ${name} not found in toolkit ${tool.toolkit.name}`,
      );
    return instancedTool;
  }
}
