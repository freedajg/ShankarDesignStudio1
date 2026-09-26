import "server-only";
import sharp from "sharp";

/**
 * Lifts a plain, flat background off generated artwork (for providers that
 * cannot return transparency). Conservative: only acts when the image border is
 * one uniform colour, and only removes pixels connected to that border, so
 * matching colours inside the artwork are kept. Returns null when it can't
 * safely remove anything — the customer then sees the normal "no transparent
 * background" warning instead of damaged artwork.
 */
export async function removeFlatBackground(input: Buffer, tolerance = 30): Promise<Buffer | null> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]] as const;

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  // median border colour
  const med = [0, 1, 2].map((ch) => {
    const vals = border.map((i) => data[i * 4 + ch]).sort((a, b) => a - b);
    return vals[vals.length >> 1];
  });
  const near = (i: number, tol: number) => {
    const [r, g, b] = px(i);
    return (r - med[0]) ** 2 + (g - med[1]) ** 2 + (b - med[2]) ** 2 <= tol * tol;
  };
  const uniform = border.filter((i) => near(i, tolerance)).length / border.length;
  if (uniform < 0.9) return null;

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const i of border) {
    if (!seen[i] && near(i, tolerance)) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    data[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i / w) | 0;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const n of next) {
      if (n >= 0 && !seen[n] && near(n, tolerance)) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  const removed = tail / (w * h);
  // nothing meaningful removed, or everything removed (the "artwork" was the background)
  if (removed < 0.02 || removed > 0.97) return null;

  // soften the cut: pixels bordering removed background become semi-transparent
  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const touches = (x > 0 && data[(i - 1) * 4 + 3] === 0) || (x < w - 1 && data[(i + 1) * 4 + 3] === 0) || (y > 0 && data[(i - w) * 4 + 3] === 0) || (y < h - 1 && data[(i + w) * 4 + 3] === 0);
    if (touches && near(i, tolerance * 2)) out[i * 4 + 3] = 128;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
