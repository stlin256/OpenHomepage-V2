/**
 * 流式区块构建侧（docs/specs/04）：把 markdown 渲染产物（hast 树）切成
 * open / text / close / node 指令序列，前端逐 token 增量插入 DOM，
 * 结构随播随成型（标题立刻是标题、代码按行流出且即时高亮）。
 *
 * token 形态：
 * - { t: 'open', tag, h }：开标签（h 为开标签 HTML，前端用浏览器自身解析器还原属性）
 * - { t: 'text', w }      ：文本片段（CJK 逐字，拉丁字母/数字按词，标点独立成 token）
 * - { t: 'close' }        ：闭合当前元素（弹栈）
 * - { t: 'node', h }      ：完整子树一次性出现（链接/图片/数学/代码行，避免半截语法闪烁）
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toHtml } from 'hast-util-to-html';
import type { Root, Element, ElementContent, RootContent } from 'hast';
import { createMarkdownProcessor, type MarkdownOptions } from './markdown.ts';
import { resolveText, type LocalizedText } from './config.ts';

export type StreamToken =
  | { t: 'open'; tag: string; h: string }
  | { t: 'text'; w: string }
  | { t: 'close' }
  | { t: 'node'; h: string };

/** 整体出现、不逐字流出的元素（spec 04 §1：链接、图片到完整节点时才出现） */
const ATOMIC_TAGS = new Set([
  'a', 'img', 'math', 'br', 'hr', 'input', 'video', 'audio', 'iframe', 'source',
]);

/** 文本切分：拉丁词（连尾部空格/制表符）｜空白串｜CJK/全角单字｜其余单码点（标点等） */
const TEXT_TOKEN_RE =
  /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*[ \t]*|[ \t\n\r]+|[⺀-鿿豈-﫿぀-ヿ가-힯＀-￯]|./gsu;

/** 把一段纯文本切成 token 文本序列；空串返回空数组 */
export function splitTextTokens(text: string): string[] {
  return text.match(TEXT_TOKEN_RE) ?? [];
}

function hasClass(el: Element, cls: string): boolean {
  // 注意：经 rehypeRaw 重解析后 class 属性键可能是 className 或 class
  const c = el.properties?.className ?? el.properties?.class;
  return Array.isArray(c) ? c.includes(cls) : c === cls;
}

/** 序列化元素的开标签（children 置空后去掉结尾闭合标签；void 元素原样） */
function openTagHtml(el: Element): string {
  const s = toHtml({ ...el, children: [] });
  const close = `</${el.tagName}>`;
  return s.endsWith(close) ? s.slice(0, s.length - close.length) : s;
}

function elementHasLineSpan(el: Element): boolean {
  if (hasClass(el, 'line')) return true;
  return el.children.some((c) => c.type === 'element' && elementHasLineSpan(c));
}

/**
 * pre 代码块：含 Shiki .line 行元素时逐行流出（每行一个 node token，即时高亮），
 * 行间换行等空白文本作为零停顿 text token；无行元素时整块一次性出现。
 */
function walkPre(pre: Element, push: (t: StreamToken) => void): void {
  if (!elementHasLineSpan(pre)) {
    push({ t: 'node', h: toHtml(pre) });
    return;
  }
  push({ t: 'open', tag: pre.tagName, h: openTagHtml(pre) });
  const walkChild = (node: ElementContent) => {
    if (node.type === 'text') {
      if (node.value.trim() === '') push({ t: 'text', w: node.value });
      else for (const w of splitTextTokens(node.value)) push({ t: 'text', w });
      return;
    }
    if (node.type !== 'element') return;
    if (hasClass(node, 'line')) {
      push({ t: 'node', h: toHtml(node) });
      return;
    }
    push({ t: 'open', tag: node.tagName, h: openTagHtml(node) });
    for (const c of node.children) walkChild(c);
    push({ t: 'close' });
  };
  for (const c of pre.children) walkChild(c);
  push({ t: 'close' });
}

/** hast 子树数组 → token 序列 */
export function hastToStreamTokens(nodes: (RootContent | ElementContent | Root)[]): StreamToken[] {
  const tokens: StreamToken[] = [];
  const push = (t: StreamToken) => tokens.push(t);
  const walk = (node: RootContent | ElementContent | Root) => {
    // rehypeRaw 重解析会产生嵌套的 root 片段节点（运行时存在，不在 RootContent 类型里），递归其 children
    if (node.type === 'root') {
      for (const c of node.children) walk(c as ElementContent);
      return;
    }
    if (node.type === 'text') {
      for (const w of splitTextTokens(node.value)) push({ t: 'text', w });
      return;
    }
    if (node.type !== 'element') return;
    if (ATOMIC_TAGS.has(node.tagName)) {
      push({ t: 'node', h: toHtml(node) });
      return;
    }
    if (node.tagName === 'pre') {
      walkPre(node, push);
      return;
    }
    push({ t: 'open', tag: node.tagName, h: openTagHtml(node) });
    for (const c of node.children) walk(c);
    push({ t: 'close' });
  };
  for (const n of nodes) walk(n);
  return tokens;
}

