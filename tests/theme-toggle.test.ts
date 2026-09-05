/**
 * 前台主题切换 DOM 行为：切换期间挂过渡 class，结束后清理；
 * 图标常驻双图层，由 CSS 做淡切。
 * 另覆盖：currentTheme 初始主题解析（用户选择 > default_mode > 系统）、
 * sessionStorage 读写异常降级、系统主题变化监听。
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

  it('sessionStorage 写入失败时主题仍当页生效', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { initThemeToggle } = await import('../src/scripts/theme.ts');
    initThemeToggle();
    document.querySelector<HTMLButtonElement>('.theme-toggle')!.click();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    vi.advanceTimersByTime(220);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
  });

  it('无按钮或已初始化时静默返回，且不会重复绑定点击监听', async () => {
    const { initThemeToggle } = await import('../src/scripts/theme.ts');
    document.body.innerHTML = '';
    expect(() => initThemeToggle()).not.toThrow(); // 无 .theme-toggle 按钮直接返回

    document.body.innerHTML = '<button class="theme-toggle" type="button"></button>';
    initThemeToggle();
    const btn = document.querySelector<HTMLElement>('.theme-toggle')!;
    expect(btn.dataset.themeInit).toBe('1');
    initThemeToggle(); // 已带 data-theme-init，第二次初始化被跳过

    // 若重复绑定，点击会切换两次回到 light；此处应只切换一次
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('currentTheme 初始主题解析', () => {
  let matchesDark = false;

  beforeEach(() => {
    matchesDark = false;
    sessionStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.defaultMode;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes('dark') && matchesDark,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sessionStorage 中的用户选择优先于站点默认与系统', async () => {
    sessionStorage.setItem('theme', 'dark');
    document.documentElement.dataset.defaultMode = 'light';
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('dark');
  });

  it('无用户选择时遵循站点 default_mode=light（即使系统为暗色）', async () => {
    matchesDark = true;
    document.documentElement.dataset.defaultMode = 'light';
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('light');
  });

  it('无用户选择时遵循站点 default_mode=dark', async () => {
    document.documentElement.dataset.defaultMode = 'dark';
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('dark');
  });

  it('default_mode 非法值时回退为跟随系统', async () => {
    matchesDark = true;
    document.documentElement.dataset.defaultMode = 'auto';
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('dark');
  });

  it('无 default_mode 且系统为亮色时解析为 light', async () => {
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('light');
  });

  it('sessionStorage 读取抛错时按未选择回退', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    document.documentElement.dataset.defaultMode = 'dark';
    const { currentTheme } = await import('../src/scripts/theme.ts');
    expect(currentTheme()).toBe('dark');
  });
});

describe('系统主题变化监听', () => {
  let matchesDark = false;
  let changeHandler: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    matchesDark = false;
    changeHandler = undefined;
    sessionStorage.clear();
    document.documentElement.className = '';
    document.documentElement.dataset.theme = 'light';
    delete document.documentElement.dataset.defaultMode;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes('dark') && matchesDark,
        addEventListener: vi.fn((_event: string, cb: () => void) => {
          changeHandler = cb;
        }),
        removeEventListener: vi.fn(),
      })),
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('无用户选择时跟随系统主题变化', async () => {
    matchesDark = true;
    await import('../src/scripts/theme.ts');
    expect(changeHandler).toBeDefined();

    changeHandler!();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
    vi.advanceTimersByTime(220);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
  });

  it('已有用户选择时不跟随系统主题变化', async () => {
    matchesDark = true;
    sessionStorage.setItem('theme', 'light');
    await import('../src/scripts/theme.ts');
    expect(changeHandler).toBeDefined();

    changeHandler!();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
  });

  it('matchMedia 不支持 addEventListener 时静默跳过监听', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    await expect(import('../src/scripts/theme.ts')).resolves.toBeDefined();
  });
});
