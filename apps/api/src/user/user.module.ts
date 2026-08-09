import { Module } from '@nestjs/common';
import { OperatorService } from './operator.service.js';
import { UserController } from './user.controller.js';

@Module({
  controllers: [UserController],
  providers: [OperatorService],
  exports: [OperatorService],
})
export class UserModule {}
