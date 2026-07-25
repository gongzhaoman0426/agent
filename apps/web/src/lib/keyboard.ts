import type { KeyboardEvent } from 'react';

/**
 * 判断这次回车是否应该触发提交。
 *
 * 中文等输入法在候选词未上屏时按回车只是「选词」，但浏览器同样会派发 keydown，
 * 此时 value 还是拼音字母，直接提交就会把拼音发出去。isComposing 标记组合态；
 * 少数浏览器/输入法不带该标记，用 keyCode 229 兜底。
 */
export function isSubmitEnter(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' || event.shiftKey) {
    return false;
  }
  return !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229;
}
