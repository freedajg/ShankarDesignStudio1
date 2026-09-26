import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import type { Db, DbOrTx } from "../db/client";
import * as t from "../db/schema";
import { notFound } from "../errors";
import { BUCKETS, storage, type Bucket } from "../storage";
import { loadProductConfig, loadSettings } from "../services/catalogue";
import { getVersion } from "../services/designs";
import { orderDetail } from "../services/orders";
import { renderMockup, renderPrintFile } from "../render/design";
import { adapterFor, type ProductionNote } from "./adapters";
import { SIDES, type DesignDoc, type Side } from "@/domain/design/schema";
import { formatInr } from "@/domain/money";
import { STATUS_LABEL } from "@/domain/orders";

/** Bump when the renderer changes so cached print files are regenerated. */
const RENDERER_VERSION = 1;

type Detail = Awaited<ReturnType<typeof orderDetail>>;
type Item = Detail["items"][number];

/** e.g. SG-10452_FRONT_DTF.png — multi-item orders add the item number: SG-10452-2_BACK_DTF.png */
export function fileBase(orderNumber: string, itemIndex: number, itemCount: number) {
  return itemCount > 1 ? `${orderNumber}-${itemIndex + 1}` : orderNumber;
}

export async function loadItemContext(db: DbOrTx, item: Item) {
  const version = await getVersion(db, item.designVersionId);
  if (!version) throw notFound("That design version");
  const product = await loadProductConfig(db, { id: item.productId });
  if (!product) throw notFound("That product");
  return { version, product, doc: version.doc };
}

async function assetsFor(db: DbOrTx, doc: DesignDoc) {
  const ids = SIDES.flatMap((s) => doc.surfaces[s].elements.flatMap((e) => (e.type === "image" ? [e.assetId] : [])));
  return ids.length ? db.select().from(t.artworkAssets).where(inArray(t.artworkAssets.id, ids)) : [];
}

/** Adapter review notes per decorated side, for the admin screen and the job sheet. */
export async function productionNotes(db: DbOrTx, item: Item): Promise<Partial<Record<Side, ProductionNote[]>>> {
  const { doc } = await loadItemContext(db, item);
  const rules = (await loadSettings(db)).artwork;
  const assets = new Map((await assetsFor(db, doc)).map((a) => [a.id, a]));
  const adapter = adapterFor(item.printMethodCode);
  const out: Partial<Record<Side, ProductionNote[]>> = {};
  for (const side of SIDES) if (doc.surfaces[side].elements.length) out[side] = adapter.review({ doc, side, assets, rules });
  return out;
}

/** Print file for one decorated surface, generated once and kept (versions are immutable). */
export async function printFile(db: Db, detail: Detail, itemIndex: number, side: Side, actorUserId: string | null) {
  const item = detail.items[itemIndex];
  if (!item) throw notFound("That order item");
  const { doc, product } = await loadItemContext(db, item);
  if (!doc.surfaces[side].elements.length) throw notFound("A design on that side");
  const adapter = adapterFor(item.printMethodCode);
  const kind = `PRINT_${adapter.code}_v${RENDERER_VERSION}`;
  const filename = `${fileBase(detail.order.orderNumber, itemIndex, detail.items.length)}_${side.toUpperCase()}_${adapter.code}.png`;

  const [hit] = await db
    .select()
    .from(t.productionFiles)
    .where(and(eq(t.productionFiles.orderItemId, item.id), eq(t.productionFiles.side, side), eq(t.productionFiles.kind, kind)))
    .limit(1);
  if (hit) {
    const data = await storage().get(hit.bucket as Bucket, hit.storageKey);
    if (data) return { data, filename, contentType: "image/png" };
  }
  const rendered = await renderPrintFile(db, { product, doc, side, dpi: adapter.dpi });
  const key = `${detail.order.orderNumber}/${item.id}/${side}-${kind}.png`;
  await storage().put(BUCKETS.production, key, rendered.png, "image/png");
  await db
    .insert(t.productionFiles)
    .values({ orderId: detail.order.id, orderItemId: item.id, side, printMethodCode: adapter.code, kind, bucket: BUCKETS.production, storageKey: key, widthPx: rendered.widthPx, heightPx: rendered.heightPx, dpi: adapter.dpi, generatedBy: actorUserId })
    .onConflictDoNothing();
  return { data: rendered.png, filename, contentType: "image/png" };
}

