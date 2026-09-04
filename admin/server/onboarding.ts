/**
 * 新手欢迎向导（spec 19）的"已完成"标记：
 * 标记落在 data/.onboarding-done（轻量纯标记文件，不走快照——
 * paths.ts 的 assertSnapshottable 仅放行 pages/**、streaming/** 与根下 *.yaml/*.bib）。
 * 自动弹出条件：本次启动刚从 data.example/ 初始化（initialized）且标记文件不存在。
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ONBOARDING_FLAG = '.onboarding-done';

export function isOnboardingDone(dataDir: string): boolean {
  return existsSync(path.join(dataDir, ONBOARDING_FLAG));
}

/** 是否应自动弹出欢迎向导：仅首次初始化且未完成/未跳过 */
export function shouldShowOnboarding(dataDir: string, initialized: boolean): boolean {
  return initialized && !isOnboardingDone(dataDir);
}

/** 写入完成标记（内容为 ISO 时间戳，便于排查；重复写幂等覆盖） */
export function markOnboardingDone(dataDir: string, now: Date = new Date()): void {
  writeFileSync(
    path.join(dataDir, ONBOARDING_FLAG),
    `onboarding completed at ${now.toISOString()}\n`,
    'utf8'
  );
}
