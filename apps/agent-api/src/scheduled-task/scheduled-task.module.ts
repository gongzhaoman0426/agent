import { Module } from '@nestjs/common';
import { ScheduledTaskService } from './scheduled-task.service';
import { ScheduledTaskController } from './scheduled-task.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScheduledTaskController],
  providers: [ScheduledTaskService],
  exports: [ScheduledTaskService],
})
export class ScheduledTaskModule {}
