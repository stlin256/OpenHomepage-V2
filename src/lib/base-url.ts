/**
 * 基础路径（base URL）工具函数：
 * 支持在 GitHub Pages 子路径（如 /OpenHomepage-V2/）与根路径（/）下无缝切换。
 */

/** 当前构建/运行时的 BASE_URL（尾部带 /，如 / 或 /OpenHomepage-V2/） */
export function getBaseUrl(): string {
  const envBase = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : undefined;
  return envBase || '/';
}

/** 为站内相对绝对路径补充 BASE_URL 前缀 */
export function withBase(path: string | undefined | null, base: string = getBaseUrl()): string {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:') ||
    path.startsWith('#') ||
    path.startsWith('data:')
  ) {
    return path;
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!cleanBase) return cleanPath;
  if (cleanPath === cleanBase || cleanPath.startsWith(`${cleanBase}/`)) {
    return cleanPath;
  }
  return `${cleanBase}${cleanPath}`;
}

/** 剥离开头的 BASE_URL 前缀，返回以 / 开头的路径 */
export function stripBase(path: string | undefined | null, base: string = getBaseUrl()): string {
  if (!path) return '/';
  const cleanBase = base.replace(/\/+$/, '');
  if (!cleanBase) return path.startsWith('/') ? path : `/${path}`;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath === cleanBase) return '/';
  if (cleanPath.startsWith(`${cleanBase}/`)) {
    const stripped = cleanPath.slice(cleanBase.length);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return cleanPath;
}