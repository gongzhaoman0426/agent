import { Controller, Get, Param } from '@nestjs/common';
import { SkillService } from './skill.service.js';

@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  list() {
    return this.skillService.list();
  }

  @Get(':name')
  detail(@Param('name') name: string) {
    const skill = this.skillService.getDetail(name);
    return {
      name: skill.name,
      description: skill.description,
      content: skill.content,
      references: skill.references,
      scripts: skill.scripts,
    };
  }
}
