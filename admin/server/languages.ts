/**
 * 语言管理（spec 19 §4，docs/specs/19-admin-onboarding.md）：
 * 「停用」= 把 data/pages/<lang>/（以及按语言分目录的 data/streaming/<lang>/，若存在）
 * 整目录移动到 data/.archived_langs/ 下同名位置；「恢复」为反向移动。
 * - 归档目标是点目录：data.zip 导出全量递归会带上它（可随整包迁移后恢复），
 *   而 loadPages / doctor / 搜索索引只扫 data/pages/，归档内容天然不参与构建；
 * - 归档前对涉及文件逐个 createSnapshot（pages/**、streaming/** 均在快照白名单）；
 *   恢复方向的目标必不存在（否则 409 拒绝），无可快照对象，且操作本身可逆（可再次归档）；
 * - site.yaml 里 LocalizedText 对象中的该语言键保留不删，恢复即无损；
 * - 默认语言（site.language 归一化）锁定不可停用（400）；归档 en 在响应里带
 *   en-fallback 警告标记；归档后剩余 <2 语言需请求体 confirm: true 二次确认（否则 409）。
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { readSiteConfig } from './configs.ts';
import { createSnapshot } from './snapshots.ts';
import { normalizeLang } from '../../src/lib/routes.ts';

/** 归档根目录（data/ 内的点目录）：构建/后台扫描只认 pages/，天然不拾取 */
export const ARCHIVE_ROOT = '.archived_langs';

/** 语言目录名（与 pages.ts assertLang 同规则） */
const LANG_RE = /^[a-z][a-z0-9-]*$/i;

/**
 * 归档/恢复冲突或需二次确认：HTTP 409，由 http.ts sendError 识别
 * （必须先于 sendError 的正则兜底判断——消息里的"已存在"会被正则映射成 400）。
 */
export class LangConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LangConflictError';
  }
}

function assertValidLang(lang: string): void {
  if (!LANG_RE.test(lang)) throw new Error(`非法的语言目录：${lang}`);
}

export interface LangDirInfo {
  lang: string;
  /** 该语言目录下的 .md 页面数 */
  pages: number;
}

export interface LanguageState {
  /** 当前启用的语言（pages/ 下的目录，字典序） */
  languages: LangDirInfo[];
  /** 已归档（停用）的语言（.archived_langs/pages/ 下的目录） */
  archived: LangDirInfo[];
  /** site.language 归一化后的默认语言；配置读不出或未配置时为 null */
  defaultLang: string | null;
  /** en 是否在当前启用语言中 */
  hasEn: boolean;
  /** 当前启用语言数（<2 时整站 i18n 关闭） */
  total: number;
}

function langDirsUnder(root: string): LangDirInfo[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => statSync(path.join(root, name)).isDirectory())
    .sort()
    .map((lang) => ({
      lang,
      pages: readdirSync(path.join(root, lang)).filter((f) => f.endsWith('.md')).length,
    }));
}

export function listLanguageState(dataDir: string): LanguageState {
  const languages = langDirsUnder(path.join(dataDir, 'pages'));
  const archived = langDirsUnder(path.join(dataDir, ARCHIVE_ROOT, 'pages'));
  let defaultLang: string | null = null;
  try {
    defaultLang = normalizeLang(readSiteConfig(dataDir).site?.language) ?? null;
  } catch {
    /* site.yaml 缺失/损坏时默认语言未知（doctor 会报），不阻断面板 */
  }
  const langs = languages.map((l) => l.lang);
  return {
    languages,
    archived,
    defaultLang,
    hasEn: langs.includes('en'),
    total: languages.length,
  };
}

/** 递归快照 data/ 下某目录里的全部文件（目录本身经 renameSync 整体移动，内容不变） */
function snapshotTree(dataDir: string, rel: string, now: Date): void {
  const abs = path.join(dataDir, ...rel.split('/'));
  for (const name of readdirSync(abs)) {
    const childRel = `${rel}/${name}`;
    const childAbs = path.join(abs, name);
    if (statSync(childAbs).isDirectory()) snapshotTree(dataDir, childRel, now);
    else createSnapshot(dataDir, childRel, now);
  }
}

