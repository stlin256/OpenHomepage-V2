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
import { localizeInternalHref } from './routes.ts';
import { withBase, getBaseUrl } from './base-url.ts';
import { listEditableBlocks } from './edit-blocks.ts';
import { localizeRemoteAsset, type RemoteFetchFn } from './remote-assets.ts';

export interface MarkdownOptions {
  /** 站点 base URL，用于静态资源与链接补齐前缀（缺省自动读取或为 /） */
  baseUrl?: string;
  /**
   * 可视化编辑模式（M12a，docs/specs/12 §2.2）：页面正文的 data/ 相对路径
   * （如 pages/zh/index.md）。存在时启用 remarkEditSpans——给每个可编辑块的 hast 元素
   * 注入 data-oh-src="<editSource>:<start>,<end>" 坐标（与 listEditableBlocks 同一函数，
   * 坐标与 admin 块级 API 一致）；stream/ghcard/editorial 占位由整段替换改为 oh-embed 包裹；
   * 缺参/未知指令不降级为纯文本，改渲染占位卡（oh-directive-placeholder，保持节点类型
   * 不变、坐标照常注入，overlay 可点击打开检查器）。生产渲染（无 editSource）零注入。
   */
  editSource?: string;
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
  /** 编辑区块 id → 构建好的完整 HTML 片段（src/lib/editorial-block.ts） */
  editorialEmbeds?: Record<string, string>;
  /** 当前路由语言下的站内链接改写参数；缺省时保留作者写的链接 */
  localizeHrefs?: {
    lang: string;
    defaultLang: string;
    slugs: string[];
    baseUrl?: string;
  };
  /**
   * 远程媒体本地化：img/video/audio/source 的 http(s) src/poster 在渲染时下载到
   * <dataDir>/assets/remote/ 并改写为本地路径（URL→路径映射持久化在 .cache/
   * remote-assets.json，同一 URL 跨页面/跨构建只下载一次）。下载失败保留原 URL。
   * 仅真实 data/ 目录生效（data.example/ 为入库示例数据，不写入）。
   */
  localizeAssets?: { dataDir: string; fetchFn?: RemoteFetchFn; warn?: (msg: string) => void };
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
    img: [...(defaultSchema.attributes?.img ?? ['src', 'alt', 'title']), 'loading', 'decoding', 'sizes', 'width', 'height'],
    button: ['type', 'ariaLabel', 'ariaPressed', 'disabled'],
    svg: ['viewBox', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'width', 'height', 'ariaHidden', 'ariaLabel', 'xmlns'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
  };
  for (const tag of MATH_ML_TAGS) attributes[tag] = MATH_ML_ATTRS;
  return {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'iframe', 'video', 'audio', 'figure', 'figcaption', 'button', 'svg', 'path', ...MATH_ML_TAGS,
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
const FIGURE_ALIGNS = ['left', 'center', 'right'] as const;
type FigureAlign = (typeof FIGURE_ALIGNS)[number];

/** figure 对齐 → margin 内联样式（依赖 figure 为块级且有确定宽度时生效） */
const FIGURE_ALIGN_STYLE: Record<FigureAlign, string> = {
  left: 'margin-left:0;margin-right:auto',
  center: 'margin-left:auto;margin-right:auto',
  right: 'margin-left:auto;margin-right:0',
};

function toFigure(attrs: Record<string, string>, baseUrl?: string): { properties: Properties; children: ElementContent[] } | null {
  const rawSrc = attrs.src;
  if (!rawSrc) return null;
  const src = withBase(rawSrc, baseUrl);
  const caption = attrs.caption ?? '';
  const properties: Properties = {};
  const styles: string[] = [];
  if (attrs.width && WIDTH_RE.test(attrs.width)) {
    styles.push(`width:${attrs.width}`);
  }
  const align = attrs.align as FigureAlign | undefined;
  if (align && (FIGURE_ALIGNS as readonly string[]).includes(align)) {
    styles.push(FIGURE_ALIGN_STYLE[align]);
  }
  if (styles.length > 0) properties.style = styles.join(';');
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

/**
 * 纯冒号段落判定：嵌套容器指令未遵守「外层冒号数多于内层」（spec 03 §2）时，
 * remark-directive 会把多层闭合合并消费，多余的 `:::` 闭合围栏解析成普通文本段落，
 * 渲染为网格/正文里的残留 ":::" 文本（曾出现在画廊页图片右上角，形似拖动手柄）。
 * 这类段落没有合法内容语义，管线容错直接移除。
 */
/**
 * `:::audio` 自渲染播放器结构：真实 `<audio>` 保留原生内核（不隐藏节点本身，
 * 仅 CSS 收缩为 1px 无障碍占位），外层卡片由前端交互接管；A 默认卡片，
 * `cover` 存在时自动切为 B 封面卡。`preload` 默认 metadata，保证播放前可显示时长；
 * `none` 时不主动读元数据，点击后才加载。
 */
function hEl(tagName: string, properties: Properties = {}, children: ElementContent[] = []): ElementContent {
  return { type: 'element', tagName, properties, children };
}
function hTxt(value: string): ElementContent {
  return { type: 'text', value };
}

const PLAY_ICON_PATH = 'M8 5v14l11-7z';
const PAUSE_ICON_PATH = 'M6 5h4v14H6zM14 5h4v14h-4z';

function audioPlayPauseSvg(): ElementContent[] {
  const playSvg = hEl('svg', { className: ['icon-play'], viewBox: '0 0 24 24', fill: 'currentColor', ariaHidden: 'true' }, [
    hEl('path', { d: PLAY_ICON_PATH }),
  ]);
  const pauseSvg = hEl('svg', { className: ['icon-pause'], viewBox: '0 0 24 24', fill: 'currentColor', ariaHidden: 'true' }, [
    hEl('path', { d: PAUSE_ICON_PATH }),
  ]);
  return [playSvg, pauseSvg];
}

/**
 * `:::audio` 自渲染播放器结构：真实 `<audio>` 保留原生内核（不隐藏节点本身，
 * 仅 CSS 收缩为 1px 无障碍占位），外层卡片由前端交互接管；A 默认卡片，
 * `cover` 存在时自动切为 B 封面卡。`preload` 默认 metadata，保证播放前可显示时长；
 * `none` 时不主动读元数据，点击后才加载。
 */
function toAudioPlayer(
  attrs: Record<string, string>,
  baseUrl?: string,
): { properties: Properties; children: ElementContent[] } {
  const src = withBase(attrs.src, baseUrl);
  const title = attrs.title || '';
  const desc = attrs.description ?? attrs.desc ?? '';
  const cover = attrs.cover ? withBase(attrs.cover, baseUrl) : undefined;
  const isCard = Boolean(cover);

  const className = ['audio-player', 'md-audio'];
  if (isCard) className.push('audio-card');

  const properties: Properties = {
    className,
    'data-src': src,
    'data-mode': isCard ? 'card' : 'compact',
    role: 'group',
    ariaLabel: title || 'Audio player',
  };
  if (attrs.preload && ['none', 'metadata', 'auto'].includes(attrs.preload)) {
    properties['data-preload'] = attrs.preload;
  }
  if (title) properties['data-title'] = title;
  if (desc) properties['data-desc'] = desc;
  if (cover) properties['data-cover'] = cover;

  const btn = hEl('button', { className: ['btn-toggle'], type: 'button', ariaLabel: '播放 / Play' }, audioPlayPauseSvg());
  const track = hEl('div', { className: ['audio-track'] }, [hEl('div', { className: ['audio-fill'] })]);
  const timeSpan = hEl('span', { className: ['audio-time'] }, [hTxt('--:-- / --:--')]);

  if (isCard && cover) {
    const coverImg = hEl('img', { src: cover, alt: title || 'Cover', loading: 'lazy', decoding: 'async' });
    const audioCover = hEl('div', { className: ['audio-cover'] }, [coverImg]);

    const titleNode = hEl('span', { className: ['audio-title', 'audio-scroll-text'], dataMarquee: 'true' }, [hTxt(title || '音频播放 / Audio')]);
    const titleScroll = hEl('div', { className: ['audio-scroll'] }, [titleNode]);

    const contentChildren: ElementContent[] = [titleScroll];
    if (desc) {
      const descNode = hEl('span', { className: ['audio-desc', 'audio-scroll-text'], dataMarquee: 'true' }, [hTxt(desc)]);
      contentChildren.push(hEl('div', { className: ['audio-scroll'] }, [descNode]));
    }
    const audioBottom = hEl('div', { className: ['audio-bottom'] }, [btn, timeSpan]);
    contentChildren.push(audioBottom, track);
    const audioContent = hEl('div', { className: ['audio-content'] }, contentChildren);

    return { properties, children: [audioCover, audioContent] };
  }

  // Compact A mode
  const titleNode = hEl('span', { className: ['audio-title', 'audio-scroll-text'], dataMarquee: 'true' }, [hTxt(title || '音频播放 / Audio')]);
  const titleScroll = hEl('span', { className: ['audio-scroll'] }, [titleNode]);
  const barsSpan = hEl('span', { className: ['audio-bars-mini'], ariaHidden: 'true' }, [
    hEl('span'), hEl('span'), hEl('span'), hEl('span'), hEl('span'),
  ]);
  const audioBottom = hEl('div', { className: ['audio-bottom'] }, [timeSpan, barsSpan]);
  const audioMeta = hEl('div', { className: ['audio-meta'] }, [titleScroll, audioBottom]);
  const audioUser = hEl('div', { className: ['audio-user'] }, [btn, audioMeta]);

  return { properties, children: [audioUser, track] };
}

/**
 * 纯冒号段落判定：嵌套容器指令未遵守「外层冒号数多于内层」时，多余的闭合围栏
 * 会解析成普通文本段落（如 <p>:::</p>），这类残留没有内容语义，直接移除。
 */
function isStrayFenceParagraph(node: Content): boolean {
  if (node.type !== 'paragraph' || node.children.length !== 1) return false;
  const child = node.children[0];
  return child.type === 'text' && /^:{3,}$/.test(child.value.trim());
}

/** 未识别/缺参数的指令：按原始源码降级为普通文本，不报错（生产渲染路径） */
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

/**
 * 编辑模式的降级出口：缺参/未知指令渲染占位卡（虚线卡片 + 提示文本），
 * 只设 hName/hProperties/hChildren、不改变节点类型——remarkEditSpans 的
 * position 匹配不受影响，坐标照常注入，overlay 据此识别为可编辑指令块
 * （点击打开检查器配参数）。data-oh-directive 记录指令名供样式/脚本识别。
 * 生产模式不走这里（degradeToText 降级为原文文本，行为不变）。
 */
function setDirectivePlaceholder(  node: ContainerDirective | LeafDirective,
  reason: 'params' | 'unknown'
): void {
  const name = node.name;
  const hint =
    reason === 'params'
      ? `${name}：缺少参数，点击配置 / ${name}: missing params, click to configure`
      : `未知指令 ${name} / unknown directive: ${name}`;
  const data = (node.data ??= {});
  data.hName = 'div';
  data.hProperties = {
    className: ['oh-directive-placeholder', `oh-directive-${reason}`],
    dataOhDirective: name,
  };
  data.hChildren = [{ type: 'text', value: hint }];
}

function remarkCustomDirectives(baseUrl: string | undefined, editMode: boolean) {
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

      // 缺参/未知指令的出口：编辑模式渲染占位卡（坐标照常注入，块级指令才有块坐标——
      // 行内 textDirective 没有独立块，仍走文本降级）；生产模式降级为原文文本
      const degrade = (reason: 'params' | 'unknown'): void => {
        if (editMode && directive.type !== 'textDirective') {
          setDirectivePlaceholder(directive, reason);
        } else {
          degradeToText(directive, file);
        }
      };

      switch (name) {
        case 'bilibili':
        case 'youtube': {
          const embed = toEmbedDiv(name, attrs);
          if (!embed) return degrade('params');
          setElement('div', embed.properties);
          data.hChildren = embed.children;
          break;
        }
        case 'video': {
          if (!attrs.src) return degrade('params');
          const properties: Properties = {
            src: withBase(attrs.src, baseUrl),
            controls: true,
            preload: attrs.preload ?? 'metadata',
          };
          if (attrs.poster) properties.poster = withBase(attrs.poster, baseUrl);
          setElement(name, properties);
          break;
        }
        case 'audio': {
          if (!attrs.src) return degrade('params');
          const audio = toAudioPlayer(attrs, baseUrl);
          setElement('div', audio.properties);
          data.hChildren = audio.children;
          break;
        }
        case 'figure': {
          const figure = toFigure(attrs, baseUrl);
          if (!figure) return degrade('params');
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
          if (!attrs.id) return degrade('params');
          setElement('div', { className: ['stream-block'], dataStreamId: attrs.id });
          break;
        }
        case 'ghcard': {
          if (!attrs.repo) return degrade('params');
          setElement('div', { className: ['gh-card'], dataRepo: attrs.repo });
          break;
        }
        case 'editorial': {
          if (!attrs.id) return degrade('params');
          setElement('div', { className: ['editorial-embed'], dataEditorialId: attrs.id });
          break;
        }
        default:
          degrade('unknown');
      }
    });
    // 误嵌套指令残留的纯冒号闭合围栏段落（见 isStrayFenceParagraph 注释）
    visit(tree, 'paragraph', (node: Content, index, parent) => {
      if (parent == null || index == null || !isStrayFenceParagraph(node)) return;
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}

// ---------------------------------------------------------------------------
// remark 插件（仅编辑模式）：可编辑块 → data-oh-src 源码坐标
// ---------------------------------------------------------------------------

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
function remarkEditSpans(editSource: string) {  return (tree: Root, file: VFile) => {
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

// ---------------------------------------------------------------------------
// rehype 插件：图片懒加载、iframe 域名白名单、资产路径归一化
// ---------------------------------------------------------------------------

function rehypeNormalizeAssetPaths(baseUrl?: string) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName;
      if (tag !== 'img' && tag !== 'video' && tag !== 'audio' && tag !== 'source') return;
      for (const attr of ['src', 'poster'] as const) {
        const v = node.properties?.[attr];
        if (typeof v === 'string') {
          if (v.startsWith('assets/')) {
            node.properties[attr] = withBase(`/${v}`, baseUrl);
          } else if (v.startsWith('/assets/')) {
            node.properties[attr] = withBase(v, baseUrl);
          }
        }
      }
    });
  };
}

/**
 * 远程媒体本地化：img/video/audio/source 的 http(s) src/poster 下载到
 * data/assets/remote/ 并改写为带 base 前缀的本地路径；下载失败保留原 URL。
 * 在 rehypeNormalizeAssetPaths 之后运行（本地路径已归一，这里只处理远程）。
 */
function rehypeLocalizeRemoteAssets(
  baseUrl: string,
  opts: NonNullable<MarkdownOptions['localizeAssets']>,
) {
  return async (tree: HastRoot) => {
    const jobs: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName;
      if (tag !== 'img' && tag !== 'video' && tag !== 'audio' && tag !== 'source') return;
      for (const attr of ['src', 'poster'] as const) {
        const v = node.properties?.[attr];
        if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) continue;
        jobs.push(
          localizeRemoteAsset(v, opts).then((local) => {
            if (local && node.properties) node.properties[attr] = withBase(`/${local}`, baseUrl);
          }),
        );
      }
    });
    await Promise.all(jobs);
  };
}

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
// rehype 插件：stream/ghcard 占位 → 构建好的 HTML 片段
// ---------------------------------------------------------------------------

