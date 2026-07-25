import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import { collectWithAncestors } from '../agent/agent-ancestors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { executeInSandbox } from './script-sandbox.js';
import type {
  ActivatedSkill,
  SkillDetail,
  SkillFileContent,
  SkillFileNode,
  SkillSummary,
} from './skill.types.js';

const MAX_REFERENCE_BYTES = 100 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
/** 可在线编辑的纯文本扩展名 */
const EDITABLE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.json',
  '.txt',
  '.yml',
  '.yaml',
  '.csv',
  '.html',
  '.css',
  '.sql',
  '.sh',
  '.py',
]);
const MAX_EDITABLE_BYTES = 512 * 1024;

/** 新建技能时的 SKILL.md 骨架，给用户和 AI 助手一个可改的起点 */
function buildSkillTemplate(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

## 何时使用

描述什么样的用户请求应该触发这个技能。

## 执行步骤

1. 第一步做什么
2. 第二步做什么

## 输出要求

说明期望的输出格式或注意事项。
`;
}

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

  /** 在平台内直接新建空技能：写入带 frontmatter 的 SKILL.md 骨架 */
  async create(
    ownerId: string,
    name: string,
    description: string,
  ): Promise<SkillSummary> {
    if (!SKILL_NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        '技能名称只能包含字母、数字、中划线、下划线，且以字母或数字开头（64 字符内）',
      );
    }

    const existing = await this.prisma.skill.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
    if (existing) {
      throw new ConflictException(`技能「${name}」已存在`);
    }

    const dirPath = path.join(ownerId, name);
    const absDir = path.join(this.storageRoot, dirPath);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(
      path.join(absDir, 'SKILL.md'),
      buildSkillTemplate(name, description),
      'utf-8',
    );

    const record = await this.prisma.skill.create({
      data: { ownerId, name, description, dirPath, scripts: [], references: [] },
    });

    this.logger.log(`技能已创建: ${name} (owner=${ownerId})`);
    return this.toSummary(record);
  }

  async list(ownerId: string): Promise<SkillSummary[]> {
    const records = await this.prisma.skill.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => this.toSummary(record));
  }

  /**
   * 重命名 / 改简介：目录、SKILL.md frontmatter、数据库与智能体挂载记录一起改，
   * 挂载了该技能的智能体（含其父级）实例缓存随之失效。
   */
  async rename(
    ownerId: string,
    name: string,
    updates: { name?: string; description?: string },
  ): Promise<SkillSummary> {
    const record = await this.requireSkill(ownerId, name);
    const nextName = updates.name?.trim() || name;
    const nextDescription = updates.description?.trim() || record.description;

    if (nextName !== name) {
      if (!SKILL_NAME_PATTERN.test(nextName)) {
        throw new BadRequestException(
          '技能名称只能包含字母、数字、中划线、下划线，且以字母或数字开头（64 字符内）',
        );
      }
      const conflict = await this.prisma.skill.findUnique({
        where: { ownerId_name: { ownerId, name: nextName } },
      });
      if (conflict) {
        throw new ConflictException(`技能「${nextName}」已存在`);
      }
    }

    const nextDirPath = path.join(ownerId, nextName);
    if (nextName !== name) {
      await fs.rename(
        path.join(this.storageRoot, record.dirPath),
        path.join(this.storageRoot, nextDirPath),
      );
    }
    await this.rewriteFrontmatter(nextDirPath, nextName, nextDescription);

    const [updated] = await this.prisma.$transaction([
      this.prisma.skill.update({
        where: { id: record.id },
        data: {
          name: nextName,
          description: nextDescription,
          dirPath: nextDirPath,
        },
      }),
      // 挂载记录按名字引用技能，跟着改
      this.prisma.agentSkill.updateMany({
        where: { skillName: name, agent: { createdById: ownerId } },
        data: { skillName: nextName },
      }),
    ]);

    await this.touchMountedAgents(ownerId, nextName);
    this.logger.log(`技能已更新: ${name} -> ${nextName} (owner=${ownerId})`);
    return this.toSummary(updated);
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

  // ============ 在线编辑 ============

  /** 技能目录下的全部文件（扁平列表，含大小与是否可编辑） */
  async listFiles(ownerId: string, name: string): Promise<SkillFileNode[]> {
    const record = await this.requireSkill(ownerId, name);
    const absDir = path.join(this.storageRoot, record.dirPath);

    const walk = async (dir: string): Promise<SkillFileNode[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const nodes: SkillFileNode[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          nodes.push(...(await walk(abs)));
          continue;
        }
        const stat = await fs.stat(abs);
        nodes.push({
          path: path.relative(absDir, abs).split(path.sep).join('/'),
          size: stat.size,
          editable:
            stat.size <= MAX_EDITABLE_BYTES &&
            EDITABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
          updatedAt: stat.mtime,
        });
      }
      return nodes;
    };

    const files = await walk(absDir).catch(() => {
      throw new NotFoundException('技能文件已丢失，请重新上传');
    });
    // SKILL.md 置顶，其余按路径排序
    return files.sort((a, b) => {
      if (a.path === 'SKILL.md') return -1;
      if (b.path === 'SKILL.md') return 1;
      return a.path.localeCompare(b.path);
    });
  }

  async readFile(
    ownerId: string,
    name: string,
    relativePath: string,
  ): Promise<SkillFileContent> {
    const record = await this.requireSkill(ownerId, name);
    const absPath = this.resolveFilePath(record.dirPath, relativePath);

    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat?.isFile()) {
      throw new NotFoundException(`文件不存在: ${relativePath}`);
    }
    if (stat.size > MAX_EDITABLE_BYTES) {
      throw new BadRequestException('文件超过 512KB，无法在线编辑');
    }
    if (!EDITABLE_EXTENSIONS.has(path.extname(absPath).toLowerCase())) {
      throw new BadRequestException('该文件类型不支持在线编辑');
    }

    return {
      path: relativePath,
      content: await fs.readFile(absPath, 'utf-8'),
    };
  }

  /** 写入（可新建）文件，并同步数据库中的描述与脚本/引用清单 */
  async writeFile(
    ownerId: string,
    name: string,
    relativePath: string,
    content: string,
  ): Promise<SkillFileContent> {
    const record = await this.requireSkill(ownerId, name);
    const absPath = this.resolveFilePath(record.dirPath, relativePath);

    if (!EDITABLE_EXTENSIONS.has(path.extname(absPath).toLowerCase())) {
      throw new BadRequestException('该文件类型不支持在线编辑');
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_EDITABLE_BYTES) {
      throw new BadRequestException('内容超过 512KB 上限');
    }
    if (relativePath === 'SKILL.md') {
      // 目录名与挂载关系都以技能名为准，不允许改名
      this.assertSkillMarkdown(content, name);
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');
    await this.syncMetadata(ownerId, name, record.dirPath, record.description);

    return { path: relativePath, content };
  }

  async deleteFile(ownerId: string, name: string, relativePath: string) {
    const record = await this.requireSkill(ownerId, name);
    if (relativePath === 'SKILL.md') {
      throw new BadRequestException('SKILL.md 是技能的入口文件，不能删除');
    }
    const absPath = this.resolveFilePath(record.dirPath, relativePath);

    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat?.isFile()) {
      throw new NotFoundException(`文件不存在: ${relativePath}`);
    }
    await fs.rm(absPath);
    await this.syncMetadata(ownerId, name, record.dirPath, record.description);
    return { success: true };
  }

  async remove(ownerId: string, name: string) {
    const record = await this.requireSkill(ownerId, name);
    // 挂载记录删掉后就查不到了，先取出受影响的智能体
    const mountedAgentIds = await this.findMountedAgentIds(ownerId, name);

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

    await this.touchAgents(mountedAgentIds);
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
        const outcome = await executeInSandbox(code, scriptInput);
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

  /** 改名/改简介后回写 SKILL.md 的 frontmatter，保持文件与数据库一致 */
  private async rewriteFrontmatter(
    dirPath: string,
    name: string,
    description: string,
  ) {
    const absPath = path.join(this.storageRoot, dirPath, 'SKILL.md');
    const raw = await fs.readFile(absPath, 'utf-8').catch(() => null);
    if (raw === null) {
      throw new NotFoundException('技能文件已丢失，请重新上传');
    }
    const parsed = matter(raw);
    const data = { ...parsed.data, name, description };
    await fs.writeFile(absPath, matter.stringify(parsed.content, data), 'utf-8');
  }

  /**
   * 技能元信息变化后，让挂载它的智能体重建实例。
   * Registry 以 agent.updatedAt 作缓存键，这里更新时间戳即可让下次请求重建，
   * 无需反向依赖 AgentModule（否则会形成模块循环）。
   */
  private async touchMountedAgents(ownerId: string, skillName: string) {
    await this.touchAgents(await this.findMountedAgentIds(ownerId, skillName));
  }

  private async findMountedAgentIds(ownerId: string, skillName: string) {
    const mounts = await this.prisma.agentSkill.findMany({
      where: { skillName, agent: { createdById: ownerId, deleted: false } },
      select: { agentId: true },
    });
    return mounts.map((mount) => mount.agentId);
  }

  private async touchAgents(agentIds: string[]) {
    if (agentIds.length === 0) {
      return;
    }
    const affected = await collectWithAncestors(this.prisma, agentIds);
    await this.prisma.agent.updateMany({
      where: { id: { in: affected } },
      data: { updatedAt: new Date() },
    });
  }

  /** 把用户给的相对路径限制在技能目录内，防目录穿越 */
  private resolveFilePath(dirPath: string, relativePath: string): string {
    const cleaned = relativePath.trim().replace(/^\/+/, '');
    if (!cleaned || cleaned.length > 255) {
      throw new BadRequestException('文件路径不合法');
    }
    const absDir = path.join(this.storageRoot, dirPath);
    const absPath = path.resolve(absDir, cleaned);
    if (absPath !== absDir && !absPath.startsWith(absDir + path.sep)) {
      throw new BadRequestException(`路径越界: ${relativePath}`);
    }
    return absPath;
  }

  /** SKILL.md 必须保留合法 frontmatter，且不能改名（目录与挂载都按名字索引） */
  private assertSkillMarkdown(content: string, expectedName: string) {
    let parsed: ReturnType<typeof matter>;
    try {
      parsed = matter(content);
    } catch {
      throw new BadRequestException('SKILL.md frontmatter 解析失败');
    }
    const name = String(parsed.data.name || '').trim();
    if (name !== expectedName) {
      throw new BadRequestException(
        `编辑 SKILL.md 不能改名（当前为 ${expectedName}）：改名要同步目录和智能体挂载，请用页面顶部的「重命名」`,
      );
    }
    if (!String(parsed.data.description || '').trim()) {
      throw new BadRequestException('SKILL.md frontmatter 缺少 description 字段');
    }
  }

  /** 文件变更后重新扫描目录，同步描述与脚本/引用清单 */
  private async syncMetadata(
    ownerId: string,
    name: string,
    dirPath: string,
    previousDescription: string,
  ): Promise<void> {
    const absDir = path.join(this.storageRoot, dirPath);
    const listDir = async (sub: string) =>
      fs
        .readdir(path.join(absDir, sub))
        .then((files) => files.filter((file) => !file.startsWith('.')))
        .catch(() => [] as string[]);

    const scripts = (await listDir('scripts')).filter((file) =>
      file.endsWith('.js'),
    );
    const references = await listDir('references');

    let description: string | undefined;
    try {
      const raw = await fs.readFile(path.join(absDir, 'SKILL.md'), 'utf-8');
      description = String(matter(raw).data.description || '').trim();
    } catch {
      // SKILL.md 读取失败时保留原描述
    }

    await this.prisma.skill.update({
      where: { ownerId_name: { ownerId, name } },
      data: { scripts, references, ...(description ? { description } : {}) },
    });

    // 简介会进入智能体提示词里的 <available_skills>，变了就要重建实例
    if (description && description !== previousDescription) {
      await this.touchMountedAgents(ownerId, name);
    }
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
