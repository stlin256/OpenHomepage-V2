/**
 * bilibili/youtube 视频嵌入门面（Facade）：指令 → 封面/标题栏/播放按钮 hast 结构（toEmbedDiv），
 * 以及 rehype 阶段的远程元数据解析（rehypeResolveEmbeds：Bilibili API / YouTube oEmbed
 * 自动补封面与标题，失败时降级本地 cover-bilibili-* 封面）。
 * 结构按部件/平台拆分为扁平的 embed* / resolve* 小函数。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Root as HastRoot, Element, ElementContent, Properties } from 'hast';
import { withBase } from '../base-url.ts';
import { getUiLabels } from '../ui-i18n.ts';
import { fetchBilibiliMeta, type BilibiliMeta } from '../bilibili.ts';
import { fetchYouTubeMeta } from '../youtube.ts';
import { hEl, hTxt, classesOf } from './utils.ts';
import type { MarkdownOptions } from './types.ts';

export const PLAY_ICON_PATH = 'M8 5v14l11-7z';
export const PAUSE_ICON_PATH = 'M6 5h4v14H6zM14 5h4v14h-4z';

type EmbedKind = 'bilibili' | 'youtube';

const YT_PLAY_PATH = 'M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z';
const YT_BRAND_PATH = 'M23.5 6.2c-.3-1-1-1.8-2-2.1C19.7 3.5 12 3.5 12 3.5s-7.7 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8 0 12 0 12s0 4 .5 5.8c.3 1 1 1.8 2 2.1 1.8.6 9.5.6 9.5.6s7.7 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.8.5-5.8.5-5.8s0-4-.5-5.8zM9.5 15.5v-7l6 3.5-6 3.5z';
const BILI_TV_PATH = 'M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z';

/** 封面 <img>（懒加载 + no-referrer；远程 src 随后由 rehypeLocalizeRemoteAssets 转本地缓存） */
function embedPosterImg(src: string, alt: string): ElementContent {
  return hEl('img', {
    className: ['embed-poster'],
    src,
    alt,
    loading: 'lazy',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  });
}

/** 顶部标题栏：品牌图标 + 标题文本 */
function embedTopBar(kind: EmbedKind, title: string): ElementContent {
  const brandSvg = hEl(
    'svg',
    { className: ['embed-brand-svg'], viewBox: '0 0 24 24', fill: 'currentColor', ariaHidden: 'true' },
    [hEl('path', { d: kind === 'bilibili' ? BILI_TV_PATH : YT_BRAND_PATH })]
  );
  return hEl('div', { className: ['embed-topbar'] }, [
    hEl('span', { className: ['embed-brand-icon'] }, [brandSvg]),
    hEl('span', { className: ['embed-title'] }, [hTxt(title)]),
  ]);
}

/** 官方专属播放按钮（YouTube 红底圆角 / Bilibili 蓝圆环） */
function embedPlayButton(kind: EmbedKind, title: string, lang?: string): ElementContent {
  const labels = getUiLabels(lang).embed;
  if (kind === 'youtube') {
    const ytSvg = hEl(
      'svg',
      { className: ['embed-yt-svg'], viewBox: '0 0 68 48', width: '68', height: '48', ariaHidden: 'true' },
      [
        hEl('path', { className: ['embed-yt-btn-bg'], d: YT_PLAY_PATH }),
        hEl('path', { className: ['embed-yt-btn-arrow'], d: 'M 45,24 27,14 27,34', fill: '#ffffff' }),
      ]
    );
    return hEl(
      'button',
      {
        type: 'button',
        className: ['embed-play-btn', 'embed-play-btn-yt'],
        ariaLabel: `${labels.youtubePlay}: ${title}`,
      },
      [ytSvg]
    );
  }
  const biliSvg = hEl(
    'svg',
    { className: ['embed-bili-svg'], viewBox: '0 0 64 64', width: '64', height: '64', ariaHidden: 'true' },
    [
      hEl('circle', { className: ['embed-bili-btn-circle'], cx: '32', cy: '32', r: '28' }),
      hEl('path', { className: ['embed-bili-btn-arrow'], d: 'M 26,20 L 46,32 L 26,44 Z', fill: '#ffffff' }),
    ]
  );
  return hEl(
    'button',
    {
      type: 'button',
      className: ['embed-play-btn', 'embed-play-btn-bili'],
      ariaLabel: `${labels.bilibiliPlay}: ${title}`,
    },
    [biliSvg]
  );
}

