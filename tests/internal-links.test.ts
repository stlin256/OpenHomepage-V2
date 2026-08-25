import { describe, expect, it, beforeAll } from 'vitest';
import { localizeInternalHref } from '../src/lib/routes.ts';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { renderEditorialBlock } from '../src/lib/editorial-block.ts';

const slugs = new Set(['/', 'research', 'features']);

beforeAll(async () => {
  await renderMarkdown('warmup');
}, 60000);

describe('localizeInternalHref', () => {
  it('rewrites known page slugs for the current route language', () => {
    expect(localizeInternalHref('/', 'en', 'zh', slugs)).toBe('/en/');
    expect(localizeInternalHref('/research', 'en', 'zh', slugs)).toBe('/en/research');
    expect(localizeInternalHref('/research/', 'en', 'zh', slugs)).toBe('/en/research/');
    expect(localizeInternalHref('/features#top', 'en', 'zh', slugs)).toBe('/en/features#top');
  });

  it('keeps default-language, prefixed, external, asset, and unknown links unchanged', () => {
    expect(localizeInternalHref('/research', 'zh', 'zh', slugs)).toBe('/research');
    expect(localizeInternalHref('/en/research', 'en', 'zh', slugs)).toBe('/en/research');
    expect(localizeInternalHref('https://example.com/research', 'en', 'zh', slugs)).toBe('https://example.com/research');
    expect(localizeInternalHref('/assets/photo.jpg', 'en', 'zh', slugs)).toBe('/assets/photo.jpg');
    expect(localizeInternalHref('/unknown', 'en', 'zh', slugs)).toBe('/unknown');
  });
});

describe('language-neutral internal links', () => {
  it('localizes markdown anchors and editorial block URLs', async () => {
    const html = await renderMarkdown('[Research](/research)', {
      localizeHrefs: { lang: 'en', defaultLang: 'zh', slugs: [...slugs] },
    });
    expect(html).toContain('href="/en/research"');

    const block = renderEditorialBlock(
      {
        id: 'kit',
        title: 'Kit',
        actions: [{ label: 'Action', url: '/features' }],
        list: [{ title: 'Item', url: '/research' }],
      },
      'en',
      (href) => localizeInternalHref(href, 'en', 'zh', slugs)
    );
    expect(block).toContain('href="/en/features"');
    expect(block).toContain('href="/en/research"');
  });
});
