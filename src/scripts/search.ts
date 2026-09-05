/**
 * P1 全局静态搜索客户端（Cmd+K / Ctrl+K）：
 * - 拦截快捷键与搜索按钮，呼出杂志风毛玻璃搜索框；
 * - 支持全站静态 JSON 索引与本地轻量 DOM 索引渐进增强回退；
 * - 支持中英文分词检索、多语言作用域切换、键盘上下键导航与回车跳转；
 * - 支持弹窗打开/关闭平滑动画过渡与多语言 i18n 动态同步；
 * - 无任何 emoji 字符，清空与关闭按键统一现代矢量图标与视觉高度。
 */
import { filterSearchResults, getSearchI18n, type SearchResultItem } from '../lib/search.ts';

function formatSearchUrl(url: string): string {
  const base = document.documentElement.dataset.base || '/';
  const cleanBase = base.replace(/\/+$/, '');
  if (!cleanBase || url.startsWith('http://') || url.startsWith('https://')) return url;
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  if (cleanPath === cleanBase || cleanPath.startsWith(`${cleanBase}/`)) return cleanPath;
  return `${cleanBase}${cleanPath}`;
}

let cachedSiteIndex: SearchResultItem[] | null = null;
let indexFetching: Promise<SearchResultItem[]> | null = null;

async function loadSiteSearchIndex(): Promise<SearchResultItem[]> {
  if (cachedSiteIndex) return cachedSiteIndex;
  if (indexFetching) return indexFetching;

  indexFetching = (async () => {
    try {
      const base = document.documentElement.dataset.base || '/';
      const cleanBase = base.replace(/\/+$/, '');
      const url = `${cleanBase}/search-index.json`;
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as SearchResultItem[];
        if (Array.isArray(json) && json.length > 0) {
          cachedSiteIndex = json;
          return json;
        }
      }
    } catch {
      /* fallback to local collection */
    }
    return [];
  })();

  return indexFetching;
}

function collectLocalSearchItems(): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();
  const currentLang = document.documentElement.dataset.routeLang || 'zh';

  const addItem = (id: string, url: string, title: string, excerpt: string) => {
    if (!title || seen.has(id)) return;
    seen.add(id);
    items.push({ id, url, title, excerpt, lang: currentLang });
  };

  // 1. Page title
  const pageTitle = document.querySelector('h1')?.textContent?.trim() || document.title;
  addItem(location.pathname, location.pathname, pageTitle, document.querySelector('meta[name="description"]')?.getAttribute('content') || '');

  // 2. Headings with IDs or anchor links
  document.querySelectorAll<HTMLElement>('.markdown-body h2, .markdown-body h3, .markdown-body h4, .page-content h2, .page-content h3, .page-content h4, .component-demo-title').forEach((h) => {
    const text = h.textContent?.trim();
    if (!text) return;
    const id = h.id || h.getAttribute('id') || '';
    const href = id ? `${location.pathname}#${id}` : location.pathname;
    let sibling = h.nextElementSibling;
    let excerpt = '';
    while (sibling && !/^H[1-6]$/.test(sibling.tagName)) {
      const sText = sibling.textContent?.replace(/\s+/g, ' ').trim();
      if (sText) {
        excerpt += (excerpt ? ' ' : '') + sText;
        if (excerpt.length > 200) break;
      }
      sibling = sibling.nextElementSibling;
    }
    addItem(href, href, `${text} · ${pageTitle}`, excerpt.slice(0, 200) || text);
  });

  // 3. Navigation links & home blocks
  document.querySelectorAll<Element>('.site-nav a, .home-block a, .publication-item, .timeline-item, .rss-card, .editorial-item, .callout').forEach((el, idx) => {
    const link = el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>('a');
    const titleEl = el.querySelector('h2, h3, h4, .publication-title, .timeline-item-title, .callout-title, .rss-title, .editorial-item-title') || el;
    const title = titleEl.textContent?.trim();
    const href = link?.getAttribute('href') || location.pathname;
    const excerpt = el.textContent?.replace(/\s+/g, ' ').slice(0, 180) || '';
    if (title) {
      addItem(`${href}#item-${idx}`, href, title, excerpt);
    }
  });

  return items;
}

