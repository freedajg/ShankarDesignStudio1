import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "../db/client";
import { artworkAssets, designs, designVersionAssets, designVersions } from "../db/schema";
import { AppError, notFound } from "../errors";
import { serverMeasure } from "../render/canvas";
import { loadProductConfig } from "./catalogue";
import { ownedProcessedAssets, toClientAsset } from "./artwork";
import { assetIds, countElements, designDocSchema, type DesignDoc } from "@/domain/design/schema";
import { validateDesign } from "@/domain/design/validate";

/**
 * Designs: a mutable working draft (autosaved) plus immutable versions.
 * Carts and orders reference versions, so editing a design later can never
 * change what was ordered.
 */

export type DesignOwner = { tokenHash: string };

const parseDoc = (doc: unknown): DesignDoc => {
  const parsed = designDocSchema.safeParse(doc);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "The design data is invalid.", { issues: parsed.error.issues.slice(0, 5) });
  }
  return parsed.data;
};

async function loadOwned(db: DbOrTx, owner: DesignOwner, id: string) {
  const [row] = await db
    .select()
    .from(designs)
    .where(and(eq(designs.id, id), eq(designs.ownerTokenHash, owner.tokenHash)))
    .limit(1);
  // Same response whether it doesn't exist or belongs to someone else (no probing).
  if (!row) throw notFound("That design");
  return row;
}

/** Light checks for drafts: schema-valid, product/colour real, referenced uploads owned by this browser. */
async function checkDraft(db: DbOrTx, owner: DesignOwner, doc: DesignDoc) {
  const product = await loadProductConfig(db, { id: doc.productId });
  if (!product) throw new AppError("VALIDATION", "This product is no longer available.");
  if (!product.colours.some((c) => c.id === doc.colourId)) throw new AppError("VALIDATION", "This colour is not available.");
  const ids = assetIds(doc);
  const owned = await ownedProcessedAssets(db, owner.tokenHash, ids);
  if (owned.length !== ids.length) throw new AppError("VALIDATION", "An image in this design isn't available. Please upload it again.");
  return { product, owned };
}

export async function createDesign(db: Db, owner: DesignOwner, input: { doc: unknown; name?: string }) {
  const doc = parseDoc(input.doc);
  await checkDraft(db, owner, doc);
  const [row] = await db
    .insert(designs)
    .values({
      ownerTokenHash: owner.tokenHash,
      productId: doc.productId,
      colourId: doc.colourId,
      name: input.name?.trim().slice(0, 80) || "Untitled design",
      draftJson: doc,
      draftRevision: 1,
    })
    .returning({ id: designs.id, draftRevision: designs.draftRevision });
  return row;
}

export async function saveDraft(db: Db, owner: DesignOwner, id: string, input: { doc: unknown; name?: string }) {
  const doc = parseDoc(input.doc);
  const existing = await loadOwned(db, owner, id);
  if (existing.productId !== doc.productId) throw new AppError("VALIDATION", "A design can't change product. Start a new design instead.");
  await checkDraft(db, owner, doc);
  const [row] = await db
    .update(designs)
    .set({
      draftJson: doc,
      colourId: doc.colourId,
      name: input.name?.trim().slice(0, 80) || existing.name,
      draftRevision: sql`${designs.draftRevision} + 1`,
    })
    .where(eq(designs.id, id))
    .returning({ id: designs.id, draftRevision: designs.draftRevision, updatedAt: designs.updatedAt });
  return row;
}

export async function getOwnedDesign(db: DbOrTx, owner: DesignOwner, id: string) {
  const design = await loadOwned(db, owner, id);
  const doc = parseDoc(design.draftJson);
  const ids = assetIds(doc);
  const assets = ids.length ? await db.select().from(artworkAssets).where(inArray(artworkAssets.id, ids)) : [];
  return { design, doc, assets: assets.map(toClientAsset) };
}

/**
 * Freezes the current design into an immutable version after full server-side
 * validation (every element inside its print area, measured with the same fonts
 * the printer uses). A design with no elements is not printable, so it cannot
 * be versioned for ordering.
 */
export async function createVersion(db: Db, owner: DesignOwner, id: string, input: { doc: unknown; name?: string }) {
  const doc = parseDoc(input.doc);
  const existing = await loadOwned(db, owner, id);
  if (existing.productId !== doc.productId) throw new AppError("VALIDATION", "A design can't change product.");
  if (countElements(doc) === 0) throw new AppError("VALIDATION", "Add some text or artwork before saving — an empty shirt can't be printed.");

  const { product, owned } = await checkDraft(db, owner, doc);
  const issues = validateDesign(doc, {
    productId: product.id,
    colourIds: product.colours.map((c) => c.id),
    printAreas: product.printAreas,
    measure: serverMeasure(),
    knownAssetIds: new Set(owned.map((a) => a.id)),
  });
  if (issues.length) throw new AppError("VALIDATION", issues[0].message, { issues });

  return db.transaction(async (tx) => {
    // lock the design row so concurrent saves get sequential version numbers
    await tx.execute(sql`select id from designs where id = ${id} for update`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${designVersions.version}), 0) + 1` })
      .from(designVersions)
      .where(eq(designVersions.designId, id));
    const [version] = await tx
      .insert(designVersions)
      .values({
        designId: id,
        version: next,
        schemaVersion: doc.schemaVersion,
        designJson: doc,
        productId: doc.productId,
        colourId: doc.colourId,
        elementCount: countElements(doc),
      })
      .returning();
    if (owned.length) {
      await tx.insert(designVersionAssets).values(owned.map((a) => ({ designVersionId: version.id, assetId: a.id })));
    }
    await tx
      .update(designs)
      .set({
        currentVersionId: version.id,
        draftJson: doc,
        colourId: doc.colourId,
        name: input.name?.trim().slice(0, 80) || existing.name,
        draftRevision: sql`${designs.draftRevision} + 1`,
      })
      .where(eq(designs.id, id));
    return { versionId: version.id, version: version.version };
  });
}

export async function getVersion(db: DbOrTx, versionId: string) {
  const [v] = await db.select().from(designVersions).where(eq(designVersions.id, versionId)).limit(1);
  return v ? { ...v, doc: parseDoc(v.designJson) } : null;
}

export async function listVersions(db: DbOrTx, owner: DesignOwner, id: string) {
  await loadOwned(db, owner, id);
  return db
    .select({ id: designVersions.id, version: designVersions.version, createdAt: designVersions.createdAt, elementCount: designVersions.elementCount })
    .from(designVersions)
    .where(eq(designVersions.designId, id))
    .orderBy(desc(designVersions.version));
}