/** 归档前的目标占用预检（pages/ 与 streaming/ 一起查，避免半迁移状态） */
function assertTargetsFree(dataDir: string, lang: string, subdirs: readonly string[]): void {
  for (const sub of subdirs) {
    if (!existsSync(path.join(dataDir, sub, lang))) continue;
    const destRel = `${ARCHIVE_ROOT}/${sub}/${lang}`;
    if (existsSync(path.join(dataDir, ...destRel.split('/')))) {
      throw new LangConflictError(
        `目标已存在：${destRel}/（为避免覆盖请先恢复或手动清理）/ Target already exists`
      );
    }
  }
}

export interface LangOpResult {
  ok: true;
  lang: string;
  /** 机读警告标记：en-fallback（en 是回退链固定一环）/ i18n-off（剩余 <2 语言，整站 i18n 关闭） */
  warnings: string[];
}

/** 归档涉及的子树：pages/ 必处理，streaming/ 有该语言目录才处理 */
const LANG_SUBDIRS = ['pages', 'streaming'] as const;

/**
 * 停用语言：归档 pages/<lang>/ 与 streaming/<lang>/（若存在）到 .archived_langs/。
 * 校验链：语言码合法 → 目录存在（400）→ 非默认语言（400）→ <2 二次确认（409）→
 * 目标占用预检（409）→ 逐文件快照 → 整目录移动。
 */
export function archiveLanguage(
  dataDir: string,
  lang: string,
  confirm = false,
  now: Date = new Date()
): LangOpResult {
  assertValidLang(lang);
  const state = listLanguageState(dataDir);
  if (!state.languages.some((l) => l.lang === lang)) {
    throw new Error(`语言目录不存在：pages/${lang}/`);
  }
  // 风险①：默认语言停用会让 defaultLang 回退 langs[0]，URL 前缀规则整体漂移——锁定不可停用
  if (state.defaultLang === lang) {
    throw new Error(
      `不能停用默认语言 ${lang}（site.language 归一化结果）；请先在「配置 → 站点」修改默认语言`
    );
  }
  // 风险③：停用后剩余 <2 语言时整站 i18n 关闭（带前缀路由消失、外链 404），需 confirm 二次确认
  const remaining = state.total - 1;
  if (remaining < 2 && !confirm) {
    throw new LangConflictError(
      `停用 ${lang} 后将只剩 ${remaining} 种语言：整站 i18n 会关闭（语言切换器与 /lang/ 前缀路由消失，既有带前缀链接将 404）。确认请带 confirm: true 重试。`
    );
  }
  assertTargetsFree(dataDir, lang, LANG_SUBDIRS);
  for (const sub of LANG_SUBDIRS) {
    const src = path.join(dataDir, sub, lang);
    if (!existsSync(src)) continue;
    snapshotTree(dataDir, `${sub}/${lang}`, now);
    const dest = path.join(dataDir, ARCHIVE_ROOT, sub, lang);
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(src, dest);
  }
  const warnings: string[] = [];
  if (lang === 'en') warnings.push('en-fallback'); // 风险②：en 是回退链固定一环
  if (remaining < 2) warnings.push('i18n-off');
  return { ok: true, lang, warnings };
}

/**
 * 恢复语言：把 .archived_langs/ 下的 pages/<lang>/ 与 streaming/<lang>/ 移回原位。
 * 归档不存在 → 400；目标目录已存在 → 409（不覆盖，先手动处理冲突）。
 */
export function restoreLanguage(dataDir: string, lang: string): LangOpResult {
  assertValidLang(lang);
  if (!existsSync(path.join(dataDir, ARCHIVE_ROOT, 'pages', lang))) {
    throw new Error(`归档不存在：${ARCHIVE_ROOT}/pages/${lang}/`);
  }
  for (const sub of LANG_SUBDIRS) {
    if (!existsSync(path.join(dataDir, ARCHIVE_ROOT, sub, lang))) continue;
    if (existsSync(path.join(dataDir, sub, lang))) {
      throw new LangConflictError(
        `目标已存在：${sub}/${lang}/（为避免覆盖请先删除或重命名现有目录）/ Target already exists`
      );
    }
  }
  for (const sub of LANG_SUBDIRS) {
    const src = path.join(dataDir, ARCHIVE_ROOT, sub, lang);
    if (!existsSync(src)) continue;
    const dest = path.join(dataDir, sub, lang);
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(src, dest);
  }
  const warnings: string[] = [];
  if (lang === 'en') warnings.push('en-fallback');
  return { ok: true, lang, warnings };
}
