/**
 * 块级编辑 API（M12a，admin/server/blocks.ts + http.ts 路由）测试：
 * GET /api/page/blocks（坐标 + hash）、POST /api/page/block（replace/insert/delete/move、
 * hash 冲突 409、路径越权/非法 op/非法 markdown 400、move 同容器约束）；
 * 以及 overlay 静态资源（/overlay.js、/overlay.css）与 /api/* 的回环 CORS。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { ensureDataDir } from '../admin/server/setup.ts';
import { createAdminServer } from '../admin/server/http.ts';

let root: string;
let server: Server;
let base: string;

const SITE = ['site:', '  title: 测试站', 'profile:', '  name: 张三', 'github:', '  username: zhangsan', ''].join('\n');
const RSS = 'display: grouped\nsources:\n  - name: 博客\n    url: https://e.com/f.xml\n    mode: latest\n';
const BODY = [
  '# 欢迎',
  '',
  '第一段。',
  '',
  '::::grid{cols=2}',
  ':::cell',
  '左栏',
  ':::',
  ':::cell',
  '右栏',
  ':::',
  '::::',
  '',
  '::stream{id="welcome"}',
  '',
].join('\n');
const INDEX = `---\ntitle: 主页\nnav: true\norder: 0\n---\n${BODY}`;

interface BlockInfo {
  start: number;
  end: number;
  kind: string;
  name?: string;
  parent: string;
  hash: string;
}

function seedExample(dir: string) {
  mkdirSync(path.join(dir, 'data.example/pages/zh'), { recursive: true });
  writeFileSync(path.join(dir, 'data.example/site.yaml'), SITE);
  writeFileSync(path.join(dir, 'data.example/rss.yaml'), RSS);
  writeFileSync(path.join(dir, 'data.example/pages/zh/index.md'), INDEX);
}

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'oh-admin-blocks-'));
  seedExample(root);
  const { dataDir } = ensureDataDir(root);
  server = createAdminServer({ dataDir, initialized: false, appJs: '', overlayJs: '// overlay stub' });
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
    /* 非 JSON */
  }
  return { status: res.status, body, headers: res.headers };
}

