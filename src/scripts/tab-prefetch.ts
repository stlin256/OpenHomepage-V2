/**
 * Idle-time prefetch for other tabs in the current language. HTML is fetched
 * first, then detached responsive images use the same srcset/sizes rules so
 * the browser selects the smallest clear candidate for this device. Lightbox
 * originals are intentionally not read from data-original.
 */
import {
  responsiveImageCandidates,
  sameLanguageTabPaths,
  shouldPrefetchResources,
  type NetworkInformationLike,
  type PrefetchImageCandidate,
} from '../lib/page-prefetch.ts';

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
    idleWindow.requestIdleCallback(callback, { timeout: 3000 });
    return;
  }
  window.setTimeout(callback, 1200);
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

  try {
    const response = await fetch(path, { credentials: 'same-origin' });
    if (!response.ok) return;
    const html = await response.text();
    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const candidate of responsiveImageCandidates(document)) {
      await loadImage(candidate);
    }
  } catch {
    /* Prefetch is best-effort; normal navigation will retry on demand. */
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
    for (const path of sameLanguageTabPaths(document, currentPath)) {
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
