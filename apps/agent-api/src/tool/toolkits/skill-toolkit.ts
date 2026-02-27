import { Injectable } from '@nestjs/common';
import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';
import { SkillService } from '../../skill/skill.service';
import { PrismaService } from '../../prisma/prisma.service';

@toolkitId('skill-toolkit-01')
@Injectable()
export class SkillToolkit extends BaseToolkit {
  name = '技能工具箱';
  description = '读取、创建和管理技能指令';
  settings = {};
  tools: ToolsType[] = [];

  constructor(
    private readonly skillService: SkillService,
    private readonly prismaService: PrismaService,
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

      // 创建技能
      FunctionTool.from(this.createSkill.bind(this), {
        name: 'createSkill',
        description: '当用户明确要求时，将对话中总结的流程、规范或方法论保存为一个可复用的技能。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '技能标识名（英文短横线命名，如 code-review）',
            },
            description: {
              type: 'string',
              description: '技能的简短描述（一句话）',
            },
            content: {
              type: 'string',
              description: '完整的技能指令内容（markdown 格式）',
            },
            references: {
              type: 'array',
              description: '可选的引用资源列表',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['url', 'skill', 'text'] },
                  uri: { type: 'string' },
                  label: { type: 'string' },
                },
                required: ['type', 'uri'],
              },
            },
            assignToCurrentAgent: {
              type: 'boolean',
              description: '是否同时分配给当前对话的 Agent，默认 true',
            },
          },
          required: ['name', 'description', 'content'],
        },
      }),

      // 更新技能
      FunctionTool.from(this.updateSkill.bind(this), {
        name: 'updateSkill',
        description: '当用户明确要求修改已有技能时，更新技能的内容或描述。',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '要更新的技能名称',
            },
            description: {
              type: 'string',
              description: '新的描述（可选）',
            },
            content: {
              type: 'string',
              description: '新的技能指令内容（可选）',
            },
            references: {
              type: 'array',
              description: '新的引用列表（可选）',
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

  async createSkill(params: {
    name: string;
    description: string;
    content: string;
    references?: Array<{ type: string; uri: string; label?: string }>;
    assignToCurrentAgent?: boolean;
  }): Promise<string> {
    try {
      if (!this.userId) {
        return '错误: 无法获取用户信息';
      }

      const skill = await this.skillService.create(
        {
          name: params.name,
          description: params.description,
          content: params.content,
          references: params.references as any,
        },
        this.userId,
      );

      // 默认分配给当前 Agent
      if (params.assignToCurrentAgent !== false && this.agentId) {
        await this.prismaService.agentSkill.create({
          data: {
            agentId: this.agentId,
            skillId: skill.id,
          },
        });
      }

      return `技能 "${skill.name}" 创建成功！${params.assignToCurrentAgent !== false ? '已自动分配给当前 Agent。' : ''}`;
    } catch (error) {
      return `创建技能失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async updateSkill(params: {
    name: string;
    description?: string;
    content?: string;
    references?: Array<{ type: string; uri: string; label?: string }>;
  }): Promise<string> {
    try {
      if (!this.userId) {
        return '错误: 无法获取用户信息';
      }

      // 先查找技能
      const skill = await this.skillService.findByName(params.name, this.userId);

      // 更新
      await this.skillService.update(
        skill.id,
        {
          description: params.description,
          content: params.content,
          references: params.references as any,
        },
        this.userId,
      );

      return `技能 "${params.name}" 更新成功！`;
    } catch (error) {
      return `更新技能失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
