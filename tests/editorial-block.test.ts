import { describe, expect, it } from 'vitest';
import { renderEditorialBlock } from '../src/lib/editorial-block.ts';

describe('renderEditorialBlock', () => {
  it('maps tile sizes to stable tile CSS classes', () => {
    const html = renderEditorialBlock(
      {
        id: 'kit',
        title: 'Kit',
        tiles: [
          { title: 'Small', size: 'small' },
          { title: 'Wide', size: 'wide' },
          { title: 'Tall', size: 'tall' },
        ],
      },
      'zh'
    );
    expect(html).toContain('editorial-tile reveal tile-small');
    expect(html).toContain('editorial-tile reveal tile-wide');
    expect(html).toContain('editorial-tile reveal tile-tall');
  });
});
