/**
 * GitHub 官网仓库卡 1:1 纯函数层（浏览器安全：无 node 依赖，编辑器 SPA 也经此复用）。
 * 视图模型/缓存读取在 src/lib/github-block.ts（node 侧）；本文件只放纯渲染逻辑：
 * octicons 内联 SVG、linguist 语言色、紧凑计数、相对时间、卡片 HTML。
 */
import type { GithubPinnedRepo } from './prefetch.ts';
import { escapeHtml } from './html.ts';
import { resolveText } from './localize.ts';

export { escapeHtml };

/** 官方 octicons（内联 SVG，不引依赖）：repo / star / repo-forked，16×16 */
export const OCTICONS = {
  repo: '<svg class="gh-octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25v3.25a.25.25 0 0 0 .4.2l1.45-1.087a.249.249 0 0 1 .3 0L8.6 15.7a.25.25 0 0 0 .4-.2v-3.25a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25Z"/></svg>',
  star: '<svg class="gh-octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>',
  fork: '<svg class="gh-octicon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 1.5 0Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>',
} as const;

/** 未知语言的灰色圆点（GitHub 未识别语言） */
export const LANGUAGE_COLOR_UNKNOWN = '#8b949e';

/** GitHub linguist 官方语言色（常见子集；键为小写） */
const LANGUAGE_COLORS: Record<string, string> = {
  python: '#3572A5',
  javascript: '#f1e05a',
  typescript: '#3178c6',
  'c++': '#f34b7d',
  c: '#555555',
  'c#': '#178600',
  go: '#00ADD8',
  rust: '#dea584',
  java: '#b07219',
  shell: '#89e051',
  html: '#e34c26',
  css: '#663399',
  scss: '#c6538c',
  less: '#1d365d',
  ruby: '#701516',
  php: '#4F5D95',
  swift: '#F05138',
  kotlin: '#A97BFF',
  dart: '#00B4AB',
  r: '#198CE7',
  lua: '#000080',
  haskell: '#5e5086',
  vue: '#41b883',
  svelte: '#ff3e00',
  astro: '#ff5a03',
  zig: '#ec915c',
  'jupyter notebook': '#DA5B0B',
  dockerfile: '#384d54',
  makefile: '#427819',
  cmake: '#DA3434',
  matlab: '#e16737',
  tex: '#3D6117',
  scala: '#c22d40',
  elixir: '#6e4a7e',
  clojure: '#db5855',
  'objective-c': '#438eff',
  perl: '#0298c3',
  powershell: '#012456',
  nix: '#7e7eff',
  yaml: '#cb171e',
  markdown: '#083fa1',
};

/**
 * 语言 → 官方色（大小写不敏感）：无语言（null/空）→ null（调用方不渲染）；
 * 未知语言 → 灰色 LANGUAGE_COLOR_UNKNOWN。
 */
export function languageColor(lang: string | null | undefined): string | null {
  if (!lang || !lang.trim()) return null;
  return LANGUAGE_COLORS[lang.trim().toLowerCase()] ?? LANGUAGE_COLOR_UNKNOWN;
}

