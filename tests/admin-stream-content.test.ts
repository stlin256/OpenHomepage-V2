/**
 * 流式块内容 API（M12g：admin/server/stream.ts + http.ts 路由）测试：
 * - GET /api/stream-content：id → site.yaml streaming_blocks 的 content_file，沿语言回退链
 *   （请求语言 → en → 默认语言 → 原路径，与渲染端 resolveStreamingFile 同一函数）解析，
 *   返回 {path, markdown}；id 不存在 404、无 content_file 400、content_file 穿越 400、
 *   内容文件缺失 404；
 * - POST /api/stream-content：写回 + 写前快照 + notifyWrite（撤销链：GET /api/history 免 path
 *   命中该文件、undo 可回滚）；空 id / 非字符串 markdown 400；内容文件缺失 404 不落盘；
 * - POST /api/render-markdown：正常渲染 {html}；超 256KB 413；非字符串 400。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAdminServer } from '../admin/server/http.ts';
import { renderMarkdown } from '../src/lib/markdown.ts';

let root: string;
let dataDir: string;
let server: Server;
let base: string;

const SITE = [
  'site:',
  '  title: 测试站',
  '  language: zh-CN',
  'streaming_blocks:',
  '  - id: welcome',
  '    content_file: streaming/welcome.md',
  '  - id: nocfg',
  '  - id: gone',
  '    content_file: streaming/gone.md',
  '  - id: evil',
  '    content_file: ../site.yaml',
  '',
].join('\n');

const ZH_MD = '# 你好\n\n中文内容\n';
const EN_MD = '# Hello\n';

// Shiki 首次调用需初始化高亮器（秒级），预热一次避免 render-markdown 用例超时
beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'oh-admin-stream-'));
  dataDir = path.join(root, 'data');
  mkdirSync(path.join(dataDir, 'streaming/zh'), { recursive: true });
  mkdirSync(path.join(dataDir, 'streaming/en'), { recursive: true });
  writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
  writeFileSync(path.join(dataDir, 'streaming/zh/welcome.md'), ZH_MD);
  writeFileSync(path.join(dataDir, 'streaming/en/welcome.md'), EN_MD);
  server = createAdminServer({ dataDir, initialized: false, appJs: '' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await renderMarkdown('```js\nwarmup\n```');
}, 60000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

async function api(p: string, init?: RequestInit) {
  const res = await fetch(base + p, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const post = (p: string, payload: unknown) =>
  api(p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

describe('GET /api/stream-content', () => {
  it('按默认语言（站点 language）解析内容文件，返回 {path, markdown}', async () => {
    const r = await api('/api/stream-content?id=welcome');
    expect(r.status).toBe(200);
    expect(r.body.path).toBe('streaming/zh/welcome.md');
    expect(r.body.markdown).toBe(ZH_MD);
  });

  it('lang 参数选择对应语言文件；未覆盖语言沿回退链落到 en', async () => {
    const en = await api('/api/stream-content?id=welcome&lang=en');
    expect(en.status).toBe(200);
    expect(en.body.path).toBe('streaming/en/welcome.md');
    // fr 无文件 → 回退链 fr → en（与渲染端 resolveStreamingFile 一致）
    const fr = await api('/api/stream-content?id=welcome&lang=fr');
    expect(fr.status).toBe(200);
    expect(fr.body.path).toBe('streaming/en/welcome.md');
  });

  it('id 不存在 404；无 content_file 400；空 id 400', async () => {
    const nope = await api('/api/stream-content?id=nope');
    expect(nope.status).toBe(404);
    const nocfg = await api('/api/stream-content?id=nocfg');
    expect(nocfg.status).toBe(400);
    const empty = await api('/api/stream-content?id=');
    expect(empty.status).toBe(400);
  });

  it('content_file 穿越（../）400；内容文件缺失 404', async () => {
    const evil = await api('/api/stream-content?id=evil');
    expect(evil.status).toBe(400);
    const gone = await api('/api/stream-content?id=gone');
    expect(gone.status).toBe(404);
  });
});

describe('POST /api/stream-content', () => {
  it('写回内容文件：落盘 + 写前快照 + notifyWrite（撤销链可回滚）', async () => {
    const r = await post('/api/stream-content', { id: 'welcome', markdown: '# 新内容\n' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, path: 'streaming/zh/welcome.md' });
    const abs = path.join(dataDir, 'streaming/zh/welcome.md');
    expect(readFileSync(abs, 'utf8')).toBe('# 新内容\n');
    // 写前快照已留版
    expect(existsSync(path.join(dataDir, '.snapshots/streaming/zh/welcome.md'))).toBe(true);
    // notifyWrite：撤销链目标 = 该文件，可 undo 回写前内容
    const hist = await api('/api/history');
    expect(hist.body).toMatchObject({ path: 'streaming/zh/welcome.md', canUndo: true });
    const undo = await post('/api/history/undo', {});
    expect(undo.body).toMatchObject({ ok: true });
    expect(readFileSync(abs, 'utf8')).toBe(ZH_MD);
  });

  it('按 lang 写到对应语言文件', async () => {
    const r = await post('/api/stream-content', { id: 'welcome', lang: 'en', markdown: '# New\n' });
    expect(r.status).toBe(200);
    expect(r.body.path).toBe('streaming/en/welcome.md');
    expect(readFileSync(path.join(dataDir, 'streaming/en/welcome.md'), 'utf8')).toBe('# New\n');
  });

  it('空 id / 非字符串 markdown 400；id 不存在 404；内容文件缺失 404 不落盘', async () => {
    expect((await post('/api/stream-content', { id: '', markdown: 'x' })).status).toBe(400);
    expect((await post('/api/stream-content', { id: 'welcome' })).status).toBe(400);
    expect((await post('/api/stream-content', { id: 'nope', markdown: 'x' })).status).toBe(404);
    const gone = await post('/api/stream-content', { id: 'gone', markdown: 'x' });
    expect(gone.status).toBe(404);
    expect(existsSync(path.join(dataDir, 'streaming/zh/gone.md'))).toBe(false);
  });
});

describe('POST /api/render-markdown', () => {
  it('正常渲染：站点同一条 markdown 管线（GFM/代码高亮）', async () => {
    const r = await post('/api/render-markdown', { markdown: '# 标题\n\n你好 **世界**\n' });
    expect(r.status).toBe(200);
    const html = String(r.body.html);
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>世界</strong>');
  });

  it('超过 256KB 拒绝（413）；非字符串 400', async () => {
    const big = await post('/api/render-markdown', { markdown: 'x'.repeat(256 * 1024 + 1) });
    expect(big.status).toBe(413);
    const bad = await post('/api/render-markdown', { markdown: 123 });
    expect(bad.status).toBe(400);
  });
});
