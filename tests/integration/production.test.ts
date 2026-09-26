import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createTestDb } from "../support/db";
import { doc, product, sizeId, textEl, uploadLogo, useTempStorage, versionedDesign } from "../support/fixtures";
import type { Db } from "@/server/db/client";
import { addToCart } from "@/server/services/cart";
import { markPaid, orderDetail, orderForCustomer, placeOrder } from "@/server/services/orders";
import { DevPaymentProvider, setPaymentProviderForTests } from "@/server/payments/provider";
import { setEmailProviderForTests } from "@/server/email";
import { artworkFile, designJson, orderPdf, printFile, productionNotes } from "@/server/production/files";
import { AppError } from "@/server/errors";

let db: Db;
const owner = "p".repeat(64);
const dev = new DevPaymentProvider("s");
let detail: Awaited<ReturnType<typeof orderDetail>>;
let logoId: string;

beforeAll(async () => {
  useTempStorage();
  db = await createTestDb();
  setPaymentProviderForTests(dev);
  setEmailProviderForTests({ send: async () => undefined });
  const crew = await product(db);
  const polo = await product(db, "pique-polo");
  const logo = await uploadLogo(db, owner);
  logoId = logo.id;
  const a = await versionedDesign(db, owner, doc(crew, { front: [textEl({ text: "ÑANDÚ – 2026 ✓" }), { id: "img1", type: "image", assetId: logo.id, width: 100, height: 100, x: 140, y: 220, rotation: 10 }] }));
  const b = await versionedDesign(db, owner, doc(polo, { front: [textEl({ fontSize: 4, x: 45, y: 45, text: "tiny" })], back: [textEl({ y: 80 })] }));
  const cart = "q".repeat(64);
  await addToCart(db, owner, cart, { designVersionId: a.versionId, channel: "B2C", printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "L"), quantity: 2 }] });
  await addToCart(db, owner, cart, { designVersionId: b.versionId, channel: "B2C", printMethodCode: "EMBROIDERY", sizes: [{ sizeId: sizeId(polo, "M"), quantity: 1 }] });
  const res = await placeOrder(db, {
    cartTokenHash: cart,
    form: { idempotencyKey: randomUUID(), name: "Ravi", email: "ravi@example.com", phone: "9876543210", addressLine1: "1 Road", city: "Jaipur", state: "Rajasthan", pincode: "302001" },
  });
  const sim = dev.simulateSuccess(res.payment!.orderId);
  await markPaid(db, sim);
  detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
});

describe("production files", () => {
  it("names files meaningfully and renders per-method print PNGs at 300 DPI", async () => {
    const n = detail.order.orderNumber;
    const front = await printFile(db, detail, 0, "front", null);
    expect(front.filename).toBe(`${n}-1_FRONT_DTF.png`);
    const meta = await sharp(front.data).metadata();
    expect(meta).toMatchObject({ width: 3307, height: 4134, density: 300 });
    const back = await printFile(db, detail, 1, "back", null);
    expect(back.filename).toBe(`${n}-2_BACK_EMBROIDERY.png`);
    const again = await printFile(db, detail, 0, "front", null); // served from the production-files cache
    expect(again.data.equals(front.data)).toBe(true);
    await expect(printFile(db, detail, 0, "back", null)).rejects.toThrow(AppError); // nothing printed on that side
  });

  it("exports the exact design JSON with print-area dimensions and sizes", async () => {
    const f = await designJson(db, detail, 0);
    const j = JSON.parse(f.data.toString());
    expect(f.filename).toMatch(/-1_DESIGN\.json$/);
    expect(j.design.surfaces.front.elements).toHaveLength(2);
    expect(j.printAreas.front).toMatchObject({ code: "FULL_FRONT", widthMm: 280, heightMm: 350 });
    expect(j.sizes).toEqual([expect.objectContaining({ size: "L", quantity: 2 })]);
    expect(j.artwork[0].assetId).toBe(logoId);
  });

  it("serves artwork only if it belongs to this order", async () => {
    const orig = await artworkFile(db, detail, logoId, "original");
    expect(orig.filename).toMatch(/_ART_logo_ORIGINAL\.png$/);
    const other = await uploadLogo(db, "x".repeat(64));
    await expect(artworkFile(db, detail, other.id, "original")).rejects.toThrow(AppError);
  });

  it("produces a job sheet PDF even with non-Latin customer text, and method-specific notes", async () => {
    const pdf = await orderPdf(db, detail);
    expect(pdf.filename).toBe(`${detail.order.orderNumber}_ORDER.pdf`);
    expect(pdf.data.subarray(0, 4).toString()).toBe("%PDF");
    const notes = await productionNotes(db, detail.items[1]);
    expect(notes.front?.some((n) => /under 5 mm/.test(n.message))).toBe(true);
    const dtfNotes = await productionNotes(db, detail.items[0]);
    expect(dtfNotes.front?.every((n) => !/digitis/.test(n.message))).toBe(true);
  });
});
