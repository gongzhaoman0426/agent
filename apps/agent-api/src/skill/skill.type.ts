import { IsArray, IsString } from 'class-validator';

export class AssignSkillsDto {
  @IsArray()
  @IsString({ each: true })
  skillIds: string[];
}

export interface SkillReference {
  type: 'url' | 'skill' | 'text';
  uri: string;
  label?: string;
}

export interface SkillScript {
  name: string;
  language: 'javascript';
  code: string;
  timeout?: number;
}
