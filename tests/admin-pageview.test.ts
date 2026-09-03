/**
 * 页面视图（M12e 重写后的 admin/ui/views/pages.ts）jsdom 测试：
 * 布局（操作条 + frontmatter 纵向表单 + 整页源码）、1.5s 停顿自动保存、
 * 「可视化编辑」按钮的三种 dev server 状态分支（托管运行 / 未运行拉起 / 外部非托管提示）。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createT } from '../admin/shared/i18n.ts';
import { renderPageEditor } from '../admin/ui/views/pages.ts';
import type { AppState } from '../admin/ui/main.ts';

const PAGE_BODY = '# 你好\n\n世界\n';

interface FetchSpec {
  devUp: boolean;
  devManaged?: boolean;
  savedBodies: { body: string; frontmatter: Record<string, unknown> }[];
}

function stubFetch(spec: FetchSpec) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('/api/page?')) {
      return json({ frontmatter: { title: '主页' }, body: PAGE_BODY, previewPath: '/' });
    }
    if (url === '/api/page' && init?.method === 'PUT') {
      spec.savedBodies.push(JSON.parse(String(init.body)));
      return json({ ok: true });
    }
    if (url === '/api/dev-status') {
      return json({
        up: spec.devUp,
        starting: false,
        managed: Boolean(spec.devManaged),
        url: spec.devUp ? 'http://127.0.0.1:4321/' : null,
        logTail: [],
        error: null,
      });
    }
    if (url === '/api/dev/start') {
      spec.devUp = true;
      spec.devManaged = true;
      return json({ up: false, starting: true, managed: true, url: null, logTail: [], error: null });
    }
    if (url === '/api/dev/stop') {
      spec.devUp = false;
      return json({ up: false, starting: false, managed: false, url: null, logTail: [], error: null });
    }
    if (url === '/api/pages') return json({ pages: [] });
    throw new Error(`未 mock 的请求：${url}`);
  });
}

function makeState(): AppState {
  return {
    lang: 'zh',
    t: createT('zh'),
    setStatus: vi.fn(),
    navigate: vi.fn(),
    refreshSidebar: async () => {},
  };
}

async function tick(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('页面视图（M12e）', () => {
  let spec: FetchSpec;
  let openMock: ReturnType<typeof vi.fn>;
  let realOpen: typeof window.open;
  beforeEach(() => {
    spec = { devUp: false, savedBodies: [] };
    vi.stubGlobal('fetch', stubFetch(spec));
    // window.open 直接替换为 mock（jsdom 的 open 不加载页面，但会污染 virtual console）
    realOpen = window.open;
    openMock = vi.fn();
    window.open = openMock as never;
    document.body.replaceChildren();
  });
  afterEach(() => {
    window.open = realOpen;
    vi.unstubAllGlobals();
  });

  async function openView() {
    const container = document.createElement('div');
    document.body.append(container);
    const cleanup = await renderPageEditor(container, makeState(), 'zh', 'index.md');
    return { container, cleanup };
  }

  it('布局：操作条（可视化编辑 + 页面操作）+ frontmatter 表单 + 整页源码', async () => {
    const { container, cleanup } = await openView();
    const workspace = container.querySelector('.page-editor')!;
    expect(workspace).toBeTruthy();
    // 操作条：可视化编辑主按钮 + 快照/重命名/创建另一语言版/删除
    const ops = container.querySelector('.page-ops-bar')!;
    expect(ops.querySelector('.btn-primary')!.textContent).toBe('可视化编辑');
    expect(ops.textContent).toContain('历史快照');
    expect(ops.textContent).toContain('重命名');
    expect(ops.textContent).toContain('创建另一语言版');
    expect(ops.textContent).toContain('删除页面');
    // frontmatter 纵向表单（field 标签 + 控件）
    const labels = [...container.querySelectorAll('.form-grid .field-label')].map((n) => n.textContent);
    expect(labels).toEqual([
      '标题 (title)',
      '路由 (slug)',
      '进导航 (nav)',
      '文章目录 (toc)',
      '阅读进度条 (reading_progress)',
      '排序 (order)',
      '描述 (description)',
      '顶端通知 (notice)',
      '通知颜色 (color)',
    ]);
    // 整页源码 textarea：等宽编辑面，初值为正文
    const source = container.querySelector<HTMLTextAreaElement>('.source-editor')!;
    expect(source.value).toBe(PAGE_BODY);
    expect(source.getAttribute('aria-label')).toBeTruthy();
    cleanup();
  });

  it('源码编辑 1.5s 停顿自动保存（PUT 带新正文与 frontmatter），cleanup flush 兜底', async () => {
    const state = makeState();
    const container = document.createElement('div');
    document.body.append(container);
    const cleanup = await renderPageEditor(container, state, 'zh', 'index.md');
    const source = container.querySelector<HTMLTextAreaElement>('.source-editor')!;
    source.value = `${PAGE_BODY}\n新增一行\n`;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.setStatus).toHaveBeenCalledWith('有未保存内容');
    await tick(1600);
    expect(spec.savedBodies.at(-1)?.body).toContain('新增一行');
    expect(spec.savedBodies.at(-1)?.frontmatter.title).toBe('主页');
    expect(state.setStatus).toHaveBeenCalledWith('已保存', 'ok');
    cleanup();
  });

  it('frontmatter 表单改动随自动保存一起提交', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const cleanup = await renderPageEditor(container, makeState(), 'zh', 'index.md');
    const title = container.querySelector<HTMLInputElement>('.form-grid .field input')!;
    expect(title.value).toBe('主页');
    title.value = '新标题';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(1600);
    expect(spec.savedBodies.at(-1)?.frontmatter.title).toBe('新标题');
    cleanup();
  });

  it('可视化编辑：托管 dev server 运行中 → 直接打开 <url><previewPath>?edit=1 新标签', async () => {
    spec.devUp = true;
    spec.devManaged = true;
    const { container, cleanup } = await openView();
    (container.querySelector('.page-ops-bar .btn-primary') as HTMLButtonElement).click();
    await tick();
    expect(openMock).toHaveBeenCalledWith('http://127.0.0.1:4321/?edit=1', '_blank');
    cleanup();
  });

  it('可视化编辑：dev 未运行 → 触发 dev/start 并轮询至就绪后打开', async () => {
    const { container, cleanup } = await openView();
    (container.querySelector('.page-ops-bar .btn-primary') as HTMLButtonElement).click();
    await tick(60);
    expect(openMock).toHaveBeenCalledWith('http://127.0.0.1:4321/?edit=1', '_blank');
    cleanup();
  });

  it('可视化编辑：up 但非 managed（外部启动）→ 显示提示与「重启为托管预览」，不打开标签', async () => {
    spec.devUp = true;
    spec.devManaged = false;
    const { container, cleanup } = await openView();
    (container.querySelector('.page-ops-bar .btn-primary') as HTMLButtonElement).click();
    await tick();
    expect(openMock).not.toHaveBeenCalled();
    const hint = container.querySelector<HTMLElement>('.page-edit-hint')!;
    expect(hint.style.display).toBe('');
    expect(hint.textContent).toContain('外部');
    const restartBtn = [...container.querySelectorAll<HTMLButtonElement>('.page-ops-bar button')].find(
      (b) => b.textContent === '重启为托管预览'
    )!;
    expect(restartBtn.style.display).toBe('');
    cleanup();
  });
  it('长文章提示：检测到长篇幅未开启 toc 或 reading_progress 时展示提醒并支持一键开启', async () => {
    const { container, cleanup } = await openView();
    const source = container.querySelector<HTMLTextAreaElement>('.source-editor')!;
    source.value = '## 章节一\n\n内容\n\n## 章节二\n\n内容\n\n## 章节三\n\n内容\n\n## 章节四\n\n内容\n';
    source.dispatchEvent(new Event('input', { bubbles: true }));

    const hints = container.querySelectorAll<HTMLElement>('.page-toc-hint:not([hidden])');
    expect(hints.length).toBe(2);
    expect(hints[0].textContent).toContain('文章目录');
    expect(hints[1].textContent).toContain('阅读进度条');

    // 点击一键开启阅读进度条
    const enableRpBtn = hints[1].querySelector('button')!;
    enableRpBtn.click();
    const hiddenHints = container.querySelectorAll<HTMLElement>('.page-toc-hint:not([hidden])');
    expect(hiddenHints.length).toBe(1);

    cleanup();
  });

  it("编辑器工具栏：支持指令模板一键插入与快捷按钮", async () => {
    const { container, cleanup } = await openView();
    const toolbar = container.querySelector(".editor-toolbar");
    expect(toolbar).not.toBeNull();

    const select = toolbar?.querySelector("select") as HTMLSelectElement;
    expect(select).not.toBeNull();

    const source = container.querySelector<HTMLTextAreaElement>(".source-editor")!;
    source.value = "# 原有标题\n\n";
    source.selectionStart = source.value.length;
    source.selectionEnd = source.value.length;

    // 选择 note 模版
    select.value = "callout";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(source.value).toContain(":::note");
    expect(source.value).toContain("注记标题");

    cleanup();
  });

});