/**
 * 配置字段路径解析（M12d，docs/specs/12 §2.3/§2.5）：admin server 的
 * POST /api/config/field（写回校验）与 overlay 的就地改字（读当前值）共用。
 * 路径按 `.` 分段；段落在对象上取属性，在数组上按数字下标或元素 id 字段匹配
 * （如 streaming_blocks.welcome.title 中的 welcome 段匹配 streaming_blocks 里 id 为
 * welcome 的项），保证数组顺序变化不影响坐标。
 */

/** 路径段合法性：字母/数字/下划线；同时禁用原型污染键 */
export function isValidConfigPathSegment(seg: string): boolean {
  if (!/^[a-z0-9_]+$/i.test(seg)) return false;
  const lower = seg.toLowerCase();
  return lower !== '__proto__' && lower !== 'constructor' && lower !== 'prototype';
}

/** 校验并拆分点分段路径；非法返回 null */
export function parseConfigPath(dotted: string): string[] | null {
  const segments = dotted.split('.');
  if (segments.some((s) => !isValidConfigPathSegment(s))) return null;
  return segments;
}

/** 段一步解析：对象取属性；数组按数字下标或元素 id 匹配；不可解析返回 undefined */
export function stepConfigPath(node: unknown, seg: string): unknown {
  if (Array.isArray(node)) {
    if (/^\d+$/.test(seg)) return node[Number(seg)];
    return node.find(
      (item) => !!item && typeof item === 'object' && (item as Record<string, unknown>).id === seg
    );
  }
  if (node && typeof node === 'object') return (node as Record<string, unknown>)[seg];
  return undefined;
}

/** 按段序列解析到目标值；任一步不可解析返回 undefined */
export function resolveConfigPath(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    cur = stepConfigPath(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}
