/**
 * P0 学术成果数据层：publications.yaml + 可选 BibTeX 文件。
 * 纯 Node/纯函数实现，构建期完成过滤、排序、分组与 HTML 生成，页面运行时零脚本
 * （仅 BibTeX 复制按钮通过事件委托渐进增强）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { type LocalizedText, resolveText } from './localize.ts';
import { withBase } from './base-url.ts';
import { getUiLabels, normalizeUiLang } from './ui-i18n.ts';

export type PublicationType = 'conference' | 'journal' | 'workshop' | 'demo' | 'preprint' | 'thesis';

export interface PublicationLinks {
  pdf?: string;
  code?: string;
  project?: string;
  slides?: string;
  dataset?: string;
}

export interface PublicationItem {
  id: string;
  title: string;
  authors: string[];
  year: number;
  date?: string;
  type?: PublicationType;
  venue: string;
  venue_short?: string;
  badges?: string[];
  tags?: string[];
  note?: LocalizedText;
  abstract?: LocalizedText;
  links?: PublicationLinks;
  bibtex_key?: string;
  /** 载入后由 publications.bib 合并的原始 BibTeX */
  bibtex?: string;
  teaser?: string;
  order?: number;
}

export interface PublicationsConfig {
  enabled: boolean;
  bibtex_file?: string;
  highlight_authors?: string[];
  items: PublicationItem[];
}

export interface PublicationQuery {
  tag?: string;
  type?: string;
  year?: string;
  limit?: number;
  group?: 'none' | 'year' | 'type';
  sort?: 'date-desc' | 'date-asc' | 'venue' | 'order';
}

export interface RenderPublicationsOptions {
  lang?: string;
  defaultLang?: string;
  baseUrl?: string;
  highlightAuthors?: string[];
}

const BIBTEX_ENTRY_RE =
  /@(article|inproceedings|book|incollection|phdthesis|mastersthesis|techreport|unpublished|misc|proceedings|online)\s*\{\s*([^,\s]+)\s*,/gi;

/** 按括号深度截取完整 BibTeX entry，保留原始字段；@string/@comment 不视为论文条目。 */
export function parseBibtexEntries(
  text: string,
  warn: (message: string) => void = console.warn,
): Map<string, string> {
  const entries = new Map<string, string>();
  BIBTEX_ENTRY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BIBTEX_ENTRY_RE.exec(text))) {
    const key = match[2].toLowerCase();
    const open = text.indexOf('{', match.index + match[0].length - 1);
    if (open < 0) {
      warn(`BibTeX entry "${match[2]}" 缺少左花括号，已跳过 / missing brace`);
      continue;
    }
    let depth = 0;
    let end = -1;
    let quote: string | null = null;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote && text[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === '{') quote = ch === '"' ? '"' : quote;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) {
      warn(`BibTeX entry "${match[2]}" 括号不平衡，已跳过 / unbalanced braces`);
      continue;
    }
    const raw = text.slice(match.index, end + 1).trim();
    if (entries.has(key)) warn(`BibTeX key 重复，使用第一条 / duplicate key: ${key}`);
    else entries.set(key, raw);
  }
  return entries;
}

