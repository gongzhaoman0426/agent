import { Module } from '@nestjs/common';
import { SkillAssistantService } from './skill-assistant.service.js';
import { SkillService } from './skill.service.js';
import { SkillController } from './skill.controller.js';
import { SkillToolkit } from './skill.toolkit.js';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillAssistantService, SkillToolkit],
  exports: [SkillService],
})
export class SkillModule {}
