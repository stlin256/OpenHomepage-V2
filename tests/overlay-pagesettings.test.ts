/**
 * 页面设置面板（pagesettings.ts）与页面切换下拉（pageswitcher.ts，M12d）jsdom 测试：
 * - 页面设置：frontmatter 表单初值（标题/slug/nav/order/描述/notice 文本+颜色）、
 *   保存合并收集（原 body 不动、未在表单内的键保留、notice 留空删键/非 accent 存对象）、
 *   取消回调；
 * - 页面下拉：选项（标题+语言）、当前页高亮、切换 → navigate(previewPath)；
 * - main 集成：顶栏「页面设置」按钮打开检查器并保存走 PUT /api/page。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPageSettings } from '../admin/ui/overlay/pagesettings.ts';
import { createPageSwitcher } from '../admin/ui/overlay/pageswitcher.ts';
import { initOverlay } from '../admin/ui/overlay/main.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('页面设置表单', () => {
  const PAGE = {
    frontmatter: {
      title: '研究',
      slug: 'research',
      nav: true,
      order: 20,
      description: '研究页',
      notice: { text: '更新中', color: 'yellow' },
      custom_key: '保留',
    },
    body: '# 正文\n',
  };

  function makeDeps(overrides = {}) {
    return {
      t,
      loadPage: vi.fn(async () => structuredClone(PAGE)),
      onSave: vi.fn(async () => {}),
      onCancel: vi.fn(),
      ...overrides,
    };
  }

  function formInputs(body: HTMLElement) {
    const fields = Array.from(body.querySelectorAll('.field'));
    const controlOf = (i: number) =>
      fields[i].querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement;
    return { fields, controlOf };
  }

  it('初值 = 服务端 frontmatter（含 notice 对象拆文本+颜色）', async () => {
    const body = document.createElement('div');
    await renderPageSettings(body, makeDeps());
    const { controlOf } = formInputs(body);
    expect((controlOf(0) as HTMLInputElement).value).toBe('研究'); // title
    expect((controlOf(1) as HTMLInputElement).value).toBe('research'); // slug
    expect((controlOf(2) as HTMLInputElement).checked).toBe(true); // nav
    expect((controlOf(3) as HTMLInputElement).value).toBe('20'); // order
    expect((controlOf(4) as HTMLInputElement).value).toBe('研究页'); // description
    expect((controlOf(5) as HTMLInputElement).value).toBe('更新中'); // notice text
    expect((controlOf(6) as HTMLSelectElement).value).toBe('yellow'); // notice color
  });

  it('保存：合并收集（body 原样回传、自定义键保留、notice 非 accent 存对象）', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderPageSettings(body, deps);
    const { controlOf } = formInputs(body);
    (controlOf(0) as HTMLInputElement).value = '研究成果';
    (body.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement).click();
    await tick();
    expect(deps.onSave).toHaveBeenCalledTimes(1);
    const [fm, savedBody] = deps.onSave.mock.calls[0] as [Record<string, unknown>, string];
    expect(savedBody).toBe('# 正文\n'); // 正文不动
    expect(fm.title).toBe('研究成果');
    expect(fm.custom_key).toBe('保留');
    expect(fm.notice).toEqual({ text: '更新中', color: 'yellow' });
  });

  it('notice 留空删键；accent 色存纯字符串；取消回调', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderPageSettings(body, deps);
    const { controlOf } = formInputs(body);
    const noticeInput = controlOf(5) as HTMLInputElement;
    noticeInput.value = '';
    noticeInput.dispatchEvent(new Event('input', { bubbles: true }));
    (body.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement).click();
    await tick();
    const [fm] = deps.onSave.mock.calls[0] as [Record<string, unknown>];
    expect('notice' in fm).toBe(false);

    // accent 色 notice 存纯字符串
    const deps2 = makeDeps();
    const body2 = document.createElement('div');
    await renderPageSettings(body2, deps2);
    const c2 = Array.from(body2.querySelectorAll('.field')).map((f) =>
      f.querySelector('input, select')
    ) as (HTMLInputElement | HTMLSelectElement)[];
    c2[5].value = '公告';
    (c2[5] as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
    (c2[6] as HTMLSelectElement).value = 'accent';
    (body2.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement).click();
    await tick();
    const [fm2] = deps2.onSave.mock.calls[0] as [Record<string, unknown>];
    expect(fm2.notice).toBe('公告');

    // 取消
    const deps3 = makeDeps();
    const body3 = document.createElement('div');
    await renderPageSettings(body3, deps3);
    (body3.querySelectorAll('.oh-inspector-ops button')[1] as HTMLButtonElement).click();
    expect(deps3.onCancel).toHaveBeenCalledTimes(1);
    expect(deps3.onSave).not.toHaveBeenCalled();
  });
});

describe('页面切换下拉', () => {
  const PAGES = [
    { lang: 'zh', file: 'index.md', slug: '/', title: '主页', nav: true, previewPath: '/' },
    { lang: 'zh', file: 'research.md', slug: 'research', title: '研究', nav: true, previewPath: '/research' },
    { lang: 'en', file: 'index.md', slug: '/', title: 'Home', nav: true, previewPath: '/en/' },
  ];

  it('选项为标题+语言；当前页高亮；切换跳 previewPath', async () => {
    const navigate = vi.fn();
    const switcher = createPageSwitcher({
      t,
      currentSource: 'pages/zh/research.md',
      loadPages: async () => PAGES,
      navigate,
    });
    document.body.append(switcher.el);
    // 加载前为占位项
    expect(switcher.el.querySelectorAll('option')).toHaveLength(1);
    await switcher.load();
    const sel = switcher.el as HTMLSelectElement;
    const options = Array.from(sel.options);
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toContain('研究');
    expect(options[1].textContent).toContain('zh');
    expect(sel.value).toBe('/research'); // 当前页高亮
    sel.value = '/en/';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(navigate).toHaveBeenCalledWith('/en/');
  });
});

describe('main 集成：页面设置按钮', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('oh-editing');
    sessionStorage.clear();
    localStorage.setItem('oh-admin-lang', 'zh');
    delete (window as Record<string, unknown>).__OH_ADMIN_ORIGIN__;
    delete (window as Record<string, unknown>).__OH_PAGE_SOURCE__;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('顶栏含页面下拉与「页面设置」；点击打开检查器，保存走 PUT /api/page（body 不动）', async () => {
    (window as Record<string, unknown>).__OH_ADMIN_ORIGIN__ = 'http://127.0.0.1:4174';
    (window as Record<string, unknown>).__OH_PAGE_SOURCE__ = 'pages/zh/index.md';
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push({
          url: u,
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (u.includes('/api/pages')) {
          return { ok: true, json: async () => ({ pages: [{ lang: 'zh', file: 'index.md', slug: '/', title: '主页', nav: true, previewPath: '/' }] }) };
        }
        if (u.includes('/api/page?')) {
          return { ok: true, json: async () => ({ frontmatter: { title: '主页', nav: true }, body: '正文\n', previewPath: '/' }) };
        }
        if (u === 'http://127.0.0.1:4174/api/page') return { ok: true, json: async () => ({ ok: true }) };
        return { ok: true, json: async () => ({}) };
      })
    );
    initOverlay(document);
    await tick();
    // 页面下拉已填充且当前页高亮
    const sel = document.querySelector('.oh-pageswitch') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('/');
    // 打开页面设置
    const settingsBtn = document.querySelector('.oh-page-settings') as HTMLButtonElement;
    expect(settingsBtn.disabled).toBe(false);
    settingsBtn.click();
    await tick();
    const panel = document.querySelector('.oh-inspector')!;
    expect(panel.querySelector('.oh-inspector-title')!.textContent).toBe(t('pageSettings'));
    const titleInput = panel.querySelector('.field input') as HTMLInputElement;
    expect(titleInput.value).toBe('主页');
    titleInput.value = '主页改';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    (panel.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement).click();
    await tick();
    const put = calls.find((c) => c.url.endsWith('/api/page') && c.method === 'PUT');
    expect(put?.body).toMatchObject({ lang: 'zh', file: 'index.md', body: '正文\n' });
    expect((put?.body as { frontmatter: Record<string, unknown> }).frontmatter.title).toBe('主页改');
  });

  it('无 __OH_PAGE_SOURCE__ 时「页面设置」按钮禁用', () => {
    initOverlay(document);
    expect((document.querySelector('.oh-page-settings') as HTMLButtonElement).disabled).toBe(true);
  });
});
