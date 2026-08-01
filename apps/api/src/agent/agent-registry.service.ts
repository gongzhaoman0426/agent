import { Injectable, Logger } from '@nestjs/common';
import { Agent as MastraAgent } from '@mastra/core/agent';
import type {
  Agent,
  AgentSkill,
  AgentToolkit,
  AgentWorkflow,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MastraService } from '../mastra/mastra.service.js';
import { McpServerService } from '../mcp/mcp-server.service.js';
import { ToolkitService } from '../toolkit/toolkit.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { SkillService } from '../skill/skill.service.js';

const SKILL_TOOLKIT_ID = 'skill-toolkit';

type AgentWithMounts = Agent & {
  agentToolkits: AgentToolkit[];
  agentWorkflows: AgentWorkflow[];
  agentSkills: AgentSkill[];
};

const mountsInclude = {
  agentToolkits: true,
  agentWorkflows: true,
  agentSkills: true,
} as const;

/**
 * 性能核心：按数据库配置构建 Mastra Agent 实例并缓存。
 * 缓存键含 updatedAt，Agent 配置变更（CRUD 里会 touch updatedAt，
 * 且级联失效所有祖先）自动重建；工具与工作流都是代码单例，
 * 实例构建只是组装引用，开销极小。
 *
 * 子智能体：挂载记录（AgentSubAgent）递归构建为 Mastra `agents`，
 * 自动注册为 agent-<childId> 工具；挂载时已做环校验，这里再兜底跳过。
 */
@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly cache = new Map<
    string,
    { key: string; instance: MastraAgent }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastraService: MastraService,
    private readonly toolkitService: ToolkitService,
    private readonly mcpServers: McpServerService,
    private readonly workflowService: WorkflowService,
    private readonly skillService: SkillService,
  ) {}

  async getInstance(agent: AgentWithMounts): Promise<MastraAgent> {
    return this.getInstanceInternal(agent, new Set([agent.id]));
  }

  invalidate(agentId: string) {
    this.cache.delete(agentId);
  }

  private async getInstanceInternal(
    agent: AgentWithMounts,
    visited: Set<string>,
  ): Promise<MastraAgent> {
    const key = `${agent.updatedAt.getTime()}`;
    const cached = this.cache.get(agent.id);
    if (cached && cached.key === key) {
      return cached.instance;
    }

    const instance = await this.build(agent, visited);
    this.cache.set(agent.id, { key, instance });
    this.logger.log(`构建 Agent 实例: ${agent.name} (${agent.id})`);
    return instance;
  }

  private async build(
    agent: AgentWithMounts,
    visited: Set<string>,
  ): Promise<MastraAgent> {
    const toolkitIds = agent.agentToolkits.map((mount) => mount.toolkitId);
    const workflowIds = agent.agentWorkflows.map((mount) => mount.workflowId);
    const skillNames = agent.agentSkills.map((mount) => mount.skillName);

    // 挂载了技能则自动附带 skill-toolkit（use_skill 工具）
    if (skillNames.length > 0 && !toolkitIds.includes(SKILL_TOOLKIT_ID)) {
      toolkitIds.push(SKILL_TOOLKIT_ID);
    }

    const codeTools = this.toolkitService.getToolsInput(toolkitIds);
    const mcpTools = agent.createdById
      ? await this.mcpServers.getToolsInputForAgent(
          agent.createdById,
          toolkitIds,
        )
      : {};
    const tools = { ...codeTools, ...mcpTools };
    const workflows = this.workflowService.getWorkflowsInput(workflowIds);
    const subAgents = await this.buildSubAgents(agent.id, visited);

    let instructions = agent.prompt;
    // 技能归属 Agent 创建者
    const skillBlock = agent.createdById
      ? await this.skillService.buildSummaryBlock(agent.createdById, skillNames)
      : '';
    if (skillBlock) {
      instructions += `\n${skillBlock}`;
    }

    return new MastraAgent({
      id: agent.id,
      name: agent.name,
      // 描述会成为其作为子智能体工具时的工具描述，保证非空
      description: agent.description || `名为「${agent.name}」的智能体`,
      instructions,
      model: this.mastraService.resolveModel(agent.model),
      tools,
      workflows,
      ...(Object.keys(subAgents).length > 0 && { agents: subAgents }),
      memory: this.mastraService.memory,
    });
  }

  /** 递归构建挂载的子智能体，visited 防御运行期环 */
  private async buildSubAgents(
    parentId: string,
    visited: Set<string>,
  ): Promise<Record<string, MastraAgent>> {
    const mounts = await this.prisma.agentSubAgent.findMany({
      where: { parentId, child: { deleted: false } },
      include: { child: { include: mountsInclude } },
    });

    const subAgents: Record<string, MastraAgent> = {};
    for (const mount of mounts) {
      if (visited.has(mount.childId)) {
        this.logger.warn(
          `跳过循环挂载: ${parentId} -> ${mount.childId}（${mount.child.name}）`,
        );
        continue;
      }
      subAgents[mount.childId] = await this.getInstanceInternal(
        mount.child,
        new Set([...visited, mount.childId]),
      );
    }
    return subAgents;
  }
}
