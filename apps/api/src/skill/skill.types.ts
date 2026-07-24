export interface SkillDefinition {
  /** 目录名，即技能唯一标识 */
  name: string;
  description: string;
  /** SKILL.md 正文（不含 frontmatter） */
  content: string;
  /** 技能目录绝对路径 */
  dir: string;
  /** references/ 下的文件名列表 */
  references: string[];
  /** scripts/ 下的 .js 脚本文件名列表 */
  scripts: string[];
}

export interface SkillSummary {
  name: string;
  description: string;
  hasScripts: boolean;
}

export interface ActivatedSkill {
  name: string;
  content: string;
  references: Array<{ file: string; content: string }>;
  scriptResults?: Array<{
    script: string;
    result?: unknown;
    logs?: string[];
    error?: string;
  }>;
}
