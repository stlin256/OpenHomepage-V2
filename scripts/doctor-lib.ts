/**
 * `npm run doctor` 的纯逻辑层（scripts/doctor.ts 只做参数解析与报告渲染）：
 * - 运行环境：Node 版本 ≥ 18.17；
 * - 数据目录：data/ 存在性与 data.example/ 回退（同 src/lib/data-dir.ts 语义）；
 * - 配置文件：site.yaml / rss.yaml / publications.yaml 解析与必需字段校验
 *   （复用 src/lib/config.ts 与 src/lib/publications.ts 的校验函数）；
 * - 语言与页面：pages/<lang>/ 目录、主语言一致性、index.md；
 * - 本地素材引用：Markdown / YAML 中 assets/... 引用的文件存在性（文件:行号）；
 * - 指令语法：:::/:::: 容器指令开合配平（fenced code block 与 frontmatter 内不计）；
 * - 外部接口（--online 才执行）：GitHub API 连通性、RSS 源 HTTP 状态；
 * - 端口占用：4321（dev）/ 4174（admin）。
 * 网络与端口检查支持注入替身，全部逻辑可由 vitest 覆盖。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

import { validateSiteConfig, validateRssConfig, type SiteConfig } from '../src/lib/config.ts';
import { loadPublications } from '../src/lib/publications.ts';
import { normalizeSiteLanguage } from '../src/lib/language.ts';

// ---------------------------------------------------------------------------
// 报告模型
// ---------------------------------------------------------------------------

export type Severity = 'ok' | 'warn' | 'error' | 'skip';

export interface DoctorItem {
  severity: Severity;
  message: string;
  /** 中文修复建议（非 ok 项给出） */
  suggestion?: string;
}

export interface DoctorSection {
  id: string;
  title: string;
  items: DoctorItem[];
}

export interface DoctorReport {
  /** 实际参与检查的数据目录（data/ 或回退的 data.example/），两者皆缺时为 null */
  dataDir: string | null;
  /** 是否因 data/ 缺失回退到了 data.example/ */
  usedExample: boolean;
  sections: DoctorSection[];
}

/** 汇总统计：fatal 决定退出码 */
export function summarize(report: DoctorReport): { ok: number; warn: number; error: number; skip: number } {
  const counts = { ok: 0, warn: 0, error: 0, skip: 0 };
  for (const s of report.sections) for (const i of s.items) counts[i.severity]++;
  return counts;
}

const ok = (message: string): DoctorItem => ({ severity: 'ok', message });
const warn = (message: string, suggestion?: string): DoctorItem => ({ severity: 'warn', message, suggestion });
const error = (message: string, suggestion?: string): DoctorItem => ({ severity: 'error', message, suggestion });
const skip = (message: string): DoctorItem => ({ severity: 'skip', message });

// ---------------------------------------------------------------------------
// 运行环境
// ---------------------------------------------------------------------------

export const MIN_NODE_VERSION: readonly [number, number, number] = [18, 17, 0];

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function checkNodeVersion(version: string, min: readonly [number, number, number] = MIN_NODE_VERSION): DoctorItem {
  const cur = parseVersion(version);
  const minText = min.join('.');
  if (!cur) return warn(`无法解析 Node.js 版本号 "${version}"`, '请确认使用 Node.js 官方发行版。');
  const cmp = cur[0] - min[0] || cur[1] - min[1] || cur[2] - min[2];
  if (cmp < 0) {
    return error(
      `Node.js ${version} 低于要求的 ${minText}`,
      `请升级 Node.js 至 ≥ ${minText}（tsx 与 Astro 的运行时基线）。`
    );
  }
  return ok(`Node.js ${version}（要求 ≥ ${minText}）`);
}

// ---------------------------------------------------------------------------
// 数据目录
// ---------------------------------------------------------------------------

export interface DataDirCheck {
  item: DoctorItem;
  dataDir: string | null;
  usedExample: boolean;
}

export function checkDataDir(rootDir: string): DataDirCheck {
  const dataDir = path.join(rootDir, 'data');
  if (existsSync(dataDir)) {
    return { item: ok('数据目录 data/ 存在'), dataDir, usedExample: false };
  }
  const exampleDir = path.join(rootDir, 'data.example');
  if (existsSync(exampleDir)) {
    return {
      item: warn(
        '未找到 data/，本次检查基于 data.example/ 示例数据（与构建回退一致）',
        '运行 npm run setup 从示例初始化自己的 data/。'
      ),
      dataDir: exampleDir,
      usedExample: true,
    };
  }
  return {
    item: error(
      '未找到 data/ 或 data.example/',
      '运行 npm run setup 初始化数据目录；或确认在项目根目录执行本命令。'
    ),
    dataDir: null,
    usedExample: false,
  };
}

