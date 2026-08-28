/**
 * 远程媒体本地化测试（src/lib/remote-assets.ts + markdown/prefetch 集成）：
 * 全程注入 mock fetch，不发真实网络请求。覆盖：
 * - URL 后缀/Content-Type 推断、稳定哈希文件名；
 * - 下载落盘 + .cache/remote-assets.json 映射复用（同一 URL 只下载一次）；
 * - 失败保留原 URL 不阻断；data.example/（非 data 目录）跳过下载；
 * - markdown 管线（img / ::figure / ::video poster）与 prefetch RSS 封面的改写。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extFromUrl,
  remoteAssetPath,
  localizeRemoteAsset,
  resetRemoteAssetState,
  type RemoteFetchFn,
} from '../src/lib/remote-assets.ts';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { runPrefetch, type FetchFn, type RssCache } from '../src/lib/prefetch.ts';

const T0 = 1_790_000_000_000;

let dir: string;
let dataDir: string;
let cacheDir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'oh-remote-assets-'));
  dataDir = path.join(dir, 'data');
  cacheDir = path.join(dir, '.cache');
  mkdirSync(dataDir, { recursive: true });
  resetRemoteAssetState();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetRemoteAssetState();
});

function bytesResponse(body: Uint8Array, contentType: string, status = 200): Response {
  return new Response(body.buffer as ArrayBuffer, { status, headers: { 'content-type': contentType } });
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 记录调用次数的 mock fetch：routes 为 url 前缀 → Response */
function mockFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    for (const [prefix, make] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return make();
    }
    throw new Error(`未 mock 的请求：${url}`);
  }) as RemoteFetchFn;
  return { fn, calls };
}

describe('extFromUrl / remoteAssetPath', () => {
  it('白名单后缀小写返回，未知/无后缀返回 null', () => {
    expect(extFromUrl('https://a.test/x/COVER.JPG')).toBe('jpg');
    expect(extFromUrl('https://a.test/x/pic.png?w=100#f')).toBe('png');
    expect(extFromUrl('https://a.test/x/movie.mp4')).toBe('mp4');
    expect(extFromUrl('https://a.test/x/noext')).toBe(null);
    expect(extFromUrl('https://a.test/x/evil.exe')).toBe(null);
    expect(extFromUrl('not a url')).toBe(null);
  });

  it('同 URL 同后缀 → 稳定路径；不同 URL → 不同路径', () => {
    const a = remoteAssetPath('https://a.test/1.jpg', 'jpg');
    expect(a).toBe(remoteAssetPath('https://a.test/1.jpg', 'jpg'));
    expect(a).toMatch(/^assets\/remote\/[0-9a-f]{16}\.jpg$/);
    expect(a).not.toBe(remoteAssetPath('https://a.test/2.jpg', 'jpg'));
  });
});

