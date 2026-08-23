/**
 * `npm run serve` 的纯逻辑层（scripts/serve.ts 只做 IO/进程装配）：
 * - serve 配置归一化（site.yaml 的 serve 段）；
 * - 证书路径解析（显式配置 > certs/ 目录约定）；
 * - 证书/私钥 PEM 校验（node:crypto，零新依赖；过期仅警告）；
 * - http/https 决策（证书不可用时降级 HTTP 并给出中文警告）；
 * - 静态文件路径解析（目录索引、防穿越）。
 * 全部函数注入 IO，便于单测。
 */
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import path from 'node:path';

export const DEFAULT_HTTP_PORT = 8080;
export const DEFAULT_HTTPS_PORT = 8443;

export interface ServeConfig {
  port?: number;
  ssl?: { cert?: string; key?: string };
}

/** site.yaml serve 段归一化：非法字段静默忽略（宽松，同 bgm 风格） */
export function normalizeServeConfig(raw: unknown): ServeConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const cfg: ServeConfig = {};
  const port = o.port;
  if (typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535) {
    cfg.port = port;
  }
  if (o.ssl && typeof o.ssl === 'object') {
    const s = o.ssl as Record<string, unknown>;
    const cert = typeof s.cert === 'string' && s.cert.trim() ? s.cert.trim() : undefined;
    const key = typeof s.key === 'string' && s.key.trim() ? s.key.trim() : undefined;
    if (cert || key) cfg.ssl = { cert, key };
  }
  return cfg;
}

/** 文件系统抽象：测试用内存替身，serve.ts 注入真实实现 */
export interface ServeIO {
  exists(p: string): boolean;
  read(p: string): string;
  kind(p: string): 'file' | 'dir' | null;
}

export interface CertFiles {
  certPath: string;
  keyPath: string;
  source: 'config' | 'convention';
}

/**
 * 证书路径解析：serve.ssl.cert+key 显式配置优先；
 * 否则按约定探测 <root>/certs/cert.pem + key.pem（两个都在才采用，只有一个由 planServe 警告）。
 */
export function resolveCertFiles(rootDir: string, cfg: ServeConfig, io: ServeIO): CertFiles | null {
  if (cfg.ssl?.cert && cfg.ssl.key) {
    return {
      certPath: path.resolve(rootDir, cfg.ssl.cert),
      keyPath: path.resolve(rootDir, cfg.ssl.key),
      source: 'config',
    };
  }
  const certPath = path.join(rootDir, 'certs', 'cert.pem');
  const keyPath = path.join(rootDir, 'certs', 'key.pem');
  if (io.exists(certPath) && io.exists(keyPath)) {
    return { certPath, keyPath, source: 'convention' };
  }
  return null;
}

export interface CertCheckResult {
  /** 致命问题（PEM 解析失败 / 密钥不匹配）：非空则应降级 HTTP */
  error: string | null;
  /** 非致命问题（尚未生效 / 已过期）：仅警告，仍启用 HTTPS */
  warnings: string[];
}

/** 证书与私钥校验：PEM 解析、公私钥匹配（比较 SPKI 公钥 DER）、有效期 */
export function checkCertificate(certPem: string, keyPem: string, now: Date = new Date()): CertCheckResult {
  const warnings: string[] = [];
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch (e) {
    return { error: `证书 PEM 解析失败：${(e as Error).message}`, warnings };
  }
  let key;
  try {
    key = createPrivateKey(keyPem);
  } catch (e) {
    return { error: `私钥解析失败：${(e as Error).message}`, warnings };
  }
  const certPub = cert.publicKey.export({ format: 'der', type: 'spki' });
  const keyPub = createPublicKey(key).export({ format: 'der', type: 'spki' });
  if (!Buffer.from(certPub).equals(Buffer.from(keyPub))) {
    return { error: '证书与私钥不匹配（公钥不一致）', warnings };
  }
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  if (now < validFrom) warnings.push(`证书尚未生效（生效时间 ${cert.validFrom}）`);
  if (now > validTo) warnings.push(`证书已过期（过期时间 ${cert.validTo}），浏览器将提示不受信任`);
  return { error: null, warnings };
}

export interface ServePlan {
  secure: boolean;
  port: number;
  /** secure=true 时的 PEM 内容 */
  cert?: string;
  key?: string;
  warnings: string[];
}

/**
 * http/https 决策：
 * 无证书配置且约定文件不存在 → HTTP（端口 serve.port ?? 8080）；
 * 证书读取失败 / 校验有致命问题 → 警告 + 降级 HTTP；
 * 证书仅过期/未生效 → 警告但保持 HTTPS（端口 serve.port ?? 8443）。
 */
export function planServe(rootDir: string, siteRaw: unknown, io: ServeIO, now?: Date): ServePlan {
  const cfg = normalizeServeConfig((siteRaw as Record<string, unknown> | null)?.serve);
  const warnings: string[] = [];
  const http = (): ServePlan => ({ secure: false, port: cfg.port ?? DEFAULT_HTTP_PORT, warnings });

  // 约定目录只有单个文件：显式提醒（不成对无法启用）
  const convCert = path.join(rootDir, 'certs', 'cert.pem');
  const convKey = path.join(rootDir, 'certs', 'key.pem');
  if (!cfg.ssl?.cert && !cfg.ssl?.key && (io.exists(convCert) !== io.exists(convKey))) {
    warnings.push('certs/ 目录下 cert.pem 与 key.pem 不成对，无法启用 HTTPS，已降级 HTTP。');
    return http();
  }

  const files = resolveCertFiles(rootDir, cfg, io);
  if (!files) return http();

  let cert: string, key: string;
  try {
    cert = io.read(files.certPath);
    key = io.read(files.keyPath);
  } catch (e) {
    warnings.push(
      `证书文件读取失败（${files.source === 'config' ? 'serve.ssl 配置' : 'certs/ 约定'}）：${(e as Error).message}，已降级 HTTP。`
    );
    return http();
  }

  const check = checkCertificate(cert, key, now);
  if (check.error) {
    warnings.push(`证书无效：${check.error}，已降级 HTTP。`);
    return http();
  }
  warnings.push(...check.warnings);
  return { secure: true, port: cfg.port ?? DEFAULT_HTTPS_PORT, cert, key, warnings };
}

/** 静态资源 MIME（按扩展名；未知类型 octet-stream） */
export const SERVE_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
};

/**
 * URL 路径 → dist/ 内文件（多页静态直出，无 SPA 回退）：
 * `/a/` → a/index.html；`/a` → a 或 a/index.html 或 a.html（Astro directory 产物）；
 * 穿越（..）与无法解码的路径返回 null。
 */
export function resolveStaticPath(distDir: string, pathname: string, io: ServeIO): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const clean = path.posix.normalize(decoded.split('?')[0]).replace(/^([/\\])+/, '');
  if (clean === '..' || clean.startsWith(`..${path.sep}`) || clean.startsWith('../')) return null;
  const candidates = decoded.endsWith('/')
    ? [path.join(clean, 'index.html')]
    : [clean, path.join(clean, 'index.html'), `${clean}.html`];
  for (const rel of candidates) {
    const abs = path.resolve(distDir, rel);
    if (!abs.startsWith(path.resolve(distDir) + path.sep)) continue;
    if (io.kind(abs) === 'file') return abs;
  }
  return null;
}
