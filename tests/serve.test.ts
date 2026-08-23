/**
 * serve 纯逻辑（scripts/serve-lib.ts）与静态服务集成测试。
 * 证书 fixtures：tests/fixtures/certs/（openssl 自签名，cert.pem+key.pem 匹配，
 * other-key.pem 故意不匹配；过期/未生效分支用 now 注入模拟）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import {
  normalizeServeConfig,
  resolveCertFiles,
  checkCertificate,
  planServe,
  resolveStaticPath,
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTPS_PORT,
  type ServeIO,
} from '../scripts/serve-lib.ts';
import { createStaticServer } from '../scripts/serve.ts';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/certs');
const CERT = readFileSync(path.join(FIXTURES, 'cert.pem'), 'utf8');
const KEY = readFileSync(path.join(FIXTURES, 'key.pem'), 'utf8');
const OTHER_KEY = readFileSync(path.join(FIXTURES, 'other-key.pem'), 'utf8');

/** 内存 IO 替身：files 为 路径→内容，dirs 为目录集合 */
function fakeIo(files: Record<string, string>, dirs: string[] = []): ServeIO {
  const norm = (p: string) => path.resolve(p);
  const fmap = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  const dset = new Set(dirs.map(norm));
  return {
    exists: (p) => fmap.has(norm(p)) || dset.has(norm(p)),
    read: (p) => {
      const v = fmap.get(norm(p));
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    kind: (p) => (fmap.has(norm(p)) ? 'file' : dset.has(norm(p)) ? 'dir' : null),
  };
}

const ROOT = process.platform === 'win32' ? 'C:\\root' : '/root';

describe('normalizeServeConfig', () => {
  it('非对象/空配置 → {}；非法 port/ssl 字段忽略', () => {
    expect(normalizeServeConfig(undefined)).toEqual({});
    expect(normalizeServeConfig(null)).toEqual({});
    expect(normalizeServeConfig('x')).toEqual({});
    expect(normalizeServeConfig({ port: 'abc', ssl: 'no' })).toEqual({});
    expect(normalizeServeConfig({ port: 0 })).toEqual({});
    expect(normalizeServeConfig({ port: 70000 })).toEqual({});
  });

  it('合法 port 与 ssl.cert/key 保留', () => {
    expect(normalizeServeConfig({ port: 8443, ssl: { cert: 'certs/a.pem', key: 'certs/b.pem' } })).toEqual({
      port: 8443,
      ssl: { cert: 'certs/a.pem', key: 'certs/b.pem' },
    });
    expect(normalizeServeConfig({ ssl: { cert: 'a.pem' } })).toEqual({ ssl: { cert: 'a.pem', key: undefined } });
  });
});

describe('resolveCertFiles', () => {
  it('显式 serve.ssl 优先（相对 rootDir 解析）', () => {
    const io = fakeIo({});
    const r = resolveCertFiles(ROOT, { ssl: { cert: 'certs/a.pem', key: 'k.pem' } }, io);
    expect(r).toEqual({
      certPath: path.resolve(ROOT, 'certs/a.pem'),
      keyPath: path.resolve(ROOT, 'k.pem'),
      source: 'config',
    });
  });

  it('约定：certs/cert.pem + key.pem 同时存在才采用', () => {
    const io = fakeIo({
      [path.join(ROOT, 'certs/cert.pem')]: CERT,
      [path.join(ROOT, 'certs/key.pem')]: KEY,
    });
    const r = resolveCertFiles(ROOT, {}, io);
    expect(r?.source).toBe('convention');
    expect(resolveCertFiles(ROOT, {}, fakeIo({}))).toBeNull();
  });
});

describe('checkCertificate', () => {
  it('有效自签名证书 + 匹配私钥 → 无错误无警告', () => {
    const r = checkCertificate(CERT, KEY, new Date('2030-01-01'));
    expect(r.error).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it('证书 PEM 解析失败 → error', () => {
    const r = checkCertificate('not a pem', KEY);
    expect(r.error).toContain('证书 PEM 解析失败');
  });

  it('私钥解析失败 → error', () => {
    const r = checkCertificate(CERT, 'garbage');
    expect(r.error).toContain('私钥解析失败');
  });

  it('证书与私钥不匹配 → error', () => {
    const r = checkCertificate(CERT, OTHER_KEY);
    expect(r.error).toContain('不匹配');
  });

  it('过期 / 尚未生效 → 仅警告不拒绝', () => {
    const expired = checkCertificate(CERT, KEY, new Date('2040-01-01'));
    expect(expired.error).toBeNull();
    expect(expired.warnings.join()).toContain('已过期');
    const early = checkCertificate(CERT, KEY, new Date('2020-01-01'));
    expect(early.error).toBeNull();
    expect(early.warnings.join()).toContain('尚未生效');
  });
});

describe('planServe', () => {
  it('无任何证书 → HTTP 默认 8080；可配端口', () => {
    const p = planServe(ROOT, null, fakeIo({}));
    expect(p).toMatchObject({ secure: false, port: DEFAULT_HTTP_PORT, warnings: [] });
    const p2 = planServe(ROOT, { serve: { port: 9000 } }, fakeIo({}));
    expect(p2).toMatchObject({ secure: false, port: 9000 });
  });

  it('约定 certs/ 有效 → HTTPS 默认 8443', () => {
    const io = fakeIo({
      [path.join(ROOT, 'certs/cert.pem')]: CERT,
      [path.join(ROOT, 'certs/key.pem')]: KEY,
    });
    const p = planServe(ROOT, null, io, new Date('2030-01-01'));
    expect(p.secure).toBe(true);
    expect(p.port).toBe(DEFAULT_HTTPS_PORT);
    expect(p.cert).toBe(CERT);
    expect(p.key).toBe(KEY);
  });

  it('显式 serve.ssl 有效 → HTTPS 用配置端口', () => {
    const io = fakeIo({ [path.resolve(ROOT, 'ssl/c.pem')]: CERT, [path.resolve(ROOT, 'ssl/k.pem')]: KEY });
    const p = planServe(ROOT, { serve: { port: 9443, ssl: { cert: 'ssl/c.pem', key: 'ssl/k.pem' } } }, io, new Date('2030-01-01'));
    expect(p).toMatchObject({ secure: true, port: 9443 });
  });

  it('证书/私钥不匹配 → 警告 + 降级 HTTP', () => {
    const io = fakeIo({
      [path.join(ROOT, 'certs/cert.pem')]: CERT,
      [path.join(ROOT, 'certs/key.pem')]: OTHER_KEY,
    });
    const p = planServe(ROOT, null, io);
    expect(p.secure).toBe(false);
    expect(p.warnings.join()).toContain('不匹配');
  });

  it('证书文件损坏（PEM 解析失败）→ 警告 + 降级 HTTP', () => {
    const io = fakeIo({
      [path.join(ROOT, 'certs/cert.pem')]: 'broken',
      [path.join(ROOT, 'certs/key.pem')]: KEY,
    });
    const p = planServe(ROOT, null, io);
    expect(p.secure).toBe(false);
    expect(p.warnings.join()).toContain('证书无效');
  });

  it('certs/ 只有一个文件 → 不成对警告 + HTTP', () => {
    const io = fakeIo({ [path.join(ROOT, 'certs/cert.pem')]: CERT });
    const p = planServe(ROOT, null, io);
    expect(p.secure).toBe(false);
    expect(p.warnings.join()).toContain('不成对');
  });

  it('过期证书 → 警告但保持 HTTPS', () => {
    const io = fakeIo({
      [path.join(ROOT, 'certs/cert.pem')]: CERT,
      [path.join(ROOT, 'certs/key.pem')]: KEY,
    });
    const p = planServe(ROOT, null, io, new Date('2040-01-01'));
    expect(p.secure).toBe(true);
    expect(p.warnings.join()).toContain('已过期');
  });
});

describe('resolveStaticPath', () => {
  const dist = path.join(ROOT, 'dist');
  const io = fakeIo(
    {
      [path.join(dist, 'index.html')]: '<h1>home</h1>',
      [path.join(dist, 'research/index.html')]: '<h1>research</h1>',
      [path.join(dist, '404.html')]: '<h1>404</h1>',
      [path.join(dist, 'plain.html')]: 'x',
    },
    [path.join(dist, 'research')]
  );

  it('/ → index.html；目录与无扩展路径 → index.html；.html 直出', () => {
    expect(resolveStaticPath(dist, '/', io)).toBe(path.join(dist, 'index.html'));
    expect(resolveStaticPath(dist, '/research/', io)).toBe(path.join(dist, 'research/index.html'));
    expect(resolveStaticPath(dist, '/research', io)).toBe(path.join(dist, 'research/index.html'));
    expect(resolveStaticPath(dist, '/plain', io)).toBe(path.join(dist, 'plain.html'));
  });

  it('不存在的路径 → null；路径穿越 → null', () => {
    expect(resolveStaticPath(dist, '/nope', io)).toBeNull();
    expect(resolveStaticPath(dist, '/../secret.txt', io)).toBeNull();
    expect(resolveStaticPath(dist, '/%2e%2e/secret.txt', io)).toBeNull();
    expect(resolveStaticPath(dist, '/%zz', io)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 集成：真实 http/https 服务（tmp dist + fixture 证书）
// ---------------------------------------------------------------------------

describe('createStaticServer 集成', () => {
  let dist: string;
  const httpPlan = { secure: false, port: 0, warnings: [] };
  const httpsPlan = { secure: true, port: 0, cert: CERT, key: KEY, warnings: [] };

  function get(url: string): Promise<{ status: number; body: string; type: string | null }> {
    const mod = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.get(url, { rejectUnauthorized: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            type: res.headers['content-type'] ?? null,
          })
        );
      });
      req.on('error', reject);
    });
  }

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'oh-serve-'));
    mkdirSync(path.join(dist, 'research'), { recursive: true });
    writeFileSync(path.join(dist, 'index.html'), '<h1>home</h1>');
    writeFileSync(path.join(dist, 'research/index.html'), '<h1>research</h1>');
    writeFileSync(path.join(dist, '404.html'), '<h1>页面不存在</h1>');
    writeFileSync(path.join(dist, 'style.css'), 'body{}');
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  async function withServer(plan: typeof httpPlan | typeof httpsPlan, fn: (base: string) => Promise<void>) {
    const server = createStaticServer(plan, dist);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const base = `${plan.secure ? 'https' : 'http'}://127.0.0.1:${port}`;
    try {
      await fn(base);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  it('HTTP：静态页/MIME/目录索引/404 页', async () => {
    await withServer(httpPlan, async (base) => {
      expect((await get(`${base}/`)).body).toContain('home');
      const research = await get(`${base}/research`);
      expect(research.status).toBe(200);
      expect(research.type).toContain('text/html');
      expect((await get(`${base}/style.css`)).type).toContain('text/css');
      const missing = await get(`${base}/nope`);
      expect(missing.status).toBe(404);
      expect(missing.body).toContain('页面不存在');
      const traversal = await get(`${base}/../serve.test.ts`);
      expect(traversal.status).toBe(404);
    });
  });

  it('HTTPS：自签名证书可正常服务', async () => {
    await withServer(httpsPlan, async (base) => {
      const r = await get(`${base}/`);
      expect(r.status).toBe(200);
      expect(r.body).toContain('home');
    });
  });
});
