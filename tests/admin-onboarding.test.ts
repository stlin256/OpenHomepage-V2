/**
 * 新手欢迎向导（spec 19）测试：
 * 触发条件（initialized × 完成标记）、标记文件读写、HTTP 端点，
 * 以及 shared/onboarding.ts 的配置改写纯逻辑（名片 / 模块勾选 / 主题色）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  ONBOARDING_FLAG,
  isOnboardingDone,
  shouldShowOnboarding,
  markOnboardingDone,
} from '../admin/server/onboarding.ts';
import { createAdminServer } from '../admin/server/http.ts';
import {
  listModuleCandidates,
  enabledModuleKeys,
  applyModuleSelection,
  applyFeatureToggles,
  applyOnboardingProfile,
  applyAccent,
  githubPrefillSuggestions,
  applyGithubBlogLink,
  ACCENT_PRESETS,
  type Obj,
} from '../admin/shared/onboarding.ts';

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-onboarding-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('onboarding 触发条件与标记文件', () => {
  it('initialized 且标记不存在 → 应弹出；写入标记后不再弹出', () => {
    withTempData((dir) => {
      expect(shouldShowOnboarding(dir, true)).toBe(true);
      expect(isOnboardingDone(dir)).toBe(false);
      markOnboardingDone(dir);
      expect(isOnboardingDone(dir)).toBe(true);
      expect(shouldShowOnboarding(dir, true)).toBe(false);
      const flag = path.join(dir, ONBOARDING_FLAG);
      expect(existsSync(flag)).toBe(true);
      expect(readFileSync(flag, 'utf8')).toContain('onboarding completed at');
    });
  });

  it('非首次初始化（initialized=false）即使无标记也不弹；标记写入幂等', () => {
    withTempData((dir) => {
      expect(shouldShowOnboarding(dir, false)).toBe(false);
      markOnboardingDone(dir, new Date('2026-09-04T00:00:00Z'));
      markOnboardingDone(dir, new Date('2026-09-04T01:00:00Z'));
      expect(readFileSync(path.join(dir, ONBOARDING_FLAG), 'utf8')).toContain('2026-09-04T01:00');
    });
  });
});

describe('POST /api/onboarding/done 与 GET /api/onboarding', () => {
  let root: string;
  let server: Server;
  let base: string;

  async function api(p: string, init?: RequestInit) {
    const res = await fetch(base + p, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-onboarding-api-'));
    server = createAdminServer({ dataDir: root, initialized: true, appJs: 'console.log("stub")' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('标记前 show=true；POST done 落标记后 show=false', async () => {
    expect((await api('/api/onboarding')).body.show).toBe(true);
    const done = await api('/api/onboarding/done', { method: 'POST' });
    expect(done.status).toBe(200);
    expect(done.body.ok).toBe(true);
    expect(existsSync(path.join(root, ONBOARDING_FLAG))).toBe(true);
    expect((await api('/api/onboarding')).body.show).toBe(false);
  });

  it('initialized=false 的服务恒 show=false', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-onboarding-api2-'));
    const s2 = createAdminServer({ dataDir: dir, initialized: false, appJs: '' });
    await new Promise<void>((resolve) => s2.listen(0, '127.0.0.1', resolve));
    try {
      const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
      const res = await fetch(b2 + '/api/onboarding');
      expect(((await res.json()) as { show: boolean }).show).toBe(false);
    } finally {
      await new Promise((resolve) => s2.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- GET /api/github/prefill（注入 fetch 替身覆盖成功/404/超时三路径）----

describe('GET /api/github/prefill', () => {
  let root: string;
  let server: Server;
  let base: string;
  /** 每个用例可换的 fetch 替身（经 AdminServerOptions.githubFetch 透传） */
  let stubFetch: typeof fetch;
  /** 记录替身收到的 url 与 headers，供断言 User-Agent / 请求地址 */
  let lastCall: { url: string; headers: Record<string, string> };

  async function api(p: string) {
    const res = await fetch(base + p);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-github-prefill-'));
    server = createAdminServer({
      dataDir: root,
      initialized: true,
      appJs: '',
      // 包装一层转发，用例间可热替换 stubFetch；超时压到 50ms 便于测超时路径
      githubFetch: ((url: RequestInfo | URL, init?: RequestInit) => {
        lastCall = { url: String(url), headers: (init?.headers ?? {}) as Record<string, string> };
        return stubFetch(url, init);
      }) as typeof fetch,
      githubTimeoutMs: 50,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('成功：200 + 名片字段映射（上游 null 归一为空串），请求带 User-Agent 头', async () => {
    stubFetch = (async () =>
      new Response(
        JSON.stringify({
          name: 'San Zhang',
          bio: 'PhD candidate',
          blog: 'example.com',
          avatar_url: 'https://avatars.example/u/1',
          html_url: 'https://github.com/zhangsan',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;
    const r = await api('/api/github/prefill?username=zhangsan');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      name: 'San Zhang',
      bio: 'PhD candidate',
      blog: 'example.com',
      avatarUrl: 'https://avatars.example/u/1',
      htmlUrl: 'https://github.com/zhangsan',
    });
    expect(lastCall.url).toBe('https://api.github.com/users/zhangsan');
    expect(lastCall.headers['user-agent']).toBeTruthy();
  });

  it('上游字段为 null 时归一为空串', async () => {
    stubFetch = (async () =>
      new Response(JSON.stringify({ name: null, bio: null, blog: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const r = await api('/api/github/prefill?username=ghost');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ name: '', bio: '', blog: '', avatarUrl: '', htmlUrl: '' });
  });

  it('上游 404（用户不存在）→ 404 + 友好错误', async () => {
    stubFetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    const r = await api('/api/github/prefill?username=nobody-xyz');
    expect(r.status).toBe(404);
    expect(String(r.body.error)).toContain('找不到 GitHub 用户');
  });

  it('网络失败 → 502 + 友好错误', async () => {
    stubFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r = await api('/api/github/prefill?username=zhangsan');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('网络失败或超时');
  });

  it('超时（AbortController 到时中断）→ 502', async () => {
    // 替身挂起直到被 abort，模拟超时；githubTimeoutMs=50ms
    stubFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError'))
        );
      })) as typeof fetch;
    const r = await api('/api/github/prefill?username=slowuser');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('网络失败或超时');
  });

  it('上游其他非 2xx（如限流 403）→ 502', async () => {
    stubFetch = (async () => new Response('{}', { status: 403 })) as typeof fetch;
    const r = await api('/api/github/prefill?username=zhangsan');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('HTTP 403');
  });

  it('非法用户名 → 400，且不发起上游请求', async () => {
    let called = 0;
    stubFetch = (async () => {
      called++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    expect((await api('/api/github/prefill?username=')).status).toBe(400);
    expect((await api('/api/github/prefill?username=-bad-')).status).toBe(400);
    expect((await api('/api/github/prefill?username=../../etc')).status).toBe(400);
    expect(called).toBe(0);
  });
});

// ---- GitHub 预填纯逻辑：字段填充策略与博客链接合并 ----

describe('githubPrefillSuggestions（不覆盖用户已输入内容）', () => {
  const noTouch = { nameZh: false, nameEn: false, taglineZh: false, taglineEn: false };

  it('全部为空时 name/bio 填入 zh/en 两侧', () => {
    const out = githubPrefillSuggestions(
      { nameZh: '', nameEn: '', taglineZh: '', taglineEn: '' },
      noTouch,
      { name: 'San Zhang', bio: 'PhD candidate' }
    );
    expect(out).toEqual({
      nameZh: 'San Zhang',
      nameEn: 'San Zhang',
      taglineZh: 'PhD candidate',
      taglineEn: 'PhD candidate',
    });
  });

  it('已手改的非空字段不覆盖；未手改字段即使非空也允许预填', () => {
    const out = githubPrefillSuggestions(
      { nameZh: '张三', nameEn: 'Zhang San', taglineZh: '工程师', taglineEn: '' },
      { nameZh: true, nameEn: false, taglineZh: true, taglineEn: false },
      { name: 'San Zhang', bio: 'PhD candidate' }
    );
    // nameZh/taglineZh 已手改 → 不动；nameEn/taglineEn 未手改 → 预填
    expect(out).toEqual({ nameEn: 'San Zhang', taglineEn: 'PhD candidate' });
  });

  it('手改过但当前已清空的字段允许预填（当前为空即可填）', () => {
    const out = githubPrefillSuggestions(
      { nameZh: '', nameEn: 'Mine', taglineZh: '', taglineEn: '' },
      { nameZh: true, nameEn: true, taglineZh: false, taglineEn: false },
      { name: 'San Zhang', bio: 'bio' }
    );
    expect(out.nameZh).toBe('San Zhang');
    expect(out.nameEn).toBeUndefined(); // 手改且非空 → 不覆盖
    expect(out.taglineZh).toBe('bio');
  });

  it('上游 name/bio 为空串或全空白时不出对应建议', () => {
    const out = githubPrefillSuggestions(
      { nameZh: '', nameEn: '', taglineZh: '', taglineEn: '' },
      noTouch,
      { name: '  ', bio: '' }
    );
    expect(out).toEqual({});
  });
});

describe('applyGithubBlogLink（博客链接并入 profile.links）', () => {
  it('裸域名补 https:// 并追加 Website 链接，返回 true', () => {
    const cfg: Obj = { profile: { links: [{ label: 'GitHub', url: 'https://github.com/zs' }] } };
    expect(applyGithubBlogLink(cfg, 'example.com/blog')).toBe(true);
    expect((cfg.profile as Obj).links).toEqual([
      { label: 'GitHub', url: 'https://github.com/zs' },
      { label: 'Website', url: 'https://example.com/blog' },
    ]);
  });

  it('已有同 URL（忽略大小写与末尾斜杠）时不重复添加，返回 false', () => {
    const cfg: Obj = { profile: { links: [{ label: 'Website', url: 'https://Example.com/' }] } };
    expect(applyGithubBlogLink(cfg, 'https://example.com')).toBe(false);
    expect(((cfg.profile as Obj).links as unknown[]).length).toBe(1);
  });

  it('profile.links 缺失时补建；blog 为空不动配置', () => {
    const cfg: Obj = {};
    expect(applyGithubBlogLink(cfg, 'https://me.dev')).toBe(true);
    expect((cfg.profile as Obj).links).toEqual([{ label: 'Website', url: 'https://me.dev' }]);

    const before = JSON.stringify(cfg);
    expect(applyGithubBlogLink(cfg, '   ')).toBe(false);
    expect(JSON.stringify(cfg)).toBe(before);
  });
});

// ---- shared/onboarding.ts 纯逻辑 ----

function sampleCfg(): Obj {
  return {
    profile: {
      name: { zh: '林知远', en: 'Zhiyuan Lin', ja: '林知远', fr: 'Zhiyuan Lin' },
      tagline: { zh: '博士研究生', en: 'PhD candidate' },
    },
    github: { username: 'stlin256' },
    theme: { accent: '#3a7bd5' },
    bgm: { enabled: true, file: 'assets/bgm.mp3' },
    contact: { intro_card: { enabled: true, title: { zh: '交个朋友' }, image: 'assets/qr.svg' } },
    streaming_blocks: [{ id: 'welcome', content_file: 'streaming/welcome.md' }],
    editorial_blocks: [
      { id: 'work', title: { zh: 'W' } },
      { id: 'studio', title: { zh: 'S' } },
    ],
    home: {
      layout: [
        { block: 'profile' },
        { block: 'streaming', id: 'welcome' },
        { block: 'editorial', id: 'work' },
        { block: 'markdown' },
        { block: 'editorial', id: 'studio' },
        { block: 'github' },
        { block: 'rss' },
      ],
    },
  };
}

describe('applyOnboardingProfile', () => {
  it('双语写入 name/tagline，保留 ja/fr 等其他语言键', () => {
    const cfg = sampleCfg();
    applyOnboardingProfile(cfg, {
      nameZh: '张三',
      nameEn: 'San Zhang',
      taglineZh: '工程师',
      githubUsername: '  zhangsan  ',
    });
    const profile = cfg.profile as Obj;
    expect(profile.name).toEqual({ zh: '张三', en: 'San Zhang', ja: '林知远', fr: 'Zhiyuan Lin' });
    // taglineEn 留空 → 不写 en 键
    expect(profile.tagline).toEqual({ zh: '工程师' });
    expect((cfg.github as Obj).username).toBe('zhangsan');
  });

  it('字段留空不动原值；GitHub 用户名全空白不改', () => {
    const cfg = sampleCfg();
    applyOnboardingProfile(cfg, { nameZh: '', nameEn: '', githubUsername: '   ' });
    const profile = cfg.profile as Obj;
    expect((profile.name as Obj).zh).toBe('林知远');
    expect((cfg.github as Obj).username).toBe('stlin256');
  });

  it('原值为纯字符串时升级为双语对象', () => {
    const cfg = sampleCfg();
    (cfg.profile as Obj).name = '林知远';
    applyOnboardingProfile(cfg, { nameZh: '张三', nameEn: 'San Zhang' });
    expect((cfg.profile as Obj).name).toEqual({ zh: '张三', en: 'San Zhang' });
  });
});

describe('模块编排（home.layout 勾选）', () => {
  it('候选清单含固定区块与 streaming/editorial 定义，按规范顺序', () => {
    const keys = listModuleCandidates(sampleCfg()).map((c) => c.key);
    expect(keys).toEqual([
      'profile',
      'streaming:welcome',
      'editorial:work',
      'editorial:studio',
      'markdown',
      'github',
      'rss',
    ]);
  });

  it('enabledModuleKeys 反映当前 layout', () => {
    expect(enabledModuleKeys(sampleCfg())).toEqual([
      'profile',
      'streaming:welcome',
      'editorial:work',
      'markdown',
      'editorial:studio',
      'github',
      'rss',
    ]);
  });

  it('取消勾选移除条目；重新勾选按规范序回补', () => {
    const cfg = sampleCfg();
    // 取消 github / rss / editorial:work
    applyModuleSelection(cfg, ['profile', 'streaming:welcome', 'markdown', 'editorial:studio']);
    expect(enabledModuleKeys(cfg)).toEqual([
      'profile',
      'streaming:welcome',
      'editorial:studio',
      'markdown',
    ]);
    // 重新勾选 rss：按规范序落在 github 位（github 未勾选则紧随 markdown 后）
    applyModuleSelection(cfg, ['profile', 'streaming:welcome', 'markdown', 'editorial:studio', 'rss']);
    expect(enabledModuleKeys(cfg)).toEqual([
      'profile',
      'streaming:welcome',
      'editorial:studio',
      'markdown',
      'rss',
    ]);
  });

  it('引用不存在定义的 key 被忽略；空勾选不改动 layout', () => {
    const cfg = sampleCfg();
    applyModuleSelection(cfg, ['profile', 'editorial:ghost']);
    expect(enabledModuleKeys(cfg)).toEqual(['profile']);
    applyModuleSelection(cfg, []);
    expect(enabledModuleKeys(cfg)).toEqual(['profile']);
  });

  it('未知自定义条目仍勾选时保留（排最后）', () => {
    const cfg = sampleCfg();
    ((cfg.home as Obj).layout as Obj[]).push({ block: 'custom', id: 'x' });
    applyModuleSelection(cfg, ['profile', 'custom:x']);
    expect(enabledModuleKeys(cfg)).toEqual(['profile', 'custom:x']);
  });
});

describe('applyFeatureToggles', () => {
  it('bgm / contact 开关写入对应 enabled 键；缺段时补建', () => {
    const cfg = sampleCfg();
    applyFeatureToggles(cfg, { bgmEnabled: false, contactEnabled: false });
    expect((cfg.bgm as Obj).enabled).toBe(false);
    expect(((cfg.contact as Obj).intro_card as Obj).enabled).toBe(false);

    const bare: Obj = {};
    applyFeatureToggles(bare, { bgmEnabled: true, contactEnabled: true });
    expect((bare.bgm as Obj).enabled).toBe(true);
    expect(((bare.contact as Obj).intro_card as Obj).enabled).toBe(true);
  });
});

describe('applyAccent', () => {
  it('预设色可应用；hex 规范化为小写 #rrggbb；非法值拒绝且不改配置', () => {
    const cfg = sampleCfg();
    expect(applyAccent(cfg, ACCENT_PRESETS[3])).toBe(true);
    expect((cfg.theme as Obj).accent).toBe(ACCENT_PRESETS[3]);
    expect(applyAccent(cfg, 'F06')).toBe(true);
    expect((cfg.theme as Obj).accent).toBe('#ff0066');
    expect(applyAccent(cfg, 'red')).toBe(false);
    expect((cfg.theme as Obj).accent).toBe('#ff0066');
  });
});