describe('localizeRemoteAsset', () => {
  it('下载落盘并返回 data/ 相对路径；第二次命中映射不再请求', async () => {
    const url = 'https://img.test/cover.png';
    const { fn, calls } = mockFetch({ 'https://img.test/': () => bytesResponse(PNG, 'image/png') });

    const rel = await localizeRemoteAsset(url, { dataDir, fetchFn: fn, now: () => T0 });
    expect(rel).toMatch(/^assets\/remote\/[0-9a-f]{16}\.png$/);
    expect(readFileSync(path.join(dataDir, rel!))).toEqual(Buffer.from(PNG));

    // 映射文件已持久化
    const map = JSON.parse(readFileSync(path.join(cacheDir, 'remote-assets.json'), 'utf8'));
    expect(map[url]).toEqual({ path: rel, fetched_at: T0 });

    const again = await localizeRemoteAsset(url, { dataDir, fetchFn: fn, now: () => T0 });
    expect(again).toBe(rel);
    expect(calls.filter((u) => u === url)).toHaveLength(1);
  });

  it('URL 无后缀时按 Content-Type 推断扩展名', async () => {
    const { fn } = mockFetch({ 'https://img.test/': () => bytesResponse(PNG, 'image/jpeg') });
    const rel = await localizeRemoteAsset('https://img.test/og-image', { dataDir, fetchFn: fn });
    expect(rel).toMatch(/\.jpg$/);
  });

  it('HTTP 失败 → 返回 null（调用方保留原 URL）并告警，不写文件', async () => {
    const warnings: string[] = [];
    const { fn } = mockFetch({
      'https://img.test/': () => bytesResponse(PNG, 'image/png', 403),
    });
    const rel = await localizeRemoteAsset('https://img.test/blocked.png', {
      dataDir,
      fetchFn: fn,
      warn: (m) => warnings.push(m),
    });
    expect(rel).toBe(null);
    expect(warnings.some((m) => m.includes('blocked.png'))).toBe(true);
    expect(existsSync(path.join(dataDir, 'assets/remote'))).toBe(false);
  });

  it('未知 Content-Type 且无白名单后缀 → null', async () => {
    const { fn } = mockFetch({
      'https://img.test/': () => bytesResponse(PNG, 'application/octet-stream'),
    });
    expect(await localizeRemoteAsset('https://img.test/blob', { dataDir, fetchFn: fn })).toBe(null);
  });

  it('空响应体 → null', async () => {
    const { fn } = mockFetch({
      'https://img.test/': () => bytesResponse(new Uint8Array(), 'image/png'),
    });
    expect(await localizeRemoteAsset('https://img.test/empty.png', { dataDir, fetchFn: fn })).toBe(null);
  });

  it('dataDir 非 data（如 data.example）→ 跳过下载返回 null', async () => {
    const exampleDir = path.join(dir, 'data.example');
    mkdirSync(exampleDir, { recursive: true });
    const warnings: string[] = [];
    const { fn, calls } = mockFetch({ 'https://img.test/': () => bytesResponse(PNG, 'image/png') });
    const rel = await localizeRemoteAsset('https://img.test/cover.png', {
      dataDir: exampleDir,
      fetchFn: fn,
      warn: (m) => warnings.push(m),
    });
    expect(rel).toBe(null);
    expect(calls).toHaveLength(0);
    expect(warnings.some((m) => m.includes('data.example'))).toBe(true);
  });
});

describe('markdown 管线集成', () => {
  // Shiki/KaTeX 首次初始化较慢，先预热（与 tests/stream.test.ts 同一手法）
  beforeEach(async () => {
    await renderMarkdown('```js\nwarmup\n```');
  }, 60000);

  it('img / ::figure / ::video src+poster 的远程 URL 下载并改写为本地路径', async () => {
    const { fn } = mockFetch({
      'https://img.test/a.png': () => bytesResponse(PNG, 'image/png'),
      'https://img.test/b.jpg': () => bytesResponse(PNG, 'image/jpeg'),
      'https://v.test/clip.mp4': () => bytesResponse(PNG, 'video/mp4'),
      'https://v.test/poster.jpg': () => bytesResponse(PNG, 'image/jpeg'),
    });
    const md = [
      '![alt](https://img.test/a.png)',
      '',
      '::figure{src="https://img.test/b.jpg" caption="图"}',
      '',
      '::video{src="https://v.test/clip.mp4" poster="https://v.test/poster.jpg"}',
    ].join('\n');
    const html = await renderMarkdown(md, { baseUrl: '/', localizeAssets: { dataDir, fetchFn: fn } });
    expect(html).not.toContain('https://img.test/');
    expect(html).not.toContain('https://v.test/');
    const locals = [...html.matchAll(/(?:src|poster)="(\/assets\/remote\/[0-9a-f]{16}\.[a-z0-9]+)"/g)];
    expect(locals).toHaveLength(4);
    for (const [, rel] of locals) {
      expect(existsSync(path.join(dataDir, rel.slice(1)))).toBe(true);
    }
  });

  it('下载失败的 URL 保留原样；本地 assets/ 路径不受影响', async () => {
    const warnings: string[] = [];
    const { fn } = mockFetch({
      'https://img.test/fail.png': () => bytesResponse(PNG, 'image/png', 404),
    });
    const md = '![a](https://img.test/fail.png)\n\n![b](assets/local.png)';
    const html = await renderMarkdown(md, {
      baseUrl: '/',
      localizeAssets: { dataDir, fetchFn: fn, warn: (m: string) => warnings.push(m) },
    });
    expect(html).toContain('https://img.test/fail.png');
    expect(html).toContain('src="/assets/local.png"');
    expect(warnings.some((m) => m.includes('fail.png'))).toBe(true);
  });
});

