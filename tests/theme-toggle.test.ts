/**
 * 前台主题切换 DOM 行为：切换期间挂过渡 class，结束后清理；
 * 图标常驻双图层，由 CSS 做淡切。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('theme toggle transition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button class="theme-toggle" type="button">
        <svg class="icon icon-light"></svg>
        <svg class="icon icon-dark"></svg>
      </button>
    `;
    document.documentElement.className = '';
    document.documentElement.dataset.theme = 'light';
    sessionStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('切换主题时临时启用全站颜色过渡并更新主题', async () => {
    const { initThemeToggle } = await import('../src/scripts/theme.ts');
    initThemeToggle();
    document.querySelector<HTMLButtonElement>('.theme-toggle')!.click();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    expect(sessionStorage.getItem('theme')).toBe('dark');

    vi.advanceTimersByTime(220);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
  });

  it('连续切换时过渡 class 不会被上一次定时器提前移除', async () => {
    const { initThemeToggle } = await import('../src/scripts/theme.ts');
    initThemeToggle();
    const button = document.querySelector<HTMLButtonElement>('.theme-toggle')!;
    button.click();
    vi.advanceTimersByTime(200);
    button.click();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    vi.advanceTimersByTime(220);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
  });
});

