import { isInsideArea } from "./geometry";
import { SIDES, type DesignDoc, type Side } from "./schema";
import { elementBox } from "../render/surface";
import type { Measure } from "../render/text";

export type PrintAreaRef = { code: string; side: Side; widthMm: number; heightMm: number; isActive: boolean };

export type DesignIssue = { side: Side | null; elementId: string | null; code: string; message: string };

/**
 * Business validation of a structured design against its product. Run on the
 * server (authoritative) and in the editor (for immediate feedback).
 */
export function validateDesign(
  doc: DesignDoc,
  ctx: { productId: string; colourIds: string[]; printAreas: PrintAreaRef[]; measure: Measure; knownAssetIds?: Set<string> },
): DesignIssue[] {
  const issues: DesignIssue[] = [];
  if (doc.productId !== ctx.productId) {
    issues.push({ side: null, elementId: null, code: "PRODUCT_MISMATCH", message: "Design belongs to a different product." });
  }
  if (!ctx.colourIds.includes(doc.colourId)) {
    issues.push({ side: null, elementId: null, code: "COLOUR_UNAVAILABLE", message: "This colour is not available for this product." });
  }
  for (const side of SIDES) {
    const surface = doc.surfaces[side];
    const area = ctx.printAreas.find((a) => a.code === surface.printAreaCode && a.side === side && a.isActive);
    if (!area) {
      issues.push({ side, elementId: null, code: "PRINT_AREA_INVALID", message: `The ${side} print area is not available for this product.` });
      continue;
    }
    for (const el of surface.elements) {
      if (el.type === "image" && ctx.knownAssetIds && !ctx.knownAssetIds.has(el.assetId)) {
        issues.push({ side, elementId: el.id, code: "ASSET_MISSING", message: "An uploaded image in this design is missing. Please upload it again." });
      }
      if (!isInsideArea(elementBox(el, ctx.measure), { width: area.widthMm, height: area.heightMm })) {
        issues.push({
          side,
          elementId: el.id,
          code: "OUTSIDE_PRINT_AREA",
          message: `${el.type === "text" ? "Text" : "An image"} on the ${side} goes outside the print area.`,
        });
      }
    }
  }
  return issues;
}
