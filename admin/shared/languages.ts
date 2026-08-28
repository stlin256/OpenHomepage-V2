/**
 * 站点内容语言工具（admin 侧）：常用语言自称名列表 + 语言下拉选项构建。
 * 注意与编辑器界面自身 i18n（仅 zh/en，见 i18n.ts）区分：这里管的是站点内容语言（任意语言目录）。
 */

/** 常用语言（自称名）：新建页面 / 创建译文时的快捷选项，免去手输语言码 */
export const COMMON_LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'ko', name: '한국어' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
] as const;

/** 语言码 → 自称名；未收录语言经 Intl.DisplayNames 取名，再回退原始码 */
export function languageName(code: string): string {
  const known = COMMON_LANGUAGES.find((l) => l.code === code);
  if (known) return known.name;
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    /* Intl 不支持该语言码时回退原始 code */
  }
  return code;
}

export interface LanguageOption {
  code: string;
  /** 下拉显示："自称名 (code)"，如 "中文 (zh)" */
  label: string;
  /** true = 项目已有该语言目录；false = 常用语言（选中即新建语言目录） */
  existing: boolean;
}

/**
 * 语言下拉选项：项目已有语言在前（按传入顺序），常用语言中尚未建目录的随后。
 * exclude 用于排除不可选项（如创建译文时，已拥有该页面的语言不再列出）。
 */
export function languageOptions(
  existingLangs: readonly string[],
  exclude: readonly string[] = []
): LanguageOption[] {
  const skip = new Set(exclude);
  const existingSet = new Set(existingLangs);
  const toOption = (code: string, existing: boolean): LanguageOption => ({
    code,
    label: `${languageName(code)} (${code})`,
    existing,
  });
  return [
    ...existingLangs.filter((l) => !skip.has(l)).map((l) => toOption(l, true)),
    ...COMMON_LANGUAGES.filter((l) => !existingSet.has(l.code) && !skip.has(l.code)).map((l) =>
      toOption(l.code, false)
    ),
  ];
}
