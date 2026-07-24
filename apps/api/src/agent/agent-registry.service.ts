import { Injectable, Logger } from '@nestjs/common';
import { Agent as MastraAgent } from '@mastra/core/agent';
import type { Agent, AgentSkill, AgentToolkit, AgentWorkflow } from '@prisma/client';
import { MastraService } from '../mastra/mastra.service.js';
import { ToolkitService } from '../toolkit/toolkit.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { SkillService } from '../skill/skill.service.js';

const SKILL_TOOLKIT_ID = 'skill-toolkit';

type AgentWithMounts = Agent & {
  agentToolkits: AgentToolkit[];
  agentWorkflows: AgentWorkflow[];
  agentSkills: AgentSkill[];
};

/**
 * 性能核心：按数据库配置构建 Mastra Agent 实例并缓存。
 * 缓存键含 updatedAt，Agent 配置变更（CRUD 里会 touch updatedAt）自动失效重建；
 * 工具与工作流都是代码单例，实例构建只是组装引用，开销极小。
 */
@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly cache = new Map<
    string,
    { key: string; instance: MastraAgent }
  >();

  constructor(
    private readonly mastraService: MastraService,
    private readonly toolkitService: ToolkitService,
    private readonly workflowService: WorkflowService,
    private readonly skillService: SkillService,
  ) {}

  getInstance(agent: AgentWithMounts): MastraAgent {
    const key = `${agent.updatedAt.getTime()}`;
    const cached = this.cache.get(agent.id);
    if (cached && cached.key === key) {
      return cached.instance;
    }

    const instance = this.build(agent);
    this.cache.set(agent.id, { key, instance });
    this.logger.log(`构建 Agent 实例: ${agent.name} (${agent.id})`);
    return instance;
  }

  invalidate(agentId: string) {
    this.cache.delete(agentId);
  }

  private build(agent: AgentWithMounts): MastraAgent {
    const toolkitIds = agent.agentToolkits.map((mount) => mount.toolkitId);
    const workflowIds = agent.agentWorkflows.map((mount) => mount.workflowId);
    const skillNames = agent.agentSkills.map((mount) => mount.skillName);

    // 挂载了技能则自动附带 skill-toolkit（use_skill 工具）
    if (skillNames.length > 0 && !toolkitIds.includes(SKILL_TOOLKIT_ID)) {
      toolkitIds.push(SKILL_TOOLKIT_ID);
    }

    const tools = this.toolkitService.getToolsInput(toolkitIds);
    const workflows = this.workflowService.getWorkflowsInput(workflowIds);

    let instructions = agent.prompt;
    const skillBlock = this.skillService.buildSummaryBlock(skillNames);
    if (skillBlock) {
      instructions += `\n${skillBlock}`;
    }

    return new MastraAgent({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? undefined,
      instructions,
      model: this.mastraService.resolveModel(agent.model),
      tools,
      workflows,
      memory: this.mastraService.memory,
    });
  }
}