describe('prefetch RSS 封面本地化', () => {
  const SITE = `
site: { title: T }
profile: { name: N }
github: { username: octocat, show_contributions: false }
rss: { enabled: true, sources_file: rss.yaml }
`;
  const RSS = `
display: grouped
sources:
  - name: Blog
    url: https://blog.test/feed.xml
    mode: latest
    latest: 1
    cover: https://img.test/source-cover.png
  - name: Picks
    url: https://pick.test/feed
    mode: curated
    articles:
      - { url: https://pick.test/a/1 }
`;

  const FEED_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>t</title><link>https://blog.test/1</link><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate></item>
</channel></rss>`;

  const ARTICLE_HTML = `<html><head><meta property="og:title" content="A1"/>
<meta property="og:image" content="https://img.test/og-cover.jpg"/></head><body><p>正文内容</p></body></html>`;

  function prefetchFetch(coverFails = false) {
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(url);
      if (url === 'https://blog.test/feed.xml') return new Response(FEED_XML);
      if (url === 'https://pick.test/feed') throw new Error('feed 不需要');
      if (url === 'https://pick.test/a/1') return new Response(ARTICLE_HTML);
      if (url === 'https://api.github.com/users/octocat') {
        return new Response(JSON.stringify({ login: 'octocat' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('https://img.test/')) {
        if (coverFails) return new Response('x', { status: 403 });
        return bytesResponse(PNG, url.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
      }
      throw new Error(`未 mock 的请求：${url}`);
    }) as FetchFn;
    return { fn, calls };
  }

  it('latest 手配封面与 curated og:image 回退封面都下载并改写为本地路径', async () => {
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    writeFileSync(path.join(dataDir, 'rss.yaml'), RSS);
    const { fn } = prefetchFetch();

    const result = await runPrefetch({ dataDir, cacheDir, fetchFn: fn, now: () => T0 });
    expect(result.ok).toBe(true);

    const rss = JSON.parse(readFileSync(path.join(cacheDir, 'rss.json'), 'utf8')) as RssCache;
    const covers = rss.sources.flatMap((s) => s.entries.map((e) => e.cover));
    expect(covers).toHaveLength(2);
    for (const cover of covers) {
      expect(cover).toMatch(/^assets\/remote\/[0-9a-f]{16}\.(png|jpg)$/);
      expect(existsSync(path.join(dataDir, cover!))).toBe(true);
    }
  });

  it('封面下载失败保留远程 URL，不影响条目数据', async () => {
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    writeFileSync(path.join(dataDir, 'rss.yaml'), RSS);
    const { fn } = prefetchFetch(true);

    const result = await runPrefetch({ dataDir, cacheDir, fetchFn: fn, now: () => T0 });
    expect(result.ok).toBe(true);
    const rss = JSON.parse(readFileSync(path.join(cacheDir, 'rss.json'), 'utf8')) as RssCache;
    const covers = rss.sources.flatMap((s) => s.entries.map((e) => e.cover));
    expect(covers).toEqual(['https://img.test/source-cover.png', 'https://img.test/og-cover.jpg']);
  });
});
