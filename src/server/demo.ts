import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import type { Db } from "./db/client";
import * as t from "./db/schema";
import { ensureStaffUser, seedDemoData } from "./db/seed";
import { hashPassword } from "./auth/crypto";
import { DevPaymentProvider, paymentProvider } from "./payments/provider";
import { processUpload } from "./services/artwork";
import { addToCart } from "./services/cart";
import { loadProductConfig, loadSettings } from "./services/catalogue";
import { createDesign, createVersion } from "./services/designs";
import { changeStatus, markPaid, placeOrder } from "./services/orders";
import type { ProductConfig } from "@/domain/catalogue";
import { emptyDesign, type DesignElement, type TextElement } from "@/domain/design/schema";
import type { OrderStatus } from "@/domain/orders";

/**
 * DEMO DATA — sample staff logins, catalogue and orders so a fresh demo
 * deployment is presentable immediately. Nothing here is a real customer,
 * price or order. Only runs on an empty embedded database.
 */

export const DEMO_STAFF = [
  { email: "admin@studio.local", name: "Demo Admin", password: "admin-dev-password", role: "ADMIN" as const },
  { email: "production@studio.local", name: "Demo Production", password: "production-dev-password", role: "PRODUCTION" as const },
];

const DEMO_OWNER = "d".repeat(64);

const text = (over: Partial<TextElement>): TextElement => ({
  id: `demo_${randomUUID().slice(0, 8)}`,
  type: "text",
  text: "SAMPLE",
  fontId: "montserrat",
  fontSize: 30,
  fill: "#FFFFFF",
  bold: true,
  italic: false,
  align: "center",
  lineHeight: 1.15,
  x: 140,
  y: 100,
  rotation: 0,
  ...over,
});

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <circle cx="500" cy="500" r="470" fill="#F4B400"/>
  <path d="M250 640 L500 250 L750 640 Z" fill="#1F4D3A"/>
  <path d="M430 640 L560 450 L690 640 Z" fill="#2E7D32"/>
