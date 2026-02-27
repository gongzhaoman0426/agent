import { IsString, IsOptional, IsNotEmpty, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum SkillType {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
}

export class SkillReferenceDto {
  @IsEnum(['url', 'skill', 'text'])
  type: 'url' | 'skill' | 'text';

  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsOptional()
  label?: string;
}

export class SkillScriptDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['javascript'])
  language: 'javascript';

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  timeout?: number;
}

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SkillReferenceDto)
  references?: SkillReferenceDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SkillScriptDto)
  scripts?: SkillScriptDto[];
}

export class UpdateSkillDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SkillReferenceDto)
  references?: SkillReferenceDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SkillScriptDto)
  scripts?: SkillScriptDto[];
}

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
