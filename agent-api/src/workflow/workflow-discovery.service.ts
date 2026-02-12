import { Injectable, OnModuleInit, Type, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service';
import { BaseWorkflow } from './base-workflow';
import { WORKFLOW_ID_KEY } from './workflow.decorator';

@Injectable()
export class WorkflowDiscoveryService implements OnModuleInit {
  private workflowMap = new Map<string, Type<BaseWorkflow>>();
  private workflowInstances = new Map<string, BaseWorkflow>();
  private readonly logger = new Logger(WorkflowDiscoveryService.name);

  constructor(
    private discoveryService: DiscoveryService,
    private reflector: Reflector,
    private prismaService: PrismaService,
  ) {}

  async onModuleInit() {
    await this.discoverAndSyncWorkflows();
  }

  private async discoverAndSyncWorkflows() {
    this.logger.log('Starting workflow discovery and synchronization');
    this.discoverWorkflows();
    await this.syncWorkflowsToDatabase();
    await this.cleanupObsoleteCodeWorkflows();
    this.logger.log('Workflow discovery and synchronization completed');
  }

  private discoverWorkflows() {
    const providers = this.discoveryService.getProviders();
    for (const wrapper of providers) {
      const { metatype, instance } = wrapper;
      if (!metatype) continue;
      const wfId = this.reflector.get(WORKFLOW_ID_KEY, metatype);
      if (!wfId) continue;
      if (!(instance instanceof BaseWorkflow)) continue;
      if (this.workflowMap.has(wfId)) {
        throw new Error(`Workflow with ID ${wfId} is already registered.`);
      }
      this.workflowMap.set(wfId, metatype as Type<BaseWorkflow>);
      this.workflowInstances.set(wfId, instance);
      this.logger.log(`Discovered code-defined workflow: ${wfId}`);
    }
  }

  private async syncWorkflowsToDatabase() {
    for (const [wfId, instance] of this.workflowInstances) {
      const dsl = instance.getDsl();

      const existing = await this.prismaService.workFlow.findUnique({
        where: { id: wfId },
      });

      if (existing && existing.deleted) {
        this.logger.log(`Reactivating previously deleted code workflow: ${wfId}`);
      }

      await this.prismaService.workFlow.upsert({
        where: { id: wfId },
        update: {
          name: instance.name,
          description: instance.description,
          DSL: dsl as any,
          source: 'code',
          deleted: false,
          updatedAt: new Date(),
        },
        create: {
          id: wfId,
          name: instance.name,
          description: instance.description,
          DSL: dsl as any,
          source: 'code',
        },
      });

      this.logger.log(`Synced code workflow to database: ${wfId}`);
    }
  }

  private async cleanupObsoleteCodeWorkflows() {
    const codeWorkflows = await this.prismaService.workFlow.findMany({
      where: { source: 'code', deleted: false },
    });

    for (const dbWorkflow of codeWorkflows) {
      if (!this.workflowMap.has(dbWorkflow.id)) {
        await this.prismaService.workFlow.update({
          where: { id: dbWorkflow.id },
          data: { deleted: true },
        });
        this.logger.warn(`Marked obsolete code workflow as deleted: ${dbWorkflow.id}`);
      }
    }
  }

  isCodeWorkflow(id: string): boolean {
    return this.workflowMap.has(id);
  }
}
