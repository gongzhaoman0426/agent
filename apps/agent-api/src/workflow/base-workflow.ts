import { WORKFLOW_ID_KEY } from './workflow.decorator';

export interface WorkflowDsl {
  id: string;
  name: string;
  description: string;
  version: string;
  tools: string[];
  agents?: any[];
  content?: any;
  events: Array<{ type: string; data?: any }>;
  steps: Array<{ event: string; handle: string }>;
}

export abstract class BaseWorkflow {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract getDsl(): WorkflowDsl;

  get id(): string {
    return Reflect.getMetadata(WORKFLOW_ID_KEY, this.constructor);
  }
}
