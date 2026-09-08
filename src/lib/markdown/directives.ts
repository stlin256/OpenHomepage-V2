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
/**
 * `:::video` 自渲染播放器结构（Scheme B 杂志卡片整合式）：
 * 保留原生 <video> 内核供解码与硬件加速，外层包装独立标题栏、定制控件与居中大播放按键。
 * 顶栏仅展示标题与徽章（时长在底栏已有），播放时顶部渐隐消失、暂停时渐显恢复；
 * 底部控制栏移除快进/快退按钮，保持界面极简克制；
 * 居中播放三角严格进行几何与视知觉光学居中。
 */
function toVideoPlayer(
  attrs: Record<string, string>,
  baseUrl?: string,
  lang?: string,
): { properties: Properties; children: ElementContent[] } {
  const src = withBase(attrs.src, baseUrl);
  const poster = attrs.poster ? withBase(attrs.poster, baseUrl) : undefined;
  const title = attrs.title || "";
  const badge = attrs.badge ?? attrs.tag ?? "";
  const preload =
    attrs.preload && ["none", "metadata", "auto"].includes(attrs.preload)
      ? attrs.preload
      : "metadata";

  const properties: Properties = {
    className: ["video-player", "md-video"],
    role: "region",
    ariaLabel: title || (lang === "zh" ? "视频播放器" : "Video player"),
    tabIndex: 0,
  };
  if (title) properties["data-title"] = title;

  // 1. 画幅层：标题栏作为画幅内的覆盖层，不在视频外额外占高度或制造黑边。
  const children: ElementContent[] = [];
  const stageChildren: ElementContent[] = [];

  // 原生 <video> 内核（供解码、海报与 rehypeNormalizeAssetPaths / rehypeLocalizeRemoteAssets 寻址）
  const videoProps: Properties = {
    className: ["video-element"],
    src,
    preload,
    playsInline: true,
  };
  if (poster) videoProps.poster = poster;
  const videoEl = hEl("video", videoProps);
  stageChildren.push(videoEl);

  // 3. 视频渐变背景蒙版
  const scrimEl = hEl("div", { className: ["video-scrim"], ariaHidden: "true" });
  stageChildren.push(scrimEl);

  // 3. 顶部信息条覆盖在画幅上方（仅展示标题/标签，不展示时长；播放时渐隐、暂停时渐显）
  if (title || badge) {
    const titleGroupChildren: ElementContent[] = [];
    if (badge) {
      titleGroupChildren.push(hEl("span", { className: ["video-top-badge"] }, [hTxt(badge)]));
    }
    if (title) {
      titleGroupChildren.push(hEl("span", { className: ["video-top-title"] }, [hTxt(title)]));
    }
    const topTitleGroup = hEl("div", { className: ["video-top-title-group"] }, titleGroupChildren);
    stageChildren.push(hEl("div", { className: ["video-topbar"] }, [topTitleGroup]));
  }

  // 4. 居中大播放按钮（数学与视知觉光学居中）
  const bigPlayBtn = hEl(
    "button",
    {
      className: ["video-big-play"],
      type: "button",
      ariaLabel: lang === "zh" ? "播放视频" : "Play video",
    },
    [
      hEl(
        "svg",
        { className: ["icon-big-play"], viewBox: "0 0 24 24", fill: "currentColor", ariaHidden: "true" },
        [
          hEl("path", {
            d: "M8.5 6.8a1.2 1.2 0 0 0-1.7 1.05v8.3a1.2 1.2 0 0 0 1.7 1.05l7.2-4.15a1.2 1.2 0 0 0 0-2.1L8.5 6.8z",
          }),
        ],
      ),
    ],
  );
  stageChildren.push(bigPlayBtn);

  // 5. 缓冲转圈占位
  stageChildren.push(hEl("div", { className: ["video-spinner"], ariaHidden: "true" }));

  // 6. 底部控制栏
  // 6.1 进度条
  const tooltip = hEl("div", { className: ["video-progress-tooltip"] }, [hTxt("00:00")]);
  const progressBuffer = hEl("div", { className: ["video-progress-buffer"] });
  const progressPlayed = hEl("div", { className: ["video-progress-played"] }, [
    hEl("div", { className: ["video-progress-thumb"] }),
  ]);
  const progressRail = hEl("div", { className: ["video-progress-rail"] }, [progressBuffer, progressPlayed]);
  const progressWrap = hEl(
    "div",
    { className: ["video-progress-wrap"], role: "slider", ariaLabel: lang === "zh" ? "播放进度" : "Progress" },
    [tooltip, progressRail],
  );

  // 6.2 左侧按钮：播放/暂停、音量、时间
  const btnPlayPause = hEl(
    "button",
    { className: ["video-btn", "btn-play-pause"], type: "button", ariaLabel: lang === "zh" ? "播放/暂停" : "Play/Pause" },
    [
      hEl("svg", { className: ["icon-play"], viewBox: "0 0 24 24", fill: "currentColor", ariaHidden: "true" }, [
        hEl("path", {
          d: "M8.5 6.8a1.2 1.2 0 0 0-1.7 1.05v8.3a1.2 1.2 0 0 0 1.7 1.05l7.2-4.15a1.2 1.2 0 0 0 0-2.1L8.5 6.8z",
        }),
      ]),
      hEl("svg", { className: ["icon-pause"], viewBox: "0 0 24 24", fill: "currentColor", ariaHidden: "true" }, [
        hEl("rect", { x: "6", y: "5", width: "4", height: "14", rx: "1" }),
        hEl("rect", { x: "14", y: "5", width: "4", height: "14", rx: "1" }),
      ]),
      hEl("svg", { className: ["icon-replay"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M1 4v6h6" }),
        hEl("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" }),
      ]),
    ],
  );

  const btnVol = hEl(
    "button",
    { className: ["video-btn", "btn-volume"], type: "button", ariaLabel: lang === "zh" ? "音量" : "Volume" },
    [
      hEl("svg", { className: ["icon-vol-high"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M11 5L6 9H2v6h4l5 4V5z", fill: "currentColor", stroke: "none" }),
        hEl("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
        hEl("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }),
      ]),
      hEl("svg", { className: ["icon-vol-low"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M11 5L6 9H2v6h4l5 4V5z", fill: "currentColor", stroke: "none" }),
        hEl("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
      ]),
      hEl("svg", { className: ["icon-vol-mute"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M11 5L6 9H2v6h4l5 4V5z", fill: "currentColor", stroke: "none" }),
        hEl("line", { x1: "23", y1: "9", x2: "17", y2: "15" }),
        hEl("line", { x1: "17", y1: "9", x2: "23", y2: "15" }),
      ]),
    ],
  );

  const volRail = hEl("div", { className: ["video-volume-rail"] }, [hEl("div", { className: ["video-volume-fill"] })]);
  const volBox = hEl("div", { className: ["video-volume-box"] }, [volRail]);
  const volWrap = hEl("div", { className: ["video-volume-wrap"] }, [btnVol, volBox]);

  const timeDisplay = hEl("div", { className: ["video-time"] }, [
    hEl("span", { className: ["video-time-cur"] }, [hTxt("00:00")]),
    hEl("span", { className: ["sep"] }, [hTxt("/")]),
    hEl("span", { className: ["video-time-dur"] }, [hTxt("--:--")]),
  ]);

  const leftGroup = hEl("div", { className: ["video-ctrl-group", "left"] }, [btnPlayPause, volWrap, timeDisplay]);

  // 6.3 右侧按钮：倍速、画中画、全屏
  const speedBtn = hEl("button", { className: ["video-btn", "btn-speed"], type: "button", ariaLabel: lang === "zh" ? "倍速" : "Speed" }, [hTxt("1.0x")]);
  const speedItems = ["0.5", "0.75", "1.0", "1.25", "1.5", "2.0"].map((s) =>
    hEl("div", { className: ["speed-item", ...(s === "1.0" ? ["active"] : [])], "data-speed": s }, [hTxt(s + "x")]),
  );
  const speedMenu = hEl("div", { className: ["video-speed-menu"] }, speedItems);
  const speedWrap = hEl("div", { className: ["video-speed-wrap"] }, [speedBtn, speedMenu]);

  const pipBtn = hEl(
    "button",
    { className: ["video-btn", "btn-pip"], type: "button", ariaLabel: lang === "zh" ? "画中画" : "Picture in Picture" },
    [
      hEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("rect", { x: "2", y: "4", width: "20", height: "16", rx: "2" }),
        hEl("rect", { x: "12", y: "10", width: "8", height: "8", rx: "1", fill: "currentColor" }),
      ]),
    ],
  );

  const fsBtn = hEl(
    "button",
    { className: ["video-btn", "btn-fullscreen"], type: "button", ariaLabel: lang === "zh" ? "全屏" : "Fullscreen" },
    [
      hEl("svg", { className: ["icon-fs-enter"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" }),
      ]),
      hEl("svg", { className: ["icon-fs-exit"], viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ariaHidden: "true" }, [
        hEl("path", { d: "M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M10 4v6m0 0H4m6 0L3 3m10 7h6m-6 0V4m0 6l7-7" }),
      ]),
    ],
  );

  const rightGroup = hEl("div", { className: ["video-ctrl-group", "right"] }, [speedWrap, pipBtn, fsBtn]);
  const ctrlRow = hEl("div", { className: ["video-ctrl-row"] }, [leftGroup, rightGroup]);
  const controls = hEl("div", { className: ["video-controls"] }, [progressWrap, ctrlRow]);

  stageChildren.push(controls);
  children.push(hEl("div", { className: ["video-stage"] }, stageChildren));

  return { properties, children };
}

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

/** 提取容器指令内部原始源码（用于 :::mermaid 等需要保留 DSL 文本的指令） */
function directiveBodySource(node: ContainerDirective, file: VFile): string {
  const first = node.children[0]?.position?.start?.offset;
  const last = node.children[node.children.length - 1]?.position?.end?.offset;
  if (first != null && last != null && last >= first) {
    return String(file).slice(first, last);
  }
  return '';
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
        case 'mermaid': {
          const source = directiveBodySource(directive as ContainerDirective, file);
          setElement('div', { className: ['mermaid-block'], dataMermaid: 'true' });
          data.hChildren = [
            hEl('pre', { className: ['mermaid-source'] }, [
              hEl('code', {}, [hTxt(source)]),
            ]),
          ];
          break;
        }
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
          const video = toVideoPlayer(attrs, baseUrl, lang);
          setElement('div', video.properties);
          data.hChildren = video.children;
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
