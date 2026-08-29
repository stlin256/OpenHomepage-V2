/**
 * P1 全局静态搜索客户端（Cmd+K / Ctrl+K）：
 * - 拦截快捷键与搜索按钮，呼出杂志风毛玻璃搜索框；
 * - 支持 Pagefind 分片静态索引与本地轻量索引渐进增强回退；
 * - 支持中英文分词检索、多语言作用域切换、键盘上下键导航与回车跳转；
 * - 支持弹窗打开/关闭平滑动画过渡与多语言 i18n 动态同步。
 */
import { filterSearchResults, getSearchI18n, type SearchResultItem } from '../lib/search.ts';

let pagefindInstance: any = null;
let pagefindLoaded = false;

async function loadPagefind(): Promise<any> {
  if (pagefindLoaded) return pagefindInstance;
  try {
    const base = document.documentElement.dataset.base || '/';
    const cleanBase = base.replace(/\/+$/, '');
    const pagefindModule = await import(/* @vite-ignore */ `${cleanBase}/pagefind/pagefind.js`);
    if (pagefindModule && pagefindModule.search) {
      await pagefindModule.init?.();
      pagefindInstance = pagefindModule;
    }
  } catch {
    pagefindInstance = null;
  }
  pagefindLoaded = true;
  return pagefindInstance;
}

function collectLocalSearchItems(): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  document.querySelectorAll<HTMLAnchorElement>('.site-nav a, .home-block a, .publication-item, .timeline-item').forEach((el, idx) => {
    const link = el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>('a');
    const titleEl = el.querySelector('h2, h3, .publication-title, .timeline-item-title') || el;
    const title = titleEl.textContent?.trim();
    const href = link?.getAttribute('href');
    if (title && href && href.startsWith('/')) {
      const excerpt = el.textContent?.replace(/\s+/g, ' ').slice(0, 160) || '';
      items.push({
        id: href + '#' + idx,
        url: href,
        title,
        excerpt,
        lang: document.documentElement.dataset.routeLang || 'zh',
      });
    }
  });
  return items;
}

export function initSearch(): void {
  const dialog = document.querySelector<HTMLDialogElement>('.search-dialog');
  const toggleBtn = document.querySelector<HTMLButtonElement>('.search-toggle');
  if (!dialog) return;

  const input = dialog.querySelector<HTMLInputElement>('.search-input');
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.search-close');
  const resultsList = dialog.querySelector<HTMLUListElement>('.search-results');
  const statusEl = dialog.querySelector<HTMLElement>('.search-status');
  const scopeBtns = dialog.querySelectorAll<HTMLButtonElement>('.search-scope-btn');

  let currentScope: 'current' | 'all' = 'current';
  let activeIndex = -1;
  let currentResults: SearchResultItem[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchGeneration = 0;
  let isClosing = false;

  const syncI18n = () => {
    const lang = document.documentElement.dataset.routeLang || 'zh';
    const dict = getSearchI18n(lang);
    if (input) {
      input.placeholder = dict.placeholder;
      input.setAttribute('aria-label', dict.placeholder);
    }
    if (toggleBtn) toggleBtn.setAttribute('aria-label', dict.toggleLabel);
    const currentBtn = dialog.querySelector<HTMLButtonElement>('.search-scope-btn[data-scope="current"]');
    const allBtn = dialog.querySelector<HTMLButtonElement>('.search-scope-btn[data-scope="all"]');
    if (currentBtn) currentBtn.textContent = dict.scopeCurrent;
    if (allBtn) allBtn.textContent = dict.scopeAll;
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
    input?.focus();
    input?.select();
    void loadPagefind();
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

  scopeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      scopeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentScope = (btn.dataset.scope as 'current' | 'all') || 'current';
      performSearch(input?.value ?? '');
    });
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
        <a href="${item.url}" class="search-result-link">
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
    if (!query) {
      currentResults = [];
      activeIndex = -1;
      if (statusEl) statusEl.textContent = dict.statusInitial;
      renderResults();
      return;
    }

    const currentLang = lang;
    const scopeLang = currentScope === 'current' ? currentLang : 'all';

    const pagefind = await loadPagefind();
    if (pagefind && pagefind.search) {
      try {
        const searchOptions: any = {};
        if (scopeLang !== 'all') {
          searchOptions.filters = { lang: scopeLang };
        }
        const searchRes = await pagefind.search(query, searchOptions);
        if (generation !== searchGeneration) return;

        const rawResults = await Promise.all(searchRes.results.slice(0, 8).map((r: any) => r.data()));
        currentResults = rawResults.map((r: any) => ({
          id: r.url,
          url: r.url,
          title: r.meta?.title || r.url,
          excerpt: r.excerpt?.replace(/<[^>]+>/g, '') || '',
          lang: r.filters?.lang?.[0] || currentLang,
        }));
        activeIndex = currentResults.length > 0 ? 0 : -1;
        renderResults();
        return;
      } catch {
        /* fallback to local search on error */
      }
    }

    // Local search fallback
    const localItems = collectLocalSearchItems();
    currentResults = filterSearchResults(localItems, query, { lang: scopeLang }).slice(0, 8);
    activeIndex = currentResults.length > 0 ? 0 : -1;
    renderResults();
  };

  input?.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch(input.value);
    }, 120);
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
        else location.href = target.url;
      }
    }
  });
}