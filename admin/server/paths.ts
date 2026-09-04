/**
 * 编辑器 API 的路径安全：所有客户端传入的相对路径统一规范化并限制在 data/ 内。
 * 任何穿越（..、绝对路径、盘符、反斜杠、URL 编码伪装）直接抛错。
 */
import path from 'node:path';

export class PathError extends Error {
  constructor(rel: string) {
    super(`路径非法：${rel} / Invalid path`);
    this.name = 'PathError';
  }
}

/** 已解码的相对路径合法性 + 限制在 baseDir 内，返回绝对路径 */
export function safeResolve(baseDir: string, rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.indexOf(String.fromCharCode(0)) >= 0) {
    throw new PathError(String(rel));
  }
  // 统一拒绝反斜杠（Windows 分隔符伪装），只接受 POSIX 风格
  if (rel.includes('\\')) throw new PathError(rel);
  // 编辑器自身产生的路径不含 %；出现即视为 URL 编码伪装，拒绝（防御深度）
  if (rel.includes('%')) throw new PathError(rel);
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) throw new PathError(rel);
  // 盘符 / 绝对路径
  if (/^[A-Za-z]:/.test(rel) || path.isAbsolute(rel)) throw new PathError(rel);
  const abs = path.resolve(baseDir, segments.join(path.sep));
  const base = path.resolve(baseDir);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new PathError(rel);
  return abs;
}

/** 允许快照/回滚的路径：pages/**、streaming/** 与根下 *.yaml、*.bib（BibTeX 导入追加前快照，spec 18） */
export function assertSnapshottable(rel: string): void {
  const ok =
    /^(pages|streaming)\/[^/].*/.test(rel) || /^[^/]+\.(ya?ml|bib)$/.test(rel);
  if (!ok) throw new PathError(rel);
}
