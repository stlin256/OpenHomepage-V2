/**
 * GitHub 头像同步（spec 19 §3.2，POST /api/github/avatar）测试：
 * 替身 fetch 覆盖成功（PNG/JPEG 嗅探、文件落盘、site.yaml 写回、快照产生、
 * 旧扩展名清理）与失败路径（404 / 502 / 超时 / 非法用户名 400 / >10MB 拒绝 /
 * 非图片内容 / avatar_url 缺失），失败一律不落盘半成品。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { load as loadYaml } from 'js-yaml';
import { createAdminServer } from '../admin/server/http.ts';
import { sniffAvatarExt, MAX_AVATAR_BYTES } from '../admin/server/github-avatar.ts';

/** 最小 PNG / JPEG 魔数样本（嗅探只认文件头） */
const PNG_BUF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG_BUF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 5, 6, 7, 8]);

const AVATAR_URL = 'https://avatars.example/u/1';

/** 最小合法 site.yaml（validateSiteConfig 必需：site.title / profile.name / github.username） */
const SITE_YAML = 'site:\n  title: Test\nprofile:\n  name: Tester\ngithub:\n  username: zhangsan\n';

describe('POST /api/github/avatar', () => {
  let root: string;
  let server: Server;
  let base: string;
  /** 每个用例可换的 fetch 替身（经 AdminServerOptions.githubFetch 透传） */
  let stubFetch: typeof fetch;
  /** 记录替身收到的所有 url，供断言请求序列与「未发起请求」 */
  let calls: string[];

  async function api(p: string, init?: RequestInit) {
    const res = await fetch(base + p, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  const post = (username: string) =>
    api('/api/github/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    });

  /** 常见成功路径替身：先回 GitHub 用户 JSON，再回图片二进制 */
  const okFetch = (img: Buffer) =>
    (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith('https://api.github.com/users/')) {
        return new Response(JSON.stringify({ avatar_url: AVATAR_URL }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(new Uint8Array(img), { status: 200 });
    }) as typeof fetch;

  const readAvatarCfg = (): string =>
    (loadYaml(readFileSync(path.join(root, 'site.yaml'), 'utf8')) as { profile: { avatar?: string } })
      .profile.avatar ?? '';

  /** data/assets/ 下当前的头像文件（avatar.*） */
  const avatarFiles = (): string[] => {
    const dir = path.join(root, 'assets');
    return existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith('avatar.')) : [];
  };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-github-avatar-'));
    writeFileSync(path.join(root, 'site.yaml'), SITE_YAML, 'utf8');
    server = createAdminServer({
      dataDir: root,
      initialized: true,
      appJs: '',
      githubFetch: ((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(url));
        return stubFetch(url, init);
      }) as typeof fetch,
      githubTimeoutMs: 50, // 压短超时便于测超时路径
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('sniffAvatarExt：PNG/JPEG 魔数识别，其他内容返回 null', () => {
    expect(sniffAvatarExt(PNG_BUF)).toBe('png');
    expect(sniffAvatarExt(JPG_BUF)).toBe('jpg');
    expect(sniffAvatarExt(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffAvatarExt(Buffer.from('<html>404</html>'))).toBeNull();
    expect(sniffAvatarExt(Buffer.alloc(0))).toBeNull();
  });

  it('成功（PNG）：落盘 data/assets/avatar.png、写回 profile.avatar、产生 site.yaml 快照', async () => {
    calls = [];
    stubFetch = okFetch(PNG_BUF);
    const r = await post('zhangsan');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ avatar: 'assets/avatar.png' });
    // 请求序列：先 GitHub API 取 avatar_url，再下载头像
    expect(calls).toEqual(['https://api.github.com/users/zhangsan', AVATAR_URL]);
    // 文件落盘且字节一致
    const abs = path.join(root, 'assets', 'avatar.png');
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs)).toEqual(PNG_BUF);
    // site.yaml 写回
    expect(readAvatarCfg()).toBe('assets/avatar.png');
    // 快照产生（writeSiteConfig 链路）
    const snaps = path.join(root, '.snapshots', 'site.yaml');
    expect(existsSync(snaps)).toBe(true);
    expect(readdirSync(snaps).length).toBeGreaterThan(0);
  });

  it('成功（JPEG）：嗅探为 avatar.jpg 并清理旧 avatar.png', async () => {
    // 上一用例已留下 avatar.png（旧扩展名），本次应被清理
    expect(avatarFiles()).toEqual(['avatar.png']);
    stubFetch = okFetch(JPG_BUF);
    const r = await post('zhangsan');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ avatar: 'assets/avatar.jpg' });
    expect(readFileSync(path.join(root, 'assets', 'avatar.jpg'))).toEqual(JPG_BUF);
    expect(readAvatarCfg()).toBe('assets/avatar.jpg');
    expect(avatarFiles()).toEqual(['avatar.jpg']); // 旧 .png 已清理
  });

  it('上游 404（用户不存在）→ 404，不落盘不动配置', async () => {
    stubFetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    const before = readFileSync(path.join(root, 'site.yaml'), 'utf8');
    const r = await post('nobody-xyz');
    expect(r.status).toBe(404);
    expect(String(r.body.error)).toContain('找不到 GitHub 用户');
    expect(avatarFiles()).toEqual(['avatar.jpg']); // 保持上一用例结果，无新文件
    expect(readFileSync(path.join(root, 'site.yaml'), 'utf8')).toBe(before);
  });

  it('网络失败 → 502；头像下载超时 → 502；均不落盘', async () => {
    stubFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r1 = await post('zhangsan');
    expect(r1.status).toBe(502);
    expect(String(r1.body.error)).toContain('网络失败或超时');

    // 第二次请求（头像下载）挂起直到被 abort，模拟下载超时
    stubFetch = ((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://api.github.com/users/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ avatar_url: AVATAR_URL }), { status: 200 })
        );
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError'))
        );
      });
    }) as typeof fetch;
    const r2 = await post('zhangsan');
    expect(r2.status).toBe(502);
    expect(String(r2.body.error)).toContain('头像下载失败');
    expect(avatarFiles()).toEqual(['avatar.jpg']); // 无半成品
  });

  it('头像下载 HTTP 错误（403 限流等）→ 502，不落盘', async () => {
    stubFetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith('https://api.github.com/users/')) {
        return new Response(JSON.stringify({ avatar_url: AVATAR_URL }), { status: 200 });
      }
      return new Response('{}', { status: 403 });
    }) as typeof fetch;
    const r = await post('zhangsan');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('HTTP 403');
    expect(avatarFiles()).toEqual(['avatar.jpg']);
  });

  it('头像内容超过 10MB → 502 拒绝，不落盘', async () => {
    const big = Buffer.alloc(MAX_AVATAR_BYTES + 1, 0x89); // 超大且即使魔数合法也拒绝
    big.set(PNG_BUF, 0); // 前缀补成合法 PNG 头，确保是「大小」而非「格式」触发拒绝
    stubFetch = okFetch(big);
    const r = await post('zhangsan');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('10MB');
    expect(avatarFiles()).toEqual(['avatar.jpg']);
  });

  it('头像内容不是 PNG/JPEG（如错误页 HTML）→ 502 拒绝，不落盘', async () => {
    stubFetch = okFetch(Buffer.from('<html>not an image</html>'));
    const r = await post('zhangsan');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('PNG/JPEG');
    expect(avatarFiles()).toEqual(['avatar.jpg']);
  });

  it('GitHub 返回空 avatar_url → 502，不发起第二次请求', async () => {
    calls = [];
    stubFetch = (async () =>
      new Response(JSON.stringify({ avatar_url: null }), { status: 200 })) as typeof fetch;
    const r = await post('ghost');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('头像地址');
    expect(calls).toEqual(['https://api.github.com/users/ghost']); // 未下载
  });

  it('非法用户名 → 400，且不发起任何上游请求', async () => {
    calls = [];
    stubFetch = okFetch(PNG_BUF);
    expect((await post('')).status).toBe(400);
    expect((await post('-bad-')).status).toBe(400);
    expect((await post('../../etc')).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('成功路径的「旧扩展名清理」不影响其他素材文件', async () => {
    mkdirSync(path.join(root, 'assets'), { recursive: true });
    writeFileSync(path.join(root, 'assets', 'keep.png'), PNG_BUF);
    stubFetch = okFetch(PNG_BUF);
    const r = await post('zhangsan');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ avatar: 'assets/avatar.png' });
    const files = avatarFiles();
    expect(files).toContain('avatar.png');
    expect(files).not.toContain('avatar.jpg'); // 旧 jpg 清理
    // 无关素材保留（avatarFiles 只列 avatar.*，这里直接看目录）
    expect(readdirSync(path.join(root, 'assets'))).toContain('keep.png');
  });
});
