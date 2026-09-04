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
