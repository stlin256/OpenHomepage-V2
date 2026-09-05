/**
 * 站点构建进程管理（发布视图，spec 21 §2）：
 * - 分阶段 spawn 构建链（fonts → og → astro build → critical-css → images），
 *   与 package.json scripts.build 一致；每阶段一个子进程，便于界面显示阶段进度；
 * - spawn 直接用当前 node 跑 tsx/astro CLI（同 devserver.ts），避开 Windows .cmd 壳；
 * - 状态机 idle → running → success|failed；同一时间只允许一个构建（冲突抛 BuildConflictError → 409）；
 * - spawn/platform/execPath 可注入，测试用假 runner 验证状态机（不真跑 astro build）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { pushLog, killProcessTree } from './devserver.ts';

export type BuildState = 'idle' | 'running' | 'success' | 'failed';

export interface BuildStatus {
  status: BuildState;
  /** 阶段 id 列表（顺序即执行顺序） */
  stages: string[];
  /** 当前阶段下标（running 时有效；其余为 -1） */
  stageIndex: number;
  logTail: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BuildStageSpec {
  id: string;
  command: string;
  args: string[];
  cwd: string;
}

/** 已有构建进行中时抛出（http 层映射 409） */
export class BuildConflictError extends Error {}

/**
 * 构建链各阶段 spawn 参数（纯函数）：node + tsx/astro CLI 直跑。
 * 阶段顺序与 scripts.build 一致：generate-fonts → generate-og-images → astro build →
 * optimize-critical-css → optimize-images。
 */
export function buildStages(rootDir: string, execPath: string): BuildStageSpec[] {
  const tsx = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const astro = path.join(rootDir, 'node_modules', 'astro', 'bin', 'astro.mjs');
  return [
    { id: 'fonts', command: execPath, args: [tsx, 'scripts/generate-fonts.ts'], cwd: rootDir },
    { id: 'og', command: execPath, args: [tsx, 'scripts/generate-og-images.ts'], cwd: rootDir },
    { id: 'astro', command: execPath, args: [astro, 'build'], cwd: rootDir },
    { id: 'css', command: execPath, args: [tsx, 'scripts/optimize-critical-css.ts'], cwd: rootDir },
    { id: 'images', command: execPath, args: [tsx, 'scripts/optimize-images.ts'], cwd: rootDir },
  ];
}

export interface BuildDeps {
  spawn: typeof spawn;
  platform: string;
  execPath: string;
}

export interface BuildManager {
  status(): BuildStatus;
  /** 启动构建；进行中再调抛 BuildConflictError */
  start(): BuildStatus;
  /** 取消进行中的构建（杀子进程树，状态回到 idle）；空闲时为空操作 */
  stop(): Promise<BuildStatus>;
}

export function createBuildManager(opts: {
  rootDir: string;
  deps?: Partial<BuildDeps>;
}): BuildManager {
  const deps: BuildDeps = {
    spawn,
    platform: process.platform,
    execPath: process.execPath,
    ...opts.deps,
  };
  const stages = buildStages(opts.rootDir, deps.execPath);

  let child: ChildProcess | null = null;
  let state: BuildState = 'idle';
  let stageIndex = -1;
  let error: string | null = null;
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  let stopping = false;
  let lineBuf = '';
  const tail: string[] = [];

  const onChunk = (chunk: Buffer) => {
    lineBuf += chunk.toString('utf8');
    const lines = lineBuf.split(/\r?\n/);
    lineBuf = lines.pop() ?? '';
    for (const line of lines) pushLog(tail, line);
  };

  const snapshot = (): BuildStatus => ({
    status: state,
    stages: stages.map((s) => s.id),
    stageIndex,
    logTail: [...tail],
    error,
    startedAt,
    finishedAt,
  });

  const fail = (msg: string) => {
    state = 'failed';
    error = msg;
    stageIndex = -1;
    finishedAt = new Date().toISOString();
  };

  const runStage = (i: number): void => {
    stageIndex = i;
    const spec = stages[i];
    pushLog(tail, `▶ ${spec.id}`);
    let c: ChildProcess;
    try {
      c = deps.spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: deps.platform !== 'win32', // POSIX 下独立进程组，便于整组终止
        windowsHide: true,
      });
    } catch (e) {
      fail(`spawn 失败（阶段 ${spec.id}）：${(e as Error).message}`);
      return;
    }
    child = c;
    c.stdout?.on('data', onChunk);
    c.stderr?.on('data', onChunk);
    c.on('error', (e) => {
      if (child !== c) return;
      child = null;
      fail(`spawn 失败（阶段 ${spec.id}）：${e.message}`);
    });
    c.on('exit', (code) => {
      if (child !== c) return;
      child = null;
      if (stopping) {
        // stop() 取消：不算失败，回到 idle 允许重新构建
        state = 'idle';
        stageIndex = -1;
        return;
      }
      if (code === 0) {
        if (i + 1 < stages.length) {
          runStage(i + 1);
        } else {
          state = 'success';
          stageIndex = -1;
          finishedAt = new Date().toISOString();
        }
      } else {
        fail(`阶段 ${spec.id} 异常退出（code ${code ?? 'null'}）`);
      }
    });
  };

  const start = (): BuildStatus => {
    if (state === 'running') {
      throw new BuildConflictError('已有构建正在进行中 / A build is already running');
    }
    state = 'running';
    error = null;
    stageIndex = -1;
    startedAt = new Date().toISOString();
    finishedAt = null;
    stopping = false;
    tail.length = 0;
    lineBuf = '';
    runStage(0);
    return snapshot();
  };

  const stop = async (): Promise<BuildStatus> => {
    const c = child;
    if (!c) return snapshot();
    stopping = true;
    const exited = new Promise<void>((resolve) => {
      c.once('exit', () => resolve());
      setTimeout(resolve, 5000).unref();
    });
    await killProcessTree(c, deps.platform, deps.spawn);
    await exited;
    if (child === c) child = null;
    stopping = false;
    if (state === 'running') {
      state = 'idle';
      stageIndex = -1;
    }
    return snapshot();
  };

  return { status: snapshot, start, stop };
}
