/** Pure helpers for idle-time prefetching of same-language tab pages. */

export interface PrefetchImageCandidate {
  src: string;
  srcset?: string;
  sizes?: string;
}

export interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function shouldPrefetchResources(connection?: NetworkInformationLike): boolean {
  if (connection?.saveData) return false;
  return connection?.effectiveType !== 'slow-2g' && connection?.effectiveType !== '2g';
}

function normalizedPath(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function sameLanguageTabPaths(document: Document, currentPath: string): string[] {
  const current = normalizedPath(currentPath, 'https://openhomepage.local/');
  const paths: string[] = [];
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.site-nav ul a[href]')) {
    const path = normalizedPath(link.getAttribute('href') ?? '', 'https://openhomepage.local/');
    if (!path || path === current || paths.includes(path)) continue;
    paths.push(path);
  }
  return paths;
}

/** 语言切换器菜单中的其他语言页面（当前页路径除外）。 */
export function languageAlternatePaths(document: Document, currentPath: string): string[] {
  const current = normalizedPath(currentPath, 'https://openhomepage.local/');
  const paths: string[] = [];
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.lang-menu a[href]')) {
    const path = normalizedPath(link.getAttribute('href') ?? '', 'https://openhomepage.local/');
    if (!path || path === current || paths.includes(path)) continue;
    paths.push(path);
  }
  return paths;
}

export function responsiveImageCandidates(document: Document): PrefetchImageCandidate[] {
  const candidates: PrefetchImageCandidate[] = [];
  const seen = new Set<string>();
  for (const image of document.querySelectorAll<HTMLImageElement>('img[src], img[srcset]')) {
    if (image.closest('.lightbox-img')) continue;
    const src = image.getAttribute('src') ?? '';
    const srcset = image.getAttribute('srcset');
    if (!src && !srcset) continue;
    if ((srcset ?? src).includes('-full.')) continue;

    // Post-build images are AVIF-first <picture> elements. The detached Image
    // used by idle prefetch must follow that source, not the WebP fallback.
    const avifSource = [...(image.closest('picture')?.children ?? [])].find(
      (element): element is HTMLSourceElement =>
        element.tagName === 'SOURCE' &&
        element.getAttribute('type') === 'image/avif' &&
        Boolean(element.getAttribute('srcset')),
    );
    const effectiveSrcset = avifSource?.getAttribute('srcset') ?? srcset;
    const firstCandidate = /^(\S+)/.exec(effectiveSrcset ?? '')?.[1];
    const candidate: PrefetchImageCandidate = effectiveSrcset
      ? {
          src: avifSource ? firstCandidate ?? src : src,
          srcset: effectiveSrcset,
          sizes: image.getAttribute('sizes') ?? undefined,
        }
      : { src };
    const key = `${candidate.srcset ?? ''}|${candidate.sizes ?? ''}|${candidate.src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}
