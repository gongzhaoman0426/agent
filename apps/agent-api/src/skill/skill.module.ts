import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenModule } from '../access-token/access-token.module';
import { SkillDiscoveryService } from './skill-discovery.service';
import { CodeReviewSkill } from './skills/code-review.skill';

@Module({
  imports: [PrismaModule, AuthModule, AccessTokenModule, DiscoveryModule],
  controllers: [SkillController],
  providers: [SkillService, SkillDiscoveryService, CodeReviewSkill],
  exports: [SkillService, SkillDiscoveryService],
})
export class SkillModule {}
