/**
 * SPA 入口：顶栏（保存状态/预览/语言切换）+ 侧栏（页面/配置/素材）+ 主区路由。
 * 路由用 location.hash：#/page/<lang>/<file>、#/config/<section>、#/assets。
 */
import { createT, detectLang, type Lang } from '../shared/i18n.ts';
import { initialTheme, toggleTheme, type ThemeName } from '../../src/lib/theme.ts';
import { el, btn } from './dom.ts';
import { api, type PageMeta } from './api.ts';
import { renderPageEditor } from './views/pages.ts';
import {
  renderSiteConfig,
  renderGithubConfig,
  renderRssConfig,
  renderStreamingConfig,
} from './views/configs.ts';
import { renderThemePicker } from './views/theme.ts';
import { renderAssets } from './views/assets.ts';

export interface AppState {
  lang: Lang;
  t: (k: string) => string;
  setStatus: (msg: string, kind?: 'ok' | 'err') => void;
  navigate: (hash: string) => void;
  refreshSidebar: () => Promise<void>;
}

const LANG_KEY = 'oh-admin-lang';
const THEME_KEY = 'oh-admin-theme';

// ---- 编辑器界面亮/暗主题：localStorage 记忆，默认跟随系统（复用站点主题纯逻辑）----
function savedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyAdminTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

let state: AppState;
let pages: PageMeta[] = [];
let currentCleanup: (() => void) | null = null;

function route(): { name: string; parts: string[] } {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  return { name: parts[0] ?? 'page', parts };
}

async function refreshSidebar(): Promise<void> {
  const { pages: list } = await api.pages();
  pages = list;
  renderSidebar();
}

function renderSidebar(): void {
  const t = state.t;
  const sidebar = document.querySelector('.sidebar')!;
  sidebar.replaceChildren();

  // 页面（按语言目录分组）
  sidebar.append(el('div', { class: 'side-title' }, t('navPages')));
  const langs = [...new Set(pages.map((p) => p.lang))].sort();
  for (const lang of langs) {
    const group = el('div', { class: 'side-group' }, el('div', { class: 'side-lang' }, lang));
    for (const p of pages.filter((x) => x.lang === lang)) {
      const item = el(
        'a',
        { class: 'side-item', href: `#/page/${p.lang}/${p.file}` },
        p.title || p.file
      );
      group.append(item);
    }
    sidebar.append(group);
  }
  sidebar.append(
    el('div', { class: 'side-actions' }, btn(t('newPage'), () => openWizard(), 'btn-block'))
  );

  sidebar.append(el('div', { class: 'side-title' }, t('navConfig')));
  for (const [key, label] of [
    ['site', t('configSite')],
    ['github', t('configGithub')],
    ['rss', t('configRss')],
    ['streaming', t('configStreaming')],
    ['theme', t('configTheme')],
  ] as const) {
    sidebar.append(el('a', { class: 'side-item', href: `#/config/${key}` }, label));
  }

  sidebar.append(el('div', { class: 'side-title' }, t('navAssets')));
  sidebar.append(el('a', { class: 'side-item', href: '#/assets' }, t('navAssets')));
}

/** 新建页面向导 */
function openWizard(): void {
  const t = state.t;
  const overlay = el('div', { class: 'modal-overlay' });
  const langs = [...new Set(pages.map((p) => p.lang))].sort();
  const titleInput = el('input', { type: 'text', class: 'input' }) as HTMLInputElement;
  const slugInput = el('input', { type: 'text', class: 'input' }) as HTMLInputElement;
  const langSel = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const l of langs.length ? langs : ['zh']) langSel.append(el('option', { value: l }, l));
  const error = el('div', { class: 'form-error' });

  const close = () => overlay.remove();
  const submit = async () => {
    error.textContent = '';
    try {
      const r = await api.createPage(
        langSel.value,
        titleInput.value,
        slugInput.value || undefined
      );
      close();
      await state.refreshSidebar();
      state.navigate(`#/page/${langSel.value}/${r.file}`);
    } catch (e) {
      error.textContent = (e as Error).message;
    }
  };

  overlay.append(
    el(
      'div',
      { class: 'modal' },
      el('h3', {}, t('wizardTitle')),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, t('wizardPageTitle')), titleInput),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, t('wizardLang')), langSel),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, t('wizardSlug')), slugInput),
      error,
      el('div', { class: 'modal-ops' }, btn(t('wizardCreate'), () => void submit(), 'btn-primary'), btn(t('cancel'), close))
    )
  );
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.append(overlay);
  titleInput.focus();
}