/** GitHub 风紧凑计数：999 原样，1234 → 1.2k（floor），1.5M 同理 */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  for (const [div, suf] of [[1_000_000, 'M'], [1000, 'k']] as const) {
    if (n >= div) {
      const v = Math.floor((n / div) * 10) / 10;
      return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}${suf}`;
    }
  }
  return String(n);
}

/** 千分位逗号计数（"2,467 contributions" 顶部行用） */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * "Updated xxx" 相对时间（GitHub 风，四语）：<1min 刚刚；<60min N 分钟；
 * <24h N 小时；<31d N 天；更早落回日期。非法/缺失输入返回空串。
 */
export function relativeUpdated(
  iso: string | null | undefined,
  now: number,
  lang: string,
): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (lang === 'ja') {
    if (mins < 1) return 'たった今更新';
    if (mins < 60) return `${mins} 分前に更新`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 時間前に更新`;
    const days = Math.floor(hours / 24);
    if (days < 31) return `${days} 日前に更新`;
    return `${iso.slice(0, 10)} に更新`;
  }
  if (lang === 'fr') {
    if (mins < 1) return 'Mis à jour à l’instant';
    if (mins < 60) return `Mis à jour il y a ${mins} minute${mins === 1 ? '' : 's'}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Mis à jour il y a ${hours} heure${hours === 1 ? '' : 's'}`;
    const days = Math.floor(hours / 24);
    if (days < 31) return `Mis à jour il y a ${days} jour${days === 1 ? '' : 's'}`;
    return `Mis à jour le ${iso.slice(0, 10)}`;
  }
  if (mins < 1) return lang === 'zh' ? '刚刚更新' : 'Updated just now';
  if (mins < 60) return lang === 'zh' ? `更新于 ${mins} 分钟前` : `Updated ${plural(mins, 'minute')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === 'zh' ? `更新于 ${hours} 小时前` : `Updated ${plural(hours, 'hour')}`;
  const days = Math.floor(hours / 24);
  if (days < 31) return lang === 'zh' ? `更新于 ${days} 天前` : `Updated ${plural(days, 'day')}`;
  const date = iso.slice(0, 10);
  return lang === 'zh' ? `更新于 ${date}` : `Updated on ${date}`;
}

/** 卡片 topics 渲染上限（GitHub 风 pill，超出截断保持卡片等高观感） */
export const TOPICS_MAX = 6;

/**
 * pinned 仓库卡片 HTML（主页 github 区块与 markdown `::ghcard` 占位替换共用），
 * 1:1 复刻 github.com 仓库卡：repo octicon + owner/repo 标题链接（owner 普通色、
 * repo 加粗主题色）→ 描述（note 优先）→ topics pill → 语言色点/star/fork/Updated。
 */
export function repoCardHtml(
  repo: GithubPinnedRepo,
  opts: { lang?: string; now?: number } = {},
): string {
  const lang = opts.lang ?? 'en';
  const now = opts.now ?? Date.now();
  const noteText = repo.note != null ? resolveText(repo.note, lang) : '';
  const desc = noteText || repo.description || '';
  const [owner, name] = repo.full_name.split('/');
  const url = repo.html_url ?? `https://github.com/${repo.full_name}`;

  const topics = (repo.topics ?? []).slice(0, TOPICS_MAX);
  const topicsHtml = topics.length
    ? `<span class="gh-repo-topics">${topics
        .map(
          (t) =>
            `<a class="gh-topic" href="https://github.com/topics/${encodeURIComponent(t)}" target="_blank" rel="noopener">${escapeHtml(t)}</a>`,
        )
        .join('')}</span>`
    : '';

  const meta: string[] = [];
  const langColor = languageColor(repo.language);
  if (repo.language && langColor) {
    meta.push(
      `<span class="gh-meta gh-lang"><i class="gh-lang-dot" style="background-color:${langColor}"></i>${escapeHtml(repo.language)}</span>`,
    );
  }
  if (repo.stargazers_count !== undefined) {
    meta.push(`<span class="gh-meta gh-stars">${OCTICONS.star}${compactCount(repo.stargazers_count)}</span>`);
  }
  if (repo.forks_count !== undefined) {
    meta.push(`<span class="gh-meta gh-forks">${OCTICONS.fork}${compactCount(repo.forks_count)}</span>`);
  }
  const updated = relativeUpdated(repo.updated_at, now, lang);
  if (updated) meta.push(`<span class="gh-meta gh-updated">${escapeHtml(updated)}</span>`);

  return (
    `<div class="gh-repo">` +
    `<span class="gh-repo-head">${OCTICONS.repo}` +
    `<a class="gh-repo-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">` +
    `<span class="gh-repo-owner">${escapeHtml(owner ?? repo.full_name)}</span>` +
    `<span class="gh-repo-sep">/</span>` +
    `<span class="gh-repo-name">${escapeHtml(name ?? '')}</span>` +
    `</a></span>` +
    (desc ? `<span class="gh-repo-desc">${escapeHtml(desc)}</span>` : '') +
    topicsHtml +
    (meta.length ? `<span class="gh-repo-meta">${meta.join('')}</span>` : '') +
    `</div>`
  );
}