type WarnFn = (msg: string) => void;

function classesOf(node: Element): string[] {
  const c = node.properties?.className ?? node.properties?.class;
  return Array.isArray(c) ? c.map(String) : c != null ? [String(c)] : [];
}

/** data-oh-src 值转义为 HTML 属性值（坐标由本管线生成，双写引号/& 兜底） */
function escapeAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 编辑模式包裹：占位元素带 data-oh-src（remarkEditSpans 注入）时，片段不整段替换，
 * 而是包一层 <div data-oh-src class="oh-embed">，保留坐标供 overlay 锚定；
 * 生产模式（无坐标）返回 null，调用方维持整段替换。
 */
function wrapFragmentForEdit(node: Element, html: string): string | null {  const src = node.properties?.dataOhSrc ?? node.properties?.['data-oh-src'];
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

function rehypeEditorialEmbeds(embeds: Record<string, string>, warn: WarnFn) {
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

function rehypeLocalizeHrefs(options: NonNullable<MarkdownOptions['localizeHrefs']>) {
  const slugs = new Set(options.slugs);
  const base = options.baseUrl ?? '/';
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a' || typeof node.properties?.href !== 'string') return;
      const localized = localizeInternalHref(
        node.properties.href,
        options.lang,
        options.defaultLang,
        slugs
      );
      node.properties.href = withBase(localized, base);
    });
  };
}