function postBlock(payload: Record<string, unknown>) {
  return api('/api/page/block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function getBlocks(): Promise<BlockInfo[]> {
  const r = await api('/api/page/blocks?path=pages/zh/index.md');
  expect(r.status).toBe(200);
  return (r.body as { blocks: BlockInfo[] }).blocks;
}

function pageFile(): string {
  return readFileSync(path.join(root, 'data/pages/zh/index.md'), 'utf8');
}

/** 每用例后还原初始页面（写盘不校验，直接覆盖） */
function resetPage() {
  writeFileSync(path.join(root, 'data/pages/zh/index.md'), INDEX, 'utf8');
}
afterEach(resetPage);

describe('GET /api/page/blocks', () => {
  it('返回块坐标/kind/name/parent/hash（grid 内部块递归，hash = 切片 sha1）', async () => {
    const blocks = await getBlocks();
    expect(blocks.map((b) => `${b.kind}${b.name ? `:${b.name}` : ''}`)).toEqual([
      'heading',
      'paragraph',
      'containerDirective:grid',
      'containerDirective:cell',
      'paragraph',
      'containerDirective:cell',
      'paragraph',
      'leafDirective:stream',
    ]);
    // hash 与正文切片一致
    expect(blocks[1].hash).toBe(createHash('sha1').update('第一段。').digest('hex'));
    // markdown 字段为块原文切片（M12b：overlay 微编辑器初值）
    expect(blocks[0].markdown).toBe('# 欢迎');
    expect(blocks[1].markdown).toBe('第一段。');
    expect(blocks[4].markdown).toBe('左栏');
    // grid 内部块 parent 指向父块坐标
    expect(blocks[3].parent).toBe(`${blocks[2].start}:${blocks[2].end}`);
    expect(blocks[4].parent).toBe(`${blocks[3].start}:${blocks[3].end}`);
    expect(blocks.every((b) => /^[0-9a-f]{40}$/.test(b.hash))).toBe(true);
  });

  it('越权/非法路径一律 400', async () => {
    expect((await api('/api/page/blocks?path=../site.yaml')).status).toBe(400);
    expect((await api('/api/page/blocks?path=site.yaml')).status).toBe(400);
    expect((await api('/api/page/blocks?path=pages/zh/../../site.yaml')).status).toBe(400);
    expect((await api('/api/page/blocks?path=pages/zh/nope.md')).status).toBe(400); // 不存在
  });
});

describe('POST /api/page/block', () => {
  it('replace：整块替换并落盘（frontmatter 原样保留），返回新块列表', async () => {
    const blocks = await getBlocks();
    const para = blocks[1];
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'replace',
      start: para.start,
      end: para.end,
      hash: para.hash,
      markdown: '**新**段落。',
    });
    expect(r.status).toBe(200);
    const text = pageFile();
    expect(text).toContain('**新**段落。');
    expect(text.startsWith('---\ntitle: 主页\nnav: true\norder: 0\n---\n')).toBe(true);
    expect(text).not.toContain('第一段。');
    // 写前快照已留版
    expect(existsSync(path.join(root, 'data/.snapshots/pages/zh/index.md'))).toBe(true);
    // 响应带最新块列表
    const next = (r.body as { blocks: BlockInfo[] }).blocks;
    expect(next).toHaveLength(blocks.length);
    expect(next[1].hash).toBe(createHash('sha1').update('**新**段落。').digest('hex'));
  });

  it('hash 不一致 → 409 且不落盘', async () => {
    const before = pageFile();
    const blocks = await getBlocks();
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'replace',
      start: blocks[1].start,
      end: blocks[1].end,
      hash: 'deadbeef',
      markdown: 'x',
    });
    expect(r.status).toBe(409);
    expect(pageFile()).toBe(before);
  });

  it('insert：锚块之后插入（hash 校验），自动补空行', async () => {
    const blocks = await getBlocks();
    const para = blocks[1];
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'insert',
      start: para.start,
      end: para.end,
      hash: para.hash,
      markdown: '插入段。',
    });
    expect(r.status).toBe(200);
    const text = pageFile();
    expect(text).toContain('第一段。\n\n插入段。\n\n::::grid');
  });

  it('insert：零宽边界插入（文首，免 hash）', async () => {
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'insert',
      start: 0,
      end: 0,
      hash: '',
      markdown: '卷首语。',
    });
    expect(r.status).toBe(200);
    expect(pageFile()).toContain('---\n卷首语。\n\n# 欢迎');
  });

  it('delete：删除块并收走相邻空行', async () => {
    const blocks = await getBlocks();
    const para = blocks[1];
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'delete',
      start: para.start,
      end: para.end,
      hash: para.hash,
    });
    expect(r.status).toBe(200);
    const text = pageFile();
    expect(text).not.toContain('第一段。');
    expect(text).toContain('# 欢迎\n\n::::grid');
  });

  it('move：顶层块移动（传原始块 end 作为 to 亦可）', async () => {
    const blocks = await getBlocks();
    const heading = blocks[0];
    const para = blocks[1];
    // 标题移到「第一段。」之后（to 取锚块的原始 end，服务端归一化为行边界）
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'move',
      start: heading.start,
      end: heading.end,
      hash: heading.hash,
      to: para.end,
    });
    expect(r.status).toBe(200);
    const text = pageFile();
    expect(text.indexOf('第一段。')).toBeLessThan(text.indexOf('# 欢迎'));
  });

  it('move：跨容器移动被拒（cell 内块移到 root 边界 → 400）', async () => {
    const before = pageFile();
    const blocks = await getBlocks();
    const left = blocks[4]; // cell 内「左栏」
    const r = await postBlock({
      path: 'pages/zh/index.md',
      op: 'move',
      start: left.start,
      end: left.end,
      hash: left.hash,
      to: 0,
    });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/同一父容器/);
    expect(pageFile()).toBe(before);
  });

  it('非法 op / 缺 markdown / 多块 markdown / 坏坐标 → 400 且不落盘', async () => {
    const before = pageFile();
    const blocks = await getBlocks();
    const para = blocks[1];
    const basePayload = { path: 'pages/zh/index.md', start: para.start, end: para.end, hash: para.hash };

    expect((await postBlock({ ...basePayload, op: 'frobnicate' })).status).toBe(400);
    expect((await postBlock({ ...basePayload, op: 'replace' })).status).toBe(400); // 缺 markdown
    expect((await postBlock({ ...basePayload, op: 'replace', markdown: '甲\n\n乙' })).status).toBe(400); // 两个块
    expect((await postBlock({ ...basePayload, op: 'replace', markdown: '   ' })).status).toBe(400); // 空内容
    expect((await postBlock({ ...basePayload, op: 'delete', start: 3, end: 5 })).status).toBe(400); // 非块坐标
    expect(pageFile()).toBe(before);
  });

  it('路径越权 → 400', async () => {
    const r = await postBlock({ path: 'pages/../../site.yaml', op: 'delete', start: 0, end: 1, hash: 'x' });
    expect(r.status).toBe(400);
  });
});

describe('overlay 静态资源与 CORS', () => {
  it('GET /overlay.js 返回打包脚本；GET /overlay.css 返回样式', async () => {
    const js = await api('/overlay.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.body).toContain('overlay stub');
    const css = await api('/overlay.css');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(css.body).toContain('.oh-topbar');
  });

  it('回环 origin 的 /api/* 响应回显 Access-Control-Allow-Origin，OPTIONS 预检 204', async () => {
    const origin = 'http://127.0.0.1:4321';
    const pre = await fetch(`${base}/api/page/blocks?path=pages/zh/index.md`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
    expect(pre.headers.get('access-control-allow-methods')).toContain('GET');

    const r = await fetch(`${base}/api/pages`, { headers: { Origin: 'http://localhost:4322' } });
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:4322');
  });

  it('非回环 origin 不回显 CORS 头', async () => {
    const r = await fetch(`${base}/api/pages`, { headers: { Origin: 'https://evil.example.com' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
