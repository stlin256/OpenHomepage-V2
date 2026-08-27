/**
 * overlay 块注册表（M12a，docs/specs/12 §2.4）：扫描渲染页中的 [data-oh-src] 元素，
 * 解析源码坐标（格式：<data/相对路径>:<start>,<end>，由 remarkEditSpans 注入），
 * 建立「元素 ↔ 坐标」映射。hover 高亮与工具条锚定都基于该注册表。
 * M12b：mergeServerBlocks 把服务端块数据（hash/kind/parent/原文切片）按 (start,end)
 * 合并进注册表（DOM 坐标 ↔ 服务端块对齐），工具条/微编辑器据此工作。
 */

export interface SourceSpan {
  /** data/ 相对路径，如 pages/zh/index.md */
  source: string;
  /** 块起始 offset（含，body 相对） */
  start: number;
  /** 块结束 offset（不含） */
  end: number;
}

/** 服务端块信息（GET /api/page/blocks 响应元素，与 admin/server/blocks.ts BlockInfo 对应） */
export interface ServerBlock {
  start: number;
  end: number;
  kind: string;
  name?: string;
  parent: string;
  /** 内容切片 sha1（防陈旧写） */
  hash: string;
  /** 块原文切片（微编辑器初值） */
  markdown: string;
}

export interface BlockEntry {
  el: Element;
  span: SourceSpan;
  /** 以下为服务端块数据合并后填充（M12b）；未匹配到服务端块时保持 undefined（操作禁用） */
  kind?: string;
  name?: string;
  parent?: string;
  hash?: string;
  markdown?: string;
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

/**
 * 把某文件的服务端块数据按 (start,end) 合并进注册表。
 * 对不上的双方各 console.warn 跳过：DOM 块无服务端对应（坐标陈旧），
 * 服务端块无 DOM 对应（如 html 原文块 raw 直出无元素可挂坐标，见 markdown.ts）。
 */
export function mergeServerBlocks(
  entries: BlockEntry[],
  source: string,
  blocks: ServerBlock[]
): void {
  const byPos = new Map(blocks.map((b) => [`${b.start}:${b.end}`, b]));
  const matched = new Set<string>();
  for (const entry of entries) {
    if (entry.span.source !== source) continue;
    const b = byPos.get(`${entry.span.start}:${entry.span.end}`);
    if (!b) {
      console.warn(`[overlay] DOM 块在服务端无对应块，跳过：${source}:${entry.span.start},${entry.span.end}`);
      continue;
    }
    entry.kind = b.kind;
    entry.name = b.name;
    entry.parent = b.parent;
    entry.hash = b.hash;
    entry.markdown = b.markdown;
    matched.add(`${b.start}:${b.end}`);
  }
  for (const b of blocks) {
    if (!matched.has(`${b.start}:${b.end}`)) {
      console.warn(`[overlay] 服务端块无 DOM 对应（html 原文块等），跳过：${source}:${b.start},${b.end}`);
    }
  }
}