/** The exact structured design, plus the context needed to reproduce it. */
export async function designJson(db: DbOrTx, detail: Detail, itemIndex: number) {
  const item = detail.items[itemIndex];
  if (!item) throw notFound("That order item");
  const { doc, product, version } = await loadItemContext(db, item);
  const areas = Object.fromEntries(
    SIDES.map((s) => {
      const a = product.printAreas.find((x) => x.side === s && x.code === doc.surfaces[s].printAreaCode);
      return [s, a ? { code: a.code, name: a.name, widthMm: a.widthMm, heightMm: a.heightMm } : null];
    }),
  );
  const assets = await assetsFor(db, doc);
  const payload = {
    format: "sweet-ginger-design",
    order: detail.order.orderNumber,
    item: itemIndex + 1,
    product: { id: product.id, name: item.productName, slug: item.productSlug },
    colour: { name: item.colourName, hex: item.colourHex },
    printMethod: item.printMethodCode,
    printAreas: areas,
    sizes: item.sizes.map((s) => ({ size: s.sizeCode, sku: s.sku, quantity: s.quantity })),
    designVersion: { id: version.id, version: version.version, createdAt: version.createdAt },
    units: "Millimetres relative to the top-left of each surface's print area; (x, y) is the element centre; rotation in degrees clockwise.",
    artwork: assets.map((a) => ({ assetId: a.id, originalAssetId: a.parentAssetId, widthPx: a.widthPx, heightPx: a.heightPx, sha256: a.sha256, filename: a.originalFilename })),
    design: doc,
  };
  return {
    data: Buffer.from(JSON.stringify(payload, null, 2)),
    filename: `${fileBase(detail.order.orderNumber, itemIndex, detail.items.length)}_DESIGN.json`,
    contentType: "application/json",
  };
}

/** Customer's uploaded artwork: the byte-for-byte original or the processed file. */
export async function artworkFile(db: DbOrTx, detail: Detail, assetId: string, variant: "original" | "processed") {
  // the asset must belong to one of this order's design versions
  const versionIds = detail.items.map((i) => i.designVersionId);
  const links = await db.select().from(t.designVersionAssets).where(inArray(t.designVersionAssets.designVersionId, versionIds));
  if (!links.some((l) => l.assetId === assetId)) throw notFound("That artwork");
  const [processed] = await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.id, assetId));
  if (!processed) throw notFound("That artwork");
  const row = variant === "original" && processed.parentAssetId ? (await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.id, processed.parentAssetId)))[0] : processed;
  const data = await storage().get(row.bucket as Bucket, row.storageKey);
  if (!data) throw notFound("That artwork file");
  const ext = row.mime === "image/jpeg" ? "jpg" : "png";
  const stem = (processed.originalFilename ?? "artwork").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40);
  return { data, filename: `${detail.order.orderNumber}_ART_${stem}_${variant.toUpperCase()}.${ext}`, contentType: row.mime };
}

// ------------------------------------------------------------------ job sheet PDF

