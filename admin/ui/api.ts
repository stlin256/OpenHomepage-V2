/** 编辑器前端 API 客户端：薄封装 fetch，错误抛后端 message */

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

export const api = {
  info: () => req<{ initialized: boolean }>('/api/info'),
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
