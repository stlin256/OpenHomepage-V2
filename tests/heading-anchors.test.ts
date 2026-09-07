import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';

describe('markdown heading anchors', () => {
  it('appends # anchor links to h2/h3/h4 with generated ids', async () => {
    const html = await renderMarkdown(
      '## Section One\n\n### Subsection A\n\n#### Deep\n\n# Title',
      { headingAnchors: true },
    );
    expect(html).toContain('id="section-one"');
    expect(html).toContain('class="heading-anchor" href="#section-one"');
    expect(html).toContain('class="heading-anchor" href="#subsection-a"');
    expect(html).toContain('class="heading-anchor" href="#deep"');
    // h1 不追加锚点
    expect(html).not.toContain('href="#title"');
  }, 60000);

  it('handles duplicate headings with deduped ids', async () => {
    const html = await renderMarkdown('## Intro\n\n## Intro', { headingAnchors: true });
    expect(html).toContain('href="#intro"');
    expect(html).toContain('href="#intro-2"');
  }, 60000);

  it('localizes the anchor aria-label', async () => {
    const zh = await renderMarkdown('## 你好', { headingAnchors: true, lang: 'zh' });
    expect(zh).toContain('aria-label="链接到本节"');

    const en = await renderMarkdown('## Hello', { headingAnchors: true, lang: 'en' });
    expect(en).toContain('aria-label="Link to this section"');
  }, 60000);

  it('preserves explicit raw HTML heading ids', async () => {
    const html = await renderMarkdown('<h2 id="custom">Custom</h2>', { headingAnchors: true });
    expect(html).toContain('id="custom"');
    expect(html).toContain('class="heading-anchor" href="#custom"');
  }, 60000);

  it('does not add anchors when the option is disabled', async () => {
    const html = await renderMarkdown('## Section', { headingSlugs: true });
    expect(html).not.toContain('heading-anchor');
  }, 60000);

  it('skips generated footnote titles', async () => {
    const html = await renderMarkdown(
      '## Heading\n\nA note.[^1]\n\n[^1]: The footnote.',
      { headingAnchors: true, lang: 'en' },
    );
    expect(html).toContain('href="#heading"');
    expect(html).not.toContain('href="#footnote-label"');
  }, 60000);
});
