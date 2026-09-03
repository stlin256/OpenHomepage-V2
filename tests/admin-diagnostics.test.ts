/**
 * 写作排错与诊断哨兵单元测试。
 */
import { describe, it, expect } from 'vitest';
import { lintMarkdownContent } from '../admin/shared/diagnostics.ts';

describe('lintMarkdownContent 语法与素材诊断', () => {
  it('合法的 Markdown 与素材引用，返回通过', () => {
    const markdown = [
      '# 正常标题',
      '',
      '这是一段正文。',
      '',
      ':::figure{src="assets/photo.jpg" caption="图注"}',
      ':::',
      '',
      '::ghcard{repo="stlin256/OpenHomepage-V2"}',
    ].join('\n');

    const fm = { title: '测试页面' };
    const assets = new Set(['photo.jpg']);

    const res = lintMarkdownContent(markdown, fm, assets);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
    expect(res.warnings.length).toBe(0);
  });

  it('缺少 Frontmatter 标题时报告错误', () => {
    const res = lintMarkdownContent('正文', { title: '' }, new Set());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('标题'))).toBe(true);
  });

  it('引用了不存在的本地素材时报告警告', () => {
    const markdown = '![示例](assets/missing-banner.jpg)';
    const res = lintMarkdownContent(markdown, { title: '页面' }, new Set(['other.jpg']));
    expect(res.warnings.some((w) => w.message.includes('missing-banner.jpg'))).toBe(true);
  });

  it('指令缺少必需参数或未闭合时报告错误', () => {
    const markdown = [
      '::stream{speed="40"}',
      '',
      ':::note{title="提示"}',
      '未闭合的内容',
    ].join('\n');

    const res = lintMarkdownContent(markdown, { title: '页面' }, new Set());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('::stream') && e.message.includes('id'))).toBe(true);
    expect(res.errors.some((e) => e.message.includes(':::note') && e.message.includes('未闭合'))).toBe(true);
  });
});
