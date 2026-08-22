/**
 * 标题 → slug 纯函数（编辑器新建向导与服务端共用）。
 * 拉丁字符转小写连字符；CJK 字符保留（文件名与路由均支持）。
 */

/** "My Research" → "my-research"；"研究方向" → "研究方向" */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** slug 合法性：字母/数字/CJK 开头，可含连字符；'/' 为主页特例 */
export function isValidSlug(slug: string): boolean {
  return slug === '/' || /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(slug);
}
