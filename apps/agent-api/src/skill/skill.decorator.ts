import { Injectable } from '@nestjs/common';

export const SKILL_ID_KEY = 'skill:id';

export function skillId(id: string) {
  return function (target: any) {
    Reflect.defineMetadata(SKILL_ID_KEY, id, target);
    return Injectable()(target);
  };
}
