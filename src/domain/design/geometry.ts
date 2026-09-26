/**
 * Element geometry in millimetres. Every element is a box of half-extents
 * (hw, hh) around its origin (x, y), rotated by `rotation` degrees.
 * Text boxes are made symmetric around the origin by the layout (conservative),
 * so a single pair of half-extents describes every element.
 */

export type Box = { x: number; y: number; hw: number; hh: number; rotation: number };
export type Area = { width: number; height: number };

/** Tolerance for floating point and editor rounding (mm). */
export const AREA_TOLERANCE_MM = 0.5;

/** Axis-aligned half-extents of a rotated box. */
export function rotatedHalfExtents(hw: number, hh: number, rotationDeg: number) {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { ex: hw * c + hh * s, ey: hw * s + hh * c };
}

export function aabb(box: Box) {
  const { ex, ey } = rotatedHalfExtents(box.hw, box.hh, box.rotation);
  return { left: box.x - ex, right: box.x + ex, top: box.y - ey, bottom: box.y + ey };
}

export function isInsideArea(box: Box, area: Area, tolerance = AREA_TOLERANCE_MM): boolean {
  const b = aabb(box);
  return b.left >= -tolerance && b.top >= -tolerance && b.right <= area.width + tolerance && b.bottom <= area.height + tolerance;
}

/** Largest uniform scale (≤ 1) at which the rotated box fits inside the area. */
export function maxFitScale(box: Box, area: Area): number {
  const { ex, ey } = rotatedHalfExtents(box.hw, box.hh, box.rotation);
  if (ex === 0 || ey === 0) return 1;
  return Math.min(1, area.width / (2 * ex), area.height / (2 * ey));
}

/**
 * Keeps a box inside the area: shrinks it if it cannot fit, then slides it in.
 * Returns the scale factor applied (1 = unchanged size) and the new origin.
 */
export function constrainToArea(box: Box, area: Area): { x: number; y: number; scale: number } {
  const scale = maxFitScale(box, area);
  const { ex, ey } = rotatedHalfExtents(box.hw * scale, box.hh * scale, box.rotation);
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return { x: clamp(box.x, ex, area.width - ex), y: clamp(box.y, ey, area.height - ey), scale };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
