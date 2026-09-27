/**
 * Geometry for the generated garment mockups (original artwork, not copied from any
 * site). Used by scripts/generate-mockups.ts to draw the images and by the seed to
 * place print areas on them. Swap for real photography by replacing product_mockups
 * rows and print-area placement fractions — no code change needed.
 *
 * Print-area millimetre sizes are DEMO values (docs/OPEN_QUESTIONS.md Q7).
 */

export const MOCKUP_W = 1000;
export const MOCKUP_H = 1100;

export type Side = "front" | "back";
export type SizeClass = "SMALL" | "STANDARD" | "LARGE";

export type GarmentDetail =
  | { kind: "seam"; d: string; width?: number }
  | { kind: "rib"; d: string; width: number }
  | { kind: "button"; cx: number; cy: number; r: number }
  | { kind: "fold"; d: string; width: number; strength: number };

export type PrintAreaSpec = {
  code: string;
  side: Side;
  name: string;
  widthMm: number;
  heightMm: number;
  /** centre x and top y on the mockup, in mockup pixels */
  centerX: number;
  top: number;
  sizeClass: SizeClass;
  isDefault: boolean;
};

export type GarmentSpec = {
  style: "crew" | "oversized" | "polo";
  /** mockup pixels per garment millimetre (fixes on-screen print-area size) */
  pxPerMm: number;
  sides: Record<
    Side,
    {
      outline: string;
      /** visible inside of the garment (back neck band) — coloured, shaded darker */
      inner?: string;
      details: GarmentDetail[];
      armpits: [number, number][];
    }
  >;
  printAreas: PrintAreaSpec[];
};

const crewBody = (neck: string) =>
  `M410 120 ${neck} L730 160 Q840 270 930 400 L835 462 L752 372 L756 1040 Q500 1064 244 1040 L248 372 L165 462 L70 400 Q160 270 270 160 Z`;

const crewDetails = (front: boolean): GarmentDetail[] => [
  front
    ? { kind: "rib", d: "M404 118 C428 210 572 210 596 118", width: 16 }
    : { kind: "rib", d: "M404 118 C430 150 570 150 596 118", width: 14 },
  { kind: "seam", d: "M902 418 L810 478" },
  { kind: "seam", d: "M98 418 L190 478" },
  { kind: "seam", d: "M730 162 Q742 270 752 372" },
  { kind: "seam", d: "M270 162 Q258 270 248 372" },
  { kind: "seam", d: "M252 1012 Q500 1036 752 1012" },
  { kind: "fold", d: "M300 520 Q360 700 330 900", width: 34, strength: 0.5 },
  { kind: "fold", d: "M700 520 Q640 700 672 900", width: 34, strength: 0.5 },
  { kind: "fold", d: "M420 880 Q500 960 590 890", width: 26, strength: 0.35 },
];

