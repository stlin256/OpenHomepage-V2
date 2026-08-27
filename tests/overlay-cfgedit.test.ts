/**
 * 配置字段就地改字（M12d）jsdom 测试：
 * - scanner：data-oh-cfg / data-oh-cfg-block 解析与扫描、resolveHitTarget 最内层优先级
 *   （cfg 字段 > markdown 块 > cfg-block 区块）；
 * - cfgedit：点击 → 原位输入框（初值来自 loadValue）、Enter/失焦保存、Esc 取消还原、
 *   多行字段（footer.text）用 textarea 且需 Ctrl+Enter；
 * - main 集成：hover cfg 元素用虚线描边 class（不出块工具条）、点击走 POST /api/config/field。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseOhCfg,
  parseOhCfgBlock,
  scanCfgFields,
  scanCfgBlocks,
  resolveHitTarget,
} from '../admin/ui/overlay/scanner.ts';
import { openCfgEditor } from '../admin/ui/overlay/cfgedit.ts';
import { initOverlay } from '../admin/ui/overlay/main.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('scanner：配置坐标解析（M12d）', () => {
  it('parseOhCfg 解析 <path>@<lang>，拒绝非法格式', () => {
    expect(parseOhCfg('site.title@zh')).toEqual({ path: 'site.title', lang: 'zh' });
    expect(parseOhCfg('streaming_blocks.welcome.title@en')).toEqual({
      path: 'streaming_blocks.welcome.title',
      lang: 'en',
    });
    expect(parseOhCfg('')).toBeNull();
    expect(parseOhCfg('site.title')).toBeNull();
    expect(parseOhCfg('@zh')).toBeNull();
  });

  it('parseOhCfgBlock：profile/github/rss 无 id；streaming/editorial 必须带 id', () => {
    expect(parseOhCfgBlock('profile')).toEqual({ kind: 'profile' });
    expect(parseOhCfgBlock('rss')).toEqual({ kind: 'rss' });
    expect(parseOhCfgBlock('streaming:welcome')).toEqual({ kind: 'streaming', id: 'welcome' });
    expect(parseOhCfgBlock('editorial:work')).toEqual({ kind: 'editorial', id: 'work' });
    expect(parseOhCfgBlock('streaming')).toBeNull();
    expect(parseOhCfgBlock('profile:x')).toBeNull();
    expect(parseOhCfgBlock('nope')).toBeNull();
    expect(parseOhCfgBlock('')).toBeNull();
  });

  it('scanCfgFields / scanCfgBlocks 按文档序收集合法坐标，非法跳过', () => {
    document.body.innerHTML = [
      '<h1 data-oh-cfg="profile.name@zh">名</h1>',
      '<p data-oh-cfg="坏值">x</p>',
      '<section data-oh-cfg-block="profile"></section>',
      '<section data-oh-cfg-block="bogus"></section>',
      '<section data-oh-cfg-block="editorial:work"></section>',
    ].join('');
    const fields = scanCfgFields(document.body);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ path: 'profile.name', lang: 'zh' });
    const blocks = scanCfgBlocks(document.body);
    expect(blocks.map((b) => b.kind)).toEqual(['profile', 'editorial']);
    expect(blocks[1].id).toBe('work');
  });

  it('resolveHitTarget：最内层命中优先（cfg > src > cfgblock）', () => {
    document.body.innerHTML = [
      '<section data-oh-cfg-block="profile">',
      '<h1 data-oh-cfg="profile.name@zh"><span id="in-cfg">名</span></h1>',
      '<div data-oh-src="pages/zh/index.md:0,5"><span id="in-src">块</span></div>',
      '<span id="in-block">区</span>',
      '</section>',
      '<p id="outside">无</p>',
    ].join('');
    expect(resolveHitTarget(document.querySelector('#in-cfg')!)).toMatchObject({ type: 'cfg' });
    expect(resolveHitTarget(document.querySelector('#in-src')!)).toMatchObject({ type: 'src' });
    expect(resolveHitTarget(document.querySelector('#in-block')!)).toMatchObject({ type: 'cfgblock' });
    expect(resolveHitTarget(document.querySelector('#outside')!)).toBeNull();
  });
});

describe('cfgedit：就地改字', () => {
  function makeEntry(path: string, text = '旧值') {
    document.body.innerHTML = '';
    const el = document.createElement('h1');
    el.setAttribute('data-oh-cfg', path);
    el.textContent = text;
    document.body.append(el);
    return { el, path, lang: 'zh' };
  }

  it('打开：元素隐藏、input 占位在原位置、初值来自 loadValue（而非 textContent）', async () => {
    const entry = makeEntry('site.title', '渲染值');
    const session = await openCfgEditor(entry, {
      t,
      loadValue: async () => '存储值',
      onSave: vi.fn(),
    });
    const input = session.root.querySelector('input')!;
    expect(input).toBeTruthy();
    expect(input.value).toBe('存储值');
    expect(session.root.parentElement).toBe(document.body);
    expect(session.root.nextSibling).toBe(entry.el);
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(true);
    session.cancel();
    expect(session.root.isConnected).toBe(false);
    expect(entry.el.classList.contains('oh-editing-hidden')).toBe(false);
  });

  it('Enter 保存 → onSave 携带路径/语言/新值；成功后清理', async () => {
    const entry = makeEntry('profile.name');
    const onSave = vi.fn(async () => {});
    const session = await openCfgEditor(entry, { t, loadValue: async () => '张三', onSave });
    const input = session.root.querySelector('input')!;
    input.value = '李四';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(onSave).toHaveBeenCalledWith('profile.name', 'zh', '李四');
    expect(session.root.isConnected).toBe(false);
  });

  it('失焦保存；Esc 取消不保存且还原 DOM（随后 blur 也不再触发保存）', async () => {
    const entry = makeEntry('site.title');
    const onSave = vi.fn(async () => {});
    const session = await openCfgEditor(entry, { t, loadValue: async () => '甲', onSave });
    const input = session.root.querySelector('input')!;
    input.value = '乙';
    input.dispatchEvent(new FocusEvent('blur'));
    await tick();
    expect(onSave).toHaveBeenCalledWith('site.title', 'zh', '乙');

    const entry2 = makeEntry('site.title');
    const onSave2 = vi.fn(async () => {});
    const session2 = await openCfgEditor(entry2, { t, loadValue: async () => '甲', onSave: onSave2 });
    const input2 = session2.root.querySelector('input')!;
    input2.value = '丙';
    input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    input2.dispatchEvent(new FocusEvent('blur'));
    await tick();
    expect(onSave2).not.toHaveBeenCalled();
    expect(session2.root.isConnected).toBe(false);
    expect(entry2.el.classList.contains('oh-editing-hidden')).toBe(false);
  });

  it('多行字段（footer.text）用 textarea：Enter 换行不保存，Ctrl+Enter 保存', async () => {
    const entry = makeEntry('footer.text');
    const onSave = vi.fn(async () => {});
    const session = await openCfgEditor(entry, { t, loadValue: async () => '一行', onSave });
    const input = session.root.querySelector('textarea')!;
    expect(input).toBeTruthy();
    input.value = '第一行\n第二行';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    expect(onSave).toHaveBeenCalledWith('footer.text', 'zh', '第一行\n第二行');
  });

  it('保存失败（校验 400）：编辑框保持打开', async () => {
    const entry = makeEntry('site.title');
    const onSave = vi.fn(async () => {
      throw new Error('配置缺少必需字段');
    });
    const session = await openCfgEditor(entry, { t, loadValue: async () => '甲', onSave });
    await session.save();
    await tick();
    expect(session.root.isConnected).toBe(true);
    session.cancel();
  });
});

describe('main：cfg 集成（hover 描边 / 点击改字 / POST 写回）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('oh-editing');
    sessionStorage.clear();
    localStorage.setItem('oh-admin-lang', 'zh');
    delete (window as unknown as Record<string, unknown>).__OH_ADMIN_ORIGIN__;
    delete (window as unknown as Record<string, unknown>).__OH_PAGE_SOURCE__;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('注册表包含 cfg 字段与区块；hover cfg 元素加虚线描边 class 且不出块工具条', () => {
    document.body.innerHTML = [
      '<section data-oh-cfg-block="profile">',
      '<h1 data-oh-cfg="profile.name@zh">张三</h1>',
      '</section>',
      '<p data-oh-src="pages/zh/index.md:0,5">正文</p>',
    ].join('');
    const { cfgFields, cfgBlocks } = initOverlay(document);
    expect(cfgFields).toHaveLength(1);
    expect(cfgBlocks).toHaveLength(1);
    const h1 = document.querySelector('[data-oh-cfg]')!;
    // hover 提示字段名
    expect((h1 as HTMLElement).title).toContain('profile.name@zh');
    h1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(h1.classList.contains('oh-hover-cfg')).toBe(true);
    expect(h1.classList.contains('oh-hover')).toBe(false);
    expect((document.querySelector('.oh-toolbar') as HTMLElement).hidden).toBe(true);
  });

  it('点击 cfg 元素 → 原位输入框（初值取服务端配置）；Enter → POST /api/config/field', async () => {
    (window as unknown as Record<string, unknown>).__OH_ADMIN_ORIGIN__ = 'http://127.0.0.1:4174';
    (window as unknown as Record<string, unknown>).__OH_PAGE_SOURCE__ = 'pages/zh/index.md';
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (u.includes('/api/config/site')) {
          return { ok: true, json: async () => ({ data: { site: { title: { zh: '中文站名', en: 'Name' } } } }) };
        }
        if (u.includes('/api/config/field')) return { ok: true, json: async () => ({ ok: true }) };
        if (u.includes('/api/pages')) return { ok: true, json: async () => ({ pages: [] }) };
        return { ok: true, json: async () => ({ blocks: [] }) };
      })
    );
    document.body.innerHTML = '<p class="site-title" data-oh-cfg="site.title@zh"><a href="/">中文站名</a></p>';
    initOverlay(document);
    (document.querySelector('[data-oh-cfg]') as HTMLElement).click();
    await tick();
    const input = document.querySelector('.oh-cfgedit input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('中文站名'); // 初值取配置存储值
    input.value = '新站名';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    const post = calls.find((c) => c.url.includes('/api/config/field'));
    expect(post?.body).toEqual({ file: 'site', path: 'site.title', lang: 'zh', value: '新站名' });
  });

  it('点击块内 cfg 字段优先于块编辑（不打开微编辑器）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { streaming_blocks: [{ id: 'welcome', title: '致辞' }] } }),
      }))
    );
    document.body.innerHTML = [
      '<div data-oh-src="pages/zh/index.md:0,30">',
      '<p class="stream-title" data-oh-cfg="streaming_blocks.welcome.title@zh">致辞</p>',
      '</div>',
    ].join('');
    initOverlay(document);
    (document.querySelector('[data-oh-cfg]') as HTMLElement).click();
    await tick();
    // 打开的是 cfg 输入框而非文本块微编辑器
    const input = document.querySelector('.oh-cfgedit input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('致辞');
    expect(document.querySelector('.oh-textedit')).toBeNull();
  });
});
