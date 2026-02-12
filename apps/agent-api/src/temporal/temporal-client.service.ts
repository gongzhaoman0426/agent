import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection } from '@temporalio/client';

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private connection: Connection;
  private readonly logger = new Logger(TemporalClientService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const address = this.configService.get(
      'TEMPORAL_ADDRESS',
      'localhost:7233',
    );
    const namespace = this.configService.get('TEMPORAL_NAMESPACE', 'default');

    try {
      this.connection = await Connection.connect({ address });
      this.client = new Client({
        connection: this.connection,
        namespace,
      });
      this.logger.log(`Connected to Temporal at ${address}`);
    } catch (error) {
      this.logger.error(
        `Failed to connect to Temporal at ${address}: ${error.message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.connection?.close();
  }

  getClient(): Client {
    return this.client;
  }

  async startWorkflowAsync(params: {
    workflowId: string;
    dsl: any;
    input: any;
    userId?: string;
    context?: any;
  }) {
    const taskQueue = this.configService.get(
      'TEMPORAL_TASK_QUEUE',
      'workflow-engine',
    );

    const handle = await this.client.workflow.start('dslWorkflow', {
      taskQueue,
      workflowId: `dsl-${params.workflowId}-${Date.now()}`,
      args: [
        {
          dsl: params.dsl,
          input: params.input,
          workflowId: params.workflowId,
          userId: params.userId,
          context: params.context || {},
        },
      ],
      workflowExecutionTimeout: '1h',
    });

    return {
      temporalWorkflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    };
  }

  async getWorkflowStatus(temporalWorkflowId: string) {
    const handle = this.client.workflow.getHandle(temporalWorkflowId);
    const description = await handle.describe();
    return {
      status: description.status.name,
      startTime: description.startTime,
      closeTime: description.closeTime,
      temporalWorkflowId,
    };
  }

  async getWorkflowResult(temporalWorkflowId: string) {
    const handle = this.client.workflow.getHandle(temporalWorkflowId);
    return handle.result();
  }

  async cancelWorkflow(temporalWorkflowId: string) {
    const handle = this.client.workflow.getHandle(temporalWorkflowId);
    await handle.cancel();
  }
}