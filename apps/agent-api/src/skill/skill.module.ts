import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenModule } from '../access-token/access-token.module';
import { SkillDiscoveryService } from './skill-discovery.service';
import { TimeQuerySkill } from './skills/time-query.skill';

@Module({
  imports: [PrismaModule, AuthModule, AccessTokenModule, DiscoveryModule],
  controllers: [SkillController],
  providers: [SkillService, SkillDiscoveryService, TimeQuerySkill],
  exports: [SkillService, SkillDiscoveryService],
})
export class SkillModule {}
