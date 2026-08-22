import { describe, it, expect, beforeAll } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';

// Shiki 首次调用需初始化高亮器（秒级），预热一次避免首个用例超时
beforeAll(async () => {
  await renderMarkdown('```js\nwarmup\n```');
}, 60000);

describe('基础 markdown / GFM', () => {
  it('渲染段落与行内格式', async () => {
    const html = await renderMarkdown('你好 **加粗** `code`');
    expect(html).toContain('<p>');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('GFM：表格渲染为 table', async () => {
    const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('GFM：删除线', async () => {
    const html = await renderMarkdown('~~删掉~~');
    expect(html).toContain('<del>删掉</del>');
  });

  it('GFM：任务列表渲染 checkbox', async () => {
    const html = await renderMarkdown('- [x] 已完成\n- [ ] 未完成');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
    expect(html).toContain('disabled');
  });

  it('链接与外链属性正常输出', async () => {
    const html = await renderMarkdown('[示例](https://example.com)');
    expect(html).toContain('<a href="https://example.com">示例</a>');
  });
});

describe('代码高亮（Shiki 双主题）', () => {
  it('代码块带 shiki class 与明暗双主题 CSS 变量', async () => {
    const html = await renderMarkdown('```js\nconst a = 1;\n```');
    expect(html).toMatch(/<pre[^>]*class="[^"]*shiki/);
    expect(html).toContain('--shiki-light');
    expect(html).toContain('--shiki-dark');
  });

  it('行内 code 不受影响', async () => {
    const html = await renderMarkdown('这是 `inline` 代码');
    expect(html).toContain('<code>inline</code>');
    expect(html).not.toContain('shiki');
  });
});

describe('数学公式（KaTeX）', () => {
  it('行内公式渲染为 katex', async () => {
    const html = await renderMarkdown('质能方程 $E=mc^2$ 很有名');
    expect(html).toContain('class="katex"');
  });

  it('块级公式渲染 katex-display', async () => {
    const html = await renderMarkdown('$$\n\\int_0^1 x\\,dx\n$$');
    expect(html).toContain('katex-display');
  });
});

describe('HTML 混写与白名单过滤', () => {
  it('允许普通 HTML 标签混写', async () => {
    const html = await renderMarkdown('前面 <strong>混写</strong> 后面');
    expect(html).toContain('<strong>混写</strong>');
  });

  it('script 标签被剔除', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>正常文字');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('正常文字');
  });

  it('img onerror 等事件属性被剔除', async () => {
    const html = await renderMarkdown('<img src="assets/x.jpg" onerror="alert(1)">');
    expect(html).toContain('<img src="assets/x.jpg"');
    expect(html).not.toContain('onerror');
  });

  it('javascript: 链接协议被剔除', async () => {
    const html = await renderMarkdown('[点我](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a');
  });

  it('恶意第三方 iframe 被剔除', async () => {
    const html = await renderMarkdown('<iframe src="https://evil.example.com/x"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('bilibili 官方播放器 iframe 保留', async () => {
    const html = await renderMarkdown(
      '<iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD" allowfullscreen></iframe>'
    );
    expect(html).toContain('<iframe');
    expect(html).toContain('player.bilibili.com/player.html?bvid=BV1xx411c7mD');
  });

  it('youtube 嵌入 iframe 保留', async () => {
    const html = await renderMarkdown(
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
    );
    expect(html).toContain('<iframe');
    expect(html).toContain('www.youtube.com/embed/dQw4w9WgXcQ');
  });
});

describe('自定义指令：内嵌播放器', () => {
  it('::bilibili 渲染为点击加载占位容器', async () => {
    const html = await renderMarkdown('::bilibili{bvid="BV1xx411c7mD"}');
    expect(html).toContain('class="embed-lazy embed-bilibili"');
    expect(html).toContain('data-embed="bilibili"');
    expect(html).toContain('data-bvid="BV1xx411c7mD"');
    expect(html).toContain('player.bilibili.com/player.html?bvid=BV1xx411c7mD');
    expect(html).not.toContain('<iframe');
  });

  it('::youtube 渲染为点击加载占位容器', async () => {
    const html = await renderMarkdown('::youtube{id="dQw4w9WgXcQ"}');
    expect(html).toContain('class="embed-lazy embed-youtube"');
    expect(html).toContain('data-embed="youtube"');
    expect(html).toContain('data-id="dQw4w9WgXcQ"');
    expect(html).toContain('youtube');
    expect(html).not.toContain('<iframe');
  });

  it(':::video 渲染原生 video 标签', async () => {
    const html = await renderMarkdown(
      ':::video{src="assets/demo.mp4" poster="assets/cover.png"}\n:::'
    );
    expect(html).toContain('<video');
    expect(html).toContain('controls');
    expect(html).toContain('src="assets/demo.mp4"');
    expect(html).toContain('poster="assets/cover.png"');
  });

  it(':::audio 渲染原生 audio 标签', async () => {
    const html = await renderMarkdown(':::audio{src="assets/podcast.mp3"}\n:::');
    expect(html).toContain('<audio');
    expect(html).toContain('controls');
    expect(html).toContain('src="assets/podcast.mp3"');
  });

  it('指令缺必需参数时降级为普通文本', async () => {
    const html = await renderMarkdown('::bilibili{}');
    expect(html).not.toContain('embed-lazy');
    expect(html).toContain('::bilibili');
  });
});

describe('自定义指令：图文排版', () => {
  it(':::figure 渲染 figure/img/figcaption 与宽度', async () => {
    const html = await renderMarkdown(
      ':::figure{src="assets/photo.jpg" caption="图 1：实验装置" width="70%"}\n:::'
    );
    expect(html).toContain('<figure style="width:70%">');
    expect(html).toContain('src="assets/photo.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="图 1：实验装置"');
    expect(html).toContain('<figcaption>图 1：实验装置</figcaption>');
  });

  it('::::grid + :::cell 渲染网格结构，栏内 markdown 正常解析', async () => {
    const md = [
      '::::grid{cols=2}',
      ':::cell',
      '左栏 **重点**',
      ':::',
      ':::cell',
      '右栏内容',
      ':::',
      '::::',
    ].join('\n');
    const html = await renderMarkdown(md);
    expect(html).toContain('class="md-grid"');
    expect(html).toContain('grid-template-columns:repeat(2,1fr)');
    const cells = html.match(/class="md-grid-cell"/g);
    expect(cells).toHaveLength(2);
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('右栏内容');
  });
});

describe('自定义指令：功能指令', () => {
  it('::stream 渲染流式区块占位', async () => {
    const html = await renderMarkdown('::stream{id="welcome"}');
    expect(html).toContain('class="stream-block"');
    expect(html).toContain('data-stream-id="welcome"');
  });

  it('::ghcard 渲染仓库卡片占位', async () => {
    const html = await renderMarkdown('::ghcard{repo="owner/repo"}');
    expect(html).toContain('class="gh-card"');
    expect(html).toContain('data-repo="owner/repo"');
  });
});

describe('指令健壮性', () => {
  it('未识别指令降级为普通文本，不报错', async () => {
    const html = await renderMarkdown('::nosuch{foo="bar"}');
    expect(html).toContain('::nosuch');
    expect(html).not.toContain('nosuch-card');
  });

  it('未识别容器指令整体降级为文本', async () => {
    const html = await renderMarkdown(':::what\n内容\n:::');
    expect(html).toContain(':::what');
  });

  it('指令参数值做 HTML 转义防注入', async () => {
    const html = await renderMarkdown('::ghcard{repo=\'a"><img src=x onerror=alert(1)>\'}');
    // 双引号被转义为 &#x22;，参数值无法逃逸出属性、不会成为真实标签
    expect(html).toContain('data-repo="a&#x22;>');
    expect(html).toContain('class="gh-card"');
  });
});

describe('图片', () => {
  it('markdown 图片保留相对路径并加 loading=lazy', async () => {
    const html = await renderMarkdown('![示例图](assets/pic.jpg)');
    expect(html).toContain('src="assets/pic.jpg"');
    expect(html).toContain('alt="示例图"');
    expect(html).toContain('loading="lazy"');
  });

  it('外部图片 URL 原样保留', async () => {
    const html = await renderMarkdown('![x](https://example.com/a.png)');
    expect(html).toContain('src="https://example.com/a.png"');
  });
});
