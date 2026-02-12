import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NativeConnection, Worker } from '@temporalio/worker';

import { createActivities } from './activities';
import { ToolsService } from '../tool/tools.service';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TemporalWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(TemporalWorkerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsService: ToolsService,
    private readonly agentService: AgentService,
    private readonly prismaService: PrismaService,
  ) {}

  async onModuleInit() {
    const enabled = this.configService.get('TEMPORAL_WORKER_ENABLED', 'true');
    if (enabled !== 'true') {
      this.logger.log('Temporal worker disabled');
      return;
    }

    const address = this.configService.get(
      'TEMPORAL_ADDRESS',
      'localhost:7233',
    );
    const taskQueue = this.configService.get(
      'TEMPORAL_TASK_QUEUE',
      'workflow-engine',
    );
    const namespace = this.configService.get('TEMPORAL_NAMESPACE', 'default');

    try {
      const connection = await NativeConnection.connect({ address });

      const activities = createActivities({
        toolsService: this.toolsService,
        agentService: this.agentService,
        prismaService: this.prismaService,
      });

      this.worker = await Worker.create({
        connection,
        namespace,
        taskQueue,
        workflowsPath: require.resolve('./workflows'),
        activities,
      });

      this.worker.run().catch((err) => {
        this.logger.error('Temporal worker stopped with error', err);
      });

      this.logger.log(
        `Temporal worker started on task queue: ${taskQueue}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start Temporal worker: ${error.message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      this.worker.shutdown();
      this.logger.log('Temporal worker shut down');
    }
  }
}
