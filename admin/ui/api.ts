/** 编辑器前端 API 客户端：薄封装 fetch，错误抛后端 message */
import type { GithubPrefillData } from '../shared/onboarding.ts';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
  return data as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export interface PageMeta {
  lang: string;
  file: string;
  slug: string;
  title: string;
  nav: boolean;
  order?: number;
  description?: string;
}

export interface PageContent {
  frontmatter: Record<string, unknown>;
  body: string;
  /** 页面在 dev server 上的预览路径（如 /、/en/hello） */
  previewPath?: string;
}

export interface DevStatus {
  up: boolean;
  starting: boolean;
  managed: boolean;
  url: string | null;
  logTail: string[];
  error: string | null;
}

export interface AssetInfo {
  name: string;
  size: number;
  mtime: string;
}

/** 语言管理（spec 19 §4）：单个语言目录（含页面数） */
export interface LangDirInfo {
  lang: string;
  pages: number;
}

/** 语言管理（spec 19 §4）：GET /api/languages 响应 */
export interface LanguageState {
  languages: LangDirInfo[];
  archived: LangDirInfo[];
  defaultLang: string | null;
  hasEn: boolean;
  total: number;
}

/** 归档/恢复响应：warnings 为机读标记（en-fallback / i18n-off） */
export interface LangOpResult {
  ok: true;
  lang: string;
  warnings: string[];
}

// ---- 动态数据刷新与健康检查（spec 20） ----

export interface PrefetchBlock {
  key: string;
  status: 'fresh' | 'cached' | 'stale' | 'partial' | 'placeholder' | 'error';
  error: string | null;
}

export interface PrefetchStatus {
  running: boolean;
  /** 上次抓取时间（ISO；从未抓取为 null） */
  lastFetchedAt: string | null;
}

export interface PrefetchResultView {
  ok: boolean;
  blocks: PrefetchBlock[];
  warnings: string[];
}

export interface DoctorItemView {
  severity: 'ok' | 'warn' | 'error' | 'skip';
  message: string;
  suggestion?: string;
}

export interface DoctorSectionView {
  id: string;
  title: string;
  items: DoctorItemView[];
}

export interface DoctorReportView {
  dataDir: string | null;
  usedExample: boolean;
  sections: DoctorSectionView[];
}

export interface DoctorCheckView {
  online: boolean;
  report: DoctorReportView;
  summary: { ok: number; warn: number; error: number; skip: number };
}

