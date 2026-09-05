/**
 * remark 插件：自定义指令（bilibili/youtube/video/audio/figure/grid/cell/stream/ghcard/
 * editorial/callout/timeline/publications，见 docs/specs/03）→ hast 映射，
 * 含 callout 缺省标题、figure/audio 播放器结构与缺参/未知指令的降级出口
 * （生产降级为原文文本，编辑模式渲染 oh-directive-placeholder 占位卡）。
 * 自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）。
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Root, Content } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import type { ElementContent, Properties } from 'hast';
import type { VFile } from 'vfile';
import { withBase } from '../base-url.ts';
import { getUiLabels } from '../ui-i18n.ts';
import type { PublicationsConfig } from '../publications.ts';
import { hEl, hTxt } from './utils.ts';
import { PLAY_ICON_PATH, PAUSE_ICON_PATH, toEmbedDiv } from './embeds.ts';

type Directive = ContainerDirective | LeafDirective | TextDirective;

const WIDTH_RE = /^[\d.]+(%|px|em|rem|vw)$/;
const CALLOUT_DEFAULT_TITLES: Record<string, Record<string, string>> = {
  zh: { note: '备注', tip: '提示', warning: '警告', important: '重要', quote: '引用' },
  en: { note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important', quote: 'Quote' },
  ja: { note: '注記', tip: 'ヒント', warning: '警告', important: '重要', quote: '引用' },
  fr: { note: 'Note', tip: 'Astuce', warning: 'Avertissement', important: 'Important', quote: 'Citation' },
  de: { note: 'Notiz', tip: 'Tipp', warning: 'Warnung', important: 'Wichtig', quote: 'Zitat' },
  es: { note: 'Nota', tip: 'Consejo', warning: 'Advertencia', important: 'Importante', quote: 'Cita' },
  ko: { note: '메모', tip: '팁', warning: '경고', important: '중요', quote: '인용' },
  pt: { note: 'Nota', tip: 'Dica', warning: 'Aviso', important: 'Importante', quote: 'Citação' },
  ru: { note: 'Заметка', tip: 'Совет', warning: 'Предупреждение', important: 'Важно', quote: 'Цитата' },
  it: { note: 'Nota', tip: 'Suggerimento', warning: 'Avviso', important: 'Importante', quote: 'Citazione' },
  nl: { note: 'Notitie', tip: 'Tip', warning: 'Waarschuwing', important: 'Belangrijk', quote: 'Citaat' },
  tr: { note: 'Not', tip: 'İpucu', warning: 'Uyarı', important: 'Önemli', quote: 'Alıntı' },
  vi: { note: 'Ghi chú', tip: 'Mẹo', warning: 'Cảnh báo', important: 'Quan trọng', quote: 'Trích dẫn' },
  th: { note: 'บันทึก', tip: 'เคล็ดลับ', warning: 'คำเตือน', important: 'สำคัญ', quote: 'อ้างอิง' },
  id: { note: 'Catatan', tip: 'Tips', warning: 'Peringatan', important: 'Penting', quote: 'Kutipan' },
  ar: { note: 'ملاحظة', tip: 'نصيحة', warning: 'تحذير', important: 'مهم', quote: 'اقتباس' },
  hi: { note: 'नोट', tip: 'सुझाव', warning: 'चेतावनी', important: 'महत्वपूर्ण', quote: 'उद्धरण' },
};
export const CALLOUT_ICON_PATHS: Record<string, string> = {
  note: 'M4 4h16v12H8l-4 4V4z',
  tip: 'M12 2l2.4 6.1L21 9.3l-5 4.4L17.5 20 12 16.7 6.5 20 8 13.7 3 9.3l6.6-1.2L12 2z',
  warning: 'M12 3l9 16H3l9-16zm-1 6v5h2V9h-2zm0 7v2h2v-2h-2z',
  important: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v7h-2V7zm0 9h2v2h-2v-2z',
  quote: 'M7 6c-2.2 0-4 1.8-4 4s1.8 4 4 4c0 2-1 3-3 3v2c3.3 0 5-2.3 5-6V10c0-2.2-1.8-4-4-4zm10 0c-2.2 0-4 1.8-4 4s1.8 4 4 4c0 2-1 3-3 3v2c3.3 0 5-2.3 5-6V10c0-2.2-1.8-4-4-4z',
};
function normalizeContentLang(lang: string | undefined, defaultLang?: string): string {
  const value = (lang ?? defaultLang ?? 'en').toLowerCase().split(/[-_]/)[0];
  return CALLOUT_DEFAULT_TITLES[value] ? value : 'en';
}
function calloutDefaultTitle(type: string, lang: string | undefined, defaultLang?: string): string {
  return CALLOUT_DEFAULT_TITLES[normalizeContentLang(lang, defaultLang)][type] ?? type;
}
export function safeTimelineUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}
export function timelineRangeText(start: string, end: string | undefined, lang: string | undefined, defaultLang?: string): string {
  const nowText: Record<string, string> = { zh: '进行中', en: 'Present', ja: '現在', fr: 'Présent', de: 'Gegenwart', es: 'Presente', ko: '현재', pt: 'Presente', ru: 'По настоящее время', it: 'Presente', nl: 'Heden', tr: 'Günümüzde', vi: 'Hiện tại', th: 'ปัจจุบัน', id: 'Sekarang', ar: 'حالياً', hi: 'वर्तमान' };
  const key = normalizeContentLang(lang, defaultLang);
  const present = nowText[key] ?? nowText.en;
  return end?.trim() ? `${start}–${end}` : `${start} · ${present}`;
}
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
  lang?: string,
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
    ariaLabel: title || getUiLabels(lang).audio.defaultTitle,
  };
  if (attrs.preload && ['none', 'metadata', 'auto'].includes(attrs.preload)) {
    properties['data-preload'] = attrs.preload;
  }
  if (title) properties['data-title'] = title;
  if (desc) properties['data-desc'] = desc;
  if (cover) properties['data-cover'] = cover;

  const btn = hEl('button', { className: ['btn-toggle'], type: 'button', ariaLabel: getUiLabels(lang).audio.play }, audioPlayPauseSvg());
  const track = hEl('div', { className: ['audio-track'] }, [hEl('div', { className: ['audio-fill'] })]);
  const timeSpan = hEl('span', { className: ['audio-time'] }, [hTxt(getUiLabels(lang).audio.timeFallback)]);

  if (isCard && cover) {
    const coverImg = hEl('img', { src: cover, alt: title || getUiLabels(lang).audio.coverAltFallback, loading: 'lazy', decoding: 'async' });
    const audioCover = hEl('div', { className: ['audio-cover'] }, [coverImg]);

    const titleNode = hEl('span', { className: ['audio-title', 'audio-scroll-text'], dataMarquee: 'true' }, [hTxt(title || getUiLabels(lang).audio.defaultTitle)]);
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
  const titleNode = hEl('span', { className: ['audio-title', 'audio-scroll-text'], dataMarquee: 'true' }, [hTxt(title || getUiLabels(lang).audio.defaultTitle)]);
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
function setDirectivePlaceholder(
  node: ContainerDirective | LeafDirective,
  reason: 'params' | 'unknown',
  lang?: string
): void {
  const name = node.name;
  const labels = getUiLabels(lang).directive;
  const hint =
    reason === 'params'
      ? labels.missingParams(name)
      : labels.unknown(name);
  const data = (node.data ??= {});
  data.hName = 'div';
  data.hProperties = {
    className: ['oh-directive-placeholder', `oh-directive-${reason}`],
    dataOhDirective: name,
  };
  data.hChildren = [{ type: 'text', value: hint }];
}

export function remarkCustomDirectives(baseUrl: string | undefined, editMode: boolean, lang?: string, defaultLang?: string, publications?: PublicationsConfig) {
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
          setDirectivePlaceholder(directive, reason, lang);
        } else {
          degradeToText(directive, file);
        }
      };

      switch (name) {
        case 'bilibili':
        case 'youtube': {
          const embed = toEmbedDiv(name, attrs, baseUrl, lang);
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
          const audio = toAudioPlayer(attrs, baseUrl, lang);
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
        case 'note':
        case 'tip':
        case 'warning':
        case 'important':
        case 'quote': {
          const properties: Properties = {
            className: ['callout', `callout-${name}`],
            role: 'note',
            dataCalloutTitle: attrs.title ?? calloutDefaultTitle(name, lang, defaultLang),
          };
          if (name === 'quote' && attrs.source) properties.dataCalloutSource = attrs.source;
          setElement('aside', properties);
          break;
        }
        case 'timeline': {
          const properties: Properties = { className: ['timeline'], dataTimeline: 'true' };
          if (attrs.title) properties.dataTimelineTitle = attrs.title;
          setElement('section', properties);
          break;
        }
        case 'timeline-item': {
          if (!attrs.start?.trim()) return degrade('params');
          const properties: Properties = { className: ['timeline-item'], dataTimelineItem: 'true', dataStart: attrs.start.trim() };
          if (attrs.end?.trim()) properties.dataEnd = attrs.end.trim();
          if (attrs.title?.trim()) properties.dataTimelineTitle = attrs.title.trim();
          if (attrs.org?.trim()) properties.dataOrg = attrs.org.trim();
          if (safeTimelineUrl(attrs.url)) properties.dataUrl = safeTimelineUrl(attrs.url);
          if (attrs.highlight === 'true') properties.dataHighlight = 'true';
          setElement('div', properties);
          break;
        }
        case 'publications': {
          if (!publications) return degrade('params');
          const properties: Properties = { className: ['publications'], dataPublications: 'true' };
          if (attrs.tag) properties.dataTag = attrs.tag;
          if (attrs.type) properties.dataType = attrs.type;
          if (attrs.year) properties.dataYear = attrs.year;
          if (attrs.group) properties.dataGroup = attrs.group;
          if (attrs.sort) properties.dataSort = attrs.sort;
          const limit = Number(attrs.limit);
          if (Number.isInteger(limit) && limit > 0) properties.dataLimit = String(limit);
          setElement('div', properties);
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
