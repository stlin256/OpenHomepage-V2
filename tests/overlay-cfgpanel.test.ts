/**
 * 配置区块原生表单面板（admin/ui/overlay/cfgpanel.ts，M12d）jsdom 测试：
 * profile/github/rss/streaming/editorial 五类区块的表单初值、编辑收集与保存路径
 * （site / site+rss 全量 PUT）、streaming/editorial 的 id 未命中提示、editorial 深链、
 * streaming「编辑内容」按钮（M12g：按区块 id 回调 onEditStreamContent）。
 * 表单构建与 admin 视图共用 configforms.ts，这里同时守护共享构建器的面板侧行为。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderCfgBlockForm, type CfgPanelDeps } from '../admin/ui/overlay/cfgpanel.ts';
import type { CfgBlockEntry } from '../admin/ui/overlay/scanner.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const SITE = {
  site: { title: { zh: '站名', en: 'Site' } },
  profile: {
    name: { zh: '张三', en: 'Zhang' },
    tagline: { zh: '简介', en: '' },
    avatar: 'assets/me.png',
    avatar_position: 'top',
    links: [{ label: 'Email', url: 'mailto:a@b.c' }],
  },
  github: {
    username: 'zhangsan',
    show_contributions: true,
    pinned: [{ repo: 'o/r1' }, { repo: 'o/r2' }],
  },
  rss: { enabled: true, block_title: { zh: '动态', en: '' } },
  streaming_blocks: [{ id: 'welcome', title: { zh: '致辞' }, content_file: 'streaming/welcome.md', autoplay: true, speed: 40 }],
  editorial_blocks: [{ id: 'work', title: { zh: '研究', en: 'Research' }, color: '#7b9aac' }],
};

const RSS = {
  display: 'grouped',
  sources: [{ name: '博客', url: 'https://e.com/f.xml', mode: 'latest' }],
};

function makeDeps(overrides: Partial<CfgPanelDeps> = {}) {
  return {
    t,
    loadSite: vi.fn(async () => structuredClone(SITE)),
    saveSite: vi.fn(async () => ({})),
    loadRss: vi.fn(async () => structuredClone(RSS)),
    saveRss: vi.fn(async () => ({})),
    loadAssets: vi.fn(async () => ['assets/me.png', 'assets/other.jpg']),
    adminOrigin: 'http://127.0.0.1:4174',
    runSave: vi.fn(async (action: () => Promise<unknown>) => {
      await action();
    }),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function entry(kind: CfgBlockEntry['kind'], id?: string): CfgBlockEntry {
  const el = document.createElement('section');
  document.body.append(el);
  return { el, kind, id };
}

function saveBtn(body: HTMLElement): HTMLButtonElement {
  return body.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('cfgpanel：profile 表单', () => {
  it('初值来自配置（双语名/头像下拉/头像位置/链接）；保存写回 site 全量', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('profile'), deps);

    const inputs = Array.from(body.querySelectorAll<HTMLInputElement>('.localized input'));
    expect(inputs[0].value).toBe('张三'); // 名字（中文）
    expect(inputs[1].value).toBe('Zhang'); // 名字（英文）
    const selects = Array.from(body.querySelectorAll('select'));
    const avatarSel = selects[0]; // 头像素材下拉
    expect(avatarSel.value).toBe('assets/me.png');
    expect(Array.from(avatarSel.options).map((o) => o.value)).toContain('assets/other.jpg');
    expect(selects[1].value).toBe('top'); // 头像位置
    // 社交链接行（listEditor 的行内输入框）
    const linkInputs = Array.from(body.querySelectorAll<HTMLInputElement>('.list-row input'));
    expect(linkInputs.map((i) => i.value)).toEqual(['Email', 'mailto:a@b.c']);

    inputs[0].value = '李四';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    saveBtn(body).click();
    await tick();
    expect(deps.runSave).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(deps.saveSite).mock.calls[0][0] as typeof SITE;
    expect((saved.profile.name as Record<string, string>).zh).toBe('李四');
    expect((saved.profile.name as Record<string, string>).en).toBe('Zhang');
  });
});

describe('cfgpanel：github 表单', () => {
  it('username/show_contributions/pinned 列表（增删 + 上移下移按钮）', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('github'), deps);

    const username = body.querySelector<HTMLInputElement>('.form-grid input')!;
    expect(username.value).toBe('zhangsan');
    const rows = body.querySelectorAll('.list-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector<HTMLInputElement>('input')!.value).toBe('o/r1');
    // 每行都有上移/下移/删除操作
    expect(rows[0].querySelectorAll('.list-ops button')).toHaveLength(3);

    username.value = 'lisi';
    username.dispatchEvent(new Event('input', { bubbles: true }));
    saveBtn(body).click();
    await tick();
    const saved = vi.mocked(deps.saveSite).mock.calls[0][0] as typeof SITE;
    expect(saved.github.username).toBe('lisi');
  });
});

describe('cfgpanel：rss 表单', () => {
  it('enabled/block_title + sources 列表；保存同时写 site 与 rss', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('rss'), deps);

    // 订阅源行（source-card 第一个输入框为源名称）
    expect(body.querySelector<HTMLInputElement>('.source-card input')!.value).toBe('博客');
    expect(deps.loadSite).toHaveBeenCalledTimes(1);
    expect(deps.loadRss).toHaveBeenCalledTimes(1);
    saveBtn(body).click();
    await tick();
    expect(deps.saveSite).toHaveBeenCalledTimes(1);
    expect(deps.saveRss).toHaveBeenCalledTimes(1);
  });
});

describe('cfgpanel：streaming / editorial 表单', () => {
  it('streaming：按 id 命中定义，字段初值正确；id 未命中显示提示', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('streaming', 'welcome'), deps);
    const idInput = body.querySelector<HTMLInputElement>('.source-card input')!;
    expect(idInput.value).toBe('welcome');

    idInput.value = 'news';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    saveBtn(body).click();
    await tick();
    const saved = vi.mocked(deps.saveSite).mock.calls[0][0] as typeof SITE;
    expect(saved.streaming_blocks[0].id).toBe('news');

    const body2 = document.createElement('div');
    await renderCfgBlockForm(body2, entry('streaming', 'nope'), makeDeps());
    expect(body2.textContent).toContain(t('cfgBlockMissing'));
    expect(body2.querySelector('.oh-inspector-ops')).toBeNull();
  });

  it('streaming：「编辑内容」按钮按区块 id 回调（M12g）；未注入回调不出按钮', async () => {
    const onEditStreamContent = vi.fn();
    const deps = makeDeps({ onEditStreamContent });
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('streaming', 'welcome'), deps);
    const btn = Array.from(body.querySelectorAll('button')).find(
      (b) => b.textContent === t('streamEditContent')
    ) as HTMLButtonElement | undefined;
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onEditStreamContent).toHaveBeenCalledWith('welcome');

    const body2 = document.createElement('div');
    await renderCfgBlockForm(body2, entry('streaming', 'welcome'), makeDeps());
    expect(
      Array.from(body2.querySelectorAll('button')).find(
        (b) => b.textContent === t('streamEditContent')
      )
    ).toBeUndefined();
  });

  it('editorial：主字段 + 「在后台编辑」深链（组件列表不内嵌）', async () => {
    const deps = makeDeps();
    const body = document.createElement('div');
    await renderCfgBlockForm(body, entry('editorial', 'work'), deps);
    const idInput = body.querySelector<HTMLInputElement>('.source-card input')!;
    expect(idInput.value).toBe('work');
    const link = body.querySelector<HTMLAnchorElement>('a.oh-admin-link')!;
    expect(link.href).toContain('#/config/editorial');
    expect(link.target).toBe('_blank');
  });
});
