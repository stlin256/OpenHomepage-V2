/**
 * 流式块内容编辑窗口（admin/ui/overlay/streamedit.ts，M12g）jsdom 测试：
 * 打开带初值（load 的 markdown 进 textarea，打开即渲染一次预览）、输入 500ms 防抖再渲染、
 * 保存流程（onSave 携带新值、成功关窗、失败保持打开）、脏关闭 confirm（取消/确认/无改动不询问）、
 * Esc = 关闭、Ctrl+Enter 保存、渲染失败状态行报错。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openStreamEditor, type StreamEditDeps, type StreamEditSession } from '../admin/ui/overlay/streamedit.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function makeDeps(overrides: Partial<StreamEditDeps> = {}) {
  return {
    t,
    id: 'welcome',
    load: vi.fn(async () => ({ path: 'streaming/zh/welcome.md', markdown: '# 你好' })),
    render: vi.fn(async (md: string) => `<p>${md}</p>`),
    onSave: vi.fn(async () => {}),
    ...overrides,
  };
}

/** 已打开的会话（afterEach 统一关闭，避免陈旧 keydown 监听串扰后续用例） */
const sessions: StreamEditSession[] = [];
async function open(deps: StreamEditDeps): Promise<StreamEditSession> {
  const s = await openStreamEditor(document, deps);
  sessions.push(s);
  return s;
}

const rootEl = () => document.querySelector('.oh-streamedit-mask') as HTMLElement | null;
const inputEl = () => document.querySelector('.oh-streamedit-input') as HTMLTextAreaElement;
const previewEl = () => document.querySelector('.oh-streamedit-preview') as HTMLElement;
const saveBtn = () =>
  document.querySelector('.oh-streamedit-ops .oh-primary') as HTMLButtonElement;
const closeBtn = () =>
  document.querySelector('.oh-streamedit-ops button:not(.oh-primary)') as HTMLButtonElement;
const statusEl = () => document.querySelector('.oh-streamedit-status') as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  // 统一关闭遗留会话（confirm 一律确认；已关闭的会话 close 是幂等空操作）
  vi.stubGlobal('confirm', () => true);
  for (const s of sessions.splice(0)) s.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('streamedit：打开与预览', () => {
  it('打开：初值来自 load，标题含 id，打开即渲染一次预览', async () => {
    const deps = makeDeps();
    const session = await open(deps);
    expect(rootEl()).toBe(session.root);
    expect(session.root.isConnected).toBe(true);
    expect(inputEl().value).toBe('# 你好');
    expect(document.querySelector('.oh-streamedit-title')!.textContent).toContain('welcome');
    await tick();
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledWith('# 你好');
    expect(previewEl().innerHTML).toBe('<p># 你好</p>');
    session.close(); // 无改动：直接关闭不 confirm
    expect(rootEl()).toBeNull();
  });

  it('load 失败抛错（不打开窗口）', async () => {
    const deps = makeDeps({
      load: vi.fn(async () => {
        throw new Error('流式块不存在');
      }),
    });
    await expect(openStreamEditor(document, deps)).rejects.toThrow('流式块不存在');
    expect(rootEl()).toBeNull();
  });

  it('输入 150ms 防抖后重新渲染；连续输入只渲染最后一次', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    await open(deps);
    await vi.advanceTimersByTimeAsync(0); // 初始渲染
    expect(deps.render).toHaveBeenCalledTimes(1);

    inputEl().value = '# 改';
    inputEl().dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(149);
    expect(deps.render).toHaveBeenCalledTimes(1); // 防抖窗口内不触发
    inputEl().value = '# 改了两下';
    inputEl().dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.render).toHaveBeenLastCalledWith('# 改了两下');
    await vi.advanceTimersByTimeAsync(0);
    expect(previewEl().innerHTML).toBe('<p># 改了两下</p>');
  });

  it('渲染失败：状态行报错，窗口保持打开；下一次成功渲染清除错误', async () => {
    vi.useFakeTimers();
    let fail = true;
    const deps = makeDeps({
      render: vi.fn(async (md: string) => {
        if (fail) throw new Error('渲染服务异常');
        return `<p>${md}</p>`;
      }),
    });
    await open(deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(statusEl().textContent).toContain('渲染服务异常');
    expect(statusEl().classList.contains('oh-err')).toBe(true);
    expect(rootEl()).not.toBeNull();

    fail = false;
    inputEl().dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(statusEl().textContent).toBe('');
    expect(statusEl().classList.contains('oh-err')).toBe(false);
  });
});

describe('streamedit：保存与关闭', () => {
  it('保存：onSave 携带新值；成功关窗', async () => {
    const deps = makeDeps();
    await open(deps);
    inputEl().value = '# 新内容';
    saveBtn().click();
    await tick();
    expect(deps.onSave).toHaveBeenCalledWith('# 新内容');
    expect(rootEl()).toBeNull(); // 成功后关窗（调用方随即整页刷新）
  });

  it('保存失败：窗口保持打开，保存按钮恢复可用', async () => {
    const deps = makeDeps({
      onSave: vi.fn(async () => {
        throw new Error('网络错误');
      }),
    });
    await open(deps);
    saveBtn().click();
    await tick();
    expect(rootEl()).not.toBeNull();
    expect(saveBtn().disabled).toBe(false);
  });

  it('Ctrl+Enter 保存', async () => {
    const deps = makeDeps();
    await open(deps);
    inputEl().value = '# 快捷键';
    inputEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    expect(deps.onSave).toHaveBeenCalledWith('# 快捷键');
  });

  it('脏关闭需确认：confirm 取消保持打开，确认后关闭；无改动不询问', async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    const deps = makeDeps();
    await open(deps);
    inputEl().value = '# 改动';
    closeBtn().click();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(rootEl()).not.toBeNull(); // 取消：保持打开

    confirmSpy.mockReturnValue(true);
    closeBtn().click();
    expect(rootEl()).toBeNull(); // 确认：关闭

    // 无改动：直接关闭不询问
    await open(deps);
    closeBtn().click();
    expect(confirmSpy).toHaveBeenCalledTimes(2); // 未新增调用
    expect(rootEl()).toBeNull();
  });

  it('Esc = 关闭（有改动同样先 confirm；stopPropagation 不外传）', async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const outer = vi.fn();
    document.addEventListener('keydown', outer); // 冒泡阶段的外层监听：不应被触发
    const deps = makeDeps();
    await open(deps);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(rootEl()).toBeNull(); // 无改动直接关闭
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();

    await open(deps);
    inputEl().value = '# 改动';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(rootEl()).toBeNull();
    document.removeEventListener('keydown', outer);
  });

  it('点击遮罩空白处关闭；点击窗口内部不关闭', async () => {
    const deps = makeDeps();
    await open(deps);
    (document.querySelector('.oh-streamedit') as HTMLElement).click();
    expect(rootEl()).not.toBeNull();
    rootEl()!.click(); // target === mask
    expect(rootEl()).toBeNull();
  });
});
