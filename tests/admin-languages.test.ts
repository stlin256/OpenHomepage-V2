/**
 * 语言管理面板（spec 19 §4）测试：
 * 纯逻辑（admin/server/languages.ts）：状态列表、归档/恢复往返、默认语言锁定、
 * en 警告标记、<2 语言二次确认、目标冲突、快照产生、LocalizedText 键保留；
 * HTTP 端点状态码（400/409）；导出 zip 与 doctor 对 .archived_langs/ 的包含/排除策略。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  ARCHIVE_ROOT,
  LangConflictError,
  listLanguageState,
  archiveLanguage,
  restoreLanguage,
} from '../admin/server/languages.ts';
import { collectDataEntries } from '../admin/server/export.ts';
import { listLangDirs } from '../scripts/doctor-lib.ts';
import { createAdminServer } from '../admin/server/http.ts';

const SITE_YAML = [
  'site:',
  '  language: zh-CN',
  '  title: { zh: 站, en: Site, ja: サイト, fr: Site }',
  'profile:',
  '  name: { zh: 张三, en: San Zhang, ja: 张三, fr: San Zhang }',
  'github: { username: zhangsan }',
  '',
].join('\n');

/** 造一个含 pages/<lang>/index.md 与 streaming/<lang>/welcome.md 的临时 data/ */
function makeDataDir(langs: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-langs-'));
  writeFileSync(path.join(dir, 'site.yaml'), SITE_YAML);
  for (const lang of langs) {
    mkdirSync(path.join(dir, 'pages', lang), { recursive: true });
    writeFileSync(
      path.join(dir, 'pages', lang, 'index.md'),
      `---\ntitle: Home ${lang}\n---\nhi ${lang}\n`
    );
    mkdirSync(path.join(dir, 'streaming', lang), { recursive: true });
    writeFileSync(path.join(dir, 'streaming', lang, 'welcome.md'), `stream ${lang}\n`);
  }
  return dir;
}

function withTempData(langs: string[], fn: (dir: string) => void) {
  const dir = makeDataDir(langs);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('listLanguageState', () => {
  it('返回启用/归档语言列表、默认语言（归一化）、en 标记与语言数', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      const s = listLanguageState(dir);
      expect(s.languages).toEqual([
        { lang: 'en', pages: 1 },
        { lang: 'ja', pages: 1 },
        { lang: 'zh', pages: 1 },
      ]);
      expect(s.archived).toEqual([]);
      expect(s.defaultLang).toBe('zh'); // site.language: zh-CN 归一化
      expect(s.hasEn).toBe(true);
      expect(s.total).toBe(3);
    });
  });

  it('site.yaml 缺失时 defaultLang 为 null，不阻断列表', () => {
    withTempData(['zh', 'en'], (dir) => {
      rmSync(path.join(dir, 'site.yaml'));
      const s = listLanguageState(dir);
      expect(s.defaultLang).toBeNull();
      expect(s.total).toBe(2);
    });
  });
});

