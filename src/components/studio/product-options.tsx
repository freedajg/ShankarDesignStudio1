"use client";

import Link from "next/link";
import { Swatch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useStudio } from "./context";

export function ColourPicker() {
  const colours = useStudio((s) => s.product.colours);
  const colourId = useStudio((s) => s.doc.colourId);
  const setColour = useStudio((s) => s.setColour);
  const current = colours.find((c) => c.id === colourId);
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-medium">
        Shirt colour: <span className="font-normal text-ink-muted" data-testid="colour-name">{current?.name}</span>
      </legend>
      <div role="radiogroup" aria-label="Shirt colour" className="flex flex-wrap gap-x-1 gap-y-3">
        {colours.map((c) => (
          <Swatch key={c.id} hex={c.hex} name={c.name} selected={c.id === colourId} onSelect={() => setColour(c.id)} showLabel />
        ))}
      </div>
    </fieldset>
  );
}

export function PrintMethodPicker() {
  const allMethods = useStudio((s) => s.product.printMethods);
  const methods = allMethods.filter((m) => m.customerSelectable);
  const code = useStudio((s) => s.printMethodCode);
  const setMethod = useStudio((s) => s.setPrintMethod);
  if (methods.length < 2) {
    return methods[0] ? (
      <div className="text-sm">
        <p className="font-medium">Print method</p>
        <p className="text-ink-muted">{methods[0].name} — {methods[0].description}</p>
      </div>
    ) : null;
  }
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Print method</legend>
      <div role="radiogroup" aria-label="Print method" className="flex flex-col gap-2">
        {methods.map((m) => (
          <button
            key={m.code}
            type="button"
            role="radio"
            aria-checked={m.code === code}
            onClick={() => setMethod(m.code)}
            className={cn(
              "rounded-[var(--radius-sm)] border p-3 text-left text-sm transition-colors",
              m.code === code ? "border-ink bg-surface-muted shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line-strong hover:border-ink",
            )}
          >
            <span className="font-medium">{m.name}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{m.description}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PrintAreaPicker() {
  const side = useStudio((s) => s.side);
  const allAreas = useStudio((s) => s.product.printAreas);
  const areas = allAreas.filter((a) => a.side === side && a.isActive);
  const current = useStudio((s) => s.doc.surfaces[s.side].printAreaCode);
  const setArea = useStudio((s) => s.setPrintArea);
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Print area — {side}</legend>
      <div role="radiogroup" aria-label={`Print area on the ${side}`} className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <button
            key={a.code}
            type="button"
            role="radio"
            aria-checked={a.code === current}
            onClick={() => setArea(side, a.code)}
            className={cn(
              "rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors",
              a.code === current ? "border-ink bg-surface-muted shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line-strong hover:border-ink",
            )}
          >
            <span className="block font-medium">{a.name}</span>
            <span className="block text-xs tabular-nums text-ink-muted">
              {a.widthMm / 10} × {a.heightMm / 10} cm
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ProductOptions() {
  const product = useStudio((s) => s.product);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{product.categoryName}</p>
        <h2 className="mt-0.5 font-semibold">{product.name}</h2>
        <p className="text-sm text-ink-muted">
          {[product.fabric, product.gsm && `${product.gsm} GSM`].filter(Boolean).join(" · ")}
        </p>
        <Link href="/#products" className="mt-1 inline-block text-sm font-medium text-accent-ink hover:underline">
          Change product
        </Link>
      </div>
      <ColourPicker />
      <PrintAreaPicker />
      <PrintMethodPicker />
    </div>
  );
}