</svg>`;

type DemoOrder = {
  slug: string;
  colour: string;
  channel: "B2C" | "B2B";
  method: string;
  front: (logoId: string) => DesignElement[];
  back?: DesignElement[];
  sizes: Record<string, number>;
  customer: { name: string; email: string; phone: string; city: string; company?: string; gstin?: string; po?: string };
  /** where the order should end up; undefined = left unpaid */
  status?: OrderStatus;
};

const ORDERS: DemoOrder[] = [
  {
    slug: "pique-polo",
    colour: "Navy",
    channel: "B2B",
    method: "EMBROIDERY",
    front: (logo) => [{ id: "demo_logo1", type: "image", assetId: logo, width: 50, height: 50, x: 45, y: 32, rotation: 0 }, text({ text: "ACME EVENTS", fontSize: 9, x: 45, y: 72 })],
    back: [text({ text: "TEAM ACME 2026", fontSize: 26, y: 70 })],
    sizes: { S: 20, M: 35, L: 30, XL: 10, XXL: 5 },
    customer: { name: "Rohan Kapoor", email: "rohan@acme-events.example", phone: "9829000001", city: "Jaipur", company: "Acme Events Pvt Ltd", gstin: "08ABCDE1234F1Z5", po: "PO-7781" },
    status: "IN_PRODUCTION",
  },
  {
    slug: "classic-crew-tshirt",
    colour: "Black",
    channel: "B2C",
    method: "DTF",
    front: () => [text({ text: "JAIPUR\nRUNNERS", fontId: "anton", fontSize: 48, fill: "#E0A526", y: 90 })],
    back: [text({ text: "EST. 2026", fontId: "oswald", fontSize: 22, y: 50 })],
    sizes: { M: 1, L: 1 },
    customer: { name: "Asha Mehta", email: "asha@example.com", phone: "9829000002", city: "Jaipur" },
    status: "DESIGN_REVIEW",
  },
  {
    slug: "classic-crew-tshirt",
    colour: "White",
    channel: "B2B",
    method: "DTF",
    front: (logo) => [{ id: "demo_logo2", type: "image", assetId: logo, width: 120, height: 120, x: 140, y: 110, rotation: 0 }, text({ text: "Pink City Marathon", fontId: "pacifico", bold: false, fontSize: 24, fill: "#B8521A", y: 210 })],
    sizes: { S: 10, M: 20, L: 15, XL: 5 },
    customer: { name: "Neha Sharma", email: "neha@pinkcityrun.example", phone: "9829000003", city: "Jaipur", company: "Pink City Runners Club" },
    status: "SHIPPED",
  },
  {
    slug: "oversized-tshirt",
    colour: "Lavender",
    channel: "B2C",
    method: "DTF",
    front: () => [text({ text: "good vibes\nonly", fontId: "permanent-marker", bold: false, fontSize: 40, fill: "#1C1A17", y: 120, rotation: -6 })],
    sizes: { L: 1 },
    customer: { name: "Kabir Singh", email: "kabir@example.com", phone: "9829000004", city: "Delhi" },
    // left unpaid: shows an order awaiting payment
  },
];

const PATH: OrderStatus[] = ["APPROVED", "IN_PRODUCTION", "PRINTED", "QUALITY_CHECK", "SHIPPED"];

async function demoOrder(db: Db, spec: DemoOrder, logoId: string, admin: { id: string; roles: ["ADMIN"] }) {
  const product = (await loadProductConfig(db, { slug: spec.slug })) as ProductConfig;
  const colour = product.colours.find((c) => c.name === spec.colour)!;
  const doc = emptyDesign({
    productId: product.id,
    colourId: colour.id,
    frontArea: product.printAreas.find((a) => a.side === "front" && a.isDefault)!.code,
    backArea: product.printAreas.find((a) => a.side === "back" && a.isDefault)!.code,
  });
  doc.surfaces.front.elements = spec.front(logoId);
  doc.surfaces.back.elements = spec.back ?? [];
  const owner = { tokenHash: DEMO_OWNER };
  const { id } = await createDesign(db, owner, { doc, name: `${spec.customer.company ?? spec.customer.name} design` });
  const { versionId } = await createVersion(db, owner, id, { doc });
  const cart = randomUUID().replace(/-/g, "").padEnd(64, "0");
  await addToCart(db, DEMO_OWNER, cart, {
    designVersionId: versionId,
    channel: spec.channel,
    printMethodCode: spec.method,
    sizes: Object.entries(spec.sizes).map(([code, quantity]) => ({ sizeId: product.sizes.find((s) => s.code === code)!.id, quantity })),
  });
  const res = await placeOrder(db, {
    cartTokenHash: cart,
    form: {
      idempotencyKey: randomUUID(),
      name: spec.customer.name,
      email: spec.customer.email,
      phone: spec.customer.phone,
      addressLine1: "12 MI Road",
      city: spec.customer.city,
      state: spec.customer.city === "Delhi" ? "Delhi" : "Rajasthan",
      pincode: spec.customer.city === "Delhi" ? "110001" : "302001",
      companyName: spec.customer.company ?? "",
      gstin: spec.customer.gstin ?? "",
      poReference: spec.customer.po ?? "",
    },
  });
  const provider = paymentProvider();
  if (!spec.status || !res.payment || !(provider instanceof DevPaymentProvider)) return;
  await markPaid(db, provider.simulateSuccess(res.payment.orderId));
  if (spec.status === "DESIGN_REVIEW") return;
  const [order] = await db.select().from(t.orders).where(eq(t.orders.orderNumber, res.orderNumber));
  for (const to of PATH) {
    await changeStatus(db, admin, { orderId: order.id, to });
    if (to === spec.status) break;
  }
}

/** Fills an empty demo database: catalogue, staff logins and a few sample orders. */
export async function ensureDemoData(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.products);
  if (n > 0) return;
  // several instances may start at once on a shared database: only one fills it
  const claimed = await db.insert(t.rateLimits).values({ key: "demo:seed", windowStart: new Date(), count: 1 }).onConflictDoNothing().returning();
  if (!claimed.length) {
    // another instance is filling it: wait (briefly) for the catalogue to appear
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const [{ n: now }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.products);
      if (now > 0) return;
    }
    return;
  }
  console.info("[demo] empty database — loading sample catalogue, staff and orders");
  await seedDemoData(db);
  let adminId = "";
  for (const u of DEMO_STAFF) {
    const user = await ensureStaffUser(db, { ...u, passwordHash: await hashPassword(u.password) });
    if (u.role === "ADMIN") adminId = user.id;
  }
  try {
    const rules = (await loadSettings(db)).artwork;
    const logo = await processUpload(db, { data: await sharp(Buffer.from(LOGO_SVG)).png().toBuffer(), filename: "acme-logo.png", ownerTokenHash: DEMO_OWNER, rules });
    for (const spec of ORDERS) await demoOrder(db, spec, logo.id, { id: adminId, roles: ["ADMIN"] });
  } catch (err) {
    // sample orders are a nicety; the catalogue and logins are what matter
    console.error("[demo] could not create sample orders", err);
  }
}