async function renderMain(): Promise<void> {
  const main = document.querySelector<HTMLElement>('.main')!;
  currentCleanup?.();
  currentCleanup = null;
  main.replaceChildren();
  const { name, parts } = route();
  try {
    if (name === 'page' && parts.length >= 3) {
      currentCleanup = await renderPageEditor(main, state, parts[1], parts[2]);
    } else if (name === 'config') {
      const section = parts[1] ?? 'site';
      const renderers: Record<string, (c: HTMLElement, s: AppState) => Promise<void> | void> = {
        site: renderSiteConfig,
        github: renderGithubConfig,
        rss: renderRssConfig,
        streaming: renderStreamingConfig,
        theme: renderThemePicker,
      };
      await (renderers[section] ?? renderSiteConfig)(main, state);
    } else if (name === 'assets') {
      await renderAssets(main, state);
    } else {
      // 默认打开第一页
      if (pages.length > 0) {
        state.navigate(`#/page/${pages[0].lang}/${pages[0].file}`);
      } else {
        main.append(el('p', { class: 'muted' }, state.t('assetEmpty')));
      }
    }
  } catch (e) {
    main.replaceChildren(
      el('div', { class: 'error-box' }, `${state.t('loadFailed')}: ${(e as Error).message}`)
    );
  }
}

async function boot(): Promise<void> {
  const lang = detectLang(navigator.language, localStorage.getItem(LANG_KEY));
  const app = document.getElementById('app')!;
  applyAdminTheme(initialTheme(savedTheme(), 'system', systemDark()));
  // 系统主题变化：只在用户未手动选择时跟随
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (savedTheme() === null) applyAdminTheme(initialTheme(null, 'system', systemDark()));
  });

  state = {
    lang,
    t: createT(lang),
    setStatus(msg, kind) {
      const s = document.querySelector('.status')!;
      s.textContent = msg;
      s.className = `status ${kind ?? ''}`;
    },
    navigate(hash) {
      location.hash = hash;
    },
    refreshSidebar,
  };

  const info = await api.info();

  const statusEl = el('span', { class: 'status' });
  const langSel = el('select', { class: 'input lang-switch' }) as HTMLSelectElement;
  langSel.append(el('option', { value: 'zh' }, '中文'), el('option', { value: 'en' }, 'English'));
  langSel.value = lang;
  langSel.addEventListener('change', () => {
    localStorage.setItem(LANG_KEY, langSel.value);
    location.reload();
  });

  const previewBtn = btn(state.t('previewSite'), () => {
    void api.devStatus().then(({ up, url }) => {
      // url 由探测到的可连通 host 构造（外部 dev server 可能只绑 ::1）
      if (up) window.open(url ?? 'http://127.0.0.1:4321', '_blank');
      else state.setStatus(state.t('previewDown'), 'err');
    });
  });

  // 导出 data/ 压缩包（GET /api/export-data，浏览器直接下载）
  const exportBtn = el(
    'a',
    { class: 'btn', href: '/api/export-data', title: state.t('exportData') },
    state.t('exportData')
  );

  // 预览服务状态指示灯：绿=运行 / 黄=启动中 / 灰=未运行；点击手动停止/启动（重启=停后再启）
  const devDot = el('button', { class: 'dev-indicator', type: 'button' }) as HTMLButtonElement;
  devDot.append(el('span', { class: 'dev-dot' }));
  let devState: 'up' | 'starting' | 'down' = 'down';
  const paintDev = () => {
    devDot.classList.toggle('up', devState === 'up');
    devDot.classList.toggle('starting', devState === 'starting');
    const label =
      devState === 'up'
        ? state.t('devIndicatorRunning')
        : devState === 'starting'
          ? state.t('devIndicatorStarting')
          : state.t('devIndicatorStopped');
    devDot.title = label;
    devDot.setAttribute('aria-label', label);
  };
  const pollDev = async () => {
    try {
      const s = await api.devStatus();
      devState = s.up ? 'up' : s.starting ? 'starting' : 'down';
    } catch {
      devState = 'down';
    }
    paintDev();
  };
  devDot.addEventListener('click', () => {
    if (devState === 'starting') return;
    void (devState === 'up' ? api.devStop() : api.devStart())
      .then(() => pollDev())
      .catch((e) => state.setStatus((e as Error).message, 'err'));
  });
  paintDev();
  void pollDev();
  setInterval(() => void pollDev(), 5000);

  // 主题切换：小方块图标按钮（太阳/月亮，与站点同款）
  const themeBtn = el('button', {
    class: 'theme-toggle icon-btn',
    type: 'button',
    'aria-label': state.t('themeToggle'),
    title: state.t('themeToggle'),
  }) as HTMLButtonElement;
  themeBtn.innerHTML =
    '<svg class="icon icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4" />' +
    '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>' +
    '<svg class="icon icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>';
  themeBtn.addEventListener('click', () => {
    const next = toggleTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* 存储不可用时仍当页生效 */
    }
    applyAdminTheme(next);
  });

  app.append(
    el(
      'header',
      { class: 'topbar' },
      el('span', { class: 'logo' }, state.t('appTitle')),
      statusEl,
      el('span', { class: 'topbar-spacer' }),
      exportBtn,
      devDot,
      previewBtn,
      themeBtn,
      langSel
    ),
    el('div', { class: 'layout' }, el('aside', { class: 'sidebar' }), el('main', { class: 'main' }))
  );

  if (info.initialized) {
    document.querySelector('.topbar')!.after(
      el('div', { class: 'banner' }, state.t('initializedBanner'))
    );
  }

  await refreshSidebar();
  window.addEventListener('hashchange', () => void renderMain());
  await renderMain();
}

void boot();