export const api = {
  info: () => req<{ initialized: boolean }>('/api/info'),
  /** 新手向导（spec 19）：是否应自动弹出（首次初始化且未完成） */
  onboarding: () => req<{ show: boolean }>('/api/onboarding'),
  onboardingDone: () => req('/api/onboarding/done', { method: 'POST' }),
  /** 新手向导第 1 步（spec 19 §3.1）：从 GitHub API 拉取公开资料预填名片表单 */
  githubPrefill: (username: string) =>
    req<GithubPrefillData>(`/api/github/prefill?username=${encodeURIComponent(username)}`),
  /** 新手向导第 1 步（spec 19 §3.2）：下载 GitHub 头像落盘并写回 profile.avatar */
  githubAvatar: (username: string) =>
    req<{ avatar: string }>('/api/github/avatar', json('POST', { username })),
  pages: () => req<{ pages: PageMeta[] }>('/api/pages'),
  page: (lang: string, file: string) =>
    req<PageContent>(`/api/page?lang=${encodeURIComponent(lang)}&file=${encodeURIComponent(file)}`),
  savePage: (lang: string, file: string, frontmatter: Record<string, unknown>, body: string) =>
    req('/api/page', json('PUT', { lang, file, frontmatter, body })),
  createPage: (lang: string, title: string, slug?: string, templateBody?: string) =>
    req<{ file: string }>('/api/page/create', json('POST', { lang, title, slug, templateBody })),
  renamePage: (lang: string, file: string, newFile: string) =>
    req('/api/page/rename', json('POST', { lang, file, newFile })),
  deletePage: (lang: string, file: string) =>
    req('/api/page/delete', json('POST', { lang, file })),

  site: () => req<{ data: Record<string, unknown> }>('/api/config/site'),
  saveSite: (data: unknown) => req('/api/config/site', json('PUT', { data })),
  rss: () => req<{ data: Record<string, unknown> }>('/api/config/rss'),
  saveRss: (data: unknown) => req('/api/config/rss', json('PUT', { data })),

  // 语言管理（spec 19 §4）：停用（归档）/恢复；confirm 用于 <2 语言的二次确认
  languages: () => req<LanguageState>('/api/languages'),
  archiveLanguage: (lang: string, confirm = false) =>
    req<LangOpResult>('/api/languages/archive', json('POST', { lang, confirm })),
  restoreLanguage: (lang: string) =>
    req<LangOpResult>('/api/languages/restore', json('POST', { lang })),

  assets: () => req<{ assets: AssetInfo[] }>('/api/assets'),
  uploadAsset: async (name: string, buf: ArrayBuffer) => {
    const res = await fetch(`/api/asset?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: buf,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
    return data as { name: string };
  },
  deleteAsset: (name: string) => req('/api/asset/delete', json('POST', { name })),

  /** favicon 上传：任意图片二进制 → 服务端转换 180/32 PNG 并写回 site.favicon */
  uploadFavicon: async (buf: ArrayBuffer) => {
    const res = await fetch('/api/favicon', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: buf,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
    return data as { favicon: string; files: string[] };
  },

  snapshots: (path: string) =>
    req<{ snapshots: { ts: string }[] }>(`/api/snapshots?path=${encodeURIComponent(path)}`),
  restoreSnapshot: (path: string, ts: string) =>
    req('/api/snapshot/restore', json('POST', { path, ts })),

  devStatus: () => req<DevStatus>('/api/dev-status'),
  devStart: () => req<DevStatus>('/api/dev/start', { method: 'POST' }),
  devStop: () => req<DevStatus>('/api/dev/stop', { method: 'POST' }),

  // 动态数据刷新（spec 20）：运行中重复触发服务端返回 409
  prefetchStatus: () => req<PrefetchStatus>('/api/prefetch/status'),
  prefetch: () => req<PrefetchResultView>('/api/prefetch', { method: 'POST' }),
  // 健康检查（spec 20）：默认离线，online=true 追加 GitHub API / RSS 源探测
  doctor: (online = false) => req<DoctorCheckView>(`/api/doctor${online ? '?online=1' : ''}`),

  // 发布视图（spec 21）：构建状态机 + dist 静态预览
  buildStatus: () => req<BuildStatus>('/api/build/status'),
  buildStart: () => req<BuildStatus>('/api/build/start', { method: 'POST' }),
  buildStop: () => req<BuildStatus>('/api/build/stop', { method: 'POST' }),
  previewStatus: () => req<DistPreviewStatus>('/api/preview/status'),
  previewStart: () => req<DistPreviewStatus>('/api/preview/start', { method: 'POST' }),
  previewStop: () => req<DistPreviewStatus>('/api/preview/stop', { method: 'POST' }),

  // 学术成果逐条编辑（spec 21 §4）：整文件读写
  publications: () => req<{ data: PublicationsData }>('/api/config/publications'),
  savePublications: (data: PublicationsData) =>
    req('/api/config/publications', json('PUT', { data })),

  // OG 分享卡按需预览（spec 21 §5）
  ogPreview: (lang: string, file: string) =>
    req<OgPreviewResult>(
      `/api/og-preview?lang=${encodeURIComponent(lang)}&file=${encodeURIComponent(file)}`
    ),

  /** data.zip 导入（spec 18）：整包备份后覆盖写入 */
  importDataZip: async (buf: ArrayBuffer) => {
    const res = await fetch('/api/import-data', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: buf,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
    return data as { ok: true; files: number; backup: string };
  },

  /** BibTeX 导入（spec 18）：预览不写盘；确认后合并进 publications.yaml */
  previewBibtex: (bibtex: string) =>
    req<{ added: ImportedPub[]; skipped: { key: string; reason: string }[] }>(
      '/api/import/bibtex/preview',
      json('POST', { bibtex })
    ),
  importBibtex: (bibtex: string) =>
    req<{ ok: true; added: number; skipped: { key: string; reason: string }[] }>(
      '/api/import/bibtex',
      json('POST', { bibtex })
    ),
};

/** BibTeX 预览返回的新增条目（publications.yaml schema 子集） */
export interface ImportedPub {
  id: string;
  title: string;
  authors: string[];
  year: number;
  type: string;
  venue: string;
  bibtex_key: string;
}

// ---- 发布视图（spec 21） ----

export interface BuildStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  stages: string[];
  stageIndex: number;
  logTail: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DistPreviewStatus {
  up: boolean;
  managed: boolean;
  url: string | null;
  port: number;
  error: string | null;
}

/** 学术成果条目（保留未知字段如 doi，编辑往返不丢） */
export type PubItem = Record<string, unknown> & {
  id?: string;
  title?: string;
  authors?: string[];
  year?: number;
  date?: string;
  type?: string;
  venue?: string;
  venue_short?: string;
  badges?: string[];
  tags?: string[];
  note?: Record<string, string> | string;
  abstract?: Record<string, string> | string;
  links?: Record<string, string>;
  bibtex_key?: string;
  teaser?: string;
  order?: number;
};

export interface PublicationsData {
  enabled?: boolean;
  bibtex_file?: string;
  highlight_authors?: string[];
  items: PubItem[];
  [key: string]: unknown;
}

export interface OgPreviewResult {
  custom: string | null;
  svg: string | null;
  title: string;
}
