/**
 * 编辑模式源码坐标注入（src/lib/markdown.ts 的 editSource 选项，M12a）测试：
 * data-oh-src 注入与 listEditableBlocks 坐标一致、stream/ghcard 占位包裹模式、
 * 生产模式（无 editSource）零注入。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { listEditableBlocks } from '../src/lib/edit-blocks.ts';

// Shiki 首次调用需初始化高亮器（秒级），预热一次避免首个用例超时
beforeAll(async () => {
  await renderMarkdown('```js\nwarmup\n```');
}, 60000);

const SRC = 'pages/zh/index.md';

/** 第 index 个可编辑块应注入的 data-oh-src 值 */
function spanValue(md: string, index: number): string {
  const b = listEditableBlocks(md)[index];
  return `${SRC}:${b.start},${b.end}`;
}

describe('data-oh-src 坐标注入', () => {
  it('段落/标题/列表注入块坐标，与 listEditableBlocks 一致', async () => {
    const md = '# 标题\n\n第一段。\n\n- 甲\n- 乙\n';
    const html = await renderMarkdown(md, { editSource: SRC });
    expect(html).toContain(`<h1 data-oh-src="${spanValue(md, 0)}">标题</h1>`);
    expect(html).toContain(`<p data-oh-src="${spanValue(md, 1)}">第一段。</p>`);
    expect(html).toContain(`<ul data-oh-src="${spanValue(md, 2)}">`);
  });

  it('指令节点：data-oh-src 合并进既有 hProperties（class 保留）', async () => {
    const md = '::::grid{cols=2}\n:::cell\n左\n:::\n:::cell\n右\n:::\n::::\n';
    const html = await renderMarkdown(md, { editSource: SRC });
    const gridTag = /<div class="md-grid"[^>]*>/.exec(html)?.[0] ?? '';
    expect(gridTag).toContain(`data-oh-src="${spanValue(md, 0)}"`);
    expect(gridTag).toContain('grid-template-columns:repeat(2,1fr)');
    const cells = html.match(/<div class="md-grid-cell"[^>]*>/g) ?? [];
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain(`data-oh-src="${spanValue(md, 1)}"`);
    expect(cells[1]).toContain(`data-oh-src="${spanValue(md, 3)}"`);
    // cell 内段落同样带坐标（递归块）
    expect(html).toContain(`<p data-oh-src="${spanValue(md, 2)}">左</p>`);
    expect(html).toContain(`<p data-oh-src="${spanValue(md, 4)}">右</p>`);
  });

  it('缺参指令在编辑模式渲染占位卡（节点类型不变，坐标照常注入）', async () => {
    const md = '::bilibili{}\n';
    const html = await renderMarkdown(md, { editSource: SRC });
    // 占位卡：class + data-oh-directive + data-oh-src 坐标（与 listEditableBlocks 一致）
    expect(html).toContain(
      `<div class="oh-directive-placeholder oh-directive-params" data-oh-directive="bilibili" data-oh-src="${spanValue(md, 0)}">`
    );
    expect(html).toContain('缺少参数，点击配置');
    // 不再降级为原文文本
    expect(html).not.toContain('<p>::bilibili');
  });

  it('未知指令同样渲染占位卡（unknown 变体）；容器指令缺参也是占位卡', async () => {
    const unknown = await renderMarkdown('::whatisthis{a=1}\n', { editSource: SRC });
    expect(unknown).toContain('oh-directive-placeholder oh-directive-unknown');
    expect(unknown).toContain('data-oh-directive="whatisthis"');
    expect(unknown).toContain('未知指令 whatisthis');
    const figure = await renderMarkdown(':::figure{}\n:::\n', { editSource: SRC });
    expect(figure).toContain('oh-directive-placeholder oh-directive-params');
    expect(figure).toContain('data-oh-directive="figure"');
    expect(figure).toContain(`data-oh-src="${spanValue(':::figure{}\n:::\n', 0)}"`);
  });

  it('行内 textDirective 无独立块坐标，编辑模式仍降级为文本（随宿主段落覆盖）', async () => {
    const md = '前文 :bilibili{} 后文\n';
    const html = await renderMarkdown(md, { editSource: SRC });
    expect(html).not.toContain('oh-directive-placeholder');
    expect(html).toContain(`<p data-oh-src="${spanValue(md, 0)}">前文 :bilibili{} 后文</p>`);
  });

  it('误嵌套残留的纯冒号段落无对应元素（渲染移除），其余块坐标齐全', async () => {
    const md = '::::grid{cols=2}\n:::cell\n:::figure{src="assets/a.jpg"}\n:::\n:::\n::::\n';
    const html = await renderMarkdown(md, { editSource: SRC });
    expect(html).not.toContain(':::');
    // 块列表含残留 paragraph（grid/cell/figure/残留 共 4 个），DOM 只有 3 个坐标元素
    expect(listEditableBlocks(md)).toHaveLength(4);
    expect(html.match(/data-oh-src=/g)).toHaveLength(3);
  });

  it('sanitize 不剥 data-oh-src（白名单 data*）', async () => {
    const html = await renderMarkdown('正文 <strong>混写</strong>\n', { editSource: SRC });
    expect(html).toContain('data-oh-src=');
    expect(html).toContain('<strong>混写</strong>');
  });
});

