import { Injectable } from '@nestjs/common';

export const TOOLKIT_ID_KEY = 'toolkit:id';

/**
 * 标记一个类为 Toolkit：写入元数据 + 注册为 NestJS Provider。
 * 启动时由 ToolkitDiscoveryService 扫描并同步到数据库。
 */
export function toolkitId(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any) {
    Reflect.defineMetadata(TOOLKIT_ID_KEY, id, target);
    return Injectable()(target);
  };
}
