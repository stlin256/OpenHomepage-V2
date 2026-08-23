/**
 * 节点视图冒烟测试（jsdom）：指令渲染为所见即所得预览卡 + 编辑按钮展开参数面板，
 * 改参数回写文档并可序列化；ghcard/stream 预览数据经注入 loader 提供。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { createT } from '../admin/shared/i18n.ts';
import { buildEditor } from '../admin/ui/editor/create-editor.ts';
import { createDirectiveViews, type PreviewLoader } from '../admin/ui/editor/directive-views.ts';

const t = createT('zh');

const fakeLoader: PreviewLoader = async () => ({
  pinned: [
    {
      full_name: 'ggml-org/llama.cpp',
      description: 'LLM inference in C/C++',
      note: '在笔记本上跑大模型',
      language: 'C++',
      stargazers_count: 100,
      forks_count: 5,
      topics: ['llm', 'ggml'],
      updated_at: '2026-08-20T00:00:00Z',
    },
  ],
  streams: [{ id: 'welcome', title: 'AI 助理致辞', excerpt: '你好，我是这个站点的 AI 助理。' }],
});

async function editorWithViews(markdown: string, load: PreviewLoader = fakeLoader) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = await buildEditor(host, markdown, {}, createDirectiveViews(t, load));
  return { host, editor };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('指令预览卡（所见即所得）', () => {
  it('figure 直接渲染素材图片与图注；参数面板默认收起', async () => {
    const { host, editor } = await editorWithViews(
      ':::figure{src="assets/photo.jpg" caption="图 1" width="70%" align="center"}\n:::\n'
    );
    const img = host.querySelector<HTMLImageElement>('.dp-figure img')!;
    expect(img.src).toContain('/api/asset/file?name=photo.jpg');
    expect(host.querySelector('.dp-caption')!.textContent).toBe('图 1');
    const fig = host.querySelector<HTMLElement>('.dp-figure')!;
    expect(fig.style.width).toBe('70%');
    expect(fig.style.margin).toContain('auto');
    // 参数面板默认收起，hover 编辑按钮点击后展开
    const params = host.querySelector('.directive-params')!;
    expect(params.classList.contains('open')).toBe(false);
    host.querySelector<HTMLButtonElement>('.directive-edit')!.click();
    expect(params.classList.contains('open')).toBe(true);
    await editor.destroy();
  });

  it('改参数即时重绘预览并回写指令（figure src 换掉后预览图跟着变）', async () => {
    const { host, editor } = await editorWithViews(':::figure{src="assets/a.jpg"}\n:::\n');
    host.querySelector<HTMLButtonElement>('.directive-edit')!.click();
    const input = host.querySelector<HTMLInputElement>('.directive-param input')!;
    input.value = 'assets/b.jpg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(editor.action(getMarkdown())).toContain('src="assets/b.jpg"');
    expect(host.querySelector<HTMLImageElement>('.dp-figure img')!.src).toContain('name=b.jpg');
    await editor.destroy();
  });

  it('bilibili/youtube 渲染播放器观感卡（徽标 + 参数行，不加载 iframe）', async () => {
    const { host, editor } = await editorWithViews(
      '::bilibili{bvid="BV1xx411c7mD"}\n\n::youtube{id="dQw4w9WgXcQ"}\n'
    );
    const players = host.querySelectorAll('.dp-player');
    expect(players.length).toBe(2);
    expect(host.querySelector('.dp-badge-bilibili')).toBeTruthy();
    expect(host.querySelector('.dp-badge-youtube')).toBeTruthy();
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.textContent).toContain('BV1xx411c7mD');
    await editor.destroy();
  });

  it('ghcard 命中 pinned 快照渲染仓库卡（贴近站点卡：语言色点/topics/相对更新）；未命中显示占位提示', async () => {
    const { host, editor } = await editorWithViews(
      '::ghcard{repo="ggml-org/llama.cpp"}\n\n::ghcard{repo="owner/unknown"}\n'
    );
    await tick(); // 预览数据异步到达
    const cards = host.querySelectorAll('.dp-ghrepo');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('在笔记本上跑大模型'); // note 优先
    expect(cards[0].textContent).toContain('C++');
    expect(cards[0].textContent).toContain('★ 100');
    // 语言色点用 linguist 官方色；topics 渲染为 pill；显示相对更新时间
    const dot = cards[0].querySelector<HTMLElement>('.dp-ghrepo-dot')!;
    expect(dot.style.backgroundColor).toBe('rgb(243, 75, 125)'); // #f34b7d
    expect(cards[0].querySelectorAll('.dp-ghrepo-topic').length).toBe(2);
    expect(cards[0].textContent).toContain('更新于');
    expect(cards[1].textContent).toContain('owner/unknown');
    expect(cards[1].textContent).toContain(t('ghcardNotPinned'));
    await editor.destroy();
  });

  it('stream 渲染流式区块卡片（标题 + 内容摘要）', async () => {
    const { host, editor } = await editorWithViews('::stream{id="welcome"}\n');
    await tick();
    const card = host.querySelector('.dp-stream')!;
    expect(card.textContent).toContain('AI 助理致辞');
    expect(card.textContent).toContain('你好，我是这个站点的 AI 助理。');
    await editor.destroy();
  });

  it('grid 单元格按 cols 分栏布局', async () => {
    const md = '::::grid{cols=3}\n:::cell\n左\n:::\n:::cell\n右\n:::\n::::\n';
    const { host, editor } = await editorWithViews(md);
    const cells = host.querySelector<HTMLElement>('.directive-grid-cells')!;
    expect(cells.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    // 改 cols 后栏数即时更新
    const colsInput = host.querySelector<HTMLInputElement>('.directive-grid-editor .directive-param input')!;
    colsInput.value = '4';
    colsInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cells.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
    await editor.destroy();
  });

  it('预览数据加载失败时卡片正常降级（不抛错）', async () => {
    const { host, editor } = await editorWithViews('::ghcard{repo="a/b"}\n', async () => {
      throw new Error('offline');
    });
    await tick();
    expect(host.querySelector('.dp-ghrepo')!.textContent).toContain('a/b');
    await editor.destroy();
  });
});

describe('参数编辑回写', () => {
  it('bilibili 渲染为参数卡片，修改参数可序列化回指令', async () => {
    const { host, editor } = await editorWithViews('::bilibili{bvid="BV1xx411c7mD"}\n');
    const card = host.querySelector('.directive-card');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('bilibili');
    const input = card!.querySelector<HTMLInputElement>('.directive-param input')!;
    expect(input.value).toBe('BV1xx411c7mD');

    // 模拟用户修改参数
    input.value = 'BV9999999';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const md = editor.action(getMarkdown());
    expect(md).toContain('::bilibili{bvid="BV9999999"}');
    await editor.destroy();
  });

  it('figure 卡片带 src/caption/width 输入与 align 下拉，改 align 可序列化回指令', async () => {
    const { host, editor } = await editorWithViews(
      ':::figure{src="assets/photo.jpg" caption="图 1" width="70%"}\n:::\n'
    );
    const inputs = host.querySelectorAll<HTMLInputElement>('.directive-card .directive-param input');
    expect(inputs.length).toBe(3);
    expect(inputs[1].value).toBe('图 1');
    const sel = host.querySelector<HTMLSelectElement>('.directive-card .directive-param select')!;
    expect(sel).toBeTruthy();
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'left', 'center', 'right']);

    // 模拟用户选择居中：写回 figure 指令的 align 参数
    sel.value = 'center';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.action(getMarkdown())).toContain('align="center"');
    await editor.destroy();
  });

  it('grid 渲染 cols 输入与可编辑单元格内容', async () => {
    const md = '::::grid{cols=3}\n:::cell\n左\n:::\n:::cell\n右\n:::\n::::\n';
    const { host, editor } = await editorWithViews(md);
    const grid = host.querySelector('.directive-grid-editor');
    expect(grid).toBeTruthy();
    const colsInput = grid!.querySelector<HTMLInputElement>('.directive-param input')!;
    expect(colsInput.value).toBe('3');
    const cells = host.querySelectorAll('.directive-cell-editor');
    expect(cells.length).toBe(2);
    expect(cells[0].textContent).toContain('左');
    expect(cells[1].textContent).toContain('右');

    // 改 cols 回写
    colsInput.value = '4';
    colsInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(editor.action(getMarkdown())).toContain('::::grid{cols="4"}');
    await editor.destroy();
  });

  it('粘贴图片钩子：clipboardData 含图片时上传并插入引用', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = await buildEditor(host, '', {
      onPasteImage: async () => 'assets/pasted-x.png',
    });
    const view = editor.ctx.get(editorViewCtx);
    // jsdom 无 DataTransfer：构造最小可用的 clipboardData
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [file], getData: () => '', types: [] },
    });
    view.dom.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 20));
    expect(editor.action(getMarkdown())).toContain('![](assets/pasted-x.png)');
    await editor.destroy();
  });
});
