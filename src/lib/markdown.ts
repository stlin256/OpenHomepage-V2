/**
 * markdown → HTML 渲染管线：纯函数式，不依赖 Astro 运行时，供构建期页面与单测复用。
 *
 * 能力：GFM、Shiki 明暗双主题代码高亮、KaTeX 数学公式、自定义指令
 * （bilibili/youtube/video/audio/figure/grid/cell/stream/ghcard，见 docs/specs/03）、
 * HTML 混写白名单过滤（剔除 script/事件属性/非白名单 iframe）。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeShiki from '@shikijs/rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Content } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import type { Root as HastRoot, Element, ElementContent, Properties } from 'hast';
import type { VFile } from 'vfile';

export interface MarkdownOptions {
  /** Shiki 明暗双主题（CSS 变量双写方案，前端按主题切换 var） */
  shikiThemes?: { light: string; dark: string };
  /**
   * 流式区块嵌入：id → 构建好的完整 HTML 片段（src/lib/stream.ts 的 streamEmbedHtml）。
   * markdown 中 `::stream{id}` 占位（.stream-block div）在 rehype 阶段被整段替换；
   * id 未匹配时移除占位并 warning。
   */
  streamEmbeds?: Record<string, string>;
  /**
   * GitHub 仓库卡片：仓库 full_name（小写）→ 卡片 HTML 片段
   * （src/lib/github-block.ts 的 repoCardHtml，数据来自 .cache/github.json pinned）。
   * markdown 中 `::ghcard{repo}` 占位（.gh-card div）被替换；匹配不到移除并 warning。
   */
  ghCards?: { htmlByRepo: Record<string, string>; warn?: (msg: string) => void };
}

const DEFAULT_SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' };

/** 允许内嵌 iframe 的域名前缀（官方播放器），其余 iframe 一律剔除 */
const IFRAME_SRC_ALLOWLIST = [
  /^https:\/\/player\.bilibili\.com\//,
  /^https:\/\/([\w-]+\.)?youtube\.com\/embed\//,
  /^https:\/\/([\w-]+\.)?youtube-nocookie\.com\/embed\//,
];

/** KaTeX 输出的 MathML 标签与属性（渲染结果固定，全量放行） */
const MATH_ML_TAGS = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'mtext', 'mspace',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
  'mstyle', 'munderover', 'mover', 'munder', 'mpadded', 'mphantom', 'menclose',
  'merror', 'mglyph', 'ms',
];
const MATH_ML_ATTRS = [
  'xmlns', 'display', 'mathvariant', 'encoding', 'stretchy', 'accent', 'lspace',
  'rspace', 'fence', 'separator', 'largeop', 'movablelimits', 'symmetric', 'maxsize',
  'minsize', 'columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'width',
  'height', 'depth', 'scriptlevel', 'displaystyle', 'href',
];

/** 白名单 schema：在 GitHub 默认基础上放行 KaTeX/Shiki/媒体标签与 class/style/data* */
function buildSanitizeSchema(): Schema {
  const attributes: NonNullable<Schema['attributes']> = {
    ...defaultSchema.attributes,
    // @shikijs/rehype 产物的属性键是属性名形态（class/tabindex），与 className/tabIndex 一并放行
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className', 'class', 'tabindex', 'style', 'data*', 'loading', 'role',
      'ariaHidden', 'ariaLabel', 'ariaLabelledBy', 'ariaDescribedBy',
    ],
    iframe: ['src', 'width', 'height', 'allowFullScreen', 'loading', 'referrerPolicy', 'title'],
    video: ['src', 'poster', 'controls', 'preload', 'width', 'height'],
    audio: ['src', 'controls', 'preload'],
    img: [...(defaultSchema.attributes?.img ?? ['src', 'alt', 'title']), 'loading', 'width', 'height'],
  };
  for (const tag of MATH_ML_TAGS) attributes[tag] = MATH_ML_ATTRS;
  return {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'iframe', 'video', 'audio', 'figure', 'figcaption', ...MATH_ML_TAGS,
    ],
    attributes,
  };
}

// ---------------------------------------------------------------------------
// remark 插件：自定义指令 → hast 映射
// ---------------------------------------------------------------------------

