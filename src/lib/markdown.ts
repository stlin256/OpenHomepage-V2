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

/** 指令参数值原样写入 hast properties，序列化时由 hast-util-to-html 统一转义 */
function toEmbedDiv(kind: 'bilibili' | 'youtube', attrs: Record<string, string>): Properties | null {
  if (kind === 'bilibili') {
    const bvid = attrs.bvid;
    if (!bvid) return null;
    return {
      className: ['embed-lazy', 'embed-bilibili'],
      dataEmbed: 'bilibili',
      dataBvid: bvid,
      dataSrc: `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0`,
    };
  }
  const id = attrs.id;
  if (!id) return null;
  return {
    className: ['embed-lazy', 'embed-youtube'],
    dataEmbed: 'youtube',
    dataId: id,
    dataSrc: `https://www.youtube-nocookie.com/embed/${id}`,
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
          const properties = toEmbedDiv(name, attrs);
          if (!properties) return degradeToText(directive, file);
          setElement('div', properties);
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
// 管线
// ---------------------------------------------------------------------------

/** 构建一条 markdown → HTML 渲染管线（processor 可复用，内部已缓存 Shiki 实例） */
export function createMarkdownProcessor(options: MarkdownOptions = {}) {
  const themes = options.shikiThemes ?? DEFAULT_SHIKI_THEMES;
  return unified()
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
    .use(rehypeFilterIframes)
    .use(rehypeStringify);
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
