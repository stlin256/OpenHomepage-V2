import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  languageAlternatePaths,
  responsiveImageCandidates,
  sameLanguageTabPaths,
  shouldPrefetchResources,
} from '../src/lib/page-prefetch.ts';

describe('page prefetch helpers', () => {
  it('collects other tabs from the current-language navigation only', () => {
    const dom = new JSDOM(
      '<nav class="site-nav"><ul>' +
        '<li><a href="/" aria-current="page">Home</a></li>' +
        '<li><a href="/research/">Research</a></li>' +
        '<li><a href="/gallery/">Gallery</a></li>' +
        '<li><a href="/gallery/">Duplicate</a></li>' +
        '</ul></nav><div class="lang-menu"><a href="/en/gallery/">English</a></div>',
    );
    expect(sameLanguageTabPaths(dom.window.document, '/')).toEqual(['/research/', '/gallery/']);
  });

  it('collects language alternates excluding the current path', () => {
    const dom = new JSDOM(
      '<ul class="lang-menu">' +
        '<li><a href="/" hreflang="zh">中文</a></li>' +
        '<li><a href="/en/" hreflang="en">English</a></li>' +
        '<li><a href="/ja/" hreflang="ja">日本語</a></li>' +
        '<li><a href="/en/" hreflang="en">Duplicate</a></li>' +
        '</ul>',
    );
    expect(languageAlternatePaths(dom.window.document, '/')).toEqual(['/en/', '/ja/']);
  });

  it('collects responsive candidates without lightbox originals', () => {
    const dom = new JSDOM(
      '<img src="/assets/a.webp" srcset="/assets/a.480.webp 480w, /assets/a.webp 1200w" sizes="100vw" data-original="/assets/a.jpg">' +
        '<img src="/assets/b.480.webp" srcset="/assets/b.480.webp 480w" sizes="50vw">' +
        '<img src="/assets/full-only.webp">' +
        '<img class="lightbox-img" src="/assets/lightbox.webp" srcset="/assets/lightbox.480.webp 480w">' +
        '<img src="/assets/hero-full.jpg" data-original="/assets/hero-full.jpg">',
    );
    const candidates = responsiveImageCandidates(dom.window.document);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toEqual({
      src: '/assets/a.webp',
      srcset: '/assets/a.480.webp 480w, /assets/a.webp 1200w',
      sizes: '100vw',
    });
    expect(candidates.at(-1)).toEqual({ src: '/assets/full-only.webp' });
  });

  it('prefers the AVIF source from a responsive picture element', () => {
    const dom = new JSDOM(
      '<picture>' +
        '<source type="image/avif" srcset="/assets/a.480.avif 480w, /assets/a.avif 1200w">' +
        '<img src="/assets/a.webp" srcset="/assets/a.480.webp 480w, /assets/a.webp 1200w" sizes="100vw">' +
        '</picture>',
    );
    expect(responsiveImageCandidates(dom.window.document)).toEqual([
      {
        src: '/assets/a.480.avif',
        srcset: '/assets/a.480.avif 480w, /assets/a.avif 1200w',
        sizes: '100vw',
      },
    ]);
  });

  it('respects data saver and very slow connections', () => {
    expect(shouldPrefetchResources()).toBe(true);
    expect(shouldPrefetchResources({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(shouldPrefetchResources({ effectiveType: '2g' })).toBe(false);
    expect(shouldPrefetchResources({ effectiveType: '3g' })).toBe(true);
  });
});
