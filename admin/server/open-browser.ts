/**
 * 自动打开浏览器（spec 20，npm run admin 启动完成后调用）：
 * Windows `cmd /c start "" <url>` / macOS `open` / 其余（Linux 等）`xdg-open`；
 * 零新增依赖（node:child_process）；任何失败静默降级——URL 已由 index.ts 打印到终端。
 * `ADMIN_NO_OPEN=1` 可禁用（在 index.ts 判定，不在这里）。
 */
import { spawn, type ChildProcess } from 'node:child_process';

export interface OpenCommand {
  command: string;
  args: string[];
}

/** 按平台构造打开 URL 的命令（纯函数，可单测）。Windows 的 start 首个引号参数是窗口标题，须留空串占位 */
export function buildOpenCommand(platform: string, url: string): OpenCommand {
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

type SpawnLike = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: 'ignore' }
) => Pick<ChildProcess, 'on' | 'unref'>;

/** 打开浏览器访问 url；detached + stdio ignore + unref，子进程不拖住 admin 生命周期；失败静默降级 */
export function openBrowser(
  url: string,
  platform: string = process.platform,
  spawnFn: SpawnLike = spawn as unknown as SpawnLike
): void {
  try {
    const { command, args } = buildOpenCommand(platform, url);
    const child = spawnFn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      /* 打开失败不致命：URL 已打印 */
    });
    child.unref();
  } catch {
    /* 同上：静默降级 */
  }
}
