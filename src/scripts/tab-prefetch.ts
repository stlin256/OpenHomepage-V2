/**
 * Idle-time prefetch for language alternates and other tabs in the current
 * language. HTML is fetched through the shared page cache (page-cache.ts), so
 * a later language switch or tab swap reuses the already-downloaded page
 * instead of a cold fetch. There is deliberately no byte cap: every tab and
 * language alternate is warmed after load. Detached responsive images use
 * AVIF-first srcset/sizes rules so the browser keeps the visual experience
 * while selecting the efficient candidate. Lightbox originals remain excluded.
 */
import {
  languageAlternatePaths,
  responsiveImageCandidates,
  sameLanguageTabPaths,
  shouldPrefetchResources,
  type NetworkInformationLike,
  type PrefetchImageCandidate,
} from '../lib/page-prefetch.ts';
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

  const image = new Image();
  image.decoding = 'async';
  // 先 sizes 后 srcset，浏览器始终按最终 sizes 评估候选，避免中途改选重复下载
  if (candidate.sizes) image.sizes = candidate.sizes;
  if (candidate.srcset) image.srcset = candidate.srcset;
  if (candidate.src) image.src = candidate.src;

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
    window.setTimeout(done, 15000);
  });
}

async function prefetchPage(path: string): Promise<void> {
  if (prefetchedPages.has(path)) return;
  prefetchedPages.add(path);

  // 经共享缓存抓取：随后的语言切换/内容交换直接命中，不再冷请求
  const html = await fetchPageHtml(path);
  if (!html) return;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const candidate of responsiveImageCandidates(parsed)) {
    await loadImage(candidate);
  }
}

async function runPrefetch(): Promise<void> {
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
    for (const path of paths) {
      if (!shouldPrefetchResources(connection())) return;
      await prefetchPage(path);
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
