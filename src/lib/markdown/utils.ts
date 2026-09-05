/**
 * markdown 管线共享小工具：hast 节点构造（hEl/hTxt）、className 读取（classesOf）、
 * HTML 属性值转义（escapeAttrValue）与 WarnFn 类型。
 * 自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）。
 */

import type { Element, ElementContent, Properties } from 'hast';

export function hEl(tagName: string, properties: Properties = {}, children: ElementContent[] = []): ElementContent {
  return { type: 'element', tagName, properties, children };
}
export function hTxt(value: string): ElementContent {
  return { type: 'text', value };
}

export type WarnFn = (msg: string) => void;

export function classesOf(node: Element): string[] {
  const c = node.properties?.className ?? node.properties?.class;
  return Array.isArray(c) ? c.map(String) : c != null ? [String(c)] : [];
}

/** data-oh-src 值转义为 HTML 属性值（坐标由本管线生成，双写引号/& 兜底） */
export function escapeAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