// ---------------------------------------------------------------------------
// 配置文件
// ---------------------------------------------------------------------------

function readYamlText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function checkSiteYaml(dataDir: string): { items: DoctorItem[]; config: SiteConfig | null } {
  const file = path.join(dataDir, 'site.yaml');
  const rel = 'site.yaml';
  if (readYamlText(file) === null) {
    return { items: [error(`缺少 ${rel}`, '参照 data.example/site.yaml 创建站点配置。')], config: null };
  }
  let cfg: SiteConfig;
  try {
    cfg = loadYaml(readFileSync(file, 'utf8')) as SiteConfig;
  } catch (e) {
    return {
      items: [error(`site.yaml 解析失败：${(e as Error).message}`, '修复 YAML 语法后重试。')],
      config: null,
    };
  }
  try {
    validateSiteConfig(cfg, file);
  } catch (e) {
    return {
      items: [error((e as Error).message, '补齐必需字段（site.title / profile.name / github.username）。')],
      config: null,
    };
  }
  return { items: [ok('site.yaml 可解析，必需字段齐全')], config: cfg };
}

export function checkRssYaml(dataDir: string, site: SiteConfig | null): DoctorItem[] {
  const rssSection = site?.rss;
  const enabled = rssSection !== undefined && rssSection.enabled !== false;
  const fileName = rssSection?.sources_file || 'rss.yaml';
  const file = path.join(dataDir, fileName);
  if (!existsSync(file)) {
    if (enabled) {
      return [error(`已启用 RSS 区块但缺少 ${fileName}`, '参照 data.example/rss.yaml 创建，或在 site.yaml 中关闭 rss.enabled。')];
    }
    return [skip(`未启用 RSS 区块，跳过 ${fileName} 检查`)];
  }
  try {
    const cfg = loadYaml(readFileSync(file, 'utf8'));
    validateRssConfig(cfg as Parameters<typeof validateRssConfig>[0], file);
  } catch (e) {
    return [error(`${fileName} 校验失败：${(e as Error).message}`, '修复 YAML 语法或 sources 字段后重试。')];
  }
  return [ok(`${fileName} 可解析，sources 配置合法`)];
}

export function checkPublicationsYaml(dataDir: string): DoctorItem[] {
  const file = path.join(dataDir, 'publications.yaml');
  if (!existsSync(file)) {
    return [skip('publications.yaml 不存在（仅 ::publications 指令需要），跳过')];
  }
  const warnings: string[] = [];
  try {
    loadPublications(dataDir, (msg) => warnings.push(msg));
  } catch (e) {
    return [error(`publications.yaml 校验失败：${(e as Error).message}`, '检查 items 的 title/authors/year/venue 字段。')];
  }
  const items: DoctorItem[] = [ok('publications.yaml 可解析，条目字段合法')];
  for (const w of warnings) items.push(warn(`publications：${w}`));
  return items;
}

// ---------------------------------------------------------------------------
// 语言与页面
// ---------------------------------------------------------------------------

export function listLangDirs(dataDir: string): string[] | null {
  const pagesDir = path.join(dataDir, 'pages');
  if (!existsSync(pagesDir)) return null;
  return readdirSync(pagesDir)
    .filter((name) => statSync(path.join(pagesDir, name)).isDirectory())
    .sort();
}

