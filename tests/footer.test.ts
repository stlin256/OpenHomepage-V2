/**
 * 页脚（src/lib/footer.ts）单测：默认开启（显式 false 才关闭）、
 * 默认内容 Powered by OpenHomepage-V2（带仓库链接）、内联 markdown 链接解析 + sanitize。
 */
import { describe, it, expect } from 'vitest';
import {
  resolveFooter,
  footerTextToHtml,
  DEFAULT_FOOTER_TEXT,
  FOOTER_REPO_URL,
} from '../src/lib/footer.ts';
import type { SiteConfig } from '../src/lib/config.ts';

const baseSite = {
  site: { title: 'T' },
  profile: { name: 'N' },
  github: { username: 'u' },
} as unknown as SiteConfig;

describe('resolveFooter（默认开启）', () => {
  it('缺省 / 空对象 → 开启且用默认内容', () => {
    const a = resolveFooter(baseSite);
    expect(a).not.toBeNull();
    expect(a!.text).toEqual(DEFAULT_FOOTER_TEXT);
    expect(resolveFooter({ ...baseSite, footer: {} })!.text).toEqual(DEFAULT_FOOTER_TEXT);
  });

  it('显式 enabled: false → null（关闭）', () => {
    expect(resolveFooter({ ...baseSite, footer: { enabled: false } })).toBeNull();
    expect(resolveFooter({ ...baseSite, footer: { enabled: false, text: 'x' } })).toBeNull();
  });

  it('自定义文本覆盖默认；默认内容含 OpenHomepage-V2 仓库链接', () => {
    const r = resolveFooter({ ...baseSite, footer: { enabled: true, text: { zh: '自用', en: 'Mine' } } });
    expect(r!.text).toEqual({ zh: '自用', en: 'Mine' });
    expect(DEFAULT_FOOTER_TEXT.en).toContain('Powered by');
    expect(DEFAULT_FOOTER_TEXT.en).toContain(FOOTER_REPO_URL);
    expect(DEFAULT_FOOTER_TEXT.zh).toContain(FOOTER_REPO_URL);
  });
});

describe('footerTextToHtml（内联链接 + sanitize）', () => {
  it('纯文本转义 HTML', () => {
    expect(footerTextToHtml('a <b> & "c"')).toBe('a &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('[label](url) 转为链接（target=_blank rel=noopener）', () => {
    const html = footerTextToHtml('Powered by [OpenHomepage-V2](https://github.com/stlin256/OpenHomepage-V2)');
    expect(html).toBe(
      'Powered by <a href="https://github.com/stlin256/OpenHomepage-V2" target="_blank" rel="noopener">OpenHomepage-V2</a>',
    );
  });

  it('mailto: 允许；javascript:/data: 等危险协议不转链接（原样输出文本）', () => {
    expect(footerTextToHtml('[写信](mailto:a@b.com)')).toContain('href="mailto:a@b.com"');
    const evil = footerTextToHtml('[x](javascript:alert(1))');
    expect(evil).not.toContain('<a');
    expect(evil).toContain('[x](javascript:alert(1))');
  });

  it('链接 label 内的 HTML 也转义；不完整语法原样保留', () => {
    const html = footerTextToHtml('[<img>](https://a.com)');
    expect(html).toContain('&lt;img&gt;');
    expect(html).not.toContain('<img>');
    expect(footerTextToHtml('[断链](https://a.com')).toBe('[断链](https://a.com');
    expect(footerTextToHtml('没有链接')).toBe('没有链接');
  });

  it('多个链接与混排文本', () => {
    const html = footerTextToHtml('由 [A](https://a.com) 与 [B](https://b.com) 驱动');
    expect(html).toBe(
      '由 <a href="https://a.com" target="_blank" rel="noopener">A</a> 与 <a href="https://b.com" target="_blank" rel="noopener">B</a> 驱动',
    );
  });
});
