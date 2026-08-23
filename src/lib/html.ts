/** 共享的 HTML 转义（纯函数，浏览器安全）：卡片/页脚等字符串拼 HTML 处共用 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
