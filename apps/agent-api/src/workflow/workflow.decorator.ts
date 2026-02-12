import { Injectable } from '@nestjs/common';

export const WORKFLOW_ID_KEY = 'workflow:id';

export function workflowId(id: string) {
  return function (target: any) {
    Reflect.defineMetadata(WORKFLOW_ID_KEY, id, target);
    return Injectable()(target);
  };
}
