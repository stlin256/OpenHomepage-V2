/**
 * Idle-time prefetch for language alternates, tabs, and lightbox images.
 *
 * Sequence:
 * 1. Preload HTML pages through the shared page cache (page-cache.ts) for language
 *    alternates and same-language tabs.
 * 2. Preload detached responsive page images using AVIF-first srcset/sizes rules.
 * 3. After all regular page contents have finished loading, preload high-resolution
 *    lightbox candidate images in the background (prioritizing current page then
 *    prefetched pages). 404 results are tracked in fullBad so lightbox opens instantly
 *    with the highest-quality available asset and zero redundant failed requests.
 */
import {
  languageAlternatePaths,
  lightboxImageCandidates,
  responsiveImageCandidates,
  sameLanguageTabPaths,
  shouldPrefetchResources,
  type NetworkInformationLike,
  type PrefetchImageCandidate,
} from '../lib/page-prefetch.ts';
import { fullBad } from '../lib/lightbox.ts';
import { fetchPageHtml } from './page-cache.ts';

const prefetchedPages = new Set<string>();
const prefetchedImages = new Set<string>();
let running = false;
let queued = false;

// Network Information 与 requestIdleCallback 尚无标准 lib.dom 类型，按需声明
type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function requestIdle(callback: () => void): void {
  const idleWindow = window as IdleCapableWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(callback, { timeout: 1000 });
    return;
  }
  window.setTimeout(callback, 250);
}

async function loadImage(candidate: PrefetchImageCandidate): Promise<void> {
  const key = `${candidate.srcset ?? ''}|${candidate.sizes ?? ''}|${candidate.src}`;
  if (prefetchedImages.has(key)) return;
  prefetchedImages.add(key);
  if (candidate.src) prefetchedImages.add(candidate.src);

  const image = new Image();
  image.decoding = 'async';
  // 先 sizes 后 srcset，浏览器始终按最终 sizes 评估候选，避免中途改选重复下载
  if (candidate.sizes) image.sizes = candidate.sizes;
  if (candidate.srcset) image.srcset = candidate.srcset;
  if (candidate.src) image.src = candidate.src;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, 15000);
  });
}

async function prefetchImageUrl(src: string): Promise<boolean> {
  if (prefetchedImages.has(src)) return true;

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    let settled = false;
    const done = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (success) {
        prefetchedImages.add(src);
      }
      resolve(success);
    };
    image.addEventListener('load', () => done(true), { once: true });
    image.addEventListener('error', () => done(false), { once: true });
    image.src = src;
    window.setTimeout(() => done(false), 15000);
  });
}

async function prefetchLightboxGroup(candidates: string[]): Promise<void> {
  for (const candidate of candidates) {
    if (!shouldPrefetchResources(connection()) || !navigator.onLine) return;
    if (fullBad.has(candidate)) continue;
    if (prefetchedImages.has(candidate)) break;

    const success = await prefetchImageUrl(candidate);
    if (success) {
      // 当前候选成功加载，已缓存最高画质版本，无需再请求后续低画质回退
      break;
    } else {
      // 加载失败（如 404），记入 fullBad，继续尝试下一优先级候选
      fullBad.add(candidate);
    }
  }
}

async function prefetchPage(path: string): Promise<Document | null> {
  if (prefetchedPages.has(path)) return null;
  prefetchedPages.add(path);

  // 经共享缓存抓取：随后的语言切换/内容交换直接命中，不再冷请求
  const html = await fetchPageHtml(path);
  if (!html) return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const candidate of responsiveImageCandidates(parsed)) {
    if (!shouldPrefetchResources(connection()) || !navigator.onLine) return parsed;
    await loadImage(candidate);
  }
  return parsed;
}

export async function runPrefetch(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const currentPath = `${location.pathname}${location.search}`;
    // 备选语言优先：语言切换是冷请求开销最大的导航
    const paths = [
      ...languageAlternatePaths(document, currentPath),
      ...sameLanguageTabPaths(document, currentPath),
    ];

    // 阶段一：常规页面与主图预取（其他语言和当前语言其他 Tab 的 HTML 及响应式主图）
    const parsedDocs: Document[] = [];
    for (const path of paths) {
      if (!shouldPrefetchResources(connection()) || !navigator.onLine) return;
      const parsed = await prefetchPage(path);
      if (parsed) parsedDocs.push(parsed);
    }

    // 阶段二：当一切常规内容加载完毕后，在空闲时段加载灯箱内的图片
    // 优先当前页正文灯箱图，再处理其他已预取页面的灯箱图
    const allDocs = [document, ...parsedDocs];
    for (const doc of allDocs) {
      if (!shouldPrefetchResources(connection()) || !navigator.onLine) return;
      const candidateGroups = lightboxImageCandidates(doc);
      for (const group of candidateGroups) {
        if (!shouldPrefetchResources(connection()) || !navigator.onLine) return;
        await prefetchLightboxGroup(group);
      }
    }
  } finally {
    running = false;
    if (queued) {
      queued = false;
      requestIdle(() => void runPrefetch());
    }
  }
}

export function scheduleTabPrefetch(): void {
  if (!shouldPrefetchResources(connection()) || !navigator.onLine) return;
  const start = () => requestIdle(() => void runPrefetch());
  if (document.readyState === 'complete') {
    start();
    return;
  }
  window.addEventListener('load', start, { once: true });
}

export function _resetPrefetchStateForTesting(): void {
  prefetchedPages.clear();
  prefetchedImages.clear();
  running = false;
  queued = false;
}
