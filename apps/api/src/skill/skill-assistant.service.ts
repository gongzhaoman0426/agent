import { Injectable, Logger } from '@nestjs/common';
import { Agent as MastraAgent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  toUiMessage,
  type RecalledMessage,
  type UiMessage,
} from '../common/memory-message.js';
import { mapStreamChunk, type SseChunk } from '../common/sse.js';
import { MastraService } from '../mastra/mastra.service.js';
import { SkillService } from './skill.service.js';

const CONTEXT_KEYS = { ownerId: 'skillOwnerId', skillName: 'skillName' } as const;

const INSTRUCTIONS = `你是技能包编辑助手，帮助用户通过对话修改一个「技能」的文件。

技能包结构：
- SKILL.md（必需）：frontmatter 含 name / description，正文是给智能体看的指令
- scripts/*.js（可选）：在受限沙箱中执行，入参是全局变量 input（对象），返回结果写成 module.exports = function (input) { ... }，或给全局 result 赋值。沙箱里没有 require / process / fs / fetch，只能做纯计算
- references/*（可选）：激活技能时附带给模型的参考资料

工作方式：
1. 动手前先用 list_skill_files 和 read_skill_file 了解现状，不要凭空猜测文件内容。
2. write_skill_file 是整文件覆盖写入，必须提交完整内容，不能只给片段或省略号。
3. 修改 SKILL.md 时保留原有 frontmatter 结构；技能名称不可更改，改名需要用户重新上传技能包。
4. 改完用一两句话说明你做了什么改动，不要把整个文件内容复述给用户。
5. 用户意图不清晰时先提问确认，不要擅自大改。

始终使用简体中文回复。`;

/**
 * 技能编辑助手：一个内置的 Mastra Agent，工具直接读写技能目录。
 * 工具无状态，技能归属通过 requestContext 传入；每个技能一个独立会话线程，
 * 线程创建时预置标题，避免触发标题生成的额外模型调用。
 */
@Injectable()
export class SkillAssistantService {
  private readonly logger = new Logger(SkillAssistantService.name);
  private agent?: MastraAgent;

  constructor(
    private readonly mastraService: MastraService,
    private readonly skillService: SkillService,
  ) {}

  async *chatStream(
    ownerId: string,
    skillName: string,
    message: string,
  ): AsyncGenerator<SseChunk> {
    // 校验归属，技能不存在时直接抛错
    const skill = await this.skillService.getDetail(ownerId, skillName);
    const threadId = await this.ensureThread(ownerId, skill.id, skillName);

    const requestContext = new RequestContext();
    requestContext.set(CONTEXT_KEYS.ownerId, ownerId);
    requestContext.set(CONTEXT_KEYS.skillName, skillName);

    const stream = await this.getAgent().stream(message, {
      memory: { thread: threadId, resource: this.resourceId(ownerId) },
      requestContext,
    });

    let responseText = '';
    let filesChanged = false;
    for await (const chunk of stream.fullStream) {
      const mapped = mapStreamChunk(chunk, this.logger);
      if (!mapped) {
        continue;
      }
      if (mapped.event === 'delta') {
        responseText += String(mapped.data.delta ?? '');
      }
      if (
        mapped.event === 'tool_result' &&
        WRITE_TOOL_IDS.has(String(mapped.data.toolName ?? ''))
      ) {
        filesChanged = true;
      }
      yield mapped;
    }

    // filesChanged 让前端知道要重新拉取文件树与编辑器内容
    yield {
      event: 'done',
      data: { sessionId: threadId, response: responseText, filesChanged },
    };
  }

  async getHistory(ownerId: string, skillName: string): Promise<UiMessage[]> {
    const skill = await this.skillService.getDetail(ownerId, skillName);
    const recalled = await this.mastraService.memory
      .recall({ threadId: this.threadId(skill.id) })
      .catch(() => null);

    return (recalled?.messages ?? [])
      .map((message) => toUiMessage(message as RecalledMessage))
      .filter((message): message is UiMessage => message !== null);
  }

