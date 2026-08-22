import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ensureDataDir } from '../admin/server/setup.ts';
import { createAdminServer } from '../admin/server/http.ts';
import type { Server } from 'node:http';

let root: string;
let server: Server;
let base: string;

const SITE = [
  'site:',
  '  title: 测试站',
  'profile:',
  '  name: 张三',
  'github:',
  '  username: zhangsan',
  '',
].join('\n');
const RSS = 'display: grouped\nsources:\n  - name: 博客\n    url: https://e.com/f.xml\n    mode: latest\n';
const INDEX = '---\ntitle: 主页\nnav: true\norder: 0\n---\n你好\n';

function seedExample(dir: string) {
  mkdirSync(path.join(dir, 'data.example/pages/zh'), { recursive: true });
  writeFileSync(path.join(dir, 'data.example/site.yaml'), SITE);
  writeFileSync(path.join(dir, 'data.example/rss.yaml'), RSS);
  writeFileSync(path.join(dir, 'data.example/pages/zh/index.md'), INDEX);
}

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'oh-admin-api-'));
  seedExample(root);
  const { dataDir, initialized } = ensureDataDir(root);
  expect(initialized).toBe(true);
  server = createAdminServer({ dataDir, initialized, appJs: 'console.log("stub")' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

async function api(p: string, init?: RequestInit) {
  const res = await fetch(base + p, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* 非 JSON（二进制/静态） */
  }
  return { status: res.status, body, headers: res.headers };
}

describe('静态与基本信息', () => {
  it('GET / 返回 SPA 页面，/app.js 返回打包脚本', async () => {
    const html = await api('/');
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    const js = await api('/app.js');
    expect(js.status).toBe(200);
    expect(js.body).toContain('stub');
  });

  it('GET /api/info 报告从示例初始化', async () => {
    const r = await api('/api/info');
    expect(r.status).toBe(200);
    expect((r.body as { initialized: boolean }).initialized).toBe(true);
  });
});

describe('页面 API', () => {
  it('GET /api/pages 分组列出；GET /api/page 读出内容', async () => {
    const list = await api('/api/pages');
    expect(list.status).toBe(200);
    const pages = (list.body as { pages: { lang: string; file: string }[] }).pages;
    expect(pages.some((p) => p.lang === 'zh' && p.file === 'index.md')).toBe(true);

    const one = await api('/api/page?lang=zh&file=index.md');
    expect((one.body as { frontmatter: { title: string } }).frontmatter.title).toBe('主页');
  });

  it('PUT /api/page 写盘并自动快照；缺 title 拒绝且文件不变', async () => {
    const ok = await api('/api/page', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'zh', file: 'index.md', frontmatter: { title: '主页2' }, body: '新内容\n' }),
    });
    expect(ok.status).toBe(200);
    expect(readFileSync(path.join(root, 'data/pages/zh/index.md'), 'utf8')).toContain('主页2');
    expect(existsSync(path.join(root, 'data/.snapshots/pages/zh/index.md'))).toBe(true);

    const bad = await api('/api/page', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'zh', file: 'index.md', frontmatter: {}, body: 'x' }),
    });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: string }).error).toMatch(/title/);
    expect(readFileSync(path.join(root, 'data/pages/zh/index.md'), 'utf8')).toContain('主页2');
  });

  it('路径穿越一律 400', async () => {
    const evil = await api('/api/page?lang=..&file=..%2fsite.yaml');
    expect(evil.status).toBe(400);
    const evil2 = await api('/api/snapshots?path=../../etc/passwd');
    expect(evil2.status).toBe(400);
  });

  it('POST /api/page/create 新建；/rename 重命名；/delete 删除（留快照）', async () => {
    const created = await api('/api/page/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'zh', title: 'My Notes' }),
    });
    expect(created.status).toBe(200);
    expect((created.body as { file: string }).file).toBe('my-notes.md');

    const renamed = await api('/api/page/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'zh', file: 'my-notes.md', newFile: 'notes.md' }),
    });
    expect(renamed.status).toBe(200);

    const deleted = await api('/api/page/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'zh', file: 'notes.md' }),
    });
    expect(deleted.status).toBe(200);
    expect(existsSync(path.join(root, 'data/pages/zh/notes.md'))).toBe(false);
    const snaps = await api('/api/snapshots?path=pages/zh/notes.md');
    expect((snaps.body as { snapshots: unknown[] }).snapshots.length).toBeGreaterThan(0);
  });
});

describe('配置 API', () => {
  it('GET/PUT /api/config/site；非法 schema 400 且不落盘', async () => {
    const got = await api('/api/config/site');
    expect((got.body as { data: { site: { title: string } } }).data.site.title).toBe('测试站');
    const data = (got.body as { data: Record<string, unknown> }).data;
    data.theme = { accent: '#123456' };
    const put = await api('/api/config/site', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    expect(put.status).toBe(200);

    data.github = {};
    const bad = await api('/api/config/site', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    expect(bad.status).toBe(400);
    expect(readFileSync(path.join(root, 'data/site.yaml'), 'utf8')).toContain('#123456');
  });

  it('GET/PUT /api/config/rss；mode 非法 400', async () => {
    const got = await api('/api/config/rss');
    const data = (got.body as { data: { sources: { mode: string }[] } }).data;
    data.sources[0].mode = 'bad';
    const bad = await api('/api/config/rss', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    expect(bad.status).toBe(400);
    data.sources[0].mode = 'curated';
    const ok = await api('/api/config/rss', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    expect(ok.status).toBe(200);
  });
});

describe('素材 API', () => {
  it('上传（原始二进制）→ 列表 → 读取 → 删除', async () => {
    const up = await fetch(base + '/api/asset?name=clip.png', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from([137, 80, 78, 71]),
    });
    expect(up.status).toBe(200);
    const { name } = (await up.json()) as { name: string };
    expect(name).toBe('clip.png');

    const list = await api('/api/assets');
    expect((list.body as { assets: { name: string }[] }).assets.map((a) => a.name)).toContain('clip.png');

    const file = await fetch(base + '/api/asset/file?name=clip.png');
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));

    const del = await api('/api/asset/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'clip.png' }),
    });
    expect(del.status).toBe(200);
  });

  it('exe 上传被拒；穿越文件名被拒', async () => {
    const bad = await fetch(base + '/api/asset?name=evil.exe', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('x'),
    });
    expect(bad.status).toBe(400);
    const evil = await fetch(base + '/api/asset?' + new URLSearchParams({ name: '../x.png' }), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('x'),
    });
    expect(evil.status).toBe(400);
  });
});

describe('快照回滚与 dev 探测', () => {
  it('POST /api/snapshot/restore 回滚页面内容', async () => {
    const snaps = await api('/api/snapshots?path=pages/zh/index.md');
    const ts = (snaps.body as { snapshots: { ts: string }[] }).snapshots.at(-1)!.ts;
    const r = await api('/api/snapshot/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'pages/zh/index.md', ts }),
    });
    expect(r.status).toBe(200);
    expect(readFileSync(path.join(root, 'data/pages/zh/index.md'), 'utf8')).toContain('你好');
  });

  it('GET /api/dev-status 返回 {up:boolean}', async () => {
    const r = await api('/api/dev-status');
    expect(r.status).toBe(200);
    expect(typeof (r.body as { up: boolean }).up).toBe('boolean');
  });

  it('未知 API 返回 404', async () => {
    const r = await api('/api/nope');
    expect(r.status).toBe(404);
  });
});