describe('占位包裹模式（编辑模式）', () => {
  it('::stream：整段替换改为 oh-embed 包裹，坐标指向指令块', async () => {
    const md = '前文\n\n::stream{id="welcome"}\n\n后文\n';
    const frag = '<div class="stream-block" data-stream-id="welcome">FRAG</div>';
    const html = await renderMarkdown(md, { editSource: SRC, streamEmbeds: { welcome: frag } });
    const stream = listEditableBlocks(md)[1];
    expect(html).toContain(
      `<div data-oh-src="${SRC}:${stream.start},${stream.end}" class="oh-embed">${frag}</div>`,
    );
    // 占位 div 不再单独出现（仅包裹内的一份 data-stream-id）
    expect(html.match(/data-stream-id/g)).toHaveLength(1);
    // 前后段落照常注入坐标
    expect(html.match(/data-oh-src=/g)).toHaveLength(3);
  });

  it('::ghcard 与 ::editorial 同样包裹', async () => {
    const gh = await renderMarkdown('::ghcard{repo="o/r"}\n', {
      editSource: SRC,
      ghCards: { htmlByRepo: { 'o/r': '<a class="gh-repo">card</a>' } },
    });
    expect(gh).toContain('class="oh-embed"');
    expect(gh).toContain('<a class="gh-repo">card</a>');
    expect(gh).toContain(`data-oh-src="${spanValue('::ghcard{repo="o/r"}\n', 0)}"`);

    const ed = await renderMarkdown('::editorial{id="kit"}\n', {
      editSource: SRC,
      editorialEmbeds: { kit: '<section class="block-editorial">E</section>' },
    });
    expect(ed).toContain('class="oh-embed"');
    expect(ed).toContain('<section class="block-editorial">E</section>');
  });

  it('未命中的嵌入 id：编辑模式同样移除占位并 warning', async () => {
    const html = await renderMarkdown('前文\n\n::stream{id="nope"}\n', {
      editSource: SRC,
      streamEmbeds: {},
    });
    expect(html).not.toContain('stream-block');
    expect(html.match(/data-oh-src=/g)).toHaveLength(1); // 只剩「前文」段落
  });
});

describe('生产模式零注入', () => {
  it('无 editSource：无任何 data-oh-src / oh-embed，占位整段替换不变', async () => {
    const html = await renderMarkdown('前文\n\n::stream{id="welcome"}\n', {
      streamEmbeds: { welcome: '<div class="stream-block">F</div>' },
    });
    expect(html).toContain('<div class="stream-block">F</div>');
    expect(html).not.toContain('data-oh-src');
    expect(html).not.toContain('oh-embed');

    const plain = await renderMarkdown('# 标题\n\n正文\n');
    expect(plain).not.toContain('data-oh-src');
    expect(plain).toContain('<h1>标题</h1>');
  });

  it('缺参/未知指令仍按原逻辑降级为原文文本（无占位卡、无注入）', async () => {
    const html = await renderMarkdown('::bilibili{}\n\n::whatisthis{a=1}\n');
    expect(html).not.toContain('oh-directive-placeholder');
    expect(html).not.toContain('data-oh-directive');
    expect(html).not.toContain('data-oh-src');
    expect(html).toContain('::bilibili');
    expect(html).toContain('::whatisthis');
  });
});
