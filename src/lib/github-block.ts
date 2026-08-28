/**
 * GitHub 区块构建侧视图模型（docs/specs/07 缓存结构 + spec 09 贡献图 stagger）。
 * 读 .cache/github.json（prefetch 产物），产出渲染用纯数据：
 * - 贡献热力图：周×7 格子、5 档色阶（构建时从 accent 与底色混合计算）、
 *   月份/星期坐标轴与格子 tooltip 文案（GitHub 首页对齐）；
 * - pinned 仓库卡片（note 优先于官方描述；卡片渲染纯函数在 github-card.ts，转口导出）；
 * - error 且有旧数据 → 照常渲染 + stale 标记（组件据此显示"数据更新于"）；
 * - 本地无 PAT 的贡献图占位块 → placeholder；.cache 缺失 → null（组件渲染空态）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hexToRgb, rgbToHex, DARK_BG } from './theme.ts';
import type {
  CacheBlock,
  Contributions,
  GithubCache,
  GithubPinnedRepo,
} from './prefetch.ts';

// 卡片渲染纯函数拆到 github-card.ts（浏览器安全，编辑器 SPA 复用）；此处转口保持既有调用不变
export {
  OCTICONS,
  LANGUAGE_COLOR_UNKNOWN,
  languageColor,
  compactCount,
  formatCount,
  relativeUpdated,
  TOPICS_MAX,
  repoCardHtml,
} from './github-card.ts';

/** 读 .cache/github.json；文件缺失/损坏时 warning 并返回 null（构建侧空态，报错闸口在 prefetch） */
export function loadGithubCache(
  cacheDir: string,
  warn: (msg: string) => void = console.warn,
): GithubCache | null {
  const file = path.join(cacheDir, 'github.json');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    warn(
      `读不到 ${file}，GitHub 区块渲染空态；请先运行 npm run prefetch。/` +
        ` ${file} not found; GitHub block renders an empty state. Run \`npm run prefetch\` first.`,
    );
    return null;
  }
  try {
    return JSON.parse(text) as GithubCache;
  } catch (e) {
    warn(`解析 ${file} 失败（${(e as Error).message}），GitHub 区块渲染空态。`);
    return null;
  }
}

/** 按 ratio（0–1，a 的占比）混合两个 hex 颜色 */
export function mixHex(a: string, b: string, ratio: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: ca.r * r + cb.r * (1 - r),
    g: ca.g * r + cb.g * (1 - r),
    b: ca.b * r + cb.b * (1 - r),
  });
}

/** 热力图档位数：0 档（无贡献）+ 4 档 */
export const HEAT_LEVELS = 5;

/**
 * 贡献数 → 档位（0–4）：0 次为 0 档；非零按当年单日最大值线性分 4 档。
 * 与 GitHub 官方（分位数）不同，采用可预测的线性分档（决策见 spec 09）。
 */
export function heatLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.max(1, Math.min(HEAT_LEVELS - 1, Math.ceil((count / maxCount) * (HEAT_LEVELS - 1))));
}

/** 5 档色阶：0 档为中性灰（与底色混合），1–4 档 accent 渐强（末档为 accent 原色） */
export function heatScale(accent: string, bg: string): string[] {
  return [
    mixHex('#808891', bg, 0.14),
    mixHex(accent, bg, 0.3),
    mixHex(accent, bg, 0.55),
    mixHex(accent, bg, 0.8),
    accent,
  ];
}

/** 明暗两套色阶（浅色底为白，深色底为主题深底） */
export function buildHeatScales(lightAccent: string, darkAccent: string): { light: string[]; dark: string[] } {
  return {
    light: heatScale(lightAccent, '#ffffff'),
    dark: heatScale(darkAccent, DARK_BG),
  };
}

export interface HeatDay {
  date: string;
  count: number;
  level: number;
}

/** 一周 7 格（周日开头）；首末周不足 7 天的位置补 null（渲染空格） */
export interface HeatWeek {
  days: (HeatDay | null)[];
}

export type ContributionsView =
  | { kind: 'hidden' }
  | { kind: 'placeholder' }
  | {
      kind: 'ok';
      total: number;
      maxCount: number;
      weeks: HeatWeek[];
      fetchedAt: number | null;
      /** error 非空但有旧数据（stale 降级） */
      stale: boolean;
    };

const WEEK_DAYS = 7;

