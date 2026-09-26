/**
 * Generates the garment mockup layers in public/mockups:
 *   <style>-<side>-mask.png       white silhouette on transparent (recoloured at render time)
 *   <style>-<side>-shade.webp     multiply layer: folds, seams, edge falloff, fabric grain
 *   <style>-<side>-highlight.webp  screen layer: soft light so folds read on dark colours
 *
 * Deterministic (seeded noise) so re-running produces identical files.
 * Run: npm run mockups
 */
import { createCanvas, Path2D, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";
import { garments, MOCKUP_H, MOCKUP_W, type GarmentSpec, type Side } from "../src/server/db/seed-data/garments";

const OUT = path.join(process.cwd(), "public", "mockups");
fs.mkdirSync(OUT, { recursive: true });

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas() {
  const c = createCanvas(MOCKUP_W, MOCKUP_H);
  return { c, ctx: c.getContext("2d") };
}

async function save(c: Canvas, name: string) {
  const png = c.toBuffer("image/png");
  // shade/highlight are opaque and noisy: WebP keeps them ~10x smaller than PNG
  const buf = name.endsWith(".webp") ? await sharp(png).webp({ quality: 88 }).toBuffer() : png;
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log("wrote", name, `${Math.round(buf.length / 1024)} KB`);
}

function bounds(ctx: SKRSContext2D, outline: Path2D) {
  // crude bbox scan of the silhouette for gradients
  let minX = MOCKUP_W, maxX = 0, minY = MOCKUP_H, maxY = 0;
  for (let y = 0; y < MOCKUP_H; y += 4)
    for (let x = 0; x < MOCKUP_W; x += 4)
      if (ctx.isPointInPath(outline, x, y)) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
  return { minX, maxX, minY, maxY };
}

async function generate(spec: GarmentSpec, side: Side) {
  const { outline: d, inner: innerD, details, armpits } = spec.sides[side];
  const outline = new Path2D(d);
  const inner = innerD ? new Path2D(innerD) : null;
  const base = `${spec.style}-${side}`;

  // ---- mask
  {
    const { c, ctx } = canvas();
    ctx.fillStyle = "#ffffff";
    ctx.fill(outline);
    if (inner) ctx.fill(inner);
    await save(c, `${base}-mask.png`);
  }

  // ---- shade (multiply): white = no change
  {
    const { c, ctx } = canvas();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, MOCKUP_W, MOCKUP_H);
    const b = bounds(ctx, outline);
    ctx.save();
    ctx.clip(outline);

    // edge falloff: fabric turns away from the viewer at the sides
    const edge = (x0: number, x1: number) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), MOCKUP_H);
    };
    edge(b.minX, b.minX + 150);
    edge(b.maxX, b.maxX - 150);

    // hem and shoulder falloff
    const hem = ctx.createLinearGradient(0, b.maxY, 0, b.maxY - 90);
    hem.addColorStop(0, "rgba(0,0,0,0.16)");
    hem.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hem;
    ctx.fillRect(0, b.maxY - 90, MOCKUP_W, 90);

    // armpit gathers
    ctx.filter = "blur(26px)";
    for (const [x, y] of armpits) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(x, y + 30, 40, 90, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // drape folds
    for (const det of details) {
      if (det.kind !== "fold") continue;
      ctx.strokeStyle = `rgba(0,0,0,${0.18 * det.strength})`;
      ctx.lineWidth = det.width;
      ctx.lineCap = "round";
      ctx.stroke(new Path2D(det.d));
    }
    ctx.filter = "none";

    // ribs, seams, buttons
    for (const det of details) {
      if (det.kind === "rib") {
        ctx.filter = "blur(2px)";
        ctx.strokeStyle = "rgba(0,0,0,0.20)";
        ctx.lineWidth = det.width;
        ctx.stroke(new Path2D(det.d));
        ctx.filter = "none";
        ctx.strokeStyle = "rgba(0,0,0,0.10)";
        ctx.lineWidth = 1;
        for (let i = -det.width / 2 + 3; i < det.width / 2; i += 4) {
          ctx.save();
          ctx.translate(0, i);
          ctx.stroke(new Path2D(det.d));
          ctx.restore();
        }
      } else if (det.kind === "seam") {
        ctx.filter = "blur(1px)";
        ctx.strokeStyle = "rgba(0,0,0,0.30)";
        ctx.lineWidth = det.width ?? 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke(new Path2D(det.d));
        ctx.setLineDash([]);
        ctx.filter = "none";
      } else if (det.kind === "button") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(det.cx, det.cy, det.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (inner) {
      // inside of the back neck band: in shadow
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fill(inner);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke(inner);
    }

    // fabric grain: subtle seeded noise inside the garment
    const img = ctx.getImageData(0, 0, MOCKUP_W, MOCKUP_H);
    const rnd = mulberry32(spec.style.length * 1000 + (side === "front" ? 1 : 2));
    for (let y = 0; y < MOCKUP_H; y++) {
      for (let x = 0; x < MOCKUP_W; x++) {
        const i = (y * MOCKUP_W + x) * 4;
        const weave = (x + y) % 3 === 0 ? 4 : 0; // faint twill
        const n = Math.floor(rnd() * 7) + weave;
        img.data[i] = Math.max(0, img.data[i] - n);
        img.data[i + 1] = Math.max(0, img.data[i + 1] - n);
        img.data[i + 2] = Math.max(0, img.data[i + 2] - n);
      }
    }
    ctx.putImageData(img, 0, 0);

    // silhouette edge so white garments read on a light stage
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke(outline);
    await save(c, `${base}-shade.webp`);
  }

  // ---- highlight (screen): black = no change
  {
    const { c, ctx } = canvas();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, MOCKUP_W, MOCKUP_H);
    const b = bounds(ctx, outline);
    ctx.save();
    ctx.clip(outline);
    ctx.filter = "blur(60px)";
    const cx = (b.minX + b.maxX) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.beginPath();
    ctx.ellipse(cx - 50, (b.minY + b.maxY) * 0.45, 210, 380, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (const det of details) {
      if (det.kind !== "fold") continue;
      ctx.save();
      ctx.translate(det.width * 0.9, 0);
      ctx.strokeStyle = `rgba(255,255,255,${0.12 * det.strength})`;
      ctx.lineWidth = det.width * 0.8;
      ctx.stroke(new Path2D(det.d));
      ctx.restore();
    }
    ctx.filter = "none";
    ctx.restore();
    await save(c, `${base}-highlight.webp`);
  }
}

async function main() {
  for (const spec of garments) {
    await generate(spec, "front");
    await generate(spec, "back");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
