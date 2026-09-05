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
  scopeToggleLabel: string;
  clearLabel: string;
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
    scopeToggleLabel: '搜索范围',
    clearLabel: '清空搜索',
    closeLabel: '关闭',
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
    scopeToggleLabel: 'Search scope',
    clearLabel: 'Clear search',
    closeLabel: 'Close',
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
    scopeToggleLabel: '検索範囲',
    clearLabel: '検索内容をクリア',
    closeLabel: '閉じる',
    statusInitial: 'キーワードを入力して検索...',
    statusNoMatch: '一致する結果が見つかりませんでした',
    statusMatches: (n: number) => `${n} 件の結果`,
    navHint: '移動',
    selectHint: '選択',
    closeHint: '閉じる',
  },
  fr: {
    toggleLabel: 'Rechercher (Ctrl+K)',
    placeholder: 'Rechercher dans le site (Ctrl+K)...',
    scopeCurrent: 'Langue actuelle',
    scopeAll: 'Toutes les langues',
    scopeToggleLabel: 'Portée de recherche',
    clearLabel: 'Effacer la recherche',
    closeLabel: 'Fermer',
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
  const tokens = query.split(/\s+/).filter(Boolean);

  const matched: { item: SearchResultItem; score: number }[] = [];

  for (const item of items) {
    if (targetLang && targetLang !== 'all' && item.lang !== targetLang) {
      continue;
    }

    const titleLower = item.title.toLowerCase();
    const excerptLower = item.excerpt.toLowerCase();

    const titleExact = titleLower === query;
    const titleStartsWith = titleLower.startsWith(query);
    const titleIncludesQuery = titleLower.includes(query);
    const excerptIncludesQuery = excerptLower.includes(query);

    let titleTokensCount = 0;
    let excerptTokensCount = 0;

    for (const token of tokens) {
      if (titleLower.includes(token)) titleTokensCount++;
      if (excerptLower.includes(token)) excerptTokensCount++;
    }

    const allTokensMatch = tokens.every(
      (token) => titleLower.includes(token) || excerptLower.includes(token)
    );

    if (!titleIncludesQuery && !excerptIncludesQuery && !allTokensMatch) {
      continue;
    }

    let score = 0;
    if (titleExact) score += 1000;
    else if (titleStartsWith) score += 500;
    else if (titleIncludesQuery) score += 250;

    score += titleTokensCount * 60;
    if (excerptIncludesQuery) score += 40;
    score += excerptTokensCount * 15;

    let excerpt = item.excerpt;
    if (excerptLower.includes(query) && item.excerpt.length > 140) {
      const matchIdx = excerptLower.indexOf(query);
      const start = Math.max(0, matchIdx - 35);
      const end = Math.min(item.excerpt.length, matchIdx + query.length + 85);
      excerpt = (start > 0 ? '...' : '') + item.excerpt.slice(start, end).trim() + (end < item.excerpt.length ? '...' : '');
    }

    matched.push({
      item: {
        ...item,
        excerpt,
      },
      score,
    });
  }

  matched.sort((a, b) => b.score - a.score);

  return matched.map((m) => m.item);
}

export function buildSearchIndexItem(input: {
  url: string;
  title: string;
  html: string;
  lang: string;
}): SearchResultItem {
  // Strip ignored elements
  const clean = input.html
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
