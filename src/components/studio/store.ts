"use client";

import { create } from "zustand";
import { defaultArea, defaultMethod, type Channel, type ProductConfig } from "@/domain/catalogue";
import { isLightColour } from "@/domain/colour";
import { constrainToArea, round2 } from "@/domain/design/geometry";
import {
  emptyDesign,
  MAX_ELEMENTS_PER_SURFACE,
  type DesignDoc,
  type DesignElement,
  type ImageElement,
  type Side,
  type TextElement,
} from "@/domain/design/schema";
import { DEFAULT_FONT_ID } from "@/domain/fonts";
import type { Settings } from "@/domain/settings";

/**
 * Studio state. The design document is the single source of truth; the Fabric
 * canvas is a view of it. Garment colour, size and quantity live beside the
 * design's elements, so changing them can never touch the artwork.
 */

export type AssetInfo = {
  id: string;
  previewUrl: string;
  widthPx: number;
  heightPx: number;
  hasAlpha: boolean;
  mime: string;
  originalFilename: string | null;
};

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
type Surfaces = DesignDoc["surfaces"];

type State = {
  product: ProductConfig;
  /** business configuration (no secrets) for live pricing and artwork checks */
  settings: Settings;
  doc: DesignDoc;
  side: Side;
  selectedId: string | null;
  channel: Channel;
  printMethodCode: string;
  /** quantity per product size id — survives colour changes */
  quantities: Record<string, number>;
  assets: Record<string, AssetInfo>;
  past: Surfaces[];
  future: Surfaces[];
  lastCoalesce: { key: string; at: number } | null;
  designId: string | null;
  name: string;
  /** increases on every change to doc/name — autosave compares against the last saved value */
  revision: number;
  savedRevision: number;
  saveState: SaveState;
  zoom: "garment" | "area";
};

type Actions = {
  setSide(side: Side): void;
  select(id: string | null): void;
  setColour(colourId: string): void;
  setChannel(channel: Channel): void;
  setPrintMethod(code: string): void;
  setPrintArea(side: Side, code: string): void;
  setQuantity(sizeId: string, qty: number): void;
  setQuantities(q: Record<string, number>): void;
  addText(text?: string): string | null;
  addImage(asset: AssetInfo): string | null;
  updateElement(id: string, patch: Partial<DesignElement>, opts?: { coalesce?: string; history?: boolean }): void;
  removeElement(id: string): void;
  duplicateElement(id: string): void;
  moveLayer(id: string, dir: "up" | "down" | "top" | "bottom"): void;
  undo(): void;
  redo(): void;
  registerAsset(asset: AssetInfo): void;
  setDesignId(id: string): void;
  setName(name: string): void;
  markSaving(): void;
  markSaved(revision: number): void;
  markSaveError(): void;
  setZoom(z: State["zoom"]): void;
};

export type StudioStore = State & Actions;

