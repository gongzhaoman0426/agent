import { Injectable } from '@nestjs/common';

export const WORKFLOW_ID_KEY = 'workflow:id';

/**
 * 标记一个类为工作流 Provider：写入元数据 + 注册为 NestJS Provider。
 * 启动时由 WorkflowDiscoveryService 扫描并把元数据同步到数据库。
 */
export function workflowId(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any) {
    Reflect.defineMetadata(WORKFLOW_ID_KEY, id, target);
    return Injectable()(target);
  };
}
