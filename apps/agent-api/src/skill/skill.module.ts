import { Module } from '@nestjs/common';
import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenModule } from '../access-token/access-token.module';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule, AccessTokenModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
