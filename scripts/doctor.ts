/**
 * doctor CLI（docs/specs/16-doctor.md）：一体化健康自检。
 * 用法：npm run doctor              # 默认离线，不发起网络请求
 *       npm run doctor -- --online  # 追加 GitHub API / RSS 源探测
 *       npm run doctor -- --offline # 显式离线（与默认等价）
 * 退出码：存在致命错误（[✗]）→ 1；仅警告或全部通过 → 0（可接入 CI / prebuild）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor, summarize, type Severity } from './doctor-lib.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`用法：npm run doctor [-- --online|--offline]

  （默认）    离线模式：环境 / 数据目录 / 配置 / 语言 / 素材引用 / 指令语法 / 端口
  --online    追加外部接口检查（GitHub API 连通性、rss.yaml 各源 HTTP 状态）
  --offline   显式离线（与默认等价）

退出码：存在 [✗] 致命错误为 1，仅 [!] 警告或全通过为 0。`);
  process.exit(0);
}

const online = args.includes('--online') && !args.includes('--offline');

const ICONS: Record<Severity, string> = { ok: '[✓]', warn: '[!]', error: '[✗]', skip: '[–]' };

try {
  const report = await runDoctor({ rootDir: root, online });

  console.log('OpenHomepage Doctor');
  console.log(`数据目录：${report.dataDir ? path.relative(root, report.dataDir) + path.sep : '（未找到）'}${report.usedExample ? '（回退示例数据）' : ''}`);
  console.log(`模式：${online ? 'online（含外部接口检查）' : 'offline（跳过网络检查）'}`);
  console.log('');

  for (const section of report.sections) {
    console.log(`【${section.title}】`);
    for (const item of section.items) {
      console.log(`  ${ICONS[item.severity]} ${item.message}`);
      if (item.suggestion) console.log(`      → 建议：${item.suggestion}`);
    }
    console.log('');
  }

  const { ok, warn, error } = summarize(report);
  console.log(`检查完成：${ok} 项通过，${warn} 个警告，${error} 个错误。`);
  if (error > 0) {
    console.error('存在致命问题，请按上述建议修复后重试。');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`error: doctor 自检失败：${(e as Error).message}`);
  process.exitCode = 1;
}
