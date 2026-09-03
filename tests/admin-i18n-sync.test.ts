/**
 * 多语言同步看板与骨架提取测试。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generatePageSkeleton } from '../admin/shared/skeleton.ts';
import { renderI18nSync } from '../admin/ui/views/i18nsync.ts';
import { createT } from '../admin/shared/i18n.ts';
import { api } from '../admin/ui/api.ts';

describe('skeleton 骨架生成纯函数', () => {
  it('保留 Markdown 自定义指令、媒体与代码块，并为标题标注待翻译', () => {
    const markdown = [
      '# 深度学习推理加速',
      '',
      '这是一段详细的研究背景正文内容。',
      '',
      ':::note{title="核心优势"}',
      '低延迟和高吞吐的兼顾。',
      ':::',
      '',
      '::ghcard{repo="stlin256/OpenHomepage-V2"}',
      '',
      '```python',
      'def forward(x):',
      '    return x * 2',
      '```',
    ].join('\n');

    const skeleton = generatePageSkeleton(markdown);

    expect(skeleton).toContain('# 深度学习推理加速 [待翻译]');
    expect(skeleton).toContain(':::note{title="核心优势"}');
    expect(skeleton).toContain('::ghcard{repo="stlin256/OpenHomepage-V2"}');
    expect(skeleton).toContain('def forward(x):');
  });
});

describe('i18n-sync 多语言同步看板渲染', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>';
    vi.resetModules();
  });

  it('渲染多语言页面矩阵、覆盖率与回退状态', async () => {
    vi.spyOn(api, 'pages').mockResolvedValue({
      pages: [
        { lang: 'zh', file: 'index.md', slug: '/', title: '主页', nav: true },
        { lang: 'en', file: 'index.md', slug: '/', title: 'Home', nav: true },
        { lang: 'zh', file: 'features.md', slug: 'features', title: '特性', nav: true },
      ],
    });

    const container = document.getElementById('container')!;
    const state = {
      lang: 'zh' as const,
      t: createT('zh'),
      setStatus: vi.fn(),
      navigate: vi.fn(),
      refreshSidebar: vi.fn(),
    };

    await renderI18nSync(container, state);

    expect(container.querySelector('.i18n-matrix-table')).not.toBeNull();
    const readyBadges = container.querySelectorAll('.i18n-badge.ready');
    const fallbackBadges = container.querySelectorAll('.i18n-badge.fallback');

    expect(readyBadges.length).toBe(3);
    expect(fallbackBadges.length).toBe(1); // en/features 缺译回退

    const cloneBtn = container.querySelector('.btn-clone');
    expect(cloneBtn).not.toBeNull();
  });
});
