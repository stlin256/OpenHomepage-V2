/**
 * overlay 的 admin API 客户端（M12b，docs/specs/12 §2.4/§2.5）：
 * admin origin 与当前页面文件由渲染页 bootstrap 注入
 * （window.__OH_ADMIN_ORIGIN__ / window.__OH_PAGE_SOURCE__）；
 * overlay 跑在 dev server origin，跨域由 admin server 的回环 CORS 放行
 * （M12a，admin/server/http.ts）。
 */
import type { ServerBlock } from './scanner.ts';

function win(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

/** admin server origin（bootstrap 注入；未注入时为空串，调用方据此跳过联网） */
export function adminOrigin(): string {
  const o = win().__OH_ADMIN_ORIGIN__;
  return typeof o === 'string' ? o.replace(/\/+$/, '') : '';
}

/** 当前页面正文的 data/ 相对路径（bootstrap 注入；空页面无块坐标时靠它定位插入目标） */
export function pageSource(): string | null {
  const s = win().__OH_PAGE_SOURCE__;
  return typeof s === 'string' && s !== '' ? s : null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${adminOrigin()}${path}`, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status}`);
  return data as T;
}

/** GET /api/page/blocks：服务端口径的块列表（坐标 + kind/name/parent + hash + 原文切片） */
export async function fetchBlocks(path: string): Promise<ServerBlock[]> {
  const r = await req<{ blocks: ServerBlock[] }>(`/api/page/blocks?path=${encodeURIComponent(path)}`);
  return r.blocks;
}

/** POST /api/page/block 的请求体（与 admin/server/blocks.ts 的 applyBlockOp 对应） */
export interface BlockOpPayload {
  path: string;
  op: 'replace' | 'insert' | 'delete' | 'move' | 'attrs';
  start: number;
  end: number;
  hash: string;
  markdown?: string;
  to?: number;
  /** op=attrs：新的指令属性表（M12c 检查器保存） */
  attrs?: Record<string, string>;
  /** op=insert：插为锚块（grid/cell 容器）的最后一个子块而非插到其后（M12c 添加单元格） */
  into?: boolean;
}

/** POST /api/page/block 响应：操作后的最新块列表（坐标已平移，插入定位新块用） */
export interface BlockOpResult {
  ok: true;
  blocks: ServerBlock[];
}

/** POST /api/page/block：单块操作；返回最新块列表；失败抛服务端错误消息（如 hash 陈旧 409） */
export async function applyBlockOp(payload: BlockOpPayload): Promise<BlockOpResult> {
  return req('/api/page/block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** GET /api/assets：素材引用值列表（assets/<name>，M12c 检查器素材下拉） */
export async function fetchAssets(): Promise<string[]> {
  const r = await req<{ assets: { name: string }[] }>('/api/assets');
  return r.assets.map((a) => `assets/${a.name}`);
}

/** 素材上传（POST /api/asset 二进制，粘贴图片用）；返回可引用的素材名 */
export async function uploadAsset(name: string, buf: ArrayBuffer): Promise<{ name: string }> {
  return req(`/api/asset?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: buf,
  });
}

// ---------------------------------------------------------------------------
// M12d：配置读写（区块表单 / 就地改字）与页面（设置面板 / 切换下拉）
// ---------------------------------------------------------------------------

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/** 页面列表项（GET /api/pages；previewPath 为 dev server 上的页面路径，M12d 起由服务端附带） */
export interface PageListItem {
  lang: string;
  file: string;
  slug: string;
  title: string;
  nav: boolean;
  order?: number;
  previewPath?: string;
}

/** GET /api/pages：页面下拉数据源（标题 + 语言 + 跳转路径） */
export async function fetchPages(): Promise<PageListItem[]> {
  const r = await req<{ pages: PageListItem[] }>('/api/pages');
  return r.pages;
}

export interface PageContent {
  frontmatter: Record<string, unknown>;
  body: string;
  previewPath?: string;
}

/** GET /api/page：页面设置面板的表单初值（body 原样带回，保存时不动正文） */
export async function fetchPage(lang: string, file: string): Promise<PageContent> {
  return req(`/api/page?lang=${encodeURIComponent(lang)}&file=${encodeURIComponent(file)}`);
}

/** PUT /api/page：页面设置保存（frontmatter 改动 + 原 body 不动） */
export async function savePage(
  lang: string,
  file: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<void> {
  await req('/api/page', json('PUT', { lang, file, frontmatter, body }));
}

/** GET /api/config/site：站点配置全量（面板按段编辑后整体 PUT 回） */
export async function fetchSiteConfig(): Promise<Record<string, unknown>> {
  const r = await req<{ data: Record<string, unknown> }>('/api/config/site');
  return r.data;
}

export async function saveSiteConfig(data: Record<string, unknown>): Promise<void> {
  await req('/api/config/site', json('PUT', { data }));
}

/** GET /api/config/rss：订阅源配置（rss 区块面板的 sources 列表） */
export async function fetchRssConfig(): Promise<Record<string, unknown>> {
  const r = await req<{ data: Record<string, unknown> }>('/api/config/rss');
  return r.data;
}

export async function saveRssConfig(data: Record<string, unknown>): Promise<void> {
  await req('/api/config/rss', json('PUT', { data }));
}

/** POST /api/config/field：就地改字的单字段写回（校验 + 快照在服务端） */
export async function saveConfigField(payload: {
  file: 'site' | 'rss';
  path: string;
  lang?: string;
  value: string;
}): Promise<void> {
  await req('/api/config/field', json('POST', payload));
}

// ---------------------------------------------------------------------------
// 撤销/重做（快照兜底）：目标 = 服务端记录的最近写盘文件（块操作→页面 md，
// 配置保存→site/rss.yaml）；overlay 一律省略 path，走服务端的全局"最近写盘"语义
// ---------------------------------------------------------------------------

/** GET /api/history 响应：path 为当前目标文件（null = 服务端尚无写盘记录） */
export interface HistoryState {
  path: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** GET /api/history：撤销/重做可用性（顶栏按钮置灰数据源） */
export async function fetchHistory(): Promise<HistoryState> {
  return req('/api/history');
}

export interface HistoryOpResult extends HistoryState {
  /** false = 无可撤销/重做（并发兜底），文件未改动 */
  ok: boolean;
}

export async function undoHistory(): Promise<HistoryOpResult> {
  return req('/api/history/undo', json('POST', {}));
}

export async function redoHistory(): Promise<HistoryOpResult> {
  return req('/api/history/redo', json('POST', {}));
}