function normalizeItem(raw: Record<string, unknown>, index: number): PublicationItem {
  const title = typeof raw.title === 'string' ? raw.title : '';
  const authors = Array.isArray(raw.authors) ? raw.authors.filter((a): a is string => typeof a === 'string') : [];
  const venue = typeof raw.venue === 'string' ? raw.venue : '';
  const year = Number(raw.year);
  if (!title || !venue || !authors.length || !Number.isInteger(year)) {
    throw new Error(`publications.yaml items[${index}] 缺少 title/authors/year/venue 或字段非法`);
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${year}-${title}`,
    title,
    authors,
    year,
    date: typeof raw.date === 'string' ? raw.date : undefined,
    type: raw.type as PublicationType | undefined,
    venue,
    venue_short: typeof raw.venue_short === 'string' ? raw.venue_short : undefined,
    badges: Array.isArray(raw.badges) ? raw.badges.filter((b): b is string => typeof b === 'string') : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined,
    note: raw.note as LocalizedText | undefined,
    abstract: raw.abstract as LocalizedText | undefined,
    links: raw.links as PublicationLinks | undefined,
    bibtex_key: typeof raw.bibtex_key === 'string' ? raw.bibtex_key : undefined,
    teaser: typeof raw.teaser === 'string' ? raw.teaser : undefined,
    order: typeof raw.order === 'number' ? raw.order : undefined,
  };
}

export function loadPublications(dataDir: string, warn: (message: string) => void = console.warn): PublicationsConfig {
  const file = path.join(dataDir, 'publications.yaml');
  const raw = loadYaml(readFileSync(file, 'utf8')) as Omit<Partial<PublicationsConfig>, 'items'> & { items?: unknown[] };
  const items = (raw.items ?? []).map((item, i) => normalizeItem(item as Record<string, unknown>, i));
  const cfg: PublicationsConfig = {
    enabled: raw.enabled !== false,
    bibtex_file: typeof raw.bibtex_file === 'string' ? raw.bibtex_file : undefined,
    highlight_authors: Array.isArray(raw.highlight_authors) ? raw.highlight_authors.filter((v): v is string => typeof v === 'string') : undefined,
    items,
  };
  if (cfg.bibtex_file) {
    const bibFile = path.join(dataDir, cfg.bibtex_file);
    try {
      const entries = parseBibtexEntries(readFileSync(bibFile, 'utf8'), warn);
      for (const item of cfg.items) {
        if (!item.bibtex_key) continue;
        const bib = entries.get(item.bibtex_key.toLowerCase());
        if (bib) item.bibtex = bib;
        else warn(`论文 "${item.id}" 的 BibTeX key "${item.bibtex_key}" 未找到 / key not found`);
      }
    } catch {
      warn(`无法读取 BibTeX 文件 ${bibFile} / cannot read BibTeX file`);
    }
  }
  return cfg;
}

function itemDate(item: PublicationItem): number {
  const time = Date.parse(item.date ?? `${item.year}-01-01`);
  return Number.isNaN(time) ? Date.UTC(item.year, 0, 1) : time;
}

export function filterPublications(items: PublicationItem[], query: PublicationQuery = {}): PublicationItem[] {
  const tags = (query.tag ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  let result = items.filter((item) => {
    if (query.type && item.type !== query.type) return false;
    if (query.year && String(item.year) !== query.year) return false;
    const itemTags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
    return tags.every((tag) => itemTags.has(tag));
  });
  result = [...result].sort((a, b) => {
    if (query.sort === 'date-asc') return itemDate(a) - itemDate(b) || a.id.localeCompare(b.id);
    if (query.sort === 'venue') return a.venue.localeCompare(b.venue) || itemDate(b) - itemDate(a);
    if (query.sort === 'order') return (a.order ?? Infinity) - (b.order ?? Infinity) || itemDate(b) - itemDate(a);
    return itemDate(b) - itemDate(a) || (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id);
  });
  return query.limit && query.limit > 0 ? result.slice(0, query.limit) : result;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(value: string | undefined, baseUrl?: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return withBase(value, baseUrl);
  if (value.startsWith('assets/')) return withBase(`/${value}`, baseUrl);
  return null;
}

const TYPE_ORDER: PublicationType[] = ['conference', 'journal', 'workshop', 'demo', 'preprint', 'thesis'];

function authorsHtml(item: PublicationItem, highlights: Set<string>): string {
  return item.authors
    .map((author) => highlights.has(author.trim().toLowerCase()) ? `<strong>${esc(author)}</strong>` : esc(author))
    .join(', ');
}

function linkHtml(label: string, url: string | null): string {
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : '';
}

export function renderPublications(
  items: PublicationItem[],
  options: RenderPublicationsOptions = {},
  query: PublicationQuery = {},
): string {
  const lang = options.lang;
  const defaultLang = options.defaultLang;
  const ui = getUiLabels(normalizeUiLang(lang ?? defaultLang));

  const highlights = new Set([...(options.highlightAuthors ?? []), ...[]].map((v) => v.trim().toLowerCase()));
  const matched = filterPublications(items, query);
  const group = query.group ?? 'year';
  if (!matched.length) {
    return `<section class="publications" data-group="none"><p class="publication-empty">${esc(ui.publications.empty)}</p></section>`;
  }
  const renderArticle = (item: PublicationItem, index: number): string => {
    const abstract = item.abstract ? resolveText(item.abstract, lang, defaultLang) : '';
    const note = item.note ? resolveText(item.note, lang, defaultLang) : '';
    const badges = (item.badges ?? []).map((b) => `<span class="publication-badge">${esc(b)}</span>`).join('');
    const links = item.links ?? {};
    const linkItems = [
      linkHtml('PDF', safeUrl(links.pdf, options.baseUrl)),
      linkHtml('Code', safeUrl(links.code, options.baseUrl)),
      linkHtml('Project', safeUrl(links.project, options.baseUrl)),
      linkHtml('Slides', safeUrl(links.slides, options.baseUrl)),
      linkHtml('Dataset', safeUrl(links.dataset, options.baseUrl)),
    ].filter(Boolean);
    const bibtexId = `bibtex-${esc(item.id)}`;
    const copyBtn = item.bibtex
      ? `<button type="button" class="publication-copy" data-copy-bibtex="${bibtexId}">${ui.publications.copyBibtex}</button>`
      : '';
    const hasActions = linkItems.length > 0 || copyBtn;
    const actionsRow = hasActions
      ? `<div class="publication-actions"><nav class="publication-links" aria-label="${ui.publications.linksAria}">${linkItems.join('')}${copyBtn}</nav></div>`
      : '';
    const bibtexBlock = item.bibtex
      ? `<div class="publication-bibtex"><pre id="${bibtexId}" tabindex="0" data-pagefind-ignore>${esc(item.bibtex)}</pre></div>`
      : '';
    const teaser = item.teaser
      ? `<picture class="publication-teaser"><img src="${esc(withBase(`/${item.teaser}`, options.baseUrl))}" alt="${esc(item.title)} figure" loading="lazy" decoding="async" sizes="(max-width: 768px) 100vw, 220px"></picture>`
      : '';
    return `<article class="publication-item"${item.teaser ? ' data-has-teaser="true"' : ''}>
      <div class="publication-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="publication-main">
        <p class="publication-meta"><span>${esc(item.venue)}</span>${badges}</p>
        <h3 class="publication-title">${esc(item.title)}</h3>
        <p class="publication-authors">${authorsHtml(item, highlights)}</p>
        ${note ? `<p class="publication-note">${esc(note)}</p>` : ''}
        ${abstract ? `<details class="publication-abstract"><summary>${ui.publications.abstract}</summary><div class="abstract-content"><p>${esc(abstract)}</p></div></details>` : ''}
        ${actionsRow}
        ${bibtexBlock}
      </div>
      ${teaser}
    </article>`;
  };
  let body = '';
  if (group === 'none') body = matched.map(renderArticle).join('');
  else if (group === 'type') {
    for (const type of TYPE_ORDER) {
      const groupItems = matched.filter((item) => (item.type ?? 'preprint') === type);
      if (!groupItems.length) continue;
      body += `<section class="publication-group"><h3 class="publication-group-title">${esc(type)}</h3>${groupItems.map(renderArticle).join('')}</section>`;
    }
  } else {
    for (const year of [...new Set(matched.map((item) => item.year))].sort((a, b) => b - a)) {
      const groupItems = matched.filter((item) => item.year === year);
      body += `<section class="publication-group"><h3 class="publication-group-title">${year}</h3>${groupItems.map(renderArticle).join('')}</section>`;
    }
  }
  return `<section class="publications" data-group="${esc(group)}">${body}</section>`;
}