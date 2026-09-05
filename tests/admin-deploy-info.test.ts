/**
 * 「部署到线上」引导（spec 22 §2）测试：
 * shared/deploy.ts 的 GitHub 地址解析与 deep link 拼接（纯函数），
 * server/deploy-info.ts 的 git remote 读取（注入替身）与失败降级，
 * 以及 GET /api/deploy-info 端点（非 git 目录 → 字段全 null）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { githubWebUrl, deployLinks, GITHUB_TOKEN_URL } from '../admin/shared/deploy.ts';
import { readDeployInfo } from '../admin/server/deploy-info.ts';
import { createAdminServer } from '../admin/server/http.ts';

describe('githubWebUrl：各种 remote 写法 → 仓库主页 URL', () => {
  it('https / .git 后缀 / ssh scp 式 / ssh:// / 末尾斜杠 都能解析', () => {
    expect(githubWebUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
    expect(githubWebUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(githubWebUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(githubWebUrl('git@github.com:owner/repo')).toBe('https://github.com/owner/repo');
    expect(githubWebUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(githubWebUrl('https://github.com/owner/repo/')).toBe('https://github.com/owner/repo');
  });

  it('非 GitHub 托管 / 空串 / 非法输入 → null', () => {
    expect(githubWebUrl('https://gitlab.com/owner/repo.git')).toBeNull();
    expect(githubWebUrl('')).toBeNull();
    expect(githubWebUrl('   ')).toBeNull();
    expect(githubWebUrl('owner/repo')).toBeNull();
  });
});

describe('deployLinks：deep link 拼接', () => {
  it('Secrets / Actions / Token 生成页', () => {
    const links = deployLinks('https://github.com/owner/repo/');
    expect(links.repoUrl).toBe('https://github.com/owner/repo');
    expect(links.secretsUrl).toBe('https://github.com/owner/repo/settings/secrets/actions');
    expect(links.actionsUrl).toBe('https://github.com/owner/repo/actions');
    expect(links.newTokenUrl).toBe(GITHUB_TOKEN_URL);
  });
});

describe('readDeployInfo：git remote 读取（注入替身，不真跑 git）', () => {
  it('读到 GitHub remote → 完整 deep link', () => {
    const info = readDeployInfo('/anywhere', () => 'git@github.com:stlin256/OpenHomepage-V2.git\n');
    expect(info.repoUrl).toBe('https://github.com/stlin256/OpenHomepage-V2');
    expect(info.secretsUrl).toBe('https://github.com/stlin256/OpenHomepage-V2/settings/secrets/actions');
    expect(info.actionsUrl).toBe('https://github.com/stlin256/OpenHomepage-V2/actions');
    expect(info.newTokenUrl).toBe(GITHUB_TOKEN_URL);
  });

  it('exec 抛错（非 git 仓库 / 无 origin / git 不可用）→ 降级为全 null（保留 token 生成页）', () => {
    const info = readDeployInfo('/anywhere', () => {
      throw new Error('not a git repository');
    });
    expect(info.repoUrl).toBeNull();
    expect(info.secretsUrl).toBeNull();
    expect(info.actionsUrl).toBeNull();
    expect(info.newTokenUrl).toBe(GITHUB_TOKEN_URL);
  });

  it('remote 非 GitHub → 全 null 降级', () => {
    const info = readDeployInfo('/anywhere', () => 'https://gitlab.com/owner/repo.git');
    expect(info.repoUrl).toBeNull();
  });
});

describe('GET /api/deploy-info', () => {
  let root: string;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // 临时目录不是 git 仓库：真实 git 读取失败 → 端点返回降级形态（不抛错、状态 200）
    root = mkdtempSync(path.join(tmpdir(), 'oh-deploy-info-'));
    server = createAdminServer({ dataDir: root, initialized: false, appJs: 'console.log("stub")', rootDir: root });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  it('非 git 目录 → 200 且 repoUrl 系字段全 null（前端手填降级）', async () => {
    const res = await fetch(`${base}/api/deploy-info`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.repoUrl).toBeNull();
    expect(body.secretsUrl).toBeNull();
    expect(body.actionsUrl).toBeNull();
    expect(body.newTokenUrl).toBe(GITHUB_TOKEN_URL);
  });
});
