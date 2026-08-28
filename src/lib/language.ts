/** 站点语言工具：语言码归一化、显示名、语言路径改写（无 Node 依赖，构建侧与浏览器侧共用） */
import { stripBase, withBase } from './base-url.ts';

/** 站点语言码（页面目录名 / URL 前缀）：主语言子标签，如 zh / en / de */
export type SiteLanguage = string;

/** 合法主语言子标签：2–3 个小写字母（zh、en、de、yue …） */
const LANG_CODE_RE = /^[a-z]{2,3}$/;

/**
 * 归一化语言码：取主语言子标签（zh-CN → zh、pt_BR → pt）。
 * 传入 siteLangs（站点实际语言列表）时要求命中其中之一，防止跳转到不存在的语言；
 * 不传（单语言站点等无列表场景）只做格式校验。非法输入返回 null。
 */
export function normalizeSiteLanguage(
  value: string | null | undefined,
  siteLangs?: readonly string[]
): SiteLanguage | null {
  const lang = value?.toLowerCase().split(/[-_]/)[0];
  if (!lang || !LANG_CODE_RE.test(lang)) return null;
  if (siteLangs && !siteLangs.includes(lang)) return null;
  return lang;
}

/** 语言显示名（语言切换器菜单）：Intl.DisplayNames 自称名（de → Deutsch），不支持时回退原始语言码 */
export function languageDisplayName(lang: string): string {
  try {
    const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang);
    if (name && name.toLowerCase() !== lang.toLowerCase()) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch {
    /* Intl 不支持该语言码时回退原始 code */
  }
  return lang;
}

/** 语言菜单条目顺序：当前语言置顶，其余保持原站点语言顺序（稳定排序） */
export function orderLangMenu<T extends { lang: string }>(alternates: T[], currentLang: string): T[] {
  return [...alternates].sort((a, b) =>
    (a.lang === currentLang ? 0 : 1) - (b.lang === currentLang ? 0 : 1),
  );
}

/** 把当前路径去掉语言前缀后，改写为目标语言的路径（search/hash 由调用方拼接） */
export function localizedPathname(
  lang: SiteLanguage,
  pathname: string,
  currentLang: SiteLanguage | null,
  defaultLang: string,
  base?: string
): string {
  const unbased = base ? stripBase(pathname, base) : pathname;
  let rest = unbased || '/';
  if (currentLang) {
    const prefix = `/${currentLang}`;
    if (rest === prefix || rest.startsWith(`${prefix}/`)) {
      rest = rest.slice(prefix.length) || '/';
    }
  }
  const target = lang === defaultLang ? (rest || '/') : (rest === '/' ? `/${lang}/` : `/${lang}${rest}`);
  return base ? withBase(target, base) : target;
}
