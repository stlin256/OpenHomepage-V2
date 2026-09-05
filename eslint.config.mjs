// ESLint flat config：js recommended + typescript-eslint recommended + astro flat/recommended
// 浏览器/Node globals 按目录划分：src（站点前端）与 admin/ui 偏浏览器，
// admin/server、scripts、tests 偏 Node。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.astro/',
      '.cache/',
      '.scratch/',
      '.tmp/',
      'node_modules/',
      'coverage/',
      'data/',
      'data.example/',
      'admin/public/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    // 允许以下划线前缀标记有意未使用的变量/参数（如测试桩的 _args）
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Astro 站点源码：frontmatter 跑在 Node（构建期），script 跑在浏览器
    files: ['src/**/*.{ts,tsx,astro,mts}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['admin/ui/**/*.{ts,mts}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['admin/server/**/*.{ts,mts}', 'scripts/**/*.{ts,mts,mjs}', 'tests/**/*.{ts,mts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // 根级 Node 配置文件 + e2e（Playwright 跑在 Node）
    files: ['*.{mjs,cjs,js,ts}', 'e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // 测试大量使用 any 做 mock/替身（fetch、Response 等）与 Function 类型桩，
    // 逐处标注成本高于收益，仅对 tests/ 放宽这两条规则
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
);
