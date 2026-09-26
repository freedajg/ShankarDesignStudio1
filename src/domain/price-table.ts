import { defaultArea, defaultMethod, type Channel, type ProductConfig } from "./catalogue";
import { priceLine } from "./pricing";
import type { Settings } from "./settings";

/**
 * "Price per piece at quantity N" rows for catalogue pages, computed by the real
 * pricing engine for a reference configuration (default colour, a base size,
 * one print in the default front area with the default method).
 */
export function referencePriceTable(config: ProductConfig, channel: Channel, settings: Pick<Settings, "pricing">) {
  const method = defaultMethod(config);
  const area = defaultArea(config, "front");
  const colour = config.colours[0];
  const variant = config.variants.find((v) => v.colourId === colour?.id && v.priceAdjustmentPaise === 0 && v.isActive);
  if (!method || !area || !colour || !variant) return { rows: [], method, area };

  const tiers = config.tiers.filter((t) => t.channel === channel).sort((a, b) => a.minQty - b.minQty);
  const start = channel === "B2B" ? config.minQtyB2b : 1;
  const quantities = [start, ...tiers.map((t) => t.minQty).filter((q) => q > start)];
  const rows = quantities.flatMap((qty, i) => {
    const r = priceLine(
      config,
      {
        channel,
        colourId: colour.id,
        printMethodCode: method.code,
        placements: [{ side: "front", printAreaCode: area.code }],
        sizes: [{ variantId: variant.id, quantity: qty }],
      },
      settings,
    );
    if (!r.ok) return [];
    const next = quantities[i + 1];
    return [
      {
        label: next ? `${qty}–${next - 1}` : `${qty}+`,
        minQty: qty,
        unitPaise: r.price.sizes[0].unitPaise,
        discountBps: r.price.tier?.discountBps ?? 0,
      },
    ];
  });
  return { rows, method, area };
}