export const garments: GarmentSpec[] = [
  {
    style: "crew",
    pxPerMm: 0.95,
    sides: {
      front: {
        outline: crewBody("C430 205 570 205 590 120"),
        inner: "M410 120 C430 205 570 205 590 120 C570 150 430 150 410 120 Z",
        details: crewDetails(true), armpits: [[262, 390], [738, 390]] },
      back: { outline: crewBody("C430 146 570 146 590 120"), details: crewDetails(false), armpits: [[262, 390], [738, 390]] },
    },
    printAreas: [
      // front — standard placements used by DTF / screen printers (sizes ≈ 11×14", 14×17", 10×4", 3.5")
      { code: "FULL_FRONT", side: "front", name: "Full front", widthMm: 280, heightMm: 350, centerX: 500, top: 245, sizeClass: "STANDARD", isDefault: true },
      { code: "OVERSIZED_FRONT", side: "front", name: "Oversized front", widthMm: 355, heightMm: 430, centerX: 500, top: 225, sizeClass: "LARGE", isDefault: false },
      { code: "CENTER_CHEST", side: "front", name: "Centre chest", widthMm: 250, heightMm: 100, centerX: 500, top: 245, sizeClass: "SMALL", isDefault: false },
      { code: "LEFT_CHEST", side: "front", name: "Left chest", widthMm: 90, heightMm: 90, centerX: 622, top: 250, sizeClass: "SMALL", isDefault: false },
      { code: "RIGHT_CHEST", side: "front", name: "Right chest", widthMm: 90, heightMm: 90, centerX: 378, top: 250, sizeClass: "SMALL", isDefault: false },
      // back
      { code: "FULL_BACK", side: "back", name: "Full back", widthMm: 300, heightMm: 380, centerX: 500, top: 200, sizeClass: "STANDARD", isDefault: true },
      { code: "OVERSIZED_BACK", side: "back", name: "Oversized back", widthMm: 355, heightMm: 450, centerX: 500, top: 190, sizeClass: "LARGE", isDefault: false },
      { code: "UPPER_BACK", side: "back", name: "Upper back", widthMm: 300, heightMm: 100, centerX: 500, top: 200, sizeClass: "SMALL", isDefault: false },
      { code: "BACK_NECK", side: "back", name: "Back neck", widthMm: 75, heightMm: 75, centerX: 500, top: 182, sizeClass: "SMALL", isDefault: false },
    ],
  },
  {
    style: "oversized",
    pxPerMm: 0.88,
    sides: {
      front: {
        inner: "M402 108 C424 200 576 200 598 108 C576 144 424 144 402 108 Z",
        outline:
          "M402 108 C424 200 576 200 598 108 L790 186 Q900 330 962 470 L852 544 L782 430 L788 1076 Q500 1094 212 1076 L218 430 L148 544 L38 470 Q100 330 210 186 Z",
        details: [
          { kind: "rib", d: "M396 106 C420 214 580 214 604 106", width: 20 },
          { kind: "seam", d: "M935 488 L840 552" },
          { kind: "seam", d: "M65 488 L160 552" },
          { kind: "seam", d: "M790 190 Q800 300 784 430" },
          { kind: "seam", d: "M210 190 Q200 300 216 430" },
          { kind: "seam", d: "M216 1046 Q500 1066 784 1046" },
          { kind: "fold", d: "M270 560 Q340 760 300 960", width: 40, strength: 0.55 },
          { kind: "fold", d: "M730 560 Q660 760 700 960", width: 40, strength: 0.55 },
          { kind: "fold", d: "M400 930 Q500 1010 610 940", width: 30, strength: 0.35 },
        ],
        armpits: [[230, 450], [770, 450]],
      },
      back: {
        outline:
          "M402 108 C424 140 576 140 598 108 L790 186 Q900 330 962 470 L852 544 L782 430 L788 1076 Q500 1094 212 1076 L218 430 L148 544 L38 470 Q100 330 210 186 Z",
        details: [
          { kind: "rib", d: "M396 106 C422 146 578 146 604 106", width: 16 },
          { kind: "seam", d: "M935 488 L840 552" },
          { kind: "seam", d: "M65 488 L160 552" },
          { kind: "seam", d: "M790 190 Q800 300 784 430" },
          { kind: "seam", d: "M210 190 Q200 300 216 430" },
          { kind: "seam", d: "M216 1046 Q500 1066 784 1046" },
          { kind: "fold", d: "M270 560 Q340 760 300 960", width: 40, strength: 0.55 },
          { kind: "fold", d: "M730 560 Q660 760 700 960", width: 40, strength: 0.55 },
        ],
        armpits: [[230, 450], [770, 450]],
      },
    },
    printAreas: [
      { code: "FULL_FRONT", side: "front", name: "Full front", widthMm: 300, heightMm: 400, centerX: 500, top: 245, sizeClass: "LARGE", isDefault: true },
      { code: "OVERSIZED_FRONT", side: "front", name: "Oversized front", widthMm: 380, heightMm: 480, centerX: 500, top: 230, sizeClass: "LARGE", isDefault: false },
      { code: "CENTER_CHEST", side: "front", name: "Centre chest", widthMm: 260, heightMm: 100, centerX: 500, top: 250, sizeClass: "SMALL", isDefault: false },
      { code: "LEFT_CHEST", side: "front", name: "Left chest", widthMm: 90, heightMm: 90, centerX: 632, top: 255, sizeClass: "SMALL", isDefault: false },
      { code: "RIGHT_CHEST", side: "front", name: "Right chest", widthMm: 90, heightMm: 90, centerX: 368, top: 255, sizeClass: "SMALL", isDefault: false },
      { code: "FULL_BACK", side: "back", name: "Full back", widthMm: 320, heightMm: 420, centerX: 500, top: 190, sizeClass: "LARGE", isDefault: true },
      { code: "OVERSIZED_BACK", side: "back", name: "Oversized back", widthMm: 380, heightMm: 500, centerX: 500, top: 185, sizeClass: "LARGE", isDefault: false },
      { code: "UPPER_BACK", side: "back", name: "Upper back", widthMm: 320, heightMm: 110, centerX: 500, top: 190, sizeClass: "SMALL", isDefault: false },
      { code: "BACK_NECK", side: "back", name: "Back neck", widthMm: 75, heightMm: 75, centerX: 500, top: 172, sizeClass: "SMALL", isDefault: false },
    ],
  },
  {
    style: "polo",
    pxPerMm: 0.95,
    sides: {
      front: {
        outline:
          "M400 104 L452 212 L500 180 L548 212 L600 104 L730 160 Q820 250 890 360 L815 420 L752 372 L756 1040 Q500 1064 244 1040 L248 372 L185 420 L110 360 Q180 250 270 160 Z",
        inner: "M400 104 L452 212 L500 180 L548 212 L600 104 Q500 90 400 104 Z",
        details: [
          { kind: "seam", d: "M400 104 L452 212 L500 180 L548 212 L600 104", width: 3 },
          { kind: "seam", d: "M430 110 Q500 96 570 110", width: 2 },
          { kind: "seam", d: "M478 196 L478 360 L522 360 L522 196", width: 2.5 },
          { kind: "button", cx: 500, cy: 238, r: 7 },
          { kind: "button", cx: 500, cy: 296, r: 7 },
          { kind: "rib", d: "M868 376 L796 430", width: 22 },
          { kind: "rib", d: "M132 376 L204 430", width: 22 },
          { kind: "seam", d: "M730 162 Q742 270 752 372" },
          { kind: "seam", d: "M270 162 Q258 270 248 372" },
          { kind: "seam", d: "M252 1012 Q500 1036 752 1012" },
          { kind: "fold", d: "M300 520 Q360 700 330 900", width: 34, strength: 0.5 },
          { kind: "fold", d: "M700 520 Q640 700 672 900", width: 34, strength: 0.5 },
        ],
        armpits: [[262, 390], [738, 390]],
      },
      back: {
        outline:
          "M400 104 Q500 90 600 104 L730 160 Q820 250 890 360 L815 420 L752 372 L756 1040 Q500 1064 244 1040 L248 372 L185 420 L110 360 Q180 250 270 160 Z",
        details: [
          { kind: "rib", d: "M404 116 Q500 104 596 116", width: 22 },
          { kind: "rib", d: "M868 376 L796 430", width: 22 },
          { kind: "rib", d: "M132 376 L204 430", width: 22 },
          { kind: "seam", d: "M730 162 Q742 270 752 372" },
          { kind: "seam", d: "M270 162 Q258 270 248 372" },
          { kind: "seam", d: "M252 1012 Q500 1036 752 1012" },
          { kind: "fold", d: "M300 520 Q360 700 330 900", width: 34, strength: 0.5 },
          { kind: "fold", d: "M700 520 Q640 700 672 900", width: 34, strength: 0.5 },
        ],
        armpits: [[262, 390], [738, 390]],
      },
    },
    printAreas: [
      { code: "LEFT_CHEST", side: "front", name: "Left chest", widthMm: 90, heightMm: 90, centerX: 624, top: 250, sizeClass: "SMALL", isDefault: true },
      { code: "RIGHT_CHEST", side: "front", name: "Right chest", widthMm: 90, heightMm: 90, centerX: 376, top: 250, sizeClass: "SMALL", isDefault: false },
      { code: "FULL_BACK", side: "back", name: "Full back", widthMm: 300, heightMm: 350, centerX: 500, top: 200, sizeClass: "STANDARD", isDefault: true },
      { code: "UPPER_BACK", side: "back", name: "Upper back", widthMm: 300, heightMm: 100, centerX: 500, top: 190, sizeClass: "SMALL", isDefault: false },
      { code: "BACK_NECK", side: "back", name: "Back neck", widthMm: 75, heightMm: 75, centerX: 500, top: 168, sizeClass: "SMALL", isDefault: false },
    ],
  },
];

/** Print-area placement on the mockup as fractions (what the DB stores). */
export function placementFor(spec: GarmentSpec, area: PrintAreaSpec) {
  const wPx = area.widthMm * spec.pxPerMm;
  return {
    mockupX: round5((area.centerX - wPx / 2) / MOCKUP_W),
    mockupY: round5(area.top / MOCKUP_H),
    mockupWidth: round5(wPx / MOCKUP_W),
  };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
