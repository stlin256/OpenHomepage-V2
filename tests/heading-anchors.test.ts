import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
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

  it('enforces mobile-hidden and desktop-only responsive rules in markdown-body.css', () => {
    const css = fs.readFileSync("src/styles/markdown-body.css", "utf8");

    // 移动端及触控端必须彻底隐藏 # 井号
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)\s*,\s*\(\s*hover:\s*none\s*\)\s*\{[\s\S]*?\.markdown-body\s+\.heading-anchor\s*\{[\s\S]*?display:\s*none\s*!important/);

    // 严禁旧版触控设备常驻显示 opacity: 0.55 的回退
    expect(css).not.toMatch(/@media\s*\(\s*hover:\s*none\s*\)\s*\{[\s\S]*?opacity:\s*0\.55/);

    // 桌面端（min-width: 769px）交互显现
    expect(css).toMatch(/@media\s*\(\s*min-width:\s*769px\s*\)\s*\{[\s\S]*?\.markdown-body\s+h2:hover\s+\.heading-anchor/);
  });

  it('skips generated footnote titles', async () => {
    const html = await renderMarkdown(
      '## Heading\n\nA note.[^1]\n\n[^1]: The footnote.',
      { headingAnchors: true, lang: 'en' },
    );
    expect(html).toContain('href="#heading"');
    expect(html).not.toContain('href="#footnote-label"');
  }, 60000);
});
