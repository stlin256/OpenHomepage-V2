/**
 * markdown 源码 → 纯文本摘要（编辑器流式区块卡片预览等场景）。
 * 去掉 frontmatter/代码围栏/指令行/图片/链接语法/强调符号/HTML 标签，
 * 压缩空白后按码点截断（不劈开代理对）。
 */
export function markdownExcerpt(md: string, max = 120): string {
  let s = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''); // frontmatter
  s = s.replace(/```[\s\S]*?(?:```|$)/g, ' '); // 代码围栏
  s = s.replace(/`[^`\n]*`/g, ' '); // 行内代码
  s = s.replace(/^\s*:{2,}[^\n]*$/gm, ' '); // 指令围栏行（:::figure{...} 等）
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // 图片 → alt 文本
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // 链接 → 文字
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, ''); // 标题井号
  s = s.replace(/^\s{0,3}>\s?/gm, ''); // 引用标记
  s = s.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, ''); // 任务列表
  s = s.replace(/^\s*[-*+]\s+/gm, ''); // 列表符号
  s = s.replace(/<[^>]*>/g, ' '); // HTML 标签
  s = s.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1'); // 强调/删除线
  s = s.replace(/\s+/g, ' ').trim();
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : s;
}
