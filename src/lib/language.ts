/** 站点当前支持的语言（页面目录名 / URL 前缀） */
import { stripBase, withBase } from './base-url.ts';

export type SiteLanguage = 'zh' | 'en';

/** 归一化主语言子标签；只接受站点当前支持的 zh/en */
export function normalizeSiteLanguage(value: string | null | undefined): SiteLanguage | null {
  const lang = value?.toLowerCase().split(/[-_]/)[0];
  return lang === 'zh' || lang === 'en' ? lang : null;
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