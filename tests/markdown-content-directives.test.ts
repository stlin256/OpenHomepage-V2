import { describe, it, expect, beforeAll } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { listEditableBlocks } from '../src/lib/edit-blocks.ts';

beforeAll(async () => {
  await renderMarkdown('```js\nwarmup\n```');
}, 60000);

describe('杂志风 callout 指令', () => {
  it.each(['note', 'tip', 'warning', 'important', 'quote'] as const)(
    '渲染 %s 卡片、默认标题与图标',
    async (type) => {
      const html = await renderMarkdown(`:::${type}\n内容 **加粗**\n:::`, { lang: 'zh' });
      expect(html).toContain(`<aside class="callout callout-${type}" role="note"`);
      expect(html).toContain('class="callout-title"');
      expect(html).toContain('<svg');
      expect(html).toContain('<strong>加粗</strong>');
    },
  );

  it('支持自定义标题与 quote source，并做 HTML 转义', async () => {
    const html = await renderMarkdown(
      ':::quote{title="引用 & 研究" source="Lin, 2026"}\n证据。\n:::',
      { lang: 'zh' },
    );
    expect(html).toContain('引用 &#x26; 研究');
    expect(html).toContain('Lin, 2026');
    expect(html).toContain('class="callout-source"');
  });

  it('缺省标题按语言回退到英文', async () => {
    const html = await renderMarkdown(':::tip\n内容\n:::', { lang: 'xx' });
    expect(html).toContain('Tip');
  });
});

describe('时间线指令', () => {
  const md = [
    '::::timeline{title="Education & Experience"}',
    ':::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="https://example.edu" highlight="true"}',
    '系统方向研究。',
    ':::',
    ':::timeline-item{start="2026" title="Research Intern" org="Example Lab"}',
    '实习项目。',
    ':::',
    '::::',
  ].join('\n');

  it('渲染语义 section/ol/li 与安全链接', async () => {
    const html = await renderMarkdown(md, { lang: 'zh', defaultLang: 'zh' });
    expect(html).toContain('<section class="timeline"');
    expect(html).toContain('Education &#x26; Experience');
    expect(html).toContain('<ol class="timeline-items">');
    expect(html).toContain('<li class="timeline-item');
    expect(html).toContain('href="https://example.edu"');
    expect(html).toContain('data-highlight="true"');
    expect(html).toContain('进行中');
    expect(html).toContain('2022–2026');
  });

  it('缺 start 的 item 降级为原文', async () => {
    const html = await renderMarkdown(
      '::::timeline\n:::timeline-item{title="Missing"}\n:::\n::::',
    );
    expect(html).not.toContain('<ol class="timeline-items">');
    expect(html).toContain(':::timeline-item');
  });

  it('timeline item 内容进入可视化编辑块坐标', () => {
    const blocks = listEditableBlocks(md);
    expect(blocks.some((b) => b.name === 'timeline')).toBe(true);
    expect(blocks.filter((b) => b.name === 'timeline-item')).toHaveLength(2);
  });
});


