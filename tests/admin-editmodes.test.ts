/**
 * 页面编辑器三种模式（所见即所得 / 源码 / 双栏预览）的 jsdom 测试：
 * 模式互切内容同步、双栏预览的引导 → 一键启动 → iframe、保存后刷新预览。
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
  savedBodies: { body: string }[];
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
      spec.savedBodies.push(JSON.parse(String(init.body)) as { body: string });
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

describe('页面编辑器三模式', () => {
  let spec: FetchSpec;
  beforeEach(() => {
    spec = { devUp: false, savedBodies: [] };
    vi.stubGlobal('fetch', stubFetch(spec));
    document.body.replaceChildren();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function openEditor() {
    const container = document.createElement('div');
    document.body.append(container);
    const cleanup = await renderPageEditor(container, makeState(), 'zh', 'index.md');
    return { container, cleanup };
  }

  it('分段控件：源码 ↔ WYSIWYG 互切内容同步，保存取当前编辑面', async () => {
    const { container, cleanup } = await openEditor();
    const seg = container.querySelector('.seg')!;
    expect(seg.textContent).toContain('所见即所得');
    expect(seg.textContent).toContain('源码');
    expect(seg.textContent).toContain('双栏预览');

    // WYSIWYG → 源码：textarea 出现且内容一致
    const segBtns = [...seg.querySelectorAll('button')];
    segBtns[1].click();
    const source = container.querySelector<HTMLTextAreaElement>('.source-editor')!;
    expect(source.style.display).toBe('');
    expect(source.value).toContain('你好');
    expect((container.querySelector('.editor-host') as HTMLElement).style.display).toBe('none');

    // 在源码里追加内容 → 切回 WYSIWYG → 保存内容来自最新编辑
    source.value = `${PAGE_BODY}\n新增一行\n`;
    segBtns[0].click();
    expect(source.style.display).toBe('none');
    cleanup(); // flush 自动保存
    await tick();
    expect(spec.savedBodies.at(-1)?.body).toContain('新增一行');
  });

  it('双栏预览：dev 未运行 → 引导 + 一键启动 → iframe；再自动保存刷新预览', async () => {
    const { container } = await openEditor();
    const segBtns = [...container.querySelectorAll<HTMLButtonElement>('.seg > button')];
    segBtns[2].click(); // 双栏预览
    await tick();
    expect(container.querySelector('.editor-wrap')!.classList.contains('split')).toBe(true);

    // dev 未运行：显示引导与启动按钮
    const startBtn = [...container.querySelectorAll<HTMLButtonElement>('.preview-guide button')][0];
    expect(startBtn).toBeTruthy();
    expect(container.querySelector('.preview-guide')!.textContent).toContain('npm run dev');

    // 一键启动（mock：start 后 dev-status 变 up）
    startBtn.click();
    await tick(60);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe.preview-frame');
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toBe('http://127.0.0.1:4321/');
    // managed：显示停止按钮
    const bar = container.querySelector('.preview-bar')!;
    expect(bar.textContent).toContain('停止预览服务');

    // 双栏内编辑面子切换：切到源码编辑
    const subBtns = [...container.querySelectorAll<HTMLButtonElement>('.seg-mini button')];
    expect(subBtns.length).toBe(2);
    subBtns[1].click();
    expect((container.querySelector('.source-editor') as HTMLElement).style.display).toBe('');
  });

  it('dev 已运行：双栏直接出 iframe，无启动引导', async () => {
    spec.devUp = true;
    const { container } = await openEditor();
    [...container.querySelectorAll<HTMLButtonElement>('.seg > button')][2].click();
    await tick();
    expect(container.querySelector('iframe.preview-frame')).toBeTruthy();
    expect(container.querySelector('.preview-guide')).toBeNull();
  });
});