  async resetHistory(ownerId: string, skillName: string) {
    const skill = await this.skillService.getDetail(ownerId, skillName);
    await this.mastraService.memory
      .deleteThread(this.threadId(skill.id))
      .catch(() => undefined);
    return { success: true };
  }

  // ============ 内部方法 ============

  /** 用技能 ID 而非名称，改名后对话历史不丢 */
  private threadId(skillId: string) {
    return `skill-assistant:${skillId}`;
  }

  private resourceId(ownerId: string) {
    return `${ownerId}:skill-assistant`;
  }

  private async ensureThread(
    ownerId: string,
    skillId: string,
    skillName: string,
  ) {
    const threadId = this.threadId(skillId);
    const existing = await this.mastraService.memory
      .getThreadById({ threadId })
      .catch(() => null);

    if (!existing) {
      await this.mastraService.memory.createThread({
        threadId,
        resourceId: this.resourceId(ownerId),
        title: `技能编辑 · ${skillName}`,
        // 不写 userId：避免出现在用户的对话会话列表里
        metadata: { skillOwnerId: ownerId, skillName },
      });
    }
    return threadId;
  }

  private getAgent(): MastraAgent {
    if (!this.agent) {
      this.agent = new MastraAgent({
        id: 'skill-assistant',
        name: '技能编辑助手',
        description: '通过对话读写技能包文件',
        instructions: INSTRUCTIONS,
        model: this.mastraService.resolveModel(null),
        tools: this.buildTools(),
        memory: this.mastraService.memory,
      });
    }
    return this.agent;
  }

  /** 工具从 requestContext 取技能归属，保证只能操作当前技能 */
  private scope(requestContext: RequestContext) {
    const ownerId = requestContext.get(CONTEXT_KEYS.ownerId);
    const skillName = requestContext.get(CONTEXT_KEYS.skillName);
    if (typeof ownerId !== 'string' || typeof skillName !== 'string') {
      throw new Error('缺少技能上下文');
    }
    return { ownerId, skillName };
  }

  private buildTools() {
    return {
      list_skill_files: createTool({
        id: 'list_skill_files',
        description: '列出当前技能目录下的所有文件（路径、大小、是否可编辑）',
        inputSchema: z.object({}),
        execute: async (_input, context) => {
          const { ownerId, skillName } = this.scope(context.requestContext);
          return this.skillService.listFiles(ownerId, skillName);
        },
      }),

      read_skill_file: createTool({
        id: 'read_skill_file',
        description: '读取技能目录下某个文件的完整内容',
        inputSchema: z.object({
          path: z.string().describe('相对技能根目录的路径，如 SKILL.md'),
        }),
        execute: async ({ path: filePath }, context) => {
          const { ownerId, skillName } = this.scope(context.requestContext);
          return this.skillService.readFile(ownerId, skillName, filePath);
        },
      }),

      write_skill_file: createTool({
        id: 'write_skill_file',
        description:
          '写入技能文件（整文件覆盖，文件不存在则创建）。必须提供完整内容。',
        inputSchema: z.object({
          path: z
            .string()
            .describe('相对技能根目录的路径，如 SKILL.md 或 scripts/run.js'),
          content: z.string().describe('文件的完整新内容'),
        }),
        execute: async ({ path: filePath, content }, context) => {
          const { ownerId, skillName } = this.scope(context.requestContext);
          await this.skillService.writeFile(
            ownerId,
            skillName,
            filePath,
            content,
          );
          this.logger.log(`技能助手写入 ${skillName}/${filePath}`);
          return { success: true, path: filePath };
        },
      }),

      delete_skill_file: createTool({
        id: 'delete_skill_file',
        description: '删除技能目录下的某个文件（SKILL.md 不可删除）',
        inputSchema: z.object({
          path: z.string().describe('相对技能根目录的路径'),
        }),
        execute: async ({ path: filePath }, context) => {
          const { ownerId, skillName } = this.scope(context.requestContext);
          await this.skillService.deleteFile(ownerId, skillName, filePath);
          this.logger.log(`技能助手删除 ${skillName}/${filePath}`);
          return { success: true, path: filePath };
        },
      }),
    };
  }
}

const WRITE_TOOL_IDS = new Set(['write_skill_file', 'delete_skill_file']);
