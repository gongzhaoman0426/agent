import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { executeInSandbox } from './script-sandbox.js';
import type {
  ActivatedSkill,
  SkillDefinition,
  SkillSummary,
} from './skill.types.js';

const MAX_REFERENCE_BYTES = 100 * 1024;

/**
 * 技能以标准文件形式存放于 apps/api/skills/<name>/SKILL.md，
 * 启动时扫描加载进内存注册表，文件即事实来源，不入数据库。
 *
 * 目录约定：
 *   skills/<name>/SKILL.md       —— frontmatter(name/description) + markdown 指令
 *   skills/<name>/references/    —— 可选，激活时随全文返回
 *   skills/<name>/scripts/*.js   —— 可选，vm 沙箱执行
 */
@Injectable()
export class SkillService implements OnModuleInit {
  private readonly logger = new Logger(SkillService.name);
  private readonly registry = new Map<string, SkillDefinition>();
  private readonly skillsDir = path.join(process.cwd(), 'skills');

  async onModuleInit() {
    await this.loadSkills();
  }

  async loadSkills() {
    this.registry.clear();

    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.skillsDir);
    } catch {
      this.logger.warn(`技能目录不存在: ${this.skillsDir}`);
      return;
    }

    for (const entry of entries) {
      const dir = path.join(this.skillsDir, entry);
      const skillFile = path.join(dir, 'SKILL.md');
      try {
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) continue;

        const raw = await fs.readFile(skillFile, 'utf-8');
        const parsed = matter(raw);
        const name = String(parsed.data.name || entry);
        const description = String(parsed.data.description || '');

        this.registry.set(name, {
          name,
          description,
          content: parsed.content.trim(),
          dir,
          references: await this.listFiles(path.join(dir, 'references')),
          scripts: (await this.listFiles(path.join(dir, 'scripts'))).filter(
            (file) => file.endsWith('.js'),
          ),
        });
        this.logger.log(`加载技能: ${name}`);
      } catch {
        this.logger.warn(`跳过无效技能目录: ${entry}（缺少 SKILL.md）`);
      }
    }

    this.logger.log(`技能加载完成，共 ${this.registry.size} 个`);
  }

  list(): SkillSummary[] {
    return [...this.registry.values()].map((skill) => ({
      name: skill.name,
      description: skill.description,
      hasScripts: skill.scripts.length > 0,
    }));
  }

  getDetail(name: string): SkillDefinition {
    const skill = this.registry.get(name);
    if (!skill) {
      throw new NotFoundException(`技能不存在: ${name}`);
    }
    return skill;
  }

  /** 为挂载技能的 Agent 生成 <available_skills> 摘要块 */
  buildSummaryBlock(skillNames: string[]): string {
    const skills = skillNames
      .map((name) => this.registry.get(name))
      .filter((skill): skill is SkillDefinition => Boolean(skill));

    if (skills.length === 0) {
      return '';
    }

    const items = skills
      .map(
        (skill) =>
          `  <skill name="${skill.name}">${skill.description}</skill>`,
      )
      .join('\n');

    return [
      '',
      '## 技能系统',
      '',
      '以下是你可用的技能。当用户请求与某个技能相关时，先调用 use_skill 工具加载该技能的完整指令，再按指令执行。',
      '',
      '<available_skills>',
      items,
      '</available_skills>',
    ].join('\n');
  }

  /** use_skill 工具入口：返回全文 + 引用资料 + 可选脚本执行结果 */
  async activate(
    name: string,
    runScripts = false,
    scriptInput: Record<string, unknown> = {},
  ): Promise<ActivatedSkill> {
    const skill = this.getDetail(name);

    const references: ActivatedSkill['references'] = [];
    for (const file of skill.references) {
      try {
        const filePath = path.join(skill.dir, 'references', file);
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_REFERENCE_BYTES) {
          references.push({ file, content: '[文件过大，已跳过]' });
          continue;
        }
        references.push({
          file,
          content: await fs.readFile(filePath, 'utf-8'),
        });
      } catch {
        // 忽略读取失败的引用文件
      }
    }

    const activated: ActivatedSkill = {
      name: skill.name,
      content: `# ${skill.name}\n\n${skill.content}`,
      references,
    };

    if (runScripts && skill.scripts.length > 0) {
      activated.scriptResults = [];
      for (const script of skill.scripts) {
        const code = await fs.readFile(
          path.join(skill.dir, 'scripts', script),
          'utf-8',
        );
        const outcome = executeInSandbox(code, scriptInput);
        activated.scriptResults.push({
          script,
          result: outcome.result,
          logs: outcome.logs,
          error: outcome.error,
        });
      }
    }

    return activated;
  }

  private async listFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }
}