/**
 * token 序列 → JSON 字符串。`<\/` 转义为 `<\/`，防止内嵌进
 * <script type="application/json"> 时被浏览器的 </script> 终止（JSON 中 \/ 合法）。
 */
export function serializeTokensJson(tokens: StreamToken[]): string {
  return JSON.stringify(tokens).replace(/<\//g, '<\\/');
}

/** markdown → { html, tokens }：复用 M2 管线，run 出 hast 后同时取字符串与 token 序列 */
export async function markdownToStream(
  markdown: string,
  options: MarkdownOptions = {},
): Promise<{ html: string; tokens: StreamToken[] }> {
  const processor = createMarkdownProcessor(options);
  const tree = await processor.run(processor.parse(markdown));
  return {
    html: processor.stringify(tree),
    tokens: hastToStreamTokens(tree.children as ElementContent[]),
  };
}

/**
 * streaming 内容文件回退链（spec：页面语言 → en → 默认语言 → content_file 原路径）。
 * content_file 形如 "streaming/welcome.md"，实际文件按语言分目录
 * （streaming/<lang>/welcome.md）。找不到返回 null。
 */
export function resolveStreamingFile(
  dataDir: string,
  contentFile: string,
  lang: string,
  defaultLang: string,
): string | null {
  const dir = path.dirname(contentFile);
  const base = path.basename(contentFile);
  for (const l of [...new Set([lang, 'en', defaultLang])]) {
    const p = path.join(dataDir, dir, l, base);
    if (existsSync(p)) return p;
  }
  const direct = path.join(dataDir, contentFile);
  return existsSync(direct) ? direct : null;
}

export interface StreamingBlockDef {
  id: string;
  title?: LocalizedText;
  content_file: string;
  autoplay?: boolean;
  speed?: number;
}

export interface LoadedStreamBlock {
  id: string;
  /** 已按语言解析的标题；未配置为 '' */
  title: string;
  autoplay: boolean;
  /** 基础间隔 ms/token */
  speed: number;
  /** 完整 HTML（noscript 降级用） */
  html: string;
  tokens: StreamToken[];
}

export const DEFAULT_STREAM_SPEED = 40;

/** 加载并渲染一个流式区块；文件缺失时 warning 并返回 null */
export async function loadStreamingBlock(
  dataDir: string,
  def: StreamingBlockDef,
  lang: string,
  defaultLang: string,
  warn: (msg: string) => void = console.warn,
  slugs?: ReadonlySet<string>,
): Promise<LoadedStreamBlock | null> {
  const file = resolveStreamingFile(dataDir, def.content_file, lang, defaultLang);
  if (!file) {
    warn(
      `流式区块 "${def.id}" 找不到内容文件 ${def.content_file}（已按语言回退链查找），已跳过。/` +
        ` Streaming block "${def.id}": ${def.content_file} not found (fallback chain tried); skipped.`,
    );
    return null;
  }
  const { html, tokens } = await markdownToStream(readFileSync(file, 'utf8'), slugs ? {
    localizeHrefs: { lang, defaultLang, slugs: [...slugs] },
  } : {});
  return {
    id: def.id,
    title: def.title === undefined ? '' : resolveText(def.title, lang),
    autoplay: def.autoplay ?? true,
    speed: def.speed ?? DEFAULT_STREAM_SPEED,
    html,
    tokens,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const REPLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

/**
 * 流式区块的完整 HTML 片段：主页 streaming 区块与 markdown `::stream{id}`
 * 占位替换共用同一份结构（前端脚本按 .stream-block[data-stream-id] 全局初始化）。
 * 结构：头部（标题+重播按钮）/ 空播放容器 / noscript 完整内容 / tokens JSON。
 * titleCfgAttr（M12d，可选）：data-oh-cfg 完整属性值（<yaml路径>@<lang>），仅编辑模式
 * 由调用方（editCfgValue）传入，挂到 .stream-title 上；本函数输出在 sanitize 之后注入，属性可存活。
 */
export function streamEmbedHtml(block: LoadedStreamBlock, titleCfgAttr?: string): string {
  const cfgAttr =
    titleCfgAttr && block.title ? ` data-oh-cfg="${escapeHtml(titleCfgAttr)}"` : '';
  const title = block.title
    ? `<p class="stream-title"${cfgAttr}>${escapeHtml(block.title)}</p>`
    : '';
  return (
    `<div class="stream-block" data-stream-id="${escapeHtml(block.id)}"` +
    ` data-autoplay="${block.autoplay ? 'true' : 'false'}" data-speed="${block.speed}">` +
    `<div class="stream-head">${title}` +
    `<button class="stream-replay" type="button" aria-label="重播 / Replay">${REPLAY_ICON}</button>` +
    `</div>` +
    `<div class="stream-content markdown-body"></div>` +
    `<noscript><div class="stream-content markdown-body">${block.html}</div></noscript>` +
    `<script type="application/json" class="stream-tokens">${serializeTokensJson(block.tokens)}</script>` +
    `</div>`
  );
}
