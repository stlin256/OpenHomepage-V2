/**
 * 部署引导（spec 22）纯逻辑：GitHub 仓库地址解析与设置页 deep link 拼接。
 * 服务端（admin/server/deploy-info.ts 解析 git remote）与前端视图
 * （admin/ui/views/deploy.ts 用户手填仓库地址）共用，无 DOM / Node 依赖。
 */

/** GH_PAT 生成页（doctor 引导与本视图共用同一链接语义；scope：read:user） */
export const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens';

export interface DeployLinks {
  repoUrl: string;
  /** Settings → Secrets and variables → Actions */
  secretsUrl: string;
  /** Actions 列表页（观察部署进度 / 手动触发） */
  actionsUrl: string;
  newTokenUrl: string;
}

/** GET /api/deploy-info 响应：repoUrl 系字段为 null 时前端降级为手填仓库地址 */
export interface DeployInfo {
  repoUrl: string | null;
  secretsUrl: string | null;
  actionsUrl: string | null;
  newTokenUrl: string;
}

/**
 * 各种 GitHub remote / 网页写法 → 仓库主页 URL：
 * https://github.com/owner/repo(.git)、git@github.com:owner/repo(.git)、
 * ssh://git@github.com/owner/repo(.git)。非 GitHub 托管或无法解析返回 null。
 */
export function githubWebUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const m =
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(raw) ??
    /^(?:https?|ssh):\/\/(?:git@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(raw);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}`;
}

/** 仓库主页 URL → 部署相关 deep link（repoUrl 已归一化，无末尾斜杠/.git） */
export function deployLinks(repoUrl: string): DeployLinks {
  const repo = repoUrl.replace(/\/+$/, '');
  return {
    repoUrl: repo,
    secretsUrl: `${repo}/settings/secrets/actions`,
    actionsUrl: `${repo}/actions`,
    newTokenUrl: GITHUB_TOKEN_URL,
  };
}