export function checkLanguages(dataDir: string, site: SiteConfig | null): DoctorItem[] {
  const items: DoctorItem[] = [];
  const langs = listLangDirs(dataDir);
  if (langs === null) {
    return [error('缺少 pages/ 目录', '参照 data.example/pages/ 创建页面目录（如 pages/zh/index.md）。')];
  }
  if (langs.length === 0) {
    return [error('pages/ 下没有任何语言目录', '创建至少一个语言目录（如 pages/zh/）并放入 index.md。')];
  }
  items.push(ok(`检测到语言目录：${langs.join(' / ')}${langs.length >= 2 ? '（整站 i18n 启用）' : '（单语言站）'}`));

  for (const lang of langs) {
    if (normalizeSiteLanguage(lang) !== lang) {
      items.push(warn(
        `语言目录名 "${lang}" 不是合法语言码（应为 2–3 位小写字母，如 zh/en）`,
        '重命名目录为合法语言码，或删除该目录。'
      ));
    }
    const mdCount = readdirSync(path.join(dataDir, 'pages', lang)).filter((f) => f.endsWith('.md')).length;
    if (mdCount === 0) {
      items.push(warn(`语言目录 pages/${lang}/ 下没有 .md 页面`, '该目录对构建不可见，若非误建请删除。'));
    }
  }

  const rawLang = site?.site?.language;
  if (!rawLang) {
    items.push(warn(
      'site.yaml 未配置 site.language（站点主语言）',
      `构建将回退为首个语言目录 "${langs[0]}" 作为默认语言；建议显式配置，如 language: ${langs[0]}-CN。`
    ));
    return items;
  }
  const mainLang = normalizeSiteLanguage(rawLang);
  if (!mainLang) {
    items.push(warn(
      `site.language "${rawLang}" 不是合法语言码`,
      `构建将回退为 "${langs[0]}"；改为如 zh-CN / en 的写法。`
    ));
    return items;
  }
  if (!langs.includes(mainLang)) {
    items.push(error(
      `主语言 "${mainLang}"（来自 site.language: ${rawLang}）在 pages/ 下没有目录`,
      `创建 pages/${mainLang}/ 目录，或将 site.language 改为已有语言（${langs.join(' / ')}）。`
    ));
    return items;
  }
  items.push(ok(`主语言 ${mainLang}（site.language: ${rawLang}）与页面目录一致`));
  const mainHasIndex = existsSync(path.join(dataDir, 'pages', mainLang, 'index.md'));
  if (!mainHasIndex) {
    items.push(warn(
      `主语言目录 pages/${mainLang}/ 缺少 index.md（主页）`,
      '主页将按回退链渲染其他语言版本；建议补齐 index.md。'
    ));
  }
  return items;
}

// ---------------------------------------------------------------------------
// 本地素材引用
// ---------------------------------------------------------------------------

export interface AssetRef {
  line: number;
  /** 归一化后的 data/ 相对路径（assets/...） */
  ref: string;
}

/** 行是否处于 fenced code block / frontmatter 内的标记（供素材与指令扫描共用） */
export function maskMarkdownLines(lines: string[], skipFrontmatter: boolean): boolean[] {
  const masked = new Array<boolean>(lines.length).fill(false);
  let i = 0;
  if (skipFrontmatter && lines[0] === '---') {
    masked[0] = true;
    for (i = 1; i < lines.length; i++) {
      masked[i] = true;
      if (/^---\s*$/.test(lines[i])) { i++; break; }
    }
  }
  let fence: { marker: string; len: number } | null = null;
  for (; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (m) {
      if (!fence) {
        fence = { marker: m[1][0], len: m[1].length };
        masked[i] = true;
      } else if (m[1][0] === fence.marker && m[1].length >= fence.len) {
        fence = null;
        masked[i] = true;
      } else {
        masked[i] = true;
      }
    } else if (fence) {
      masked[i] = true;
    }
  }
  return masked;
}

/** 归一化素材引用：去 ./ 前缀、query/hash；非 assets/ 路径返回 null */
export function normalizeAssetRef(raw: string): string | null {
  let ref = raw.trim().replace(/^\.\//, '').split(/[?#]/)[0];
  if (!ref.startsWith('assets/')) return null;
  return ref;
}

const MD_LINK_REF_RE = /!?\[[^\]]*\]\(\s*<?((?:\.\/)?assets\/[^\s>)]+)/g;
const MD_ATTR_REF_RE = /(?:src|poster|cover|href)\s*=\s*["']((?:\.\/)?assets\/[^"']+)["']/gi;
/** YAML 值位引用：要求带扩展名，避免误伤散文中的 "assets/ 目录" 字样 */
const YAML_REF_RE = /["'(]?((?:\.\/)?assets\/[\w@./+-]+\.[A-Za-z0-9]{1,5})["']?/g;

/** 从 Markdown 文本提取 assets/ 引用（跳过 fenced code block；frontmatter 行按 YAML 规则提取，其中可能有 og_image 等引用） */
export function extractAssetRefsFromMarkdown(text: string): AssetRef[] {
  const lines = text.split(/\r?\n/);
  const masked = maskMarkdownLines(lines, false);
  // frontmatter 行区间（首行 --- 到下一个 ---）
  const fm = new Set<number>();
  if (lines[0] === '---') {
    fm.add(0);
    for (let i = 1; i < lines.length; i++) {
      fm.add(i);
      if (/^---\s*$/.test(lines[i])) break;
    }
  }
  const refs: AssetRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (masked[i]) continue;
    const regexes = fm.has(i) ? [YAML_REF_RE] : [MD_LINK_REF_RE, MD_ATTR_REF_RE];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i]))) {
        const ref = normalizeAssetRef(m[1]);
        if (ref) refs.push({ line: i + 1, ref });
      }
    }
  }
  return dedupeRefs(refs);
}

