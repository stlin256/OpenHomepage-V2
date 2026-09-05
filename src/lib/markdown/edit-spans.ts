/**
 * 可视化编辑模式（M12a，docs/specs/12 §2.2）支持：
 * remarkEditSpans 按 listEditableBlocks 坐标给可编辑块注入 data-oh-src；
 * wrapFragmentForEdit / replacePlaceholder 及 stream/ghcard/editorial 占位的片段替换
 * （编辑模式包 oh-embed 保留坐标供 overlay 锚定，生产模式整段替换）。
 * 自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）。
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Root, Content } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import type { Root as HastRoot, Element, ElementContent, Properties } from 'hast';
import type { VFile } from 'vfile';
import { listEditableBlocks } from '../edit-blocks.ts';
import { classesOf, escapeAttrValue, type WarnFn } from './utils.ts';

/**
 * 按 listEditableBlocks 的坐标给可编辑块注入 data-oh-src="<editSource>:<start>,<end>"。
 * 坐标一致性关键：块列表来自对原文的独立解析（与 admin 块级 API 同一函数），树内按
 * position 精确匹配挂属性——指令节点合并进既有 hProperties（remarkCustomDirectives 已设
 * hName/hProperties），普通块经 data.hProperties 由 remark-rehype 下发。
 * 误嵌套残留的纯冒号段落已被 remarkCustomDirectives 移除，不会匹配到节点（预期行为）；
 * 缺参/未知指令在编辑模式已渲染为占位卡（节点类型不变），坐标照常注入；
 * 行内 textDirective 降级成的文本落在宿主段落内，随段落坐标覆盖。
 * html 块的 data.hProperties 不会生效（raw 直出无元素可挂），DOM 中无对应物。
 */
export function remarkEditSpans(editSource: string) {  return (tree: Root, file: VFile) => {
    const valueByPos = new Map(
      listEditableBlocks(String(file)).map((b) => [
        `${b.start}:${b.end}`,
        `${editSource}:${b.start},${b.end}`,
      ]),
    );
    const attach = (node: Content): void => {
      const pos = node.position;
      if (pos && pos.start.offset != null && pos.end.offset != null) {
        const value = valueByPos.get(`${pos.start.offset}:${pos.end.offset}`);
        if (value !== undefined) {
          const data = (node.data ??= {});
          data.hProperties = { ...((data.hProperties as Properties | undefined) ?? {}), dataOhSrc: value };
        }
      }
      // 递归容器指令内部（与 listEditableBlocks 的递归范围对应：grid/cell 内部块在坐标表中）
      if (node.type === 'containerDirective') {
        for (const child of (node as ContainerDirective).children) attach(child as Content);
      }
    };
    for (const child of tree.children) attach(child);
  };
}

/**
 * 编辑模式包裹：占位元素带 data-oh-src（remarkEditSpans 注入）时，片段不整段替换，
 * 而是包一层 <div data-oh-src class="oh-embed">，保留坐标供 overlay 锚定；
 * 生产模式（无坐标）返回 null，调用方维持整段替换。
 */
export function wrapFragmentForEdit(node: Element, html: string): string | null {  const src = node.properties?.dataOhSrc ?? node.properties?.['data-oh-src'];
  if (typeof src !== 'string' || src === '') return null;
  return `<div data-oh-src="${escapeAttrValue(src)}" class="oh-embed">${html}</div>`;
}

/** 把占位元素替换为 raw HTML 片段；片段缺省时按 replace=remove 移除并 warning */
function replacePlaceholder(
  tree: HastRoot,
  markerClass: string,
  keyOf: (node: Element) => string,
  fragments: Record<string, string>,
  warn: WarnFn,
  missingMsg: (key: string) => string,
): void {
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'div' || parent == null || index == null) return;
    if (!classesOf(node).includes(markerClass)) return;
    const key = keyOf(node);
    const html = fragments[key];
    if (html === undefined) {
      warn(missingMsg(key));
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
    parent.children[index] = {
      type: 'raw',
      value: wrapFragmentForEdit(node, html) ?? html,
    } as unknown as ElementContent;
    return [SKIP, index];
  });
}

export function rehypeStreamEmbeds(embeds: Record<string, string>, warn: WarnFn) {
  return (tree: HastRoot) => {
    replacePlaceholder(
      tree,
      'stream-block',
      (node) => String(node.properties?.dataStreamId ?? node.properties?.['data-stream-id'] ?? ''),
      embeds,
      warn,
      (id) =>
        `::stream 引用了未定义的流式区块 "${id}"（site.yaml streaming_blocks 中没有或加载失败），已移除占位。/` +
        ` Unknown stream block "${id}"; placeholder removed.`,
    );
  };
}

export function rehypeGhCards(ghCards: { htmlByRepo: Record<string, string>; warn?: WarnFn }) {
  const warn = ghCards.warn ?? console.warn;
  return (tree: HastRoot) => {
    replacePlaceholder(
      tree,
      'gh-card',
      (node) => String(node.properties?.dataRepo ?? node.properties?.['data-repo'] ?? '').toLowerCase(),
      ghCards.htmlByRepo,
      warn,
      (repo) =>
        `::ghcard 的仓库 "${repo}" 不在 github.pinned 缓存数据中，已移除占位。/` +
        ` Repo "${repo}" not found in pinned cache; placeholder removed.`,
    );
  };
}

export function rehypeEditorialEmbeds(embeds: Record<string, string>, warn: WarnFn) {
  return (tree: HastRoot) => {
    replacePlaceholder(
      tree,
      'editorial-embed',
      (node) => String(node.properties?.dataEditorialId ?? node.properties?.['data-editorial-id'] ?? ''),
      embeds,
      warn,
      (id) =>
        `::editorial 引用了未定义的编辑区块 "${id}"（site.yaml editorial_blocks 中没有），已移除占位。/` +
        ` Editorial block "${id}" not found in editorial_blocks; placeholder removed.`,
    );
  };
}