describe('archiveLanguage / restoreLanguage 往返', () => {
  it('归档后 pages/ 与 streaming/ 目录移入 .archived_langs/，恢复后原位还原且内容不变', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      archiveLanguage(dir, 'ja');
      expect(existsSync(path.join(dir, 'pages', 'ja'))).toBe(false);
      expect(existsSync(path.join(dir, 'streaming', 'ja'))).toBe(false);
      expect(
        readFileSync(path.join(dir, ARCHIVE_ROOT, 'pages', 'ja', 'index.md'), 'utf8')
      ).toContain('hi ja');
      expect(
        readFileSync(path.join(dir, ARCHIVE_ROOT, 'streaming', 'ja', 'welcome.md'), 'utf8')
      ).toBe('stream ja\n');
      const s = listLanguageState(dir);
      expect(s.total).toBe(2);
      expect(s.archived).toEqual([{ lang: 'ja', pages: 1 }]);

      const r = restoreLanguage(dir, 'ja');
      expect(r.ok).toBe(true);
      expect(readFileSync(path.join(dir, 'pages', 'ja', 'index.md'), 'utf8')).toContain('hi ja');
      expect(existsSync(path.join(dir, 'streaming', 'ja', 'welcome.md'))).toBe(true);
      expect(existsSync(path.join(dir, ARCHIVE_ROOT, 'pages', 'ja'))).toBe(false);
      expect(listLanguageState(dir).total).toBe(3);
    });
  });

  it('无 streaming 语言目录时归档/恢复同样可用', () => {
    withTempData(['zh', 'en', 'fr'], (dir) => {
      rmSync(path.join(dir, 'streaming', 'fr'), { recursive: true, force: true });
      archiveLanguage(dir, 'fr');
      restoreLanguage(dir, 'fr');
      expect(existsSync(path.join(dir, 'pages', 'fr', 'index.md'))).toBe(true);
    });
  });

  it('归档前对涉及文件产生快照（pages 与 streaming 子树各一份）', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      archiveLanguage(dir, 'ja');
      const snapPages = path.join(dir, '.snapshots', 'pages', 'ja', 'index.md');
      const snapStream = path.join(dir, '.snapshots', 'streaming', 'ja', 'welcome.md');
      expect(existsSync(snapPages)).toBe(true);
      expect(existsSync(snapStream)).toBe(true);
      expect(readdirSync(snapPages).length).toBe(1);
      expect(readdirSync(snapStream).length).toBe(1);
    });
  });

  it('site.yaml 的 LocalizedText 键保留不删（归档+恢复往返后逐字节不变）', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      const before = readFileSync(path.join(dir, 'site.yaml'), 'utf8');
      archiveLanguage(dir, 'ja');
      expect(readFileSync(path.join(dir, 'site.yaml'), 'utf8')).toBe(before);
      restoreLanguage(dir, 'ja');
      expect(readFileSync(path.join(dir, 'site.yaml'), 'utf8')).toBe(before);
      expect(before).toContain('ja');
    });
  });
});

describe('风险约束', () => {
  it('默认语言锁定：归档默认语言抛错（HTTP 层映射 400）', () => {
    withTempData(['zh', 'en'], (dir) => {
      expect(() => archiveLanguage(dir, 'zh')).toThrow(/不能停用默认语言 zh/);
      expect(existsSync(path.join(dir, 'pages', 'zh'))).toBe(true); // 未动盘
    });
  });

  it('归档 en：成功但响应带 en-fallback 警告标记（回退链固定一环）', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      const r = archiveLanguage(dir, 'en');
      expect(r.warnings).toContain('en-fallback');
      expect(r.warnings).not.toContain('i18n-off');
    });
  });

  it('归档后剩余 <2 语言：无 confirm 抛 LangConflictError（409）；带 confirm 通过并带 i18n-off 标记', () => {
    withTempData(['zh', 'en'], (dir) => {
      expect(() => archiveLanguage(dir, 'en')).toThrow(LangConflictError);
      expect(existsSync(path.join(dir, 'pages', 'en'))).toBe(true); // 未动盘
      const r = archiveLanguage(dir, 'en', true);
      expect(r.warnings).toContain('en-fallback');
      expect(r.warnings).toContain('i18n-off');
      expect(listLanguageState(dir).total).toBe(1);
    });
  });

  it('归档目标已存在（残留旧归档）→ LangConflictError，不覆盖', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      mkdirSync(path.join(dir, ARCHIVE_ROOT, 'pages', 'ja'), { recursive: true });
      writeFileSync(path.join(dir, ARCHIVE_ROOT, 'pages', 'ja', 'old.md'), 'old');
      expect(() => archiveLanguage(dir, 'ja')).toThrow(LangConflictError);
      // 两边原样
      expect(existsSync(path.join(dir, 'pages', 'ja', 'index.md'))).toBe(true);
      expect(readFileSync(path.join(dir, ARCHIVE_ROOT, 'pages', 'ja', 'old.md'), 'utf8')).toBe('old');
    });
  });

  it('恢复目标已存在 → LangConflictError；归档不存在 → 400 语义错误', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      expect(() => restoreLanguage(dir, 'fr')).toThrow(/归档不存在/);
      archiveLanguage(dir, 'ja');
      mkdirSync(path.join(dir, 'pages', 'ja'), { recursive: true }); // 模拟恢复目标被重建
      expect(() => restoreLanguage(dir, 'ja')).toThrow(LangConflictError);
    });
  });

  it('非法语言码拒绝', () => {
    withTempData(['zh', 'en'], (dir) => {
      expect(() => archiveLanguage(dir, '../etc')).toThrow(/非法的语言目录/);
      expect(() => restoreLanguage(dir, '')).toThrow(/非法的语言目录/);
    });
  });
});

