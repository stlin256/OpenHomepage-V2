/**
 * 编辑器跨视图流程测试：配置表单自动保存 → 页面所见即所得编辑器保存。
 * 这里验证用户会经过的完整界面链路，而不是单个 DOM helper。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createT } from '../admin/shared/i18n.ts';
import { renderEditorialConfig } from '../admin/ui/views/configs.ts';
import { renderPageEditor } from '../admin/ui/views/pages.ts';
import type { AppState } from '../admin/ui/main.ts';

const PAGE_BODY = '# 首页\n\n原始内容\n';

const SITE = {
  site: { title: 'Demo' },
  profile: { name: 'Demo' },
  github: { username: 'octocat' },
  editorial_blocks: [{ id: 'work', title: { zh: '研究', en: 'Research' } }],
};

function makeState(): AppState {
  return { lang: 'zh', t: createT('zh'), setStatus: vi.fn(), navigate: vi.fn(), refreshSidebar: async () => {} };
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function tick(ms = 20) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('编辑器跨视图流程', () => {
  let savedConfigs: Record<string, unknown>[];
  let savedPages: { body: string }[];

  beforeEach(() => {
    savedConfigs = [];
    savedPages = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/config/site') {
          if (init?.method === 'PUT') {
            const payload = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
            savedConfigs.push(payload.data);
            return json({ ok: true });
          }
          return json({ data: SITE });
        }
        if (url.startsWith('/api/page?')) {
          return json({ frontmatter: { title: '首页' }, body: PAGE_BODY, previewPath: '/' });
        }
        if (url === '/api/page' && init?.method === 'PUT') {
          savedPages.push(JSON.parse(String(init.body)) as { body: string });
          return json({ ok: true });
        }
        throw new Error(`未 mock 的请求：${url}`);
      })
    );
    document.body.replaceChildren();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('配置修改先自动落盘，随后页面正文保存到页面 API', async () => {
    // 配置面：修改 editorial 挂载 ID，等待 1.5 秒停顿自动保存。
    const configHost = document.createElement('div');
    document.body.append(configHost);
    await renderEditorialConfig(configHost, makeState());
    const idInput = configHost.querySelector<HTMLInputElement>('.list-row input')!;
    expect(idInput.value).toBe('work');
    idInput.value = 'research';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(1600);
    expect(savedConfigs).toHaveLength(1);
    expect((savedConfigs[0].editorial_blocks as { id: string }[])[0].id).toBe('research');

    // 页面面：默认所见即所得，切到源码追加内容，离开时 flush 自动保存。
    const state = makeState();
    const pageHost = document.createElement('div');
    document.body.append(pageHost);
    const cleanup = await renderPageEditor(pageHost, state, 'zh', 'index.md');
    const segButtons = [...pageHost.querySelectorAll<HTMLButtonElement>('.seg > button')];
    expect(segButtons[0].classList.contains('active')).toBe(true);
    segButtons[1].click();
    const source = pageHost.querySelector<HTMLTextAreaElement>('.source-editor')!;
    source.value = `${PAGE_BODY}\n跨视图新增\n`;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    cleanup();
    await tick();

    expect(savedPages.at(-1)?.body).toContain('跨视图新增');
    expect(state.setStatus).toHaveBeenCalledWith('有未保存内容');
    expect(state.setStatus).toHaveBeenCalledWith('已保存', 'ok');
  });
});
