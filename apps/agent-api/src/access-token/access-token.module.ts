import { Module } from '@nestjs/common';
import { AccessTokenController } from './access-token.controller';
import { AccessTokenService } from './access-token.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AccessTokenController],
  providers: [AccessTokenService],
  exports: [AccessTokenService],
})
export class AccessTokenModule {}
