import { z } from "zod";

/**
 * Business configuration stored in the `settings` table (one row per key, JSON value).
 * Every key has a schema so a malformed admin edit can never reach the pricing engine.
 * Values Shankar has not confirmed are seeded with is_demo = true.
 */

const paise = z.number().int().min(0);
const bps = z.number().int().min(0).max(10000);

export const settingsSchemas = {
  pricing: z.object({
    /** charged per piece for every decorated side beyond the first */
    additionalPlacementPaise: paise,
  }),
  tax: z.object({
    label: z.string().min(1),
    rateBps: bps,
    pricesIncludeTax: z.boolean(),
  }),
  shipping: z.object({
    flatPaise: paise,
    /** null = never free */
    freeAbovePaise: paise.nullable(),
  }),
  artwork: z.object({
    maxUploadBytes: z.number().int().positive(),
    maxPixels: z.number().int().positive(),
    warnDpi: z.number().int().positive(),
    poorDpi: z.number().int().positive(),
    minLongEdgePx: z.number().int().positive(),
  }),
  workflow: z.object({
    /** paid orders go to DESIGN_REVIEW (true) or straight to APPROVED (false) */
    requireDesignReview: z.boolean(),
  }),
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };

/** Development defaults. NOT Shankar's confirmed values — see docs/OPEN_QUESTIONS.md. */
export const demoSettings: Settings = {
  pricing: { additionalPlacementPaise: 0 },
  tax: { label: "GST", rateBps: 500, pricesIncludeTax: false },
  shipping: { flatPaise: 7900, freeAbovePaise: 199900 },
  artwork: {
    maxUploadBytes: 25 * 1024 * 1024,
    maxPixels: 60_000_000,
    warnDpi: 150,
    poorDpi: 100,
    minLongEdgePx: 500,
  },
  workflow: { requireDesignReview: true },
};

export function parseSettings(rows: { key: string; value: unknown }[]): Settings {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchemas) as SettingsKey[]) {
    const row = rows.find((r) => r.key === key);
    if (!row) throw new Error(`Missing required setting "${key}". Run the seed or add it in admin.`);
    const parsed = settingsSchemas[key].safeParse(row.value);
    if (!parsed.success) throw new Error(`Setting "${key}" is invalid: ${parsed.error.issues[0]?.message}`);
    out[key] = parsed.data;
  }
  return out as Settings;
}
