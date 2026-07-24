import { Module } from '@nestjs/common';
import { SkillService } from './skill.service.js';
import { SkillController } from './skill.controller.js';
import { SkillToolkit } from './skill.toolkit.js';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillToolkit],
  exports: [SkillService],
})
export class SkillModule {}