const HISTORY_LIMIT = 60;
const newId = () => `el_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;

export function areaFor(product: ProductConfig, side: Side, code: string) {
  return product.printAreas.find((a) => a.side === side && a.code === code && a.isActive) ?? defaultArea(product, side)!;
}

export type StudioInit = {
  product: ProductConfig;
  settings: Settings;
  doc?: DesignDoc;
  colourId?: string;
  channel: Channel;
  designId?: string | null;
  name?: string;
  assets?: Record<string, AssetInfo>;
  quantities?: Record<string, number>;
  printMethodCode?: string;
};

export function initialState(init: StudioInit): State {
  const { product } = init;
  const colourId = init.doc?.colourId ?? (product.colours.some((c) => c.id === init.colourId) ? init.colourId! : product.colours[0].id);
  const doc =
    init.doc ??
    emptyDesign({
      productId: product.id,
      colourId,
      frontArea: defaultArea(product, "front")!.code,
      backArea: defaultArea(product, "back")!.code,
    });
  const methods = product.printMethods.filter((m) => m.customerSelectable);
  const method = methods.find((m) => m.code === init.printMethodCode) ?? defaultMethod(product);
  const defaultSize = product.sizes.find((s) => s.code === "M") ?? product.sizes[0];
  return {
    product,
    settings: init.settings,
    doc,
    side: "front",
    selectedId: null,
    channel: init.channel,
    printMethodCode: method.code,
    quantities: init.quantities ?? (init.channel === "B2B" ? {} : { [defaultSize.id]: 1 }),
    assets: init.assets ?? {},
    past: [],
    future: [],
    lastCoalesce: null,
    designId: init.designId ?? null,
    name: init.name ?? "Untitled design",
    revision: 0,
    savedRevision: 0,
    saveState: init.designId ? "saved" : "idle",
    zoom: "garment",
  };
}

export const createStudioStore = (init: StudioInit) =>
  create<StudioStore>()((set, get) => {
    /** Apply a change to the surfaces, recording undo history. */
    const commitSurfaces = (next: Surfaces, opts: { coalesce?: string; history?: boolean; selectedId?: string | null } = {}) => {
      const s = get();
      const now = Date.now();
      const coalesce = opts.coalesce && s.lastCoalesce?.key === opts.coalesce && now - s.lastCoalesce.at < 1000;
      const record = opts.history !== false && !coalesce;
      set({
        doc: { ...s.doc, surfaces: next },
        past: record ? [...s.past, s.doc.surfaces].slice(-HISTORY_LIMIT) : s.past,
        future: opts.history === false ? s.future : [],
        lastCoalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null,
        revision: s.revision + 1,
        saveState: "pending",
        ...(opts.selectedId !== undefined ? { selectedId: opts.selectedId } : {}),
      });
    };

    const withSurface = (side: Side, fn: (els: DesignElement[]) => DesignElement[]): Surfaces => {
      const s = get().doc.surfaces;
      return { ...s, [side]: { ...s[side], elements: fn(s[side].elements) } };
    };

    const findSide = (id: string): Side | null => {
      const { surfaces } = get().doc;
      return surfaces.front.elements.some((e) => e.id === id) ? "front" : surfaces.back.elements.some((e) => e.id === id) ? "back" : null;
    };

    return {
      ...initialState(init),

      setSide: (side) => set({ side, selectedId: null }),
      select: (id) => set({ selectedId: id }),
      setZoom: (zoom) => set({ zoom }),

      setColour: (colourId) => {
        const s = get();
        if (!s.product.colours.some((c) => c.id === colourId) || s.doc.colourId === colourId) return;
        // Only the garment colour changes — elements are untouched by construction.
        set({ doc: { ...s.doc, colourId }, revision: s.revision + 1, saveState: "pending" });
      },

      setChannel: (channel) => {
        const s = get();
        if (channel === s.channel) return;
        set({ channel });
      },

      setPrintMethod: (code) => {
        if (get().product.printMethods.some((m) => m.code === code)) set({ printMethodCode: code });
      },

      setPrintArea: (side, code) => {
        const s = get();
        const from = areaFor(s.product, side, s.doc.surfaces[side].printAreaCode);
        const to = s.product.printAreas.find((a) => a.side === side && a.code === code && a.isActive);
        if (!to || to.code === from.code) return;
        // Re-fit the existing artwork into the new area, preserving its layout.
        const k = Math.min(to.widthMm / from.widthMm, to.heightMm / from.heightMm);
        const offX = (to.widthMm - from.widthMm * k) / 2;
        const offY = (to.heightMm - from.heightMm * k) / 2;
        const elements = s.doc.surfaces[side].elements.map((el) => {
          const moved = { ...el, x: round2(el.x * k + offX), y: round2(el.y * k + offY) };
          return el.type === "text"
            ? { ...moved, fontSize: round2(Math.max(2, el.fontSize * k)) }
            : { ...moved, width: round2(el.width * k), height: round2(el.height * k) };
        });
        commitSurfaces({ ...s.doc.surfaces, [side]: { printAreaCode: to.code, elements } });
      },

      setQuantity: (sizeId, qty) => {
        const q = { ...get().quantities };
        const n = Math.max(0, Math.min(20000, Math.floor(Number.isFinite(qty) ? qty : 0)));
        if (n === 0) delete q[sizeId];
        else q[sizeId] = n;
        set({ quantities: q });
      },
      setQuantities: (quantities) => set({ quantities }),

      addText: (text = "Your text") => {
        const s = get();
        const surface = s.doc.surfaces[s.side];
        if (surface.elements.length >= MAX_ELEMENTS_PER_SURFACE) return null;
        const area = areaFor(s.product, s.side, surface.printAreaCode);
        const hex = s.product.colours.find((c) => c.id === s.doc.colourId)?.hex ?? "#FFFFFF";
        const el: TextElement = {
          id: newId(),
          type: "text",
          text,
          fontId: DEFAULT_FONT_ID,
          fontSize: round2(Math.min(40, area.widthMm * 0.13)),
          fill: isLightColour(hex) ? "#1C1A17" : "#FFFFFF",
          bold: true,
          italic: false,
          align: "center",
          lineHeight: 1.15,
          x: round2(area.widthMm / 2),
          y: round2(area.heightMm * (area.heightMm > 150 ? 0.3 : 0.5)),
          rotation: 0,
        };
        commitSurfaces(withSurface(s.side, (els) => [...els, el]), { selectedId: el.id });
        return el.id;
      },

      addImage: (asset) => {
        const s = get();
        const surface = s.doc.surfaces[s.side];
        if (surface.elements.length >= MAX_ELEMENTS_PER_SURFACE) return null;
        const area = areaFor(s.product, s.side, surface.printAreaCode);
        const aspect = asset.heightPx / asset.widthPx;
        let width = area.widthMm * 0.7;
        let height = width * aspect;
        if (height > area.heightMm * 0.7) {
          height = area.heightMm * 0.7;
          width = height / aspect;
        }
        const el: ImageElement = {
          id: newId(),
          type: "image",
          assetId: asset.id,
          width: round2(width),
          height: round2(height),
          x: round2(area.widthMm / 2),
          y: round2(area.heightMm / 2),
          rotation: 0,
        };
        set({ assets: { ...s.assets, [asset.id]: asset } });
        commitSurfaces(withSurface(s.side, (els) => [...els, el]), { selectedId: el.id });
        return el.id;
      },

      updateElement: (id, patch, opts = {}) => {
        const side = findSide(id);
        if (!side) return;
        commitSurfaces(
          withSurface(side, (els) => els.map((e) => (e.id === id ? ({ ...e, ...patch, id, type: e.type } as DesignElement) : e))),
          opts,
        );
      },

      removeElement: (id) => {
        const side = findSide(id);
        if (!side) return;
        commitSurfaces(withSurface(side, (els) => els.filter((e) => e.id !== id)), { selectedId: null });
      },

      duplicateElement: (id) => {
        const side = findSide(id);
        const s = get();
        if (!side || s.doc.surfaces[side].elements.length >= MAX_ELEMENTS_PER_SURFACE) return;
        const src = s.doc.surfaces[side].elements.find((e) => e.id === id)!;
        const area = areaFor(s.product, side, s.doc.surfaces[side].printAreaCode);
        const copy = { ...src, id: newId(), x: src.x + 6, y: src.y + 6 };
        // keep the copy inside the print area
        const hw = copy.type === "image" ? copy.width / 2 : 0;
        const hh = copy.type === "image" ? copy.height / 2 : 0;
        const c = constrainToArea({ x: copy.x, y: copy.y, hw, hh, rotation: copy.rotation }, { width: area.widthMm, height: area.heightMm });
        commitSurfaces(withSurface(side, (els) => [...els, { ...copy, x: round2(c.x), y: round2(c.y) }]), { selectedId: copy.id });
      },

      moveLayer: (id, dir) => {
        const side = findSide(id);
        if (!side) return;
        commitSurfaces(
          withSurface(side, (els) => {
            const i = els.findIndex((e) => e.id === id);
            const next = [...els];
            const [el] = next.splice(i, 1);
            const to = dir === "top" ? next.length : dir === "bottom" ? 0 : dir === "up" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
            next.splice(to, 0, el);
            return next;
          }),
        );
      },

      undo: () => {
        const s = get();
        const prev = s.past.at(-1);
        if (!prev) return;
        set({
          doc: { ...s.doc, surfaces: prev },
          past: s.past.slice(0, -1),
          future: [s.doc.surfaces, ...s.future].slice(0, HISTORY_LIMIT),
          selectedId: null,
          revision: s.revision + 1,
          saveState: "pending",
          lastCoalesce: null,
        });
      },

      redo: () => {
        const s = get();
        const next = s.future[0];
        if (!next) return;
        set({
          doc: { ...s.doc, surfaces: next },
          past: [...s.past, s.doc.surfaces],
          future: s.future.slice(1),
          selectedId: null,
          revision: s.revision + 1,
          saveState: "pending",
          lastCoalesce: null,
        });
      },

      registerAsset: (asset) => set({ assets: { ...get().assets, [asset.id]: asset } }),
      setDesignId: (designId) => set({ designId }),
      setName: (name) => set({ name: name.slice(0, 80), revision: get().revision + 1, saveState: "pending" }),
      markSaving: () => set({ saveState: "saving" }),
      markSaved: (revision) => set({ savedRevision: revision, saveState: get().revision === revision ? "saved" : "pending" }),
      markSaveError: () => set({ saveState: "error" }),
    };
  });

export type StudioStoreApi = ReturnType<typeof createStudioStore>;

export function selectedElement(s: State): DesignElement | null {
  if (!s.selectedId) return null;
  return (
    s.doc.surfaces.front.elements.find((e) => e.id === s.selectedId) ??
    s.doc.surfaces.back.elements.find((e) => e.id === s.selectedId) ??
    null
  );
}
