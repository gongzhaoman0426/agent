export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  hasScripts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillDetail extends SkillSummary {
  /** SKILL.md 正文（不含 frontmatter） */
  content: string;
  references: string[];
  scripts: string[];
}

/** 技能目录中的一个文件（目录不单独建节点，由前端按路径分组） */
export interface SkillFileNode {
  /** 相对技能根目录的路径，如 `scripts/run.js` */
  path: string;
  size: number;
  /** 是否为可在线编辑的纯文本 */
  editable: boolean;
  updatedAt: Date;
}

export interface SkillFileContent {
  path: string;
  content: string;
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
