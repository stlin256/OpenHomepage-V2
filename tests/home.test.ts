import { describe, it, expect, vi } from 'vitest';
import { planHomeBlocks, DEFAULT_HOME_LAYOUT } from '../src/lib/home.ts';

describe('planHomeBlocks', () => {
  it('按配置顺序渲染区块', () => {
    const blocks = planHomeBlocks([
      { block: 'markdown' },
      { block: 'profile' },
      { block: 'github' },
    ]);
    expect(blocks.map((b) => b.block)).toEqual(['markdown', 'profile', 'github']);
  });

  it('streaming 区块保留 id', () => {
    const blocks = planHomeBlocks([{ block: 'streaming', id: 'welcome' }]);
    expect(blocks).toEqual([{ block: 'streaming', id: 'welcome' }]);
  });

  it('未知区块跳过并 warning', () => {
    const warn = vi.fn();
    const blocks = planHomeBlocks(
      [
        { block: 'profile' },
        { block: 'twitter-timeline' },
        { block: 'rss' },
      ],
      warn,
    );
    expect(blocks.map((b) => b.block)).toEqual(['profile', 'rss']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('twitter-timeline');
  });

  it('home.layout 缺省/为空时用默认布局（profile + markdown）', () => {
    expect(planHomeBlocks(undefined).map((b) => b.block)).toEqual(
      DEFAULT_HOME_LAYOUT.map((b) => b.block),
    );
    expect(planHomeBlocks([]).map((b) => b.block)).toEqual(
      DEFAULT_HOME_LAYOUT.map((b) => b.block),
    );
  });
});
