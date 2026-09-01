/**
 * P1 长文目录（TOC）与标题 slug 提取：纯函数实现，构建期零 JS 依赖。
 */

export interface TocItem {
  depth: number;
  text: string;
  slug: string;
  id: string;
}

import { getUiLabels, normalizeUiLang } from './ui-i18n.ts';

export interface TocOptions {
  maxDepth?: number;
  title?: string;
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\{#[^}]+\}/g, '') // remove custom {#id}
    .replace(/!\[.*?\]\(.*?\)/g, '') // remove images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // link text
    .replace(/[*_`~]/g, '') // bold/italic/code/strikethrough
    .replace(/<[^>]+>/g, '') // html tags
    .trim();
}

export function generateHeadingSlug(text: string, existing: Set<string>, fallbackIndex = 1): string {
  const clean = cleanHeadingText(text);
  let base = clean
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '') // retain letters, numbers, spaces, hyphens, underscores
    .trim()
    .replace(/\s+/g, '-');

  if (!base) {
    base = `section-${fallbackIndex}`;
  }

  let slug = base;
  let counter = 2;
  while (existing.has(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }
  existing.add(slug);
  return slug;
}

export function shouldEnableToc(
  setting: boolean | 'auto' | undefined,
  charCount: number,
  headingCount: number
): boolean {
  if (setting === true) return true;
  if (setting === false) return false;
  if (setting === 'auto') {
    return charCount >= 1800 || headingCount >= 4;
  }
  return false;
}

export function extractToc(
  markdown: string,
  options: TocOptions = {}
): TocItem[] {
  const maxDepth = options.maxDepth ?? 3;
  const existingSlugs = new Set<string>();
  const items: TocItem[] = [];

  // Match markdown ATX headings: ## Heading, ### Heading, #### Heading
  const headingRe = /^(#{2,4})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = headingRe.exec(markdown)) !== null) {
    const depth = match[1].length;
    if (depth > maxDepth) continue;
    const rawText = match[2].trim();
    // Check if custom id exists {#custom-id}
    const customIdMatch = rawText.match(/\{#([a-zA-Z0-9-_]+)\}/);
    let id: string;
    if (customIdMatch) {
      id = customIdMatch[1];
      existingSlugs.add(id);
    } else {
      id = generateHeadingSlug(rawText, existingSlugs, index);
    }
    const text = cleanHeadingText(rawText);
    items.push({ depth, text, slug: id, id });
    index++;
  }

  return items;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderTocHtml(items: TocItem[], options: { title?: string; lang?: string } = {}): string {
  if (items.length === 0) return '';
  const title = options.title ?? getUiLabels(normalizeUiLang(options.lang)).toc.title;
  const listItems = items
    .map(
      (item) =>
        `<li class="toc-item toc-depth-${item.depth}"><a href="#${escapeHtml(item.slug)}" class="toc-link">${escapeHtml(item.text)}</a></li>`
    )
    .join('\n');

  return `<nav class="toc" aria-label="${escapeHtml(title)}" data-pagefind-ignore>
  <div class="toc-header">
    <p class="toc-title">${escapeHtml(title)}</p>
  </div>
  <div class="toc-track">
    <div class="toc-marker" aria-hidden="true"></div>
    <ol class="toc-list">
${listItems}
    </ol>
  </div>
</nav>`;
}
