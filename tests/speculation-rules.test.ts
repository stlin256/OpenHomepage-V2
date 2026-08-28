import { describe, expect, it } from 'vitest';
import { speculationRulesFor } from '../src/lib/speculation-rules.ts';

describe('speculationRulesFor', () => {
  it('generates prefetch-only document rules without prerender', () => {
    const rules = JSON.parse(speculationRulesFor('/*'));
    expect(Object.keys(rules)).toEqual(['prefetch']);
    expect(rules.prefetch).toEqual([
      {
        source: 'document',
        where: { href_matches: '/*', relative_to: 'document' },
        eagerness: 'moderate',
      },
    ]);
    expect(speculationRulesFor('/*')).not.toContain('prerender');
  });

  it('keeps GitHub Pages subpaths inside the rule', () => {
    expect(JSON.parse(speculationRulesFor('/OpenHomepage-V2/*')).prefetch[0].where.href_matches).toBe(
      '/OpenHomepage-V2/*',
    );
  });
});
