import { Module } from '@nestjs/common';
import { ScheduledTaskService } from './scheduled-task.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ScheduledTaskService],
  exports: [ScheduledTaskService],
})
export class ScheduledTaskModule {}