export async function orderPdf(db: DbOrTx, detail: Detail) {
  const { order } = detail;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${order.orderNumber} job sheet`);
  pdf.setCreator("Sweet Ginger Design Studio");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const M = 40;
  let page = pdf.addPage(A4);
  let y = A4[1] - M;
  const ink = rgb(0.11, 0.1, 0.09);
  const muted = rgb(0.37, 0.35, 0.31);
  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = ink, p: PDFPage = page) => p.drawText(ascii(s), { x, y, size, font: f, color });
  const line = (h = 14) => {
    y -= h;
    if (y < M + 40) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
    }
  };

  text(`JOB SHEET  ${order.orderNumber}`, M, 18, bold);
  text(order.channel === "B2B" ? "BULK (B2B)" : "SINGLE (B2C)", A4[0] - M - 90, 11, bold);
  line(20);
  text(`Status: ${STATUS_LABEL[order.status]}   Payment: ${order.paymentStatus}   Placed: ${order.placedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "-"} UTC`, M, 9, font, muted);
  line(22);
  text("Customer", M, 11, bold);
  line();
  text(`${order.contactName}  |  ${order.contactPhone}  |  ${order.contactEmail}`, M);
  line();
  if (order.companyName) {
    text(`Company: ${order.companyName}${order.gstin ? `   GSTIN: ${order.gstin}` : ""}${order.poReference ? `   PO: ${order.poReference}` : ""}`, M);
    line();
  }
  text(`Ship to: ${order.addressLine1}${order.addressLine2 ? `, ${order.addressLine2}` : ""}, ${order.city}, ${order.state} ${order.pincode}`, M);
  line();
  if (order.notes) {
    text(`Notes: ${order.notes.slice(0, 180)}`, M, 10, font, muted);
    line();
  }
  if (order.needsAttention) {
    text(`ATTENTION: ${order.needsAttention.slice(0, 150)}`, M, 10, bold, rgb(0.64, 0.15, 0.11));
    line();
  }

  for (const [i, item] of detail.items.entries()) {
    const { doc, product } = await loadItemContext(db, item);
    const adapter = adapterFor(item.printMethodCode);
    const notes = await productionNotes(db, item);
    line(24);
    text(`Item ${i + 1}: ${item.productName}`, M, 13, bold);
    line(16);
    text(`Colour: ${item.colourName} (${item.colourHex})   Method: ${item.printMethodCode}   Qty: ${item.quantity}`, M);
    line(38);
    // size breakdown boxes (wrap after 8)
    for (const [k, s] of item.sizes.entries()) {
      if (k > 0 && k % 8 === 0) line(38);
      const x = M + (k % 8) * 62;
      page.drawRectangle({ x, y, width: 56, height: 30, borderColor: muted, borderWidth: 0.6 });
      page.drawText(ascii(s.sizeCode), { x: x + 6, y: y + 18, size: 9, font: bold, color: ink });
      page.drawText(String(s.quantity), { x: x + 6, y: y + 5, size: 12, font: bold, color: ink });
    }
    line(22);
    // previews + placement per side
    const sides = SIDES.filter((s) => doc.surfaces[s].elements.length);
    const imgW = 150;
    const imgH = imgW * 1.1;
    if (y - imgH < M) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
    }
    for (const [k, side] of sides.entries()) {
      const webp = await renderMockup(db, { product, doc, side, width: 450 });
      const png = await pdf.embedPng(await sharp(webp).png().toBuffer());
      const left = M + k * 260;
      page.drawImage(png, { x: left, y: y - imgH, width: imgW, height: imgH });
      const area = product.printAreas.find((a) => a.side === side && a.code === doc.surfaces[side].printAreaCode)!;
      const infoX = left + imgW + 8;
      page.drawText(ascii(side.toUpperCase()), { x: infoX, y: y - 12, size: 11, font: bold, color: ink });
      page.drawText(ascii(area.name), { x: infoX, y: y - 26, size: 9, font, color: ink });
      page.drawText(`${area.widthMm} x ${area.heightMm} mm`, { x: infoX, y: y - 38, size: 9, font, color: muted });
      page.drawText(`${doc.surfaces[side].elements.length} element(s)`, { x: infoX, y: y - 50, size: 9, font, color: muted });
    }
    y -= imgH + 8;
    line(6);
    text(ascii(adapter.fileDescription).slice(0, 110), M, 8, font, muted);
    line(12);
    for (const side of sides) {
      for (const n of notes[side] ?? []) {
        text(`${side.toUpperCase()} ${n.level === "warning" ? "WARNING" : "NOTE"}: ${n.message}`.slice(0, 120), M, 8, n.level === "warning" ? bold : font, n.level === "warning" ? rgb(0.54, 0.35, 0) : muted);
        line(11);
      }
    }
    text(`Files: ${fileBase(order.orderNumber, i, detail.items.length)}_<SIDE>_${adapter.code}.png, ${fileBase(order.orderNumber, i, detail.items.length)}_DESIGN.json`, M, 8, font, muted);
    line(4);
  }

  line(24);
  text(`Subtotal ${formatInr(order.subtotalPaise)}   Tax ${formatInr(order.taxPaise)}   Shipping ${formatInr(order.shippingPaise)}   TOTAL ${formatInr(order.totalPaise)}`.replace(/₹/g, "Rs "), M, 10, bold);
  const data = Buffer.from(await pdf.save());
  return { data, filename: `${order.orderNumber}_ORDER.pdf`, contentType: "application/pdf" };
}

/** Standard PDF fonts are WinAnsi-only; keep the job sheet robust to any customer text. */
function ascii(s: string) {
  return s
    .replace(/₹/g, "Rs ")
    .replace(/[×]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "?");
}

export async function productionFileList(db: DbOrTx, orderId: string) {
  return db.select().from(t.productionFiles).where(eq(t.productionFiles.orderId, orderId)).orderBy(asc(t.productionFiles.createdAt));
}
