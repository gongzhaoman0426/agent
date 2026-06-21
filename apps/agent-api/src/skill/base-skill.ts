import { SKILL_ID_KEY } from './skill.decorator';
import type { SkillReference, SkillScript } from './skill.type';

export abstract class BaseSkill {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly content: string;

  readonly references: SkillReference[] = [];
  readonly scripts: SkillScript[] = [];

  get id(): string {
    return Reflect.getMetadata(SKILL_ID_KEY, this.constructor);
  }
}
