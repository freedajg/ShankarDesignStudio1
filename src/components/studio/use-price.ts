"use client";

import { useMemo } from "react";
import { variantFor } from "@/domain/catalogue";
import { decoratedSides, type Side } from "@/domain/design/schema";
import { priceLine, priceOrder } from "@/domain/pricing";
import { useStudio } from "./context";

/**
 * Live price for the current studio state, from the same pricing engine the
 * server uses. Before anything is designed, it estimates with one front print.
 */
export function useLinePrice() {
  const product = useStudio((s) => s.product);
  const settings = useStudio((s) => s.settings);
  const doc = useStudio((s) => s.doc);
  const channel = useStudio((s) => s.channel);
  const method = useStudio((s) => s.printMethodCode);
  const quantities = useStudio((s) => s.quantities);

  return useMemo(() => {
    const decorated = decoratedSides(doc);
    const estimate = decorated.length === 0;
    const placements = (estimate ? (["front"] as Side[]) : decorated).map((side) => ({ side, printAreaCode: doc.surfaces[side].printAreaCode }));
    const sizes = Object.entries(quantities).map(([sizeId, quantity]) => ({
      variantId: variantFor(product, doc.colourId, sizeId)?.id ?? `unavailable:${sizeId}`,
      quantity,
    }));
    const result = priceLine(product, { channel, colourId: doc.colourId, printMethodCode: method, placements, sizes }, settings);
    const line = result.ok ? result.price : result.partial;
    const totals = line ? priceOrder([line], settings) : null;
    return { result, line, totals, estimate, placements };
  }, [product, settings, doc, channel, method, quantities]);
}