type Directive = ContainerDirective | LeafDirective | TextDirective;

/** bilibili/youtube 指令：直接输出官方播放器 iframe（loading=lazy），外层 16:9 响应式容器 */
function toEmbedDiv(
  kind: 'bilibili' | 'youtube',
  attrs: Record<string, string>,
): { properties: Properties; children: ElementContent[] } | null {
  let src: string;
  let title: string;
  if (kind === 'bilibili') {
    if (!attrs.bvid) return null;
    src = `https://player.bilibili.com/player.html?bvid=${attrs.bvid}&autoplay=0`;
    title = 'bilibili 播放器';
  } else {
    if (!attrs.id) return null;
    src = `https://www.youtube-nocookie.com/embed/${attrs.id}`;
    title = 'YouTube 播放器';
  }
  return {
    properties: { className: ['embed-player', `embed-${kind}`] },
    children: [
      {
        type: 'element',
        tagName: 'iframe',
        properties: { src, loading: 'lazy', allowFullScreen: true, title },
        children: [],
      },
    ],
  };
}

const WIDTH_RE = /^[\d.]+(%|px|em|rem|vw)$/;

function toFigure(attrs: Record<string, string>): { properties: Properties; children: ElementContent[] } | null {
  const src = attrs.src;
  if (!src) return null;
  const caption = attrs.caption ?? '';
  const properties: Properties = {};
  if (attrs.width && WIDTH_RE.test(attrs.width)) {
    properties.style = `width:${attrs.width}`;
  }
  const children: ElementContent[] = [
    {
      type: 'element',
      tagName: 'img',
      properties: { src, alt: caption, loading: 'lazy' },
      children: [],
    },
  ];
  if (caption) {
    children.push({
      type: 'element',
      tagName: 'figcaption',
      properties: {},
      children: [{ type: 'text', value: caption }],
    });
  }
  return { properties, children };
}

/** 未识别/缺参数的指令：按原始源码降级为普通文本，不报错 */
function degradeToText(node: Directive, file: VFile): void {
  const { start, end } = node.position ?? {};
  const raw =
    start?.offset != null && end?.offset != null
      ? String(file).slice(start.offset, end.offset)
      : '';
  const text: Content = { type: 'text', value: raw };
  const target = node as unknown as Record<string, unknown>;
  delete target.name;
  delete target.attributes;
  delete target.data;
  if (node.type === 'textDirective') {
    target.type = 'text';
    target.value = raw;
    delete target.children;
  } else {
    target.type = 'paragraph';
    target.children = [text];
  }
}

function remarkCustomDirectives() {
  return (tree: Root, file: VFile) => {
    visit(tree, (node) => {
      if (
        node.type !== 'containerDirective' &&
        node.type !== 'leafDirective' &&
        node.type !== 'textDirective'
      ) {
        return;
      }
      const directive = node as Directive;
      const name = directive.name;
      const attrs = (directive.attributes ?? {}) as Record<string, string>;
      const data = (directive.data ??= {});

      const setElement = (tagName: string, properties: Properties) => {
        data.hName = tagName;
        data.hProperties = properties;
      };

      switch (name) {
        case 'bilibili':
        case 'youtube': {
          const embed = toEmbedDiv(name, attrs);
          if (!embed) return degradeToText(directive, file);
          setElement('div', embed.properties);
          data.hChildren = embed.children;
          break;
        }
        case 'video':
        case 'audio': {
          if (!attrs.src) return degradeToText(directive, file);
          const properties: Properties = { src: attrs.src, controls: true };
          if (name === 'video' && attrs.poster) properties.poster = attrs.poster;
          setElement(name, properties);
          break;
        }
        case 'figure': {
          const figure = toFigure(attrs);
          if (!figure) return degradeToText(directive, file);
          setElement('figure', figure.properties);
          data.hChildren = figure.children;
          break;
        }
        case 'grid': {
          const properties: Properties = { className: ['md-grid'] };
          const cols = Number(attrs.cols);
          if (Number.isInteger(cols) && cols >= 1 && cols <= 12) {
            properties.style = `grid-template-columns:repeat(${cols},1fr)`;
          }
          setElement('div', properties);
          break;
        }
        case 'cell': {
          setElement('div', { className: ['md-grid-cell'] });
          break;
        }
        case 'stream': {
          if (!attrs.id) return degradeToText(directive, file);
          setElement('div', { className: ['stream-block'], dataStreamId: attrs.id });
          break;
        }
        case 'ghcard': {
          if (!attrs.repo) return degradeToText(directive, file);
          setElement('div', { className: ['gh-card'], dataRepo: attrs.repo });
          break;
        }
        default:
          degradeToText(directive, file);
      }
    });
  };
}