/** 从 YAML 文本提取 assets/ 引用（忽略整行注释） */
export function extractAssetRefsFromYaml(text: string): AssetRef[] {
  const lines = text.split(/\r?\n/);
  const refs: AssetRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    YAML_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = YAML_REF_RE.exec(line))) {
      const ref = normalizeAssetRef(m[1]);
      if (ref) refs.push({ line: i + 1, ref });
    }
  }
  return dedupeRefs(refs);
}

function dedupeRefs(refs: AssetRef[]): AssetRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.line}:${r.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function listFilesRecursive(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * 扫描 data/ 下 Markdown 与 YAML 配置中的 assets/ 引用，检查文件存在性。
 * 跳过 assets/remote/（远程媒体本地化产物，构建期生成，见 spec 03 §1）。
 */
export function checkAssetRefs(dataDir: string): DoctorItem[] {
  const items: DoctorItem[] = [];
  const targets: { file: string; kind: 'md' | 'yaml' }[] = [
    ...listFilesRecursive(path.join(dataDir, 'pages'), '.md').map((file) => ({ file, kind: 'md' as const })),
    ...listFilesRecursive(path.join(dataDir, 'streaming'), '.md').map((file) => ({ file, kind: 'md' as const })),
    ...['site.yaml', 'rss.yaml', 'publications.yaml']
      .map((name) => path.join(dataDir, name))
      .filter((f) => existsSync(f))
      .map((file) => ({ file, kind: 'yaml' as const })),
  ];

  let total = 0;
  let missing = 0;
  for (const { file, kind } of targets) {
    const refs = (kind === 'md' ? extractAssetRefsFromMarkdown : extractAssetRefsFromYaml)(readFileSync(file, 'utf8'));
    const rel = path.relative(dataDir, file);
    for (const { line, ref } of refs) {
      if (ref.startsWith('assets/remote/')) continue;
      total++;
      if (!existsSync(path.join(dataDir, ...ref.split('/')))) {
        missing++;
        items.push(error(
          `失效的素材引用：${rel}:${line} → ${ref}`,
          `确认文件已放入 ${path.join('data', 'assets')}${path.sep} 或修正引用路径（部署环境大小写敏感）。`
        ));
      }
    }
  }
  if (missing === 0) {
    items.unshift(ok(`素材引用检查通过（共 ${total} 处引用，均存在）`));
  }
  return items;
}

// ---------------------------------------------------------------------------
// 指令语法：:::/:::: 容器配平
// ---------------------------------------------------------------------------

export interface DirectiveIssue {
  line: number;
  message: string;
  suggestion: string;
}

const DIRECTIVE_OPEN_RE = /^\s*(:{3,})([A-Za-z][\w-]*)/;
const DIRECTIVE_CLOSE_RE = /^\s*(:{3,})\s*$/;

/**
 * 容器指令开合配平（行级扫描；frontmatter 与 fenced code block 内不计）。
 * 规则（与 remark-directive 一致）：闭合围栏冒号数必须 ≥ 开启围栏；
 * 嵌套时外层冒号数须多于内层（spec 03 §2）。`::name` 叶子指令不参与配平。
 */
export function checkDirectiveBalance(text: string): DirectiveIssue[] {
  const lines = text.split(/\r?\n/);
  const masked = maskMarkdownLines(lines, true);
  const issues: DirectiveIssue[] = [];
  const stack: { name: string; colons: number; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (masked[i]) continue;
    const line = lines[i];
    const open = DIRECTIVE_OPEN_RE.exec(line);
    if (open) {
      stack.push({ name: open[2], colons: open[1].length, line: i + 1 });
      continue;
    }
    const close = DIRECTIVE_CLOSE_RE.exec(line);
    if (!close) continue;
    const colons = close[1].length;
    const top = stack[stack.length - 1];
    if (!top) {
      issues.push({
        line: i + 1,
        message: `多余的闭合围栏 "${close[1]}"（没有对应的开启指令）`,
        suggestion: '删除该行，或检查上方容器指令是否已被提前闭合。',
      });
    } else if (colons < top.colons) {
      issues.push({
        line: i + 1,
        message: `闭合围栏 "${close[1]}" 无法闭合第 ${top.line} 行开启的 "${':'.repeat(top.colons)}${top.name}"（闭合冒号数需 ≥ 开启数）`,
        suggestion: `将闭合行改为 "${':'.repeat(top.colons)}"；嵌套容器时外层冒号数必须多于内层（如 ::::grid 包 :::cell）。`,
      });
      stack.pop(); // 按已闭合恢复，避免级联误报
    } else {
      stack.pop();
    }
  }
  for (const rest of stack) {
    issues.push({
      line: rest.line,
      message: `容器指令 "${':'.repeat(rest.colons)}${rest.name}" 未闭合`,
      suggestion: `在容器内容结束后补一行 "${':'.repeat(rest.colons)}"。`,
    });
  }
  return issues;
}

export function checkDirectives(dataDir: string): DoctorItem[] {
  const items: DoctorItem[] = [];
  const files = [
    ...listFilesRecursive(path.join(dataDir, 'pages'), '.md'),
    ...listFilesRecursive(path.join(dataDir, 'streaming'), '.md'),
  ];
  let issueCount = 0;
  for (const file of files) {
    const issues = checkDirectiveBalance(readFileSync(file, 'utf8'));
    const rel = path.relative(dataDir, file);
    for (const issue of issues) {
      issueCount++;
      items.push(error(`指令不配平：${rel}:${issue.line} ${issue.message}`, issue.suggestion));
    }
  }
  if (issueCount === 0) {
    items.unshift(ok(`指令配平检查通过（扫描 ${files.length} 个 Markdown 文件）`));
  }
  return items;
}

// ---------------------------------------------------------------------------
// 端口占用
// ---------------------------------------------------------------------------

export const DEV_PORT = 4321;
export const ADMIN_PORT = 4174;

export type PortStatus = 'free' | 'busy';

/** 尝试在 127.0.0.1 绑定端口：EADDRINUSE → busy，其余错误按 free 处理（无法判定时不误报） */
export function probePort(port: number): Promise<PortStatus> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (e: NodeJS.ErrnoException) => {
      resolve(e.code === 'EADDRINUSE' ? 'busy' : 'free');
    });
    server.once('listening', () => {
      server.close(() => resolve('free'));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function checkPorts(
  ports: { port: number; label: string }[] = [
    { port: DEV_PORT, label: 'Astro dev' },
    { port: ADMIN_PORT, label: 'admin 后台' },
  ],
  probe: (port: number) => Promise<PortStatus> = probePort,
): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [];
  for (const { port, label } of ports) {
    const status = await probe(port);
    if (status === 'free') {
      items.push(ok(`端口 ${port}（${label}）空闲`));
    } else {
      items.push(warn(
        `端口 ${port}（${label}）已被占用`,
        '若是正在运行的 dev/admin 服务属预期；否则请结束占用进程或更换端口。'
      ));
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// 外部接口（--online）
// ---------------------------------------------------------------------------

export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
}
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export const ONLINE_TIMEOUT_MS = 8000;

/** GitHub API 连通性：2xx → ok（附剩余额度）；403 且额度 0 → rate limit 警告；其余 → warn */
export async function checkGithubApi(
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = ONLINE_TIMEOUT_MS,
): Promise<DoctorItem> {
  try {
    const res = await fetchFn('https://api.github.com/', {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'openhomepage-doctor', Accept: 'application/vnd.github+json' },
    });
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (res.status >= 200 && res.status < 300) {
      return ok(`GitHub API 连通（HTTP ${res.status}，rate limit 剩余 ${remaining ?? '未知'}）`);
    }
    if (res.status === 403 && remaining === '0') {
      return warn(
        'GitHub API rate limit 已耗尽（HTTP 403）',
        '配置 GH_PAT 环境变量提升额度（prefetch 会按 GH_PAT → GITHUB_TOKEN → GH_TOKEN 取用）。'
      );
    }
    return warn(`GitHub API 返回 HTTP ${res.status}`, '检查网络代理或稍后重试；不影响本地构建。');
  } catch (e) {
    return warn(`GitHub API 不可达：${(e as Error).message}`, '检查网络/代理；可先用默认离线模式跳过本检查。');
  }
}

/** RSS 源 HTTP 状态：逐源 GET 探测，2xx/3xx → ok，其余 warn */
export async function checkRssSources(
  sources: { name: string; url: string }[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = ONLINE_TIMEOUT_MS,
): Promise<DoctorItem[]> {
  if (sources.length === 0) return [skip('rss.yaml 无 sources，跳过源探测')];
  return Promise.all(
    sources.map(async ({ name, url }) => {
      try {
        const res = await fetchFn(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'openhomepage-doctor' },
        });
        if (res.status >= 200 && res.status < 400) {
          return ok(`RSS 源「${name}」正常（HTTP ${res.status}）`);
        }
        return warn(`RSS 源「${name}」返回 HTTP ${res.status}（${url}）`, '确认源地址有效；构建会降级使用缓存数据。');
      } catch (e) {
        return warn(`RSS 源「${name}」请求失败：${(e as Error).message}（${url}）`, '检查网络或源地址；构建会降级使用缓存数据。');
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// 编排
// ---------------------------------------------------------------------------

export interface DoctorOptions {
  rootDir: string;
  /** true 时追加外部接口检查（默认离线） */
  online?: boolean;
  nodeVersion?: string;
  fetchFn?: FetchLike;
  probePortFn?: (port: number) => Promise<PortStatus>;
  timeoutMs?: number;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const sections: DoctorSection[] = [];
  const push = (id: string, title: string, items: DoctorItem[]): void => {
    sections.push({ id, title, items });
  };

  push('env', '运行环境', [checkNodeVersion(options.nodeVersion ?? process.version)]);

  const dataDirCheck = checkDataDir(options.rootDir);
  push('data-dir', '数据目录', [dataDirCheck.item]);
  const dataDir = dataDirCheck.dataDir;
  if (!dataDir) {
    // 致命：数据目录缺失，后续检查无法进行
    for (const [id, title] of [
      ['config', '配置文件'],
      ['langs', '语言与页面'],
      ['assets', '本地素材引用'],
      ['directives', '指令语法'],
    ] as const) {
      push(id, title, [skip('数据目录缺失，无法检查')]);
    }
    push('ports', '端口占用', await checkPorts(undefined, options.probePortFn));
    push('online', '外部接口', [skip('数据目录缺失，无法检查')]);
    return { dataDir: null, usedExample: false, sections };
  }

  const site = checkSiteYaml(dataDir);
  const rss = checkRssYaml(dataDir, site.config);
  const pubs = checkPublicationsYaml(dataDir);
  push('config', '配置文件', [...site.items, ...rss, ...pubs]);

  push('langs', '语言与页面', checkLanguages(dataDir, site.config));
  push('assets', '本地素材引用', checkAssetRefs(dataDir));
  push('directives', '指令语法', checkDirectives(dataDir));
  push('ports', '端口占用', await checkPorts(undefined, options.probePortFn));

  if (options.online) {
    const items: DoctorItem[] = [await checkGithubApi(options.fetchFn, options.timeoutMs)];
    let sources: { name: string; url: string }[] = [];
    if (site.config?.rss && site.config.rss.enabled !== false) {
      try {
        const raw = loadYaml(readFileSync(path.join(dataDir, site.config.rss.sources_file || 'rss.yaml'), 'utf8')) as
          | { sources?: { name: unknown; url: unknown }[] }
          | undefined;
        sources = (raw?.sources ?? [])
          .filter((s) => typeof s?.url === 'string')
          .map((s) => ({
            name: typeof s.name === 'string' ? s.name : String((s.name as Record<string, unknown>)?.zh ?? s.url),
            url: s.url as string,
          }));
      } catch {
        /* rss.yaml 解析失败已在「配置文件」节报错，这里跳过 */
      }
    }
    items.push(...(await checkRssSources(sources, options.fetchFn, options.timeoutMs)));
    push('online', '外部接口', items);
  } else {
    push('online', '外部接口', [skip('已跳过网络检查（默认离线；npm run doctor -- --online 启用 GitHub API 与 RSS 源探测）')]);
  }

  return { dataDir, usedExample: dataDirCheck.usedExample, sections };
}
