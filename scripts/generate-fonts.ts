/**
 * Generate the narrow JetBrains Mono subset used by homepage editorial indexes.
 *
 * Code blocks keep the full variable font through @fontsource. The index subset
 * only needs digits, so pages without code avoid downloading the full 40 KB font.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.join(
  rootDir,
  'node_modules',
  '@fontsource-variable',
  'jetbrains-mono',
  'files',
  'jetbrains-mono-latin-wght-normal.woff2',
);
const outputRelative = path.join('fonts', 'jetbrains-mono-index.woff2');

export async function generateJetBrainsMonoIndexSubset(options: {
  source?: string;
  outputDir?: string;
} = {}): Promise<{ source: string; output: string; bytes: number }> {
  const subsetModule = (await import('subset-font')) as unknown as { default?: typeof import('subset-font')['default'] } & typeof import('subset-font');
  const subsetFont = subsetModule.default ?? subsetModule;
  const source = options.source ?? sourceFile;
  const outputDir = options.outputDir ?? path.join(rootDir, 'public');
  const output = path.join(outputDir, outputRelative);

  const buffer = await subsetFont(readFileSync(source), '0123456789', {
    targetFormat: 'woff2',
    noHinting: true,
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, buffer);
  return { source, output, bytes: buffer.byteLength };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const result = await generateJetBrainsMonoIndexSubset();
  console.log(
    `[generate-fonts] JetBrains Mono index subset: ${result.bytes} bytes -> ${path.relative(rootDir, result.output)}`,
  );
}

