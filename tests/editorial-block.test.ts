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

  it('rootAttrs（M12d）：追加到根 section 并转义；缺省零注入', () => {
    const withAttr = renderEditorialBlock(
      { id: 'work', title: 'W' },
      'zh',
      undefined,
      { 'data-oh-cfg-block': 'editorial:work' }
    );
    expect(withAttr).toContain(
      '<section class="home-block block-editorial reveal" data-oh-cfg-block="editorial:work"'
    );
    const plain = renderEditorialBlock({ id: 'work', title: 'W' }, 'zh');
    expect(plain).not.toContain('data-oh-cfg-block');
  });

  it('editorial media uses lazy images instead of eager CSS backgrounds', () => {
    const html = renderEditorialBlock(
      {
        id: 'work',
        title: 'Work',
        list: [{ title: 'List', image: 'assets/list.jpg' }],
        tiles: [{ title: 'Tile', image: 'assets/tile.jpg', url: '/gallery' }],
        archive: [{ title: 'Archive', image: 'assets/archive.jpg' }],
      },
      'zh'
    );
    expect(html).not.toContain('background-image:url');
    expect(html).not.toContain('--tile-image:');
    expect(html).toContain('<span class="editorial-item-mask" aria-hidden="true">');
    expect(html).toContain('<img class="editorial-item-mask-img" src="/assets/list.jpg"');
    expect(html).toContain('<img class="editorial-tile-media" src="/assets/tile.jpg"');
    expect(html).toContain('<img class="archive-media" src="/assets/archive.jpg"');
    expect((html.match(/loading="lazy"/g) ?? []).length).toBe(3);
  });
});
