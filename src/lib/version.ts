/**
 * 站点版本号：唯一事实来源为 package.json 的 version 字段。
 *
 * 页面正文（data/pages/<lang>/*.md）中可使用 {{version}} 占位符，
 * 渲染（renderMarkdown）与搜索索引（search-index）时统一替换，
 * 避免在 data.example 示例内容（如 about 页版本胶囊）中硬编码版本号。
 * 注意：直接调用 createMarkdownProcessor 的场景（如 stream）不经替换。
 */

import pkg from '../../package.json';

export const SITE_VERSION: string = pkg.version;

/** 替换文本中的 {{version}} 占位符为当前版本号 */
export function substituteVersion(text: string): string {
  return text.replaceAll('{{version}}', SITE_VERSION);
}
