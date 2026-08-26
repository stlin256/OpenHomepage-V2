/**
 * prefetch CLI（docs/specs/07-prefetch.md）：构建前抓取 GitHub/RSS 数据写入 .cache/。
 * 用法：npm run prefetch           # TTL 内命中缓存则跳过
 *       npm run prefetch -- --force  # 忽略 TTL 强制全量抓取（CI 用）
 * 退出码：所有数据块失败且无任何旧缓存 → 1（缺数即报错）；部分失败 → 0 + warning。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPrefetch, type BlockStatus } from '../src/lib/prefetch.ts';
import { resolveDataDir } from '../src/lib/data-dir.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.slice(2).includes('--force');

const ICONS: Record<BlockStatus, string> = {
  fresh: '✓',
  cached: '✓',
  placeholder: '◌',
  stale: '⚠',
  partial: '⚠',
  error: '✗',
};

try {
  const dataDir = resolveDataDir(root, (msg) => console.log(msg));
  const result = await runPrefetch({
    dataDir,
    cacheDir: path.join(root, '.cache'),
    force,
  });
  for (const b of result.blocks) {
    console.log(`${ICONS[b.status]} ${b.key}：${b.status}${b.error ? `（${b.error}）` : ''}`);
  }
  for (const w of result.warnings) {
    console.warn(`warning: ${w}`);
  }
  if (!result.ok) {
    console.error('error: 所有数据块抓取失败且无任何旧缓存，构建缺数，退出（spec 07：缺数即报错）。');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`error: prefetch 失败：${(e as Error).message}`);
  process.exitCode = 1;
}