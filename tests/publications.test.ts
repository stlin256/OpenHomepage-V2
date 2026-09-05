import { describe, expect, it } from 'vitest';
import {
  parseBibtexEntries,
  loadPublications,
  filterPublications,
  renderPublications,
} from '../src/lib/publications.ts';

const baseItem = {
  id: 'paper-2026',
  title: 'Efficient Inference & Scheduling',
  authors: ['Zhiyuan Lin', 'Alice Doe'],
  year: 2026,
  date: '2026-05-12',
  type: 'conference' as const,
  venue: 'OSDI 2026',
  tags: ['systems', 'inference'],
  links: { pdf: 'assets/papers/x.pdf', code: 'https://github.com/a/b' },
  bibtexKey: 'lin2026efficient',
};

describe('BibTeX parser', () => {
  it('preserves raw entries by key and ignores comments/@string', () => {
    const file = `@string{osdi = {OSDI}}\n@article{lin2026efficient,\n title = {Efficient {Inference}},\n year = {2026}\n}\n@comment{ignored}`;
    const entries = parseBibtexEntries(file);
    expect(entries.get('lin2026efficient')).toContain('title = {Efficient {Inference}}');
    expect(entries.size).toBe(1);
  });

  it('reports duplicate keys as warnings', () => {
    const warnings: string[] = [];
    parseBibtexEntries('@article{a,x={1}}\n@article{a,y={2}}', (m) => warnings.push(m));
    expect(warnings[0]).toContain('duplicate');
    expect(warnings).toHaveLength(1);
  });
});

describe('publications config', () => {
  it('loads example config with localized note fallback and bibtex merge', () => {
    const cfg = loadPublications('data.example');
    expect(cfg.enabled).toBe(true);
    expect(cfg.items.length).toBeGreaterThanOrEqual(5);
    expect((cfg.items[0].note as Record<string, string> | undefined)?.zh).toContain('第一作者');
    expect(cfg.items[0].bibtex).toContain('lin2026efficient');
  });

  it('filters tags with AND semantics and sorts date descending', () => {
    const items = [
      baseItem,
      { ...baseItem, id: 'b', date: '2026-06-01', tags: ['systems', 'ml'] },
      { ...baseItem, id: 'c', date: '2025-01-01', tags: ['systems'] },
    ];
    expect(filterPublications(items, { tag: 'systems,ml' }).map((i) => i.id)).toEqual(['b']);
    expect(filterPublications(items, {}).map((i) => i.id)).toEqual(['b', 'paper-2026', 'c']);
  });
});

describe('publication rendering', () => {
  it('renders escaped metadata, links, details, BibTeX, and responsive teaser', () => {
    const html = renderPublications(
      [{ ...baseItem, abstract: { en: 'Adaptive scheduler.' }, bibtex: '@article{lin2026efficient,x={1}}', note: { zh: '第一作者' }, teaser: 'assets/hero.jpg', badges: ['oral'] }],
      { lang: 'zh', defaultLang: 'zh', baseUrl: '/base/', highlightAuthors: ['Zhiyuan Lin'] },
      {},
    );
    expect(html).toContain('class="publication-item');
    expect(html).toContain('Efficient Inference &amp; Scheduling');
    expect(html).toContain('<strong>Zhiyuan Lin</strong>');
    expect(html).toContain('href="/base/assets/papers/x.pdf"');
    expect(html).toContain('<details class="publication-abstract">');
    expect(html).toContain('data-copy-bibtex');
    expect(html).toContain('data-pagefind-ignore');
    expect(html).toContain('src="/base/assets/hero.jpg"');
    expect(html).toContain('sizes=');
  });

  it('groups by year descending and renders empty state', () => {
    const html = renderPublications([baseItem], { lang: 'en', defaultLang: 'en' }, { group: 'year' });
    expect(html).toContain('data-group="year"');
    expect(html).toContain('<h3 class="publication-group-title">2026</h3>');
    expect(renderPublications([], { lang: 'en' }, {})).toContain('No publications matched');
  });
});



describe('publications directive', () => {
  it('renders through the markdown pipeline with query attributes', async () => {
    const { renderMarkdown } = await import('../src/lib/markdown.ts');
    const cfg = loadPublications('data.example');
    const html = await renderMarkdown('::publications{tag="systems" limit="2" group="year"}', {
      lang: 'zh',
      defaultLang: 'zh',
      publications: cfg,
    });
    expect(html).toContain('class="publications"');
    expect(html).toContain('Efficient Inference');
    expect((html.match(/<article class="publication-item/g) ?? []).length).toBeLessThanOrEqual(2);
  }, 60000);
});