// ---------------------------------------------------------------------------
// rehype 插件：图片懒加载、iframe 域名白名单
// ---------------------------------------------------------------------------

function rehypeLazyImages() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img' && node.properties && node.properties.loading == null) {
        node.properties.loading = 'lazy';
      }
    });
  };
}

function rehypeFilterIframes() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'iframe' || parent == null || index == null) return;
      const src = String(node.properties?.src ?? '');
      if (!IFRAME_SRC_ALLOWLIST.some((re) => re.test(src))) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });
  };
}

// ---------------------------------------------------------------------------
// rehype 插件：stream/ghcard 占位 → 构建好的 HTML 片段（须在 sanitize 之后运行，
// 产物为 raw 节点直出；片段本身来自可信构建数据，见 src/lib/stream.ts、github-block.ts）
// ---------------------------------------------------------------------------

type WarnFn = (msg: string) => void;

function classesOf(node: Element): string[] {
  const c = node.properties?.className ?? node.properties?.class;
  return Array.isArray(c) ? c.map(String) : c != null ? [String(c)] : [];
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
    parent.children[index] = { type: 'raw', value: html } as unknown as ElementContent;
    return [SKIP, index];
  });
}

function rehypeStreamEmbeds(embeds: Record<string, string>, warn: WarnFn) {
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

function rehypeGhCards(ghCards: { htmlByRepo: Record<string, string>; warn?: WarnFn }) {
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

// ---------------------------------------------------------------------------
// 管线
// ---------------------------------------------------------------------------

/** 构建一条 markdown → HTML 渲染管线（processor 可复用，内部已缓存 Shiki 实例） */
export function createMarkdownProcessor(options: MarkdownOptions = {}) {
  const themes = options.shikiThemes ?? DEFAULT_SHIKI_THEMES;
  const warn = console.warn;
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkMath)
    .use(remarkCustomDirectives)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // rehype-katex 内部强制 throwOnError: false，公式语法错误渲染为红色文本而非抛错
    .use(rehypeKatex)
    // defaultColor: false → 双主题全部走 CSS 变量（--shiki-light/--shiki-dark），前端切换 var 即可
    .use(rehypeShiki, { themes, defaultColor: false })
    .use(rehypeLazyImages)
    .use(rehypeSanitize, buildSanitizeSchema())
    .use(rehypeFilterIframes);
  // stream/ghcard 占位替换在 sanitize 之后：产物为可信构建片段，raw 直出。
  // 未提供对应选项时占位原样保留（如纯渲染场景）；提供后未匹配的占位移除并 warning。
  if (options.streamEmbeds) processor.use(() => rehypeStreamEmbeds(options.streamEmbeds!, warn));
  if (options.ghCards) processor.use(() => rehypeGhCards(options.ghCards!));
  // allowDangerousHtml：sanitize 之后用户内容的 raw 节点已被 rehypeRaw 全部解析，
  // 树中仅剩上面替换进来的可信构建片段（stream/ghcard），须直出而非转义（回归 #8）
  return processor.use(rehypeStringify, { allowDangerousHtml: true });
}

const processorCache = new Map<string, ReturnType<typeof createMarkdownProcessor>>();

/** 渲染 markdown 为 HTML 字符串；相同 options 复用同一 processor */
export async function renderMarkdown(
  markdown: string,
  options: MarkdownOptions = {}
): Promise<string> {
  const key = JSON.stringify(options);
  let processor = processorCache.get(key);
  if (!processor) {
    processor = createMarkdownProcessor(options);
    processorCache.set(key, processor);
  }
  return String(await processor.process(markdown));
}
