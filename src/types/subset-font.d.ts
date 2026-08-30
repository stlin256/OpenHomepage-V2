declare module 'subset-font' {
  export default function subsetFont(
    buffer: Buffer,
    text: string,
    options: {
      targetFormat: 'sfnt' | 'truetype' | 'woff' | 'woff2';
      noHinting?: boolean;
      variationAxes?: Record<string, number | { min: number; max: number; default?: number }>;
    },
  ): Promise<Buffer>;
}
