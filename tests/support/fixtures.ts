import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalDiskStorage, setStorageForTests } from "@/server/storage";
import { loadProductConfig, loadSettings } from "@/server/services/catalogue";
import { processUpload } from "@/server/services/artwork";
import { createDesign, createVersion } from "@/server/services/designs";
import type { Db } from "@/server/db/client";
import type { ProductConfig } from "@/domain/catalogue";
import { emptyDesign, type DesignDoc, type DesignElement, type TextElement } from "@/domain/design/schema";

export const FIXTURES = path.resolve(__dirname, "../../e2e/fixtures");
export const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name));

export function useTempStorage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sg-storage-"));
  setStorageForTests(new LocalDiskStorage(dir));
  return dir;
}

export async function product(db: Db, slug = "classic-crew-tshirt"): Promise<ProductConfig> {
  return (await loadProductConfig(db, { slug }))!;
}

export const textEl = (over: Partial<TextElement> = {}): TextElement => ({
  id: `t${Math.random().toString(36).slice(2, 10)}`,
  type: "text",
  text: "HELLO",
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

export function doc(p: ProductConfig, opts: { colour?: string; front?: DesignElement[]; back?: DesignElement[] } = {}): DesignDoc {
  const colour = p.colours.find((c) => c.name === (opts.colour ?? "Black")) ?? p.colours[0];
  const d = emptyDesign({
    productId: p.id,
    colourId: colour.id,
    frontArea: p.printAreas.find((a) => a.side === "front" && a.isDefault)!.code,
    backArea: p.printAreas.find((a) => a.side === "back" && a.isDefault)!.code,
  });
  d.surfaces.front.elements = opts.front ?? [];
  d.surfaces.back.elements = opts.back ?? [];
  return d;
}

export async function uploadLogo(db: Db, ownerTokenHash: string, name = "logo.png") {
  const settings = await loadSettings(db);
  return processUpload(db, { data: fixture(name), filename: name, ownerTokenHash, rules: settings.artwork });
}

/** A saved, versioned design ready for the cart. */
export async function versionedDesign(db: Db, ownerTokenHash: string, d: DesignDoc) {
  const { id } = await createDesign(db, { tokenHash: ownerTokenHash }, { doc: d });
  const v = await createVersion(db, { tokenHash: ownerTokenHash }, id, { doc: d });
  return { designId: id, versionId: v.versionId };
}

export const sizeId = (p: ProductConfig, code: string) => p.sizes.find((s) => s.code === code)!.id;
