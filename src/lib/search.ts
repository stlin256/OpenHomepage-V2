/**
 * P1 全局静态搜索：搜索结果过滤、多语言作用域与索引预处理纯函数。
 */

export interface SearchResultItem {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  lang: string;
}

export interface SearchI18nStrings {
  toggleLabel: string;
  placeholder: string;
  scopeCurrent: string;
  scopeAll: string;
  closeLabel: string;
  statusInitial: string;
  statusNoMatch: string;
  statusMatches: (n: number) => string;
  navHint: string;
  selectHint: string;
  closeHint: string;
}

export const SEARCH_I18N: Record<string, SearchI18nStrings> = {
  zh: {
    toggleLabel: '搜索 (Ctrl+K)',
    placeholder: '搜索站内内容 (Ctrl+K)...',
    scopeCurrent: '当前语言',
    scopeAll: '全部语言',
    closeLabel: '关闭 (Esc)',
    statusInitial: '输入关键词开始搜索...',
    statusNoMatch: '未找到匹配结果',
    statusMatches: (n: number) => `找到 ${n} 条结果`,
    navHint: '切换',
    selectHint: '跳转',
    closeHint: '关闭',
  },
  en: {
    toggleLabel: 'Search (Ctrl+K)',
    placeholder: 'Search content (Ctrl+K)...',
    scopeCurrent: 'This language',
    scopeAll: 'All languages',
    closeLabel: 'Close (Esc)',
    statusInitial: 'Type keywords to search...',
    statusNoMatch: 'No results matched',
    statusMatches: (n: number) => `${n} match${n > 1 ? 'es' : ''} found`,
    navHint: 'Navigate',
    selectHint: 'Select',
    closeHint: 'Close',
  },
  ja: {
    toggleLabel: '検索 (Ctrl+K)',
    placeholder: 'サイト内を検索 (Ctrl+K)...',
    scopeCurrent: '現在の言語',
    scopeAll: 'すべての言語',
    closeLabel: '閉じる (Esc)',
    statusInitial: 'キーワードを入力して検索...',
    statusNoMatch: '一致する結果が見つかりませんでした',
    statusMatches: (n: number) => `${n} 件的结果`,
    navHint: '移動',
    selectHint: '選択',
    closeHint: '閉じる',
  },
  fr: {
    toggleLabel: 'Rechercher (Ctrl+K)',
    placeholder: 'Rechercher dans le site (Ctrl+K)...',
    scopeCurrent: 'Langue actuelle',
    scopeAll: 'Toutes les langues',
    closeLabel: 'Fermer (Esc)',
    statusInitial: 'Tapez pour rechercher...',
    statusNoMatch: 'Aucun résultat trouvé',
    statusMatches: (n: number) => `${n} résultat${n > 1 ? 's' : ''}`,
    navHint: 'Naviguer',
    selectHint: 'Sélectionner',
    closeHint: 'Fermer',
  },
};

export function getSearchI18n(lang?: string): SearchI18nStrings {
  const code = (lang || 'zh').toLowerCase().split(/[-_]/)[0];
  return SEARCH_I18N[code] ?? SEARCH_I18N.zh;
}

export function filterSearchResults(
  items: SearchResultItem[],
  rawQuery: string,
  options: { lang?: string } = {}
): SearchResultItem[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const targetLang = options.lang;

  const filtered = items.filter((item) => {
    if (targetLang && targetLang !== 'all' && item.lang !== targetLang) {
      return false;
    }
    const titleMatch = item.title.toLowerCase().includes(query);
    const excerptMatch = item.excerpt.toLowerCase().includes(query);
    return titleMatch || excerptMatch;
  });

  return filtered.sort((a, b) => {
    const aInTitle = a.title.toLowerCase().includes(query) ? 1 : 0;
    const bInTitle = b.title.toLowerCase().includes(query) ? 1 : 0;
    return bInTitle - aInTitle;
  });
}

export function buildSearchIndexItem(input: {
  url: string;
  title: string;
  html: string;
  lang: string;
}): SearchResultItem {
  // Strip ignored elements
  let clean = input.html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<pre\b[^>]*data-pagefind-ignore[^>]*>[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<div\b[^>]*data-pagefind-ignore[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<nav\b[^>]*data-pagefind-ignore[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const excerpt = clean.length > 300 ? clean.slice(0, 300) + '...' : clean;

  return {
    id: input.url,
    url: input.url,
    title: input.title,
    excerpt,
    lang: input.lang,
  };
}