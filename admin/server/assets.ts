/**
 * 素材管理：data/assets/ 下的文件列表、上传（含粘贴图片）、删除、读取。
 * 文件名净化 + 扩展名白名单 + 大小上限；同名冲突自动 -1 改名。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MAX_ASSET_BYTES = 20 * 1024 * 1024; // 20MB

/** 允许入库的素材扩展名（图片/音视频/PDF） */
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac',
  '.mp4', '.webm', '.mov',
  '.pdf', '.zip',
]);

export interface AssetInfo {
  name: string;
  size: number;
  mtime: string;
}

function assetsDir(dataDir: string): string {
  return path.join(dataDir, 'assets');
}

/** 文件名净化：仅允许安全字符，拒绝目录分隔与隐藏文件 */
export function sanitizeAssetName(name: string): string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
    throw new Error(`非法的文件名：${name}`);
  }
  if (!/^[\w.()（）一-鿿 -]+$/.test(name) || name.includes('..') || name.startsWith('.')) {
    throw new Error(`非法的文件名：${name}`);
  }
  return name;
}

export function listAssets(dataDir: string): AssetInfo[] {
  const dir = assetsDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && statSync(path.join(dir, name)).isFile())
    .map((name) => {
      const st = statSync(path.join(dir, name));
      return { name, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 保存素材；同名已存在时自动改名为 <name>-1.<ext>、<name>-2.<ext>… */
export function saveAsset(dataDir: string, name: string, content: Buffer): { name: string } {
  sanitizeAssetName(name);
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`不支持的扩展名：${ext || '(无)'}，允许：${[...ALLOWED_EXT].join(' ')}`);
  }
  if (content.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`文件大小超限：${(content.byteLength / 1024 / 1024).toFixed(1)}MB > 20MB`);
  }
  const dir = assetsDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const stem = name.slice(0, name.length - ext.length);
  let final = name;
  for (let i = 1; existsSync(path.join(dir, final)); i++) {
    final = `${stem}-${i}${ext}`;
  }
  writeFileSync(path.join(dir, final), content);
  return { name: final };
}

export function readAsset(dataDir: string, name: string): Buffer {
  const abs = path.join(assetsDir(dataDir), sanitizeAssetName(name));
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`素材不存在：${name}`);
  return readFileSync(abs);
}

export function deleteAsset(dataDir: string, name: string): void {
  const abs = path.join(assetsDir(dataDir), sanitizeAssetName(name));
  if (!existsSync(abs)) throw new Error(`素材不存在：${name}`);
  rmSync(abs);
}
