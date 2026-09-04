/**
 * GitHub 头像同步（spec 19 §3.2）：新手向导第 1 步「同步头像」的服务端实现。
 * 复用 github-prefill 的 fetchGithubProfile 取 avatar_url，再二次请求下载头像：
 * - 与预填同一套超时（AbortController，默认 5s）与 User-Agent 头；
 * - magic bytes 嗅探 PNG / JPEG 决定扩展名，其他格式（如 WebP/GIF/错误页）拒绝；
 * - 超过 10MB 拒绝（GitHub 头像正常远小于 1MB，超限视为异常响应）。
 * 全部校验通过后才落盘：写 data/assets/avatar.<ext> → 经 writeSiteConfig 把
 * site.yaml 的 profile.avatar 更新为 assets/avatar.<ext>（schema 校验 + 快照）
 * → 清理同名旧扩展名的头像文件。任何失败都不落盘半成品、不动配置。
 * fetch 与超时时长均可注入（AdminServerOptions.githubFetch / githubTimeoutMs 透传）。
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  fetchGithubProfile,
  GithubPrefillError,
  DEFAULT_GITHUB_TIMEOUT_MS,
} from './github-prefill.ts';
import { readSiteConfig, writeSiteConfig } from './configs.ts';

/** 头像下载上限：10MB */
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

/** 头像同步错误：继承 GithubPrefillError 以复用 http.ts sendError 的 status 映射（404/502） */
export class GithubAvatarError extends GithubPrefillError {}

/** magic bytes 嗅探图片格式：只认 PNG（89 50 4E 47）与 JPEG（FF D8 FF） */
export function sniffAvatarExt(buf: Buffer): 'png' | 'jpg' | null {
  if (
    buf.byteLength >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png';
  }
  if (buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

/** 带超时的头像下载：网络失败 / 超时归一为 GithubAvatarError(502)，与预填同语义 */
async function downloadAvatar(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'OpenHomepage-Admin' },
    });
  } catch {
    throw new GithubAvatarError(
      '头像下载失败（网络错误或超时），请稍后重试 / Avatar download failed (network error or timeout)',
      502
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new GithubAvatarError(
      `头像下载失败（HTTP ${res.status}），请稍后重试 / Avatar download failed (HTTP ${res.status})`,
      502
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 同步 GitHub 头像：拉资料 → 下载头像 → 嗅探格式 → 落盘 → 写回 profile.avatar。
 * 返回写入后的站点头像相对路径（assets/avatar.<ext>）。
 */
export async function syncGithubAvatar(
  dataDir: string,
  username: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_GITHUB_TIMEOUT_MS
): Promise<{ avatar: string }> {
  const profile = await fetchGithubProfile(username, fetchImpl, timeoutMs);
  if (!profile.avatarUrl) {
    throw new GithubAvatarError(
      '该 GitHub 用户没有可用的头像地址 / No avatar URL available for this GitHub user',
      502
    );
  }
  const buf = await downloadAvatar(profile.avatarUrl, fetchImpl, timeoutMs);
  if (buf.byteLength > MAX_AVATAR_BYTES) {
    throw new GithubAvatarError(
      '头像文件超过 10MB，已放弃下载 / Avatar larger than 10MB, aborted',
      502
    );
  }
  const ext = sniffAvatarExt(buf);
  if (!ext) {
    throw new GithubAvatarError(
      '头像不是 PNG/JPEG 图片，已放弃保存 / Avatar is not a PNG/JPEG image, aborted',
      502
    );
  }
  const rel = `assets/avatar.${ext}`;
  const dir = path.join(dataDir, 'assets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `avatar.${ext}`), buf);
  // 写回 site.yaml 的 profile.avatar（schema 校验 + 快照，与配置保存同链路）
  const cfg = readSiteConfig(dataDir);
  cfg.profile.avatar = rel;
  writeSiteConfig(dataDir, cfg);
  // 清理同名不同扩展名的旧头像（如上次同步落的是 avatar.jpg，这次是 avatar.png）；
  // 放在配置写回之后，保证失败路径不会留下指向已删文件的配置
  for (const old of ['png', 'jpg', 'jpeg']) {
    if (old === ext) continue;
    const stale = path.join(dir, `avatar.${old}`);
    if (existsSync(stale)) rmSync(stale);
  }
  return { avatar: rel };
}
