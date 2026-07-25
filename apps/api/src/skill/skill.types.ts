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
