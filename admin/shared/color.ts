/**
 * 取色器纯函数：hex 校验/规范化、WCAG 对比度、RGB 距离、
 * 头像主色提取（median-cut 量化，确定性输出，供单测）。
 */

export function isValidHex(s: string): boolean {
  return /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

/** 统一为小写 #rrggbb；非法返回 null */
export function normalizeHex(s: string): string | null {
  const t = s.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) {
    return '#' + [...t].map((c) => c + c).join('').toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(t)) return ('#' + t).toLowerCase();
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex);
  if (!n) throw new Error(`非法 hex 色值：${hex}`);
  return [
    parseInt(n.slice(1, 3), 16),
    parseInt(n.slice(3, 5), 16),
    parseInt(n.slice(5, 7), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** WCAG 相对亮度 */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

type Rgb = [number, number, number];

interface Box {
  pixels: Rgb[];
}

/** 沿最长通道按中位数切分 */
function splitBox(box: Box): [Box, Box] | null {
  const mins = [255, 255, 255];
  const maxs = [0, 0, 0];
  for (const p of box.pixels) {
    for (let c = 0; c < 3; c++) {
      if (p[c] < mins[c]) mins[c] = p[c];
      if (p[c] > maxs[c]) maxs[c] = p[c];
    }
  }
  const ranges = [0, 1, 2].map((c) => maxs[c] - mins[c]);
  const channel = ranges.indexOf(Math.max(...ranges));
  if (ranges[channel] === 0) return null;
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = sorted[Math.floor(sorted.length / 2)][channel];
  const lo = sorted.filter((p) => p[channel] <= mid);
  const hi = sorted.filter((p) => p[channel] > mid);
  if (hi.length === 0) {
    // 中位数是最大值：退化为对半切
    const half = Math.floor(sorted.length / 2);
    if (half === 0) return null;
    return [{ pixels: sorted.slice(0, half) }, { pixels: sorted.slice(half) }];
  }
  return [{ pixels: lo }, { pixels: hi }];
}

/** 候选色之间的最小 RGB 距离，保证色板区分度 */
const MIN_PALETTE_DISTANCE = 40;
const SAMPLE_CAP = 4000;

/**
 * 从 canvas ImageData.data（RGBA 扁平数组）提取至多 count 个主色。
 * 透明像素（alpha<128）跳过；输出按覆盖像素数降序，#rrggbb 形式。
 */
export function extractPalette(data: Uint8ClampedArray | number[], count: number): string[] {
  const all: Rgb[] = [];
  const step = Math.max(4, Math.floor(data.length / 4 / SAMPLE_CAP) * 4);
  for (let i = 0; i + 3 < data.length; i += step) {
    if (data[i + 3] >= 128) all.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (all.length === 0) return [];

  let boxes: Box[] = [{ pixels: all }];
  const done: Box[] = []; // 不可再分（颜色单一）的盒子，仍计入候选
  while (boxes.length > 0 && boxes.length + done.length < count) {
    const idx = boxes
      .map((b, i) => [b.pixels.length, i] as const)
      .sort((a, b) => b[0] - a[0])[0][1];
    const split = splitBox(boxes[idx]);
    if (!split) {
      done.push(boxes[idx]);
      boxes = [...boxes.slice(0, idx), ...boxes.slice(idx + 1)];
      continue;
    }
    boxes = [...boxes.slice(0, idx), ...boxes.slice(idx + 1), ...split];
  }
  boxes = [...boxes, ...done];

  const averaged = boxes
    .filter((b) => b.pixels.length > 0)
    .map((b) => {
      const n = b.pixels.length;
      const sum = b.pixels.reduce(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
        [0, 0, 0] as Rgb
      );
      return { rgb: [sum[0] / n, sum[1] / n, sum[2] / n] as Rgb, n };
    })
    .sort((a, b) => b.n - a.n);

  const kept: Rgb[] = [];
  for (const { rgb } of averaged) {
    if (kept.length >= count) break;
    if (kept.every((k) => colorDistance(k, rgb) >= MIN_PALETTE_DISTANCE)) kept.push(rgb);
  }
  return kept.map(([r, g, b]) => rgbToHex(r, g, b));
}
