import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import { PrismaService } from '../prisma/prisma.service.js';
import { executeInSandbox } from './script-sandbox.js';
import type { ActivatedSkill, SkillDetail, SkillSummary } from './skill.types.js';

const MAX_REFERENCE_BYTES = 100 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * 技能由用户上传 zip 包（SKILL.md + 可选 scripts/ references/），
 * 平台解压存储到 data/skills/<ownerId>/<name>/，元数据入库。
 * 文件是指令与脚本的事实来源，数据库负责归属、列表与挂载校验。
 */
@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);
  private readonly storageRoot = path.join(process.cwd(), 'data', 'skills');

  constructor(private readonly prisma: PrismaService) {}

  /** 解压并校验 zip，落盘 + 入库（同名则覆盖更新） */
  async upload(ownerId: string, zipBuffer: Buffer): Promise<SkillSummary> {
    const { name, description, files } = this.parseZip(zipBuffer);

    const dirPath = path.join(ownerId, name);
    const absDir = path.join(this.storageRoot, dirPath);

    await fs.rm(absDir, { recursive: true, force: true });
    for (const file of files) {
      const target = path.join(absDir, file.relativePath);
      // 防 zip-slip：写入路径必须在技能目录内
      if (!target.startsWith(absDir + path.sep)) {
        throw new BadRequestException(`非法的压缩包路径: ${file.relativePath}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.data);
    }

    const scripts = files
      .filter(
        (file) =>
          file.relativePath.startsWith('scripts/') &&
          file.relativePath.endsWith('.js'),
      )
      .map((file) => path.basename(file.relativePath));
    const references = files
      .filter((file) => file.relativePath.startsWith('references/'))
      .map((file) => path.basename(file.relativePath));

    const record = await this.prisma.skill.upsert({
      where: { ownerId_name: { ownerId, name } },
      create: { ownerId, name, description, dirPath, scripts, references },
      update: { description, dirPath, scripts, references },
    });

    this.logger.log(`技能已上传: ${name} (owner=${ownerId})`);
    return this.toSummary(record);
  }

  async list(ownerId: string): Promise<SkillSummary[]> {
    const records = await this.prisma.skill.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => this.toSummary(record));
  }

  async getDetail(ownerId: string, name: string): Promise<SkillDetail> {
    const record = await this.requireSkill(ownerId, name);
    const content = await this.readContent(record.dirPath);
    return {
      ...this.toSummary(record),
      content,
      references: this.asStringArray(record.references),
      scripts: this.asStringArray(record.scripts),
    };
  }

  async remove(ownerId: string, name: string) {
    const record = await this.requireSkill(ownerId, name);
    await fs.rm(path.join(this.storageRoot, record.dirPath), {
      recursive: true,
      force: true,
    });
    await this.prisma.$transaction([
      this.prisma.skill.delete({ where: { id: record.id } }),
      // 同步卸载该用户 Agent 上的挂载
      this.prisma.agentSkill.deleteMany({
        where: { skillName: name, agent: { createdById: ownerId } },
      }),
    ]);
    this.logger.log(`技能已删除: ${name} (owner=${ownerId})`);
    return { success: true };
  }

  /** 为挂载技能的 Agent 生成 <available_skills> 摘要块 */
  async buildSummaryBlock(
    ownerId: string,
    skillNames: string[],
  ): Promise<string> {
    if (skillNames.length === 0) {
      return '';
    }
    const records = await this.prisma.skill.findMany({
      where: { ownerId, name: { in: skillNames } },
    });
    if (records.length === 0) {
      return '';
    }

    const items = records
      .map(
        (record) =>
          `  <skill name="${record.name}">${record.description}</skill>`,
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
    ownerId: string,
    name: string,
    runScripts = false,
    scriptInput: Record<string, unknown> = {},
  ): Promise<ActivatedSkill> {
    const record = await this.requireSkill(ownerId, name);
    const absDir = path.join(this.storageRoot, record.dirPath);
    const content = await this.readContent(record.dirPath);

    const references: ActivatedSkill['references'] = [];
    for (const file of this.asStringArray(record.references)) {
      try {
        const filePath = path.join(absDir, 'references', file);
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_REFERENCE_BYTES) {
          references.push({ file, content: '[文件过大，已跳过]' });
          continue;
        }
        references.push({ file, content: await fs.readFile(filePath, 'utf-8') });
      } catch {
        // 忽略读取失败的引用文件
      }
    }

    const activated: ActivatedSkill = {
      name: record.name,
      content: `# ${record.name}\n\n${content}`,
      references,
    };

    const scripts = this.asStringArray(record.scripts);
    if (runScripts && scripts.length > 0) {
      activated.scriptResults = [];
      for (const script of scripts) {
        const code = await fs.readFile(
          path.join(absDir, 'scripts', script),
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

  // ============ 内部方法 ============

  /**
   * 校验并展开 zip：必须包含 SKILL.md（允许包在单一顶层目录里），
   * frontmatter 的 name/description 为技能元数据。
   */
  private parseZip(zipBuffer: Buffer): {
    name: string;
    description: string;
    files: Array<{ relativePath: string; data: Buffer }>;
  } {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw new BadRequestException('无法解析压缩包，请上传有效的 zip 文件');
    }

    const entries = zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory &&
          !entry.entryName.includes('__MACOSX') &&
          !path.basename(entry.entryName).startsWith('.'),
      );
    if (entries.length === 0) {
      throw new BadRequestException('压缩包为空');
    }

    // 允许 zip 内多一层顶层目录：<folder>/SKILL.md
    const skillEntry = entries.find(
      (entry) => path.basename(entry.entryName) === 'SKILL.md',
    );
    if (!skillEntry) {
      throw new BadRequestException('压缩包中缺少 SKILL.md');
    }
    const prefix = skillEntry.entryName.slice(
      0,
      skillEntry.entryName.length - 'SKILL.md'.length,
    );
    if (prefix.includes('..')) {
      throw new BadRequestException('压缩包路径非法');
    }

    let totalBytes = 0;
    const files: Array<{ relativePath: string; data: Buffer }> = [];
    for (const entry of entries) {
      if (!entry.entryName.startsWith(prefix)) {
        continue;
      }
      const relativePath = entry.entryName.slice(prefix.length);
      if (!relativePath || relativePath.split('/').some((seg) => seg === '..')) {
        continue;
      }
      const data = entry.getData();
      if (data.length > MAX_ENTRY_BYTES) {
        throw new BadRequestException(`文件过大: ${relativePath}（上限 5MB）`);
      }
      totalBytes += data.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new BadRequestException('压缩包解压后超过 50MB 上限');
      }
      files.push({ relativePath, data });
    }

    const skillFile = files.find((file) => file.relativePath === 'SKILL.md');
    if (!skillFile) {
      throw new BadRequestException('SKILL.md 必须位于技能包根目录');
    }

    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(skillFile.data.toString('utf-8'));
    } catch {
      throw new BadRequestException('SKILL.md frontmatter 解析失败');
    }

    const fallbackName = prefix ? prefix.replace(/\/$/, '') : '';
    const name = String(parsed.data.name || fallbackName).trim();
    if (!SKILL_NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        '技能名称非法：需在 SKILL.md frontmatter 的 name 字段提供（字母/数字/中划线/下划线，64 字符内）',
      );
    }
    const description = String(parsed.data.description || '').trim();
    if (!description) {
      throw new BadRequestException(
        'SKILL.md frontmatter 缺少 description 字段',
      );
    }

    return { name, description, files };
  }

  private async requireSkill(ownerId: string, name: string) {
    const record = await this.prisma.skill.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
    if (!record) {
      throw new NotFoundException(`技能不存在: ${name}`);
    }
    return record;
  }

  private async readContent(dirPath: string): Promise<string> {
    try {
      const raw = await fs.readFile(
        path.join(this.storageRoot, dirPath, 'SKILL.md'),
        'utf-8',
      );
      return matter(raw).content.trim();
    } catch {
      throw new NotFoundException('技能文件已丢失，请重新上传');
    }
  }

  private toSummary(record: {
    id: string;
    name: string;
    description: string;
    scripts: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SkillSummary {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      hasScripts: this.asStringArray(record.scripts).length > 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }
}
