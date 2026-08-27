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
  op: 'replace' | 'insert' | 'delete' | 'move';
  start: number;
  end: number;
  hash: string;
  markdown?: string;
  to?: number;
}

/** POST /api/page/block：单块操作；失败抛服务端错误消息（如 hash 陈旧 409） */
export async function applyBlockOp(payload: BlockOpPayload): Promise<void> {
  await req('/api/page/block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** 素材上传（POST /api/asset 二进制，粘贴图片用）；返回可引用的素材名 */
export async function uploadAsset(name: string, buf: ArrayBuffer): Promise<{ name: string }> {
  return req(`/api/asset?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: buf,
  });
}