export function initSearch(): void {
  const dialog = document.querySelector<HTMLDialogElement>('.search-dialog');
  const toggleBtn = document.querySelector<HTMLButtonElement>('.search-toggle');
  if (!dialog) return;

  const input = dialog.querySelector<HTMLInputElement>('.search-input');
  const clearBtn = dialog.querySelector<HTMLButtonElement>('.search-clear-btn');
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.search-close');
  const resultsList = dialog.querySelector<HTMLUListElement>('.search-results');
  const statusEl = dialog.querySelector<HTMLElement>('.search-status');
  const scopeToggle = dialog.querySelector<HTMLButtonElement>('.search-scope-toggle');

  let currentScope: 'current' | 'all' = 'current';
  let activeIndex = -1;
  let currentResults: SearchResultItem[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchGeneration = 0;
  let isClosing = false;

  const updateClearBtn = () => {
    if (clearBtn && input) {
      clearBtn.hidden = !input.value;
    }
  };

  const updateScopeToggle = () => {
    if (!scopeToggle) return;
    const lang = document.documentElement.dataset.routeLang || 'zh';
    const dict = getSearchI18n(lang);
    scopeToggle.textContent = currentScope === 'current' ? dict.scopeCurrent : dict.scopeAll;
    scopeToggle.dataset.scope = currentScope;
    scopeToggle.setAttribute('aria-pressed', currentScope === 'all' ? 'true' : 'false');
    scopeToggle.setAttribute('title', dict.scopeToggleLabel);
    scopeToggle.setAttribute('aria-label', dict.scopeToggleLabel);
  };

  const syncI18n = () => {
    const lang = document.documentElement.dataset.routeLang || 'zh';
    const dict = getSearchI18n(lang);
    if (input) {
      input.placeholder = dict.placeholder;
      input.setAttribute('aria-label', dict.placeholder);
    }
    if (clearBtn) clearBtn.setAttribute('aria-label', dict.clearLabel);
    if (toggleBtn) toggleBtn.setAttribute('aria-label', dict.toggleLabel);
    updateScopeToggle();
    if (closeBtn) closeBtn.setAttribute('aria-label', dict.closeLabel);
    const navHint = dialog.querySelector('.search-hint-nav');
    const selectHint = dialog.querySelector('.search-hint-select');
    const closeHint = dialog.querySelector('.search-hint-close');
    if (navHint) navHint.textContent = dict.navHint;
    if (selectHint) selectHint.textContent = dict.selectHint;
    if (closeHint) closeHint.textContent = dict.closeHint;
    if (!input?.value.trim() && statusEl) {
      statusEl.textContent = dict.statusInitial;
    }
  };

  const openSearch = () => {
    isClosing = false;
    dialog.hidden = false;
    dialog.classList.remove('closing');
    if (!dialog.open) {
      dialog.showModal?.();
    }
    void dialog.offsetHeight;
    requestAnimationFrame(() => {
      dialog.classList.add('open');
    });
    syncI18n();
    updateClearBtn();
    input?.focus();
    input?.select();
    void loadSiteSearchIndex();
  };

  const closeSearch = () => {
    if (dialog.hidden || isClosing) return;
    isClosing = true;
    dialog.classList.remove('open');
    dialog.classList.add('closing');
    window.setTimeout(() => {
      dialog.hidden = true;
      dialog.classList.remove('closing');
      dialog.close?.();
      isClosing = false;
      toggleBtn?.focus();
    }, 220);
  };

  syncI18n();
  updateClearBtn();

  if (!toggleBtn?.dataset.searchInit) {
    if (toggleBtn) {
      toggleBtn.dataset.searchInit = '1';
      toggleBtn.addEventListener('click', () => openSearch());
    }

    // Global keyboard shortcuts: Cmd+K / Ctrl+K, or /
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dialog.hidden) openSearch();
        else closeSearch();
      } else if (e.key === '/' && dialog.hidden) {
        const target = e.target as HTMLElement | null;
        if (target && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
          e.preventDefault();
          openSearch();
        }
      }
    });
  }

  if (dialog.dataset.dialogInit === '1') return;
  dialog.dataset.dialogInit = '1';

  closeBtn?.addEventListener('click', () => closeSearch());
  clearBtn?.addEventListener('click', () => {
    if (input) {
      input.value = '';
      updateClearBtn();
      input.focus();
      void performSearch('');
    }
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeSearch();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeSearch();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });

  scopeToggle?.addEventListener('click', () => {
    currentScope = currentScope === 'current' ? 'all' : 'current';
    updateScopeToggle();
    void performSearch(input?.value ?? '');
  });

  const renderResults = () => {
    if (!resultsList) return;
    const lang = document.documentElement.dataset.routeLang || 'zh';
    const dict = getSearchI18n(lang);
    if (currentResults.length === 0) {
      resultsList.innerHTML = '';
      if (statusEl && input?.value.trim()) {
        statusEl.textContent = dict.statusNoMatch;
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = dict.statusMatches(currentResults.length);
    }

    resultsList.innerHTML = currentResults
      .map(
        (item, idx) => `
      <li class="search-item ${idx === activeIndex ? 'active' : ''}" data-index="${idx}">
        <a href="${formatSearchUrl(item.url)}" class="search-result-link">
          <div class="search-result-header">
            <span class="search-result-title">${item.title}</span>
            <span class="search-result-lang">${item.lang}</span>
          </div>
          <p class="search-result-excerpt">${item.excerpt}</p>
        </a>
      </li>
    `
      )
      .join('');

    resultsList.querySelectorAll('.search-item').forEach((el) => {
      el.addEventListener('click', () => {
        closeSearch();
      });
    });
  };

  const performSearch = async (queryText: string) => {
    const generation = ++searchGeneration;
    const query = queryText.trim();
    const lang = document.documentElement.dataset.routeLang || 'zh';
    const dict = getSearchI18n(lang);
    updateClearBtn();

    if (!query) {
      currentResults = [];
      activeIndex = -1;
      if (statusEl) statusEl.textContent = dict.statusInitial;
      renderResults();
      return;
    }

    const currentLang = lang;
    const scopeLang = currentScope === 'current' ? currentLang : 'all';

    let allItems: SearchResultItem[];
    const siteIndex = await loadSiteSearchIndex();
    if (siteIndex.length > 0) {
      allItems = siteIndex;
    } else {
      allItems = collectLocalSearchItems();
    }

    if (generation !== searchGeneration) return;

    currentResults = filterSearchResults(allItems, query, { lang: scopeLang }).slice(0, 12);
    activeIndex = currentResults.length > 0 ? 0 : -1;
    renderResults();
  };

  input?.addEventListener('input', () => {
    updateClearBtn();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch(input.value);
    }, 100);
  });

  input?.addEventListener('keydown', (e) => {
    if (currentResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentResults.length;
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
      renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = currentResults[activeIndex >= 0 ? activeIndex : 0];
      if (target) {
        closeSearch();
        const link = dialog.querySelector<HTMLAnchorElement>(`.search-item[data-index="${activeIndex >= 0 ? activeIndex : 0}"] a`);
        if (link) link.click();
        else location.href = formatSearchUrl(target.url);
      }
    }
  });
}
