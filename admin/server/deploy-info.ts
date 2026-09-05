/**
 * 部署引导（spec 22）：GET /api/deploy-info 的服务端逻辑。
 * 读取 git remote origin 解析 GitHub 仓库地址，拼 Secrets/Actions 设置页 deep link；
 * 读不到（非 git 仓库 / 无 origin / 非 GitHub 托管 / git 不可用）时全部降级为 null，
 * 前端改为让用户手填仓库地址（纯前端拼 URL，同一套 shared/deploy.ts 逻辑）。
 */
import { execFileSync } from 'node:child_process';
import {
  githubWebUrl,
  deployLinks,
  GITHUB_TOKEN_URL,
  type DeployInfo,
  type DeployLinks,
} from '../shared/deploy.ts';

/** git remote 读取替身（测试注入；抛错即视为读不到） */
export type ExecRemote = (rootDir: string) => string;

/** 默认实现：git remote get-url origin（5s 超时，stderr 丢弃，绝不抛出以外的副作用） */
const defaultExec: ExecRemote = (rootDir) =>
  execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

export function readDeployInfo(rootDir: string, exec: ExecRemote = defaultExec): DeployInfo {
  let remote = '';
  try {
    remote = exec(rootDir);
  } catch {
    remote = '';
  }
  const repoUrl = githubWebUrl(remote);
  const links: DeployLinks | null = repoUrl ? deployLinks(repoUrl) : null;
  return {
    repoUrl: links?.repoUrl ?? null,
    secretsUrl: links?.secretsUrl ?? null,
    actionsUrl: links?.actionsUrl ?? null,
    newTokenUrl: GITHUB_TOKEN_URL,
  };
}
