import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/scripts/**', 'admin/server/**', 'admin/shared/**', 'scripts/**'],
      exclude: [
        '**/*.d.ts',
        '**/*.d.mts',
        // 纯类型声明，无运行时代码
        'src/types/**',
        'src/lib/markdown/types.ts',
        // 薄 CLI 壳：逻辑均在已覆盖的 *-lib 模块（doctor-lib / src/lib/prefetch / setup-lib）
        'scripts/doctor.ts',
        'scripts/prefetch.ts',
        'scripts/setup.mjs',
        // Playwright 浏览器自动化截图工具，属 e2e 范畴，不纳入单测覆盖
        'scripts/screenshots.ts',
        // 经子进程端到端测试覆盖（tests/sync-version.test.ts / generate-og-images.test.ts），
        // v8 插桩不跨进程，计入统计只会恒为 0
        'scripts/sync-version.mjs',
        'scripts/generate-og-images.ts',
      ],
      reporter: ['text', 'json-summary'],
    },
  },
});
