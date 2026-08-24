/**
 * 编辑风区块后台视图：结构化表单、联系卡编辑和主页布局挂载。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createT } from '../admin/shared/i18n.ts';
import { renderEditorialConfig, renderStreamingConfig } from '../admin/ui/views/configs.ts';
import type { AppState } from '../admin/ui/main.ts';

const SITE = {
  site: { title: 'Demo' },
  profile: { name: 'Demo' },
  github: { username: 'octocat' },
  home: { layout: [{ block: 'editorial', id: 'work' }] },
  editorial_blocks: [
    {
      id: 'work',
      title: { zh: '研究索引', en: 'Research Index' },
      actions: [{ label: { zh: '查看', en: 'View' }, url: '/research', variant: 'primary' }],
      tiles: [{ title: { zh: '磁贴', en: 'Tile' }, size: 'wide' }],
    },
  ],
  contact: {
    intro_card: { enabled: true, title: { zh: '交个朋友', en: 'Say Hello' }, image: 'assets/qr.png' },
  },
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

describe('编辑区块配置', () => {
  let saved: Record<string, unknown>[];

  beforeEach(() => {
    saved = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/config/site') {
          if (init?.method === 'PUT') {
            const payload = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
            const body = payload.data;
            saved.push(body);
            return json({ ok: true });
          }
          return json({ data: SITE });
        }
        if (url === '/api/assets') return json({ assets: [] });
        throw new Error(`未 mock 的请求：${url}`);
      })
    );
    document.body.replaceChildren();
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open(render: (c: HTMLElement, s: AppState) => Promise<void>) {
    const container = document.createElement('div');
    document.body.append(container);
    const state = makeState();
    await render(container, state);
    return { container, state };
  }

  it('展示列表、按钮、磁贴与联系卡，并保存修改后的区块 id', async () => {
    const { container, state } = await open(renderEditorialConfig);
    expect(container.textContent).toContain('按钮组');
    expect(container.textContent).toContain('磁贴');
    expect(container.textContent).toContain('右下联系卡');

    const idInput = container.querySelector<HTMLInputElement>('.list-row input')!;
    expect(idInput.value).toBe('work');
    idInput.value = 'research';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.setStatus).toHaveBeenCalledWith('有未保存内容');

    await tick(1600);
    expect(state.setStatus).toHaveBeenCalledWith('保存中…');
    expect(state.setStatus).toHaveBeenCalledWith('已保存', 'ok');
    expect(saved).toHaveLength(1);
    expect((saved[0]?.editorial_blocks as { id: string }[])[0].id).toBe('research');
  });

  it('主页布局可选择并保存 editorial 挂载点', async () => {
    const { container } = await open(renderStreamingConfig);
    const select = container.querySelector<HTMLSelectElement>('.layout-add select')!;
    select.value = 'editorial';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const idInput = container.querySelector<HTMLInputElement>('.layout-add input')!;
    idInput.value = 'studio';
    const addBtn = [...container.querySelectorAll<HTMLButtonElement>('.layout-add button')].at(-1)!;
    addBtn.click();
    await tick(1600);
    expect(saved.at(-1)?.home).toEqual({
      layout: [
        { block: 'editorial', id: 'work' },
        { block: 'editorial', id: 'studio' },
      ],
    });
  });
});