describe('扫描点策略（spec §4 风险④⑤）', () => {
  it('导出 data.zip 包含 .archived_langs/（整包迁移后可恢复）', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      archiveLanguage(dir, 'ja');
      const names = collectDataEntries(dir).map((e) => e.name);
      expect(names).toContain(`${ARCHIVE_ROOT}/pages/ja/index.md`);
      expect(names).toContain(`${ARCHIVE_ROOT}/streaming/ja/welcome.md`);
      expect(names).not.toContain('pages/ja/index.md');
    });
  });

  it('doctor 语言扫描只看活跃 pages/（归档目录不计入）', () => {
    withTempData(['zh', 'en', 'ja'], (dir) => {
      expect(listLangDirs(dir)).toEqual(['en', 'ja', 'zh']);
      archiveLanguage(dir, 'ja');
      expect(listLangDirs(dir)).toEqual(['en', 'zh']);
    });
  });
});

// ---- HTTP 端点 ----

describe('HTTP /api/languages*', () => {
  let root: string;
  let server: Server;
  let base: string;

  async function api(p: string, init?: RequestInit) {
    const res = await fetch(base + p, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  const post = (p: string, body: unknown) =>
    api(p, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    root = makeDataDir(['zh', 'en', 'ja', 'fr']);
    server = createAdminServer({ dataDir: root, initialized: false, appJs: '' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /api/languages 返回完整状态', async () => {
    const r = await api('/api/languages');
    expect(r.status).toBe(200);
    expect(r.body.defaultLang).toBe('zh');
    expect(r.body.hasEn).toBe(true);
    expect(r.body.total).toBe(4);
    expect((r.body.languages as { lang: string }[]).map((l) => l.lang)).toEqual([
      'en',
      'fr',
      'ja',
      'zh',
    ]);
  });

  it('归档默认语言 → 400', async () => {
    const r = await post('/api/languages/archive', { lang: 'zh' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain('不能停用默认语言');
  });

  it('归档 en → 200 且 warnings 含 en-fallback；随后 GET 反映 en 已归档', async () => {
    const r = await post('/api/languages/archive', { lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.warnings).toContain('en-fallback');
    const s = await api('/api/languages');
    expect(s.body.hasEn).toBe(false);
    expect((s.body.archived as { lang: string }[]).map((l) => l.lang)).toEqual(['en']);
  });

  it('归档目标已存在（残留旧归档 + 页面目录重建）→ 409，不覆盖', async () => {
    // en 当前已归档（上一用例）；手动重建 pages/en 后再次归档 en → 目标已存在 409
    mkdirSync(path.join(root, 'pages', 'en'), { recursive: true });
    writeFileSync(path.join(root, 'pages', 'en', 'index.md'), '---\ntitle: Home en\n---\nhi en\n');
    const dup = await post('/api/languages/archive', { lang: 'en' });
    expect(dup.status).toBe(409);
    expect(String(dup.body.error)).toContain('目标已存在');
    // 清理：移除重建目录并恢复 en，供后续用例
    rmSync(path.join(root, 'pages', 'en'), { recursive: true, force: true });
    expect((await post('/api/languages/restore', { lang: 'en' })).status).toBe(200);
  });

  it('归档到只剩 1 种语言：无 confirm → 409；confirm:true → 200 且带 i18n-off', async () => {
    // zh 为默认语言锁定；先归档 ja、fr，剩 zh/en
    expect((await post('/api/languages/archive', { lang: 'ja' })).status).toBe(200);
    expect((await post('/api/languages/archive', { lang: 'fr' })).status).toBe(200);
    const noConfirm = await post('/api/languages/archive', { lang: 'en' });
    expect(noConfirm.status).toBe(409);
    const confirmed = await post('/api/languages/archive', { lang: 'en', confirm: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.warnings).toContain('i18n-off');
    const s = await api('/api/languages');
    expect(s.body.total).toBe(1);
  });

  it('恢复不存在的归档 → 400；恢复目标已存在 → 409', async () => {
    const missing = await post('/api/languages/restore', { lang: 'de' });
    expect(missing.status).toBe(400);
    // fr 已归档；手动重建 pages/fr 模拟恢复目标被占用
    mkdirSync(path.join(root, 'pages', 'fr'), { recursive: true });
    const conflict = await post('/api/languages/restore', { lang: 'fr' });
    expect(conflict.status).toBe(409);
    rmSync(path.join(root, 'pages', 'fr'), { recursive: true, force: true });
    expect((await post('/api/languages/restore', { lang: 'fr' })).status).toBe(200);
  });
});
