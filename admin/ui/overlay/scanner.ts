/**
 * overlay 块注册表（M12a，docs/specs/12 §2.4）：扫描渲染页中的 [data-oh-src] 元素，
 * 解析源码坐标（格式：<data/相对路径>:<start>,<end>，由 remarkEditSpans 注入），
 * 建立「元素 ↔ 坐标」映射。hover 高亮与后续里程碑的工具条锚定都基于该注册表。
 */

export interface SourceSpan {
  /** data/ 相对路径，如 pages/zh/index.md */
  source: string;
  /** 块起始 offset（含，body 相对） */
  start: number;
  /** 块结束 offset（不含） */
  end: number;
}

export interface BlockEntry {
  el: Element;
  span: SourceSpan;
}

const SPAN_RE = /^(.+):(\d+),(\d+)$/;

/** 解析 data-oh-src 属性值；非法格式返回 null */
export function parseOhSrc(value: string): SourceSpan | null {
  const m = SPAN_RE.exec(value.trim());
  if (!m) return null;
  return { source: m[1], start: Number(m[2]), end: Number(m[3]) };
}

/** 扫描 root 下所有带合法 data-oh-src 的元素（含 oh-embed 包裹的嵌入块），按文档顺序返回 */
export function scanBlocks(root: ParentNode): BlockEntry[] {
  const entries: BlockEntry[] = [];
  for (const el of Array.from(root.querySelectorAll('[data-oh-src]'))) {
    const span = parseOhSrc(el.getAttribute('data-oh-src') ?? '');
    if (span) entries.push({ el, span });
  }
  return entries;
}
