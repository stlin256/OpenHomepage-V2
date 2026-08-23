/**
 * 节点视图冒烟测试（jsdom）：指令渲染为参数卡片，改参数回写文档并可序列化。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { createT } from '../admin/shared/i18n.ts';
import { buildEditor } from '../admin/ui/editor/create-editor.ts';
import { createDirectiveViews } from '../admin/ui/editor/directive-views.ts';

const t = createT('zh');

async function editorWithViews(markdown: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = await buildEditor(host, markdown, {}, createDirectiveViews(t));
  return { host, editor };
}

describe('指令占位卡片', () => {
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
