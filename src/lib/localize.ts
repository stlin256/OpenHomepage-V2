/** 多语言映射类型与解析：无 Node 依赖，构建侧与浏览器侧（编辑器 SPA）共用 */

/** 支持多语言映射的文案字段：纯字符串（所有语言通用）或 { zh, en, ... } 映射 */
export type LocalizedText = string | Record<string, string>;

/**
 * 多语言映射解析：纯字符串原样返回；{ zh, en, ... } 映射按语言取值，
 * 缺 key 回退 en → 网站主语言（传入 defaultLang 时）→ 任意可用值。
 */
export function resolveText(field: LocalizedText, lang: string, defaultLang?: string): string {
  if (typeof field === 'string') return field;
  const value =
    field[lang] ??
    field.en ??
    (defaultLang ? field[defaultLang] : undefined) ??
    Object.values(field)[0];
  return value ?? '';
}

/** 取规范名（缓存 key / 标识符用）：字符串原样；映射取 zh → en → 首个值 */
export function canonicalText(field: LocalizedText): string {
  if (typeof field === 'string') return field;
  return field.zh ?? field.en ?? Object.values(field)[0] ?? '';
}