/** 底部角落标识 */
function embedBottomBar(kind: EmbedKind, lang?: string): ElementContent {
  return hEl('div', { className: ['embed-bottombar'] }, [
    hEl('span', { className: ['embed-corner-badge'] }, [hTxt(getUiLabels(lang).embed[kind === 'bilibili' ? 'bilibiliBadge' : 'youtubeBadge'])]),
  ]);
}

/** 指令属性 → 播放源/标题/默认封面；缺平台必需 id 时返回 null */
function embedSource(
  kind: EmbedKind,
  attrs: Record<string, string>,
  lang?: string,
): { src: string; title: string; defaultPoster?: string } | null {
  if (kind === 'bilibili') {
    if (!attrs.bvid) return null;
    return {
      src: `https://player.bilibili.com/player.html?bvid=${attrs.bvid}&autoplay=1`,
      title: attrs.title || getUiLabels(lang).embed.bilibiliTitleFallback,
    };
  }
  if (!attrs.id) return null;
  return {
    src: `https://www.youtube-nocookie.com/embed/${attrs.id}?autoplay=1`,
    title: attrs.title || getUiLabels(lang).embed.youtubeTitleFallback,
    defaultPoster: `https://i.ytimg.com/vi/${attrs.id}/hqdefault.jpg`,
  };
}

/** bilibili/youtube 指令：高性能官方门面模式（Facade），呈现与官方播放器一致的首屏封面、标题栏与专属播放按钮，点击才动态装载 iframe，保障极速流畅 */
export function toEmbedDiv(
  kind: EmbedKind,
  attrs: Record<string, string>,
  baseUrl?: string,
  lang?: string,
): { properties: Properties; children: ElementContent[] } | null {
  const source = embedSource(kind, attrs, lang);
  if (!source) return null;

  const customPoster = attrs.poster ?? attrs.cover;
  const poster = customPoster ? withBase(customPoster, baseUrl) : source.defaultPoster;

  const properties: Properties = {
    className: ['embed-player', `embed-${kind}`],
    'data-embed-kind': kind,
    'data-embed-id': kind === 'bilibili' ? attrs.bvid : attrs.id,
    'data-embed-src': source.src,
    'data-embed-title': source.title,
    role: 'region',
    ariaLabel: source.title,
    tabIndex: 0,
  };

  const children: ElementContent[] = [];
  if (poster) children.push(embedPosterImg(poster, source.title));
  children.push(embedTopBar(kind, source.title));
  children.push(embedPlayButton(kind, source.title, lang));
  children.push(embedBottomBar(kind, lang));

  return { properties, children };
}

/**
 * Bilibili / YouTube 远程封面与视频信息自动解析：
 * - 未显式指定 poster 的 ::bilibili 指令自动查询 Bilibili API，获取官方封面与标题；
 * - 未显式指定 title 的 ::youtube 指令自动查询 YouTube oEmbed，获取官方标题。
 * 查询结果会更新标题栏与无障碍标签；随后由 rehypeLocalizeRemoteAssets 自动转为本地缓存。
 */
function updateEmbedTitle(node: Element, title: string, kind: EmbedKind, lang?: string): void {
  node.properties = node.properties || {};
  node.properties.dataEmbedTitle = title;
  node.properties.ariaLabel = title;
  const topBar = node.children.find(
    (c) => c.type === 'element' && classesOf(c).includes('embed-topbar')
  ) as Element | undefined;
  const titleSpan = topBar?.children.find(
    (c) => c.type === 'element' && classesOf(c).includes('embed-title')
  ) as Element | undefined;
  if (titleSpan) {
    titleSpan.children = [{ type: 'text', value: title }];
  }
  const poster = node.children.find(
    (c) => c.type === 'element' && c.tagName === 'img' && classesOf(c).includes('embed-poster')
  ) as Element | undefined;
  if (poster) {
    poster.properties.alt = title;
  }
  const playBtn = node.children.find(
    (c) => c.type === 'element' && classesOf(c).includes('embed-play-btn')
  ) as Element | undefined;
  if (playBtn) {
    playBtn.properties.ariaLabel = `${getUiLabels(lang).embed[kind === 'bilibili' ? 'bilibiliPlay' : 'youtubePlay']}: ${title}`;
  }
}

function findLocalBilibiliPoster(dataDir: string, bvid: string): string | null {
  const clean = bvid.trim().toLowerCase();
  const rawClean = bvid.trim();
  const candidates = [
    `assets/cover-bilibili-${clean}.jpg`,
    `assets/cover-bilibili-${clean}.webp`,
    `assets/cover-bilibili-${clean}.png`,
    `assets/cover-bilibili-${clean}.avif`,
    `assets/cover-bilibili-${rawClean}.jpg`,
    `assets/cover-bilibili-${rawClean}.webp`,
    `assets/cover-bilibili-${rawClean}.png`,
  ];
  for (const rel of candidates) {
    if (existsSync(path.join(dataDir, rel))) {
      return rel;
    }
  }
  return null;
}

