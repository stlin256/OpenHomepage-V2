/**
 * 文本块就地微编辑器（admin/ui/overlay/textedit.ts，M12b）jsdom 测试：
 * 打开（块隐藏、编辑器占位在原位置、载入块原文）、保存（完成按钮 / Ctrl+Enter →
 * 序列化交给 onSave）、取消（Esc / 取消按钮 → 还原 DOM 不保存）、
 * 保存失败保持打开、粘贴图片经上传钩子插入 assets 引用。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { openTextEditor, type TextEditDeps } from '../admin/ui/overlay/textedit.ts';
import type { BlockEntry } from '../admin/ui/overlay/scanner.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  // jsdom 无布局：编辑器聚焦后 ProseMirror 的 selectionchange 会做布局测量
  // （scrollToSelection → getClientRects/getBoundingClientRect），补空实现避免异步未捕获错误
  const zeroRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;
  const emptyRects = () => [] as unknown as DOMRectList;
  const rangeProto = Range.prototype as { getClientRects?: unknown; getBoundingClientRect?: unknown };
  rangeProto.getClientRects ??= emptyRects;
  rangeProto.getBoundingClientRect ??= zeroRect;
  (Element.prototype as { getClientRects?: unknown }).getClientRects ??= emptyRects;
});

/** 造一个带服务端数据的段落块（markdown-body 容器模拟页面排版上下文） */
function makeEntry(markdown: string): BlockEntry {
  document.body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'markdown-body';
  const p = document.createElement('p');
  p.setAttribute('data-oh-src', 'pages/zh/index.md:0,3');
  p.textContent = '占位';
  wrap.append(p);
  document.body.append(wrap);
  return {
    el: p,
    span: { source: 'pages/zh/index.md', start: 0, end: 3 },
    kind: 'paragraph',
    parent: 'root',
    hash: 'h',
    markdown,
  };
}

describe('textedit：打开与保存', () => {
  it('打开：块隐藏、编辑器占位在原位置、载入块原文', async () => {
    const entry = makeEntry('你好 **世界**');
    const session = await openTextEditor(entry, { t, onSave: vi.fn() });
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(true);
    // 编辑器容器紧贴在块原位置（同一父级）
    expect(session.root.parentElement).toBe(entry.el.parentElement);
    expect(session.root.nextSibling).toBe(entry.el);
    expect(session.root.querySelector('.ProseMirror')!.textContent).toContain('你好');
    await session.cancel();
  });

  it('完成按钮 → 序列化交给 onSave；成功后清理并还原块显示', async () => {
    const entry = makeEntry('你好 **世界**');
    const onSave = vi.fn<TextEditDeps['onSave']>(async () => {});
    const session = await openTextEditor(entry, { t, onSave });
    (session.root.querySelector('.oh-textedit-ops .oh-primary') as HTMLButtonElement).click();
    await tick();
    expect(onSave).toHaveBeenCalledTimes(1);
    const md = onSave.mock.calls[0][0];
    expect(md).toContain('你好');
    expect(md).toContain('**世界**');
    expect(session.root.isConnected).toBe(false);
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(false);
  });

  it('Ctrl+Enter 保存（Mod 键兼容 metaKey）', async () => {
    const entry = makeEntry('甲');
    const onSave = vi.fn<TextEditDeps['onSave']>(async () => {});
    const session = await openTextEditor(entry, { t, onSave });
    session.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toContain('甲');
  });

  it('保存失败（如 hash 陈旧 409）：编辑器保持打开，可再取消还原', async () => {
    const entry = makeEntry('甲');
    const onSave = vi.fn(async () => {
      throw new Error('块内容已被修改（hash 不一致），请刷新后重试');
    });
    const session = await openTextEditor(entry, { t, onSave });
    await session.save();
    await tick();
    expect(session.root.isConnected).toBe(true); // 保持打开
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(true);
    await session.cancel();
    expect(session.root.isConnected).toBe(false);
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(false);
  });
});

describe('textedit：取消', () => {
  it('Esc 取消：不保存、还原 DOM、触发 onCancel', async () => {
    const entry = makeEntry('甲');
    const onSave = vi.fn<TextEditDeps['onSave']>(async () => {});
    const onCancel = vi.fn();
    const session = await openTextEditor(entry, { t, onSave, onCancel });
    session.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(session.root.isConnected).toBe(false);
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(false);
  });

  it('取消按钮：不保存、还原 DOM', async () => {
    const entry = makeEntry('甲');
    const onSave = vi.fn<TextEditDeps['onSave']>(async () => {});
    const session = await openTextEditor(entry, { t, onSave });
    const ops = session.root.querySelectorAll('.oh-textedit-ops button');
    (ops[1] as HTMLButtonElement).click(); // 第二个为取消
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    expect(session.root.isConnected).toBe(false);
  });
});

describe('textedit：粘贴图片', () => {
  it('clipboardData 含图片时走上传钩子并插入 assets 引用', async () => {
    const entry = makeEntry('甲');
    const onPasteImage = vi.fn(async () => 'assets/pasted-x.png');
    const onSave = vi.fn<TextEditDeps['onSave']>(async () => {});
    const session = await openTextEditor(entry, { t, onSave, onPasteImage });
    const pm = session.root.querySelector('.ProseMirror')!;
    // jsdom 无 DataTransfer：构造最小可用的 clipboardData（与 admin-views 测试同款做法）
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [file], getData: () => '', types: [] },
    });
    pm.dispatchEvent(event);
    await tick();
    expect(onPasteImage).toHaveBeenCalledTimes(1);
    await session.save();
    expect(onSave.mock.calls[0][0]).toContain('![](assets/pasted-x.png)');
  });
});
