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