/** GraphQL contributionCalendar 周数据 → 视图（首周前置补空、末周后补空到 7 格） */
export function contributionsView(block: CacheBlock<Contributions> | undefined): ContributionsView {
  if (!block) return { kind: 'hidden' };
  if (block.data === null) {
    // data 为 null 且带 error：本地无 PAT 占位（placeholder）或失败无缓存（CI 上 prefetch 已拦）
    return block.error ? { kind: 'placeholder' } : { kind: 'hidden' };
  }
  const { total, weeks } = block.data;
  let maxCount = 0;
  for (const w of weeks) {
    for (const d of w.contributionDays) maxCount = Math.max(maxCount, d.contributionCount);
  }
  const view: HeatWeek[] = weeks.map((w, i) => {
    const days: (HeatDay | null)[] = w.contributionDays.map((d) => ({
      date: d.date,
      count: d.contributionCount,
      level: heatLevel(d.contributionCount, maxCount),
    }));
    // 首周可能不足 7 天：前面补空（日历从周日对齐）
    if (i === 0) while (days.length < WEEK_DAYS) days.unshift(null);
    // 末周后面补空
    if (i === weeks.length - 1) while (days.length < WEEK_DAYS) days.push(null);
    return { days };
  });
  return {
    kind: 'ok',
    total,
    maxCount,
    weeks: view,
    fetchedAt: block.fetched_at,
    stale: block.error !== null,
  };
}

export interface PinnedView {
  repos: GithubPinnedRepo[];
  fetchedAt: number | null;
  stale: boolean;
}

/** pinned 块 → 视图；无数据（失败且无缓存）返回 null，组件隐藏该部分 */
export function pinnedView(block: CacheBlock<GithubPinnedRepo[]> | undefined): PinnedView | null {
  if (!block || block.data === null || block.data.length === 0) return null;
  return { repos: block.data, fetchedAt: block.fetched_at, stale: block.error !== null };
}

export interface GithubView {
  contributions: ContributionsView;
  pinned: PinnedView | null;
}

export function buildGithubView(cache: GithubCache | null): GithubView | null {
  if (!cache) return null;
  return {
    contributions: contributionsView(cache.contributions),
    pinned: pinnedView(cache.pinned),
  };
}

/** 时间戳 → 'YYYY-MM-DD HH:mm'（构建机本地时区） */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 热力图格子 tooltip 文案（四语）："N contributions on 2026-08-22" / "2026年8月22日，N 次贡献" */
export function heatTooltip(date: string, count: number, lang: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (lang === 'zh') {
    const zhDate = `${y}年${m}月${d}日`;
    return count === 0 ? `${zhDate}，无贡献` : `${zhDate}，${count} 次贡献`;
  }
  if (lang === 'ja') {
    const jaDate = `${y}年${m}月${d}日`;
    return count === 0 ? `${jaDate}、コントリビューションなし` : `${jaDate}、${count} 件のコントリビューション`;
  }
  if (lang === 'fr') {
    if (count === 0) return `Aucune contribution le ${date}`;
    return `${count} contribution${count === 1 ? '' : 's'} le ${date}`;
  }
  if (count === 0) return `No contributions on ${date}`;
  return `${count} contribution${count === 1 ? '' : 's'} on ${date}`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * 月份标签列（GitHub 风）：含某月 1 日的周列标该月（"只标新月起始列"）；
 * 首周不含 1 日时按首天月份兜底标注（坐标轴起点有标签）。
 */
export function monthLabels(
  weeks: HeatWeek[],
  lang: string,
): { weekIndex: number; label: string }[] {
  const monthLabel = (date: string) => {
    const m = Number(date.slice(5, 7));
    if (lang === 'zh' || lang === 'ja') return `${m}月`;
    return lang === 'fr' ? MONTHS_FR[m - 1] : MONTHS_EN[m - 1];
  };
  const out: { weekIndex: number; label: string }[] = [];
  weeks.forEach((w, i) => {
    const firstOfMonth = w.days.find((d) => d !== null && d.date.endsWith('-01'));
    if (firstOfMonth) {
      out.push({ weekIndex: i, label: monthLabel(firstOfMonth.date) });
    } else if (i === 0) {
      const first = w.days.find((d) => d !== null);
      if (first) out.push({ weekIndex: 0, label: monthLabel(first.date) });
    }
  });
  return out;
}

/** 星期标签（周日开头）：GitHub 只显示 Mon/Wed/Fri（中文 一/三/五），其余行留空占位 */
export function weekdayLabels(lang: string): (string | null)[] {
  if (lang === 'zh') return [null, '一', null, '三', null, '五', null];
  if (lang === 'ja') return [null, '月', null, '水', null, '金', null];
  if (lang === 'fr') return [null, 'lun.', null, 'mer.', null, 'ven.', null];
  return [null, 'Mon', null, 'Wed', null, 'Fri', null];
}
