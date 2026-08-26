/**
 * 页面文件 CRUD：data/pages/<lang>/<file>.md。
 * frontmatter 以 --- 包裹的 YAML 存储，写盘前校验并自动快照旧版本。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { safeResolve } from './paths.ts';
import { createSnapshot } from './snapshots.ts';
import { slugify, isValidSlug } from '../shared/slugify.ts';

export interface PageMeta {
  lang: string;
  file: string;
  slug: string;
  title: string;
  nav: boolean;
  order?: number;
  description?: string;
  notice?: string;
}

export interface PageContent {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** 解析 --- 头 YAML frontmatter + 正文（与 src/lib/config.ts 的解析规则一致） */
export function parsePage(text: string): PageContent {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: {}, body: text };
  return {
    frontmatter: (loadYaml(m[1]) as Record<string, unknown>) ?? {},
    body: text.slice(m[0].length),
  };
}

/** frontmatter + 正文 → 文件文本 */
export function serializePage(frontmatter: Record<string, unknown>, body: string): string {
  const fm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (v === undefined || v === '') continue;
    fm[k] = v;
  }
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  return `---\n${dumpYaml(fm)}---\n${normalizedBody}`;
}

function assertMdFile(file: string): void {
  if (!/^[^/\\]+\.md$/.test(file)) throw new Error(`非法的文件名：${file}（必须是 <name>.md）`);
}

function assertLang(lang: string): void {
  if (!/^[a-z][a-z0-9-]*$/i.test(lang)) throw new Error(`非法的语言目录：${lang}`);
}

function pageAbs(dataDir: string, lang: string, file: string): string {
  assertLang(lang);
  assertMdFile(file);
  return safeResolve(dataDir, `pages/${lang}/${file}`);
}

/** 按语言目录扫描页面元数据；单个文件 frontmatter 异常不拖垮整个列表 */
export function listPages(dataDir: string): PageMeta[] {
  const pagesDir = path.join(dataDir, 'pages');
  if (!existsSync(pagesDir)) return [];
  const pages: PageMeta[] = [];
  for (const lang of readdirSync(pagesDir)) {
    const langDir = path.join(pagesDir, lang);
    if (!statSync(langDir).isDirectory()) continue;
    for (const file of readdirSync(langDir)) {
      if (!file.endsWith('.md')) continue;
      let fm: Record<string, unknown> = {};
      try {
        fm = parsePage(readFileSync(path.join(langDir, file), 'utf8')).frontmatter;
      } catch {
        fm = {};
      }
      const base = file.replace(/\.md$/, '');
      pages.push({
        lang,
        file,
        slug: (fm.slug as string | undefined) ?? (base === 'index' ? '/' : base),
        title: (fm.title as string | undefined) ?? '',
        nav: (fm.nav as boolean | undefined) ?? true,
        order: fm.order as number | undefined,
        description: fm.description as string | undefined,
        notice: (fm.notice as string | undefined) ?? undefined,
      });
    }
  }
  return pages.sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.file.localeCompare(b.file)
  );
}

export function readPage(dataDir: string, lang: string, file: string): PageContent {
  const abs = pageAbs(dataDir, lang, file);
  if (!existsSync(abs)) throw new Error(`页面不存在：pages/${lang}/${file}`);
  return parsePage(readFileSync(abs, 'utf8'));
}

/** 写盘：校验 title 必需 → 快照旧版本 → 写文件 */
export function writePage(
  dataDir: string,
  lang: string,
  file: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  const abs = pageAbs(dataDir, lang, file);
  if (!existsSync(abs)) throw new Error(`页面不存在：pages/${lang}/${file}`);
  if (typeof frontmatter.title !== 'string' || frontmatter.title.trim() === '') {
    throw new Error('页面 frontmatter 缺少必需字段 title，未写盘。');
  }
  const rel = `pages/${lang}/${file}`;
  createSnapshot(dataDir, rel);
  writeFileSync(abs, serializePage(frontmatter, body), 'utf8');
}

/**
 * 新建页面：标题 → slug（可显式指定）+ frontmatter 模板 + 空正文（或指定模板正文）。
 * order 取该语言目录现有最大值 +10，主页 index 固定 0。
 */
export function createPage(
  dataDir: string,
  lang: string,
  title: string,
  slug?: string,
  templateBody?: string
): { file: string } {
  assertLang(lang);
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('标题不能为空。 / Title is required.');
  const finalSlug = (slug ?? slugify(cleanTitle)) || 'page';
  if (!isValidSlug(finalSlug)) throw new Error(`非法的 slug：${finalSlug}`);
  const file = `${finalSlug === '/' ? 'index' : finalSlug}.md`;
  const abs = pageAbs(dataDir, lang, file);
  if (existsSync(abs)) throw new Error(`文件已存在：pages/${lang}/${file}`);
  const siblings = listPages(dataDir).filter((p) => p.lang === lang);
  const maxOrder = siblings.reduce((m, p) => Math.max(m, p.order ?? 0), 0);
  const frontmatter: Record<string, unknown> = {
    title: cleanTitle,
    nav: true,
    order: finalSlug === '/' ? 0 : maxOrder + 10,
  };
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, serializePage(frontmatter, templateBody ?? '\n'), 'utf8');
  return { file };
}

export function renamePage(dataDir: string, lang: string, file: string, newFile: string): void {
  const from = pageAbs(dataDir, lang, file);
  const to = pageAbs(dataDir, lang, newFile);
  if (!existsSync(from)) throw new Error(`页面不存在：pages/${lang}/${file}`);
  if (existsSync(to)) throw new Error(`文件已存在：pages/${lang}/${newFile}`);
  renameSync(from, to);
}

/** 删除前先把内容入快照，可经快照列表找回 */
export function deletePage(dataDir: string, lang: string, file: string): void {
  const abs = pageAbs(dataDir, lang, file);
  if (!existsSync(abs)) throw new Error(`页面不存在：pages/${lang}/${file}`);
  createSnapshot(dataDir, `pages/${lang}/${file}`);
  rmSync(abs);
}