function embedPosterExists(node: Element): boolean {
  return node.children.some(
    (c) => c.type === 'element' && c.tagName === 'img' && classesOf(c).includes('embed-poster')
  );
}

/** 元数据请求缓存目录：跟随 localizeAssets.dataDir 旁的 .cache（未启用本地化则不缓存） */
function embedCacheDir(options: MarkdownOptions): string | undefined {
  return options.localizeAssets ? path.join(path.dirname(options.localizeAssets.dataDir), '.cache') : undefined;
}

/** 应用远程元数据：缺封面且有 pic 则补封面；标题仍是兜底文案且有 title 则更新标题 */
function applyBilibiliMeta(node: Element, meta: BilibiliMeta, hasPoster: boolean, needsTitle: boolean, lang?: string): void {
  if (!hasPoster && meta.pic) {
    node.children.unshift(embedPosterImg(meta.pic, meta.title || getUiLabels(lang).embed.bilibiliTitleFallback));
  }
  if (meta.title && needsTitle) {
    updateEmbedTitle(node, meta.title, 'bilibili', lang);
  }
}

/** 远程元数据获取失败（如 GitHub Actions 海外 IP 被拦截）时的降级：使用本地匹配的 cover-bilibili-* 离线封面 */
function applyLocalBilibiliPoster(node: Element, localFallback: string, baseUrl: string, lang?: string): void {
  const currentTitle = String(node.properties?.dataEmbedTitle || getUiLabels(lang).embed.bilibiliTitleFallback);
  node.children.unshift(embedPosterImg(withBase(`/${localFallback}`, baseUrl), currentTitle));
}

/** bilibili 嵌入：缺封面或标题仍是兜底文案时查询 Bilibili API 补全；无需补全返回 undefined */
function resolveBilibiliEmbed(node: Element, bvid: string, options: MarkdownOptions, baseUrl: string): Promise<void> | undefined {
  const hasPoster = embedPosterExists(node);
  const needsTitle = !node.properties?.dataEmbedTitle || node.properties.dataEmbedTitle === getUiLabels(options.lang).embed.bilibiliTitleFallback;
  if (hasPoster && !needsTitle) return undefined;
  const dataDir = options.localizeAssets?.dataDir;
  const localFallback = dataDir ? findLocalBilibiliPoster(dataDir, bvid) : null;
  return fetchBilibiliMeta(bvid, {
    cacheDir: embedCacheDir(options),
    fetchFn: options.localizeAssets?.fetchFn,
    warn: options.localizeAssets?.warn,
  }).then((meta) => {
    if (meta) {
      applyBilibiliMeta(node, meta, hasPoster, needsTitle, options.lang);
    } else if (!hasPoster && localFallback) {
      applyLocalBilibiliPoster(node, localFallback, baseUrl, options.lang);
    }
  });
}

/** youtube 嵌入：标题仍是兜底文案时查询 oEmbed 补全；已有标题返回 undefined */
function resolveYouTubeEmbed(node: Element, id: string, options: MarkdownOptions): Promise<void> | undefined {
  if (node.properties?.dataEmbedTitle !== getUiLabels(options.lang).embed.youtubeTitleFallback) return undefined;
  return fetchYouTubeMeta(id, {
    cacheDir: embedCacheDir(options),
    fetchFn: options.localizeAssets?.fetchFn,
    warn: options.localizeAssets?.warn,
  }).then((meta) => {
    if (meta?.title) {
      updateEmbedTitle(node, meta.title, 'youtube', options.lang);
    }
  });
}

export function rehypeResolveEmbeds(options: MarkdownOptions, baseUrl: string) {
  return async (tree: HastRoot) => {
    const jobs: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      if (!classesOf(node).includes('embed-player')) return;
      const kind = node.properties?.['dataEmbedKind'] ?? node.properties?.['data-embed-kind'];
      const id = node.properties?.['dataEmbedId'] ?? node.properties?.['data-embed-id'];
      if (typeof id !== 'string' || !id) return;
      const job =
        kind === 'bilibili'
          ? resolveBilibiliEmbed(node, id, options, baseUrl)
          : kind === 'youtube'
            ? resolveYouTubeEmbed(node, id, options)
            : undefined;
      if (job) jobs.push(job);
    });
    await Promise.all(jobs);
  };
}
