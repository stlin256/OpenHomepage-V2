import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateJetBrainsMonoIndexSubset } from '../scripts/generate-fonts.ts';

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('generate-fonts', () => {
  it('creates a small WOFF2 subset for editorial indexes', async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), 'openhomepage-fonts-'));
    tempDirs.push(outputDir);
    mkdirSync(path.join(outputDir, 'fonts'), { recursive: true });

    const source = path.resolve(
      'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
    );
    const result = await generateJetBrainsMonoIndexSubset({ source, outputDir });

    expect(result.output).toBe(path.join(outputDir, 'fonts', 'jetbrains-mono-index.woff2'));
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.bytes).toBeLessThan(readFileSync(source).byteLength / 2);
    expect(readFileSync(result.output).subarray(0, 4)).toEqual(Buffer.from([0x77, 0x4f, 0x46, 0x32]));
  });
});

