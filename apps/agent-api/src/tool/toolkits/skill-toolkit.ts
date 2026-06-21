import { Injectable } from '@nestjs/common';
import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';
import { SkillService } from '../../skill/skill.service';

@toolkitId('skill-toolkit-01')
@Injectable()
export class SkillToolkit extends BaseToolkit {
  name = '技能工具箱';
  description = '读取可用技能指令';
  settings = {};
  tools: ToolsType[] = [];

  constructor(
    private readonly skillService: SkillService,
  ) {
    super();
  }

  validateSettings(): void {
    // No settings to validate
  }

  protected async initTools(): Promise<void> {
    const { FunctionTool } = await this.llamaindexService.getLlamaindexModules();

    this.tools = [
      // 读取技能
      FunctionTool.from(this.useSkill.bind(this), {
        name: 'useSkill',
        description: '读取指定技能的完整指令内容。仅在 <available_skills> 中列出的技能可用。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '技能名称',
            },
            runScripts: {
              type: 'boolean',
              description: '是否执行技能关联的脚本，默认 false',
            },
            scriptInput: {
              type: 'string',
              description: '传递给脚本的输入数据',
            },
          },
          required: ['name'],
        },
      }),
    ];
  }

  async useSkill(params: {
    name: string;
    runScripts?: boolean;
    scriptInput?: string;
  }): Promise<string> {
    try {
      if (!this.userId) {
        return '错误: 无法获取用户信息';
      }

      const content = await this.skillService.activateSkill(
        params.name,
        this.userId,
        params.runScripts || false,
        params.scriptInput || '',
      );

      return content;
    } catch (error) {
      return `读取技能失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
