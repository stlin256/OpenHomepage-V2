/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initFootnotes,
  showFootnotePopover,
  hideFootnotePopover,
  showFootnoteDrawer,
  hideFootnoteDrawer,
} from '../src/scripts/footnotes.ts';

describe('富媒体脚注客户端交互（src/scripts/footnotes.ts）', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="markdown-body">
        <p>正文内容<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref class="footnote-ref">1</a></sup></p>
        <section data-footnotes class="footnotes">
          <h2 class="footnotes-title" id="footnote-label">脚注</h2>
          <ol class="footnotes-list">
            <li id="user-content-fn-1" class="footnote-item">
              <p>测试脚注富媒体内容 <a href="https://example.com">链接</a> <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref">↩</a></p>
            </li>
          </ol>
        </section>
      </div>
    `;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    hideFootnotePopover();
    hideFootnoteDrawer();
    document.body.innerHTML = '';
  });

  it('initFootnotes 初始化并创建 DOM 骨架', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLAnchorElement>('a[data-footnote-ref]');
    expect(ref?.dataset.fnInit).toBe('1');

    const popover = document.querySelector('.footnote-popover');
    expect(popover).not.toBeNull();
    const drawer = document.querySelector('.footnote-drawer');
    expect(drawer).not.toBeNull();
  });

  it('showFootnotePopover 成功展示内容并剔除 backref 箭头', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLElement>('a[data-footnote-ref]')!;
    showFootnotePopover(ref);

    const popover = document.querySelector<HTMLElement>('.footnote-popover')!;
    expect(popover.classList.contains('visible')).toBe(true);
    expect(ref.classList.contains('is-footnote-active')).toBe(true);

    const body = popover.querySelector('.footnote-popover-body')!;
    expect(body.textContent).toContain('测试脚注富媒体内容');
    expect(body.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(body.querySelector('.data-footnote-backref')).toBeNull();
  });

  it('hideFootnotePopover 隐藏气泡并恢复状态', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLElement>('a[data-footnote-ref]')!;
    showFootnotePopover(ref);
    hideFootnotePopover();

    const popover = document.querySelector<HTMLElement>('.footnote-popover')!;
    expect(popover.classList.contains('visible')).toBe(false);
    expect(ref.classList.contains('is-footnote-active')).toBe(false);
  });

  it('showFootnoteDrawer 展示移动端抽屉与遮罩，并配置跳转链接', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLElement>('a[data-footnote-ref]')!;
    showFootnoteDrawer(ref);

    const drawer = document.querySelector<HTMLElement>('.footnote-drawer')!;
    const backdrop = document.querySelector<HTMLElement>('.footnote-backdrop')!;
    expect(drawer.classList.contains('open')).toBe(true);
    expect(backdrop.classList.contains('open')).toBe(true);
    expect(document.body.classList.contains('footnote-drawer-open')).toBe(true);

    const jump = drawer.querySelector<HTMLAnchorElement>('.footnote-drawer-jump-btn')!;
    expect(jump.getAttribute('href')).toBe('#user-content-fn-1');
  });

  it('hideFootnoteDrawer 关闭抽屉与遮罩', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLElement>('a[data-footnote-ref]')!;
    showFootnoteDrawer(ref);
    hideFootnoteDrawer();

    const drawer = document.querySelector<HTMLElement>('.footnote-drawer')!;
    const backdrop = document.querySelector<HTMLElement>('.footnote-backdrop')!;
    expect(drawer.classList.contains('open')).toBe(false);
    expect(backdrop.classList.contains('open')).toBe(false);
    expect(document.body.classList.contains('footnote-drawer-open')).toBe(false);
  });

  it('Escape 键触发关闭 popover 与 drawer', () => {
    initFootnotes();
    const ref = document.querySelector<HTMLElement>('a[data-footnote-ref]')!;
    showFootnotePopover(ref);
    expect(document.querySelector('.footnote-popover')?.classList.contains('visible')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.footnote-popover')?.classList.contains('visible')).toBe(false);
  });
});
