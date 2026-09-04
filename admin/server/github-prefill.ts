/**
 * GitHub 公开资料预填（spec 19 §3.1）：新手向导第 1 步「⚡ 自动同步信息」的服务端实现。
 * 请求 https://api.github.com/users/<username>（全局 fetch + AbortController 超时，
 * User-Agent 头为 GitHub API 必需），成功返回名片字段子集；失败按语义归类：
 * - 用户不存在（上游 404）→ GithubPrefillError(status 404)
 * - 网络失败 / 超时 / 限流等其他上游错误 → GithubPrefillError(status 502)
 * fetch 与超时时长均可注入，便于测试（http.ts 经 AdminServerOptions 透传替身）。
 */

export interface GithubPrefillResult {
  name: string;
  bio: string;
  blog: string;
  avatarUrl: string;
  htmlUrl: string;
}

/** 预填错误：status 即对前端返回的 HTTP 状态码（404 用户不存在；502 上游不可达/超时） */
export class GithubPrefillError extends Error {
  readonly status: number;
  constructor(message: string, status: 404 | 502) {
    super(message);
    this.status = status;
  }
}

/** GitHub 用户名规则：字母数字或连字符，1–39 位，不得以连字符开头 */
export const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;

export const DEFAULT_GITHUB_TIMEOUT_MS = 5000;

export async function fetchGithubProfile(
  username: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_GITHUB_TIMEOUT_MS
): Promise<GithubPrefillResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: {
        'user-agent': 'OpenHomepage-Admin',
        accept: 'application/vnd.github+json',
      },
    });
  } catch {
    // 网络失败 / AbortError 超时：统一归一为 502 友好提示
    throw new GithubPrefillError(
      '无法连接 GitHub API（网络失败或超时），请稍后重试 / GitHub API unreachable (network error or timeout)',
      502
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    throw new GithubPrefillError(
      `找不到 GitHub 用户：${username} / GitHub user not found: ${username}`,
      404
    );
  }
  if (!res.ok) {
    throw new GithubPrefillError(
      `GitHub API 返回错误（HTTP ${res.status}），请稍后重试 / GitHub API error (HTTP ${res.status})`,
      502
    );
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) {
    throw new GithubPrefillError(
      'GitHub API 返回了无法解析的响应 / Unparseable response from GitHub API',
      502
    );
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    name: str(data.name),
    bio: str(data.bio),
    blog: str(data.blog),
    avatarUrl: str(data.avatar_url),
    htmlUrl: str(data.html_url),
  };
}