// ---------------------------------------------------------------------------
// 管线
// ---------------------------------------------------------------------------

/** 构建一条 markdown → HTML 渲染管线（processor 可复用，内部已缓存 Shiki 实例） */
export function createMarkdownProcessor(options: MarkdownOptions = {}) {
  const themes = options.shikiThemes ?? DEFAULT_SHIKI_THEMES;
  const baseUrl = options.baseUrl ?? getBaseUrl();
  const warn = console.warn;
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkMath)
    .use(() => remarkCustomDirectives(baseUrl, !!options.editSource));
  // 编辑模式坐标注入必须在 remarkRehype 之前（mdast 阶段），且晚于自定义指令映射
  // （指令的 hProperties 先建好，这里合并 data-oh-src）
  if (options.editSource) processor.use(() => remarkEditSpans(options.editSource!));
  processor
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeShiki, { themes, defaultColor: false })
    .use(() => rehypeNormalizeAssetPaths(baseUrl))
    .use(rehypeLazyImages)
    .use(rehypeSanitize, buildSanitizeSchema())
    .use(rehypeFilterIframes);

  // 远程媒体下载在 sanitize/iframe 过滤之后：只改写 src/poster 属性，不影响结构
  if (options.localizeAssets) {
    processor.use(() => rehypeLocalizeRemoteAssets(baseUrl, options.localizeAssets!));
  }

  if (options.streamEmbeds) processor.use(() => rehypeStreamEmbeds(options.streamEmbeds!, warn));
  if (options.ghCards) processor.use(() => rehypeGhCards(options.ghCards!));
  if (options.editorialEmbeds) processor.use(() => rehypeEditorialEmbeds(options.editorialEmbeds!, warn));
  if (options.localizeHrefs) {
    const localizeOpts = { ...options.localizeHrefs, baseUrl: options.localizeHrefs.baseUrl ?? baseUrl };
    processor.use(() => rehypeLocalizeHrefs(localizeOpts));
  }
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







