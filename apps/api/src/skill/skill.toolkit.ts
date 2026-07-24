import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ToolsInput } from '@mastra/core/agent';
import { toolkitId } from '../toolkit/toolkit.decorator.js';
import type { ToolkitDefinition } from '../toolkit/toolkit.types.js';
import { SkillService } from './skill.service.js';

/**
 * 技能工具包：Agent 挂载技能后自动附带（见 AgentRegistryService），
 * use_skill 按需加载技能全文，避免把长指令塞进 system prompt。
 */
@toolkitId('skill-toolkit')
export class SkillToolkit implements ToolkitDefinition {
  readonly name = '技能工具';
  readonly description = '按需加载技能（SKILL.md）的完整指令，可选执行技能脚本';
  readonly tools: ToolsInput;

  constructor(private readonly skillService: SkillService) {
    this.tools = {
      use_skill: createTool({
        id: 'use-skill',
        description:
          '按名称加载技能的完整指令内容。当用户请求与 <available_skills> 中某技能相关时调用。可选执行技能自带脚本。',
        inputSchema: z.object({
          name: z.string().describe('技能名称，来自 <available_skills>'),
          runScripts: z
            .boolean()
            .optional()
            .describe('是否执行技能自带的脚本，默认 false'),
          scriptInput: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('传给脚本的入参对象'),
        }),
        execute: async ({ name, runScripts, scriptInput }) =>
          this.skillService.activate(name, runScripts ?? false, scriptInput),
      }),
    };
  }
}
