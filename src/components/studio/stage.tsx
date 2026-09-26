"use client";

import { Canvas, FabricImage, FabricObject, type TPointerEventInfo } from "fabric";
import { useEffect, useRef, useState } from "react";
import { isLightColour } from "@/domain/colour";
import { constrainToArea, round2 } from "@/domain/design/geometry";
import type { DesignElement, ImageElement, Side, TextElement } from "@/domain/design/schema";
import { printAreaOnMockup, type MockupLayers } from "@/domain/render/surface";
import { drawText, layoutText, type TextLayout } from "@/domain/render/text";
import { useStudioApi } from "./context";
import { browserMeasure, isFontLoaded, loadDesignFont } from "./fonts";
import { areaFor, type StudioStore } from "./store";

// ------------------------------------------------------------------ fabric objects

/** A non-interactive layer drawn by a callback in mockup coordinates. */
class LayerObject extends FabricObject {
  static type = "SGLayer";
  constructor(
    width: number,
    height: number,
    public paint: (ctx: CanvasRenderingContext2D) => void,
  ) {
    super({ width, height, left: width / 2, top: height / 2, selectable: false, evented: false, objectCaching: false });
  }
  _render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(-this.width / 2, -this.height / 2);
    this.paint(ctx);
    ctx.restore();
  }
}

/** Text drawn by the shared layout/draw code — identical to the print renderer. */
class StudioText extends FabricObject {
  static type = "SGText";
  el!: TextElement;
  layout!: TextLayout;
  pxPerMm = 1;
  apply(el: TextElement, pxPerMm: number) {
    this.el = el;
    this.pxPerMm = pxPerMm;
    this.layout = layoutText(el, browserMeasure());
    this.set({ width: this.layout.hw * 2 * pxPerMm, height: this.layout.hh * 2 * pxPerMm, scaleX: 1, scaleY: 1 });
    this.dirty = true;
  }
  _render(ctx: CanvasRenderingContext2D) {
    drawText(ctx as never, this.el, this.layout, this.pxPerMm);
  }
}

type Entry = { obj: FabricObject; sig: string; el: DesignElement };
type ElementObject = FabricObject & { sgId?: string };

const CONTROL_STYLE = {
  borderColor: "#F97360",
  cornerColor: "#FFFFFF",
  cornerStrokeColor: "#F97360",
  cornerStyle: "circle" as const,
  transparentCorners: false,
  cornerSize: 12,
  touchCornerSize: 36,
  borderScaleFactor: 1.5,
  padding: 4,
  lockScalingFlip: true,
  lockSkewingX: true,
  lockSkewingY: true,
};

export const STAGE_BG = "#F3F4F0"; // --color-surface-muted
const MIN_FONT_MM = 3;
const MIN_IMAGE_MM = 5;

async function loadImg(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

// ------------------------------------------------------------------ component

export function Stage({ onEditText, className }: { onEditText?: () => void; className?: string }) {
  const api = useStudioApi();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const onEditTextRef = useRef(onEditText);
  useEffect(() => {
    onEditTextRef.current = onEditText;
  }, [onEditText]);

  useEffect(() => {
    const host = hostRef.current!;
    const canvas = new Canvas(canvasElRef.current!, {
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      uniformScaling: true,
      selectionColor: "rgba(184,82,26,0.08)",
      selectionBorderColor: "#F97360",
      selection: false, // one element at a time keeps the inspector and layers unambiguous
      enableRetinaScaling: true,
      allowTouchScrolling: false,
      backgroundVpt: true,
      overlayVpt: true,
      // the stage colour must be painted into the canvas: multiply/screen shading
      // blends against it (over transparent pixels it would paint white boxes)
      backgroundColor: STAGE_BG,
    });
    const entries = new Map<string, Entry>();
    let disposed = false;
    let layers: Record<Side, MockupLayers> | null = null;
    const garmentCanvas = document.createElement("canvas");
    let garmentKey = "";
    let syncing = false;
    let pending = false;

    const state = () => api.getState();
    const mockupSize = (side: Side) => state().product.mockups[side];
    const placementFor = (s: StudioStore, side: Side) => {
      const area = areaFor(s.product, side, s.doc.surfaces[side].printAreaCode);
      const m = mockupSize(side);
      return { area, p: printAreaOnMockup(area, { width: m.widthPx, height: m.heightPx }) };
    };

    // ---- background: garment in the chosen colour
    const paintGarment = () => {
      const s = state();
      const hex = s.product.colours.find((c) => c.id === s.doc.colourId)?.hex ?? "#FFFFFF";
      const key = `${s.side}:${hex}`;
      if (!layers || key === garmentKey) return;
      const m = mockupSize(s.side);
      garmentCanvas.width = m.widthPx;
      garmentCanvas.height = m.heightPx;
      const g = garmentCanvas.getContext("2d")!;
      g.clearRect(0, 0, m.widthPx, m.heightPx);
      g.globalCompositeOperation = "source-over";
      g.drawImage(layers[s.side].mask as HTMLImageElement, 0, 0, m.widthPx, m.heightPx);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = hex;
      g.fillRect(0, 0, m.widthPx, m.heightPx);
      garmentKey = key;
    };

    // ---- overlay: fabric shading over garment + design, then the print-area guide
    const paintOverlay = (ctx: CanvasRenderingContext2D) => {
      if (!layers) return;
      const s = state();
      const m = mockupSize(s.side);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(layers[s.side].shade as HTMLImageElement, 0, 0, m.widthPx, m.heightPx);
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(layers[s.side].highlight as HTMLImageElement, 0, 0, m.widthPx, m.heightPx);
      ctx.restore();

      const { area, p } = placementFor(s, s.side);
      const zoom = canvas.viewportTransform[0] || 1;
      const hex = s.product.colours.find((c) => c.id === s.doc.colourId)?.hex ?? "#FFFFFF";
      const light = isLightColour(hex);
      ctx.save();
      ctx.lineWidth = 1.25 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.strokeStyle = light ? "rgba(28,26,23,0.45)" : "rgba(255,255,255,0.6)";
      ctx.strokeRect(p.left, p.top, p.width, p.height);
      ctx.setLineDash([]);
      ctx.font = `500 ${11 / zoom}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = light ? "rgba(28,26,23,0.6)" : "rgba(255,255,255,0.75)";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${area.name} · ${area.widthMm / 10} × ${area.heightMm / 10} cm`, p.left, p.top - 4 / zoom);
      ctx.restore();
    };

    const size = mockupSize("front");
    canvas.backgroundImage = new LayerObject(size.widthPx, size.heightPx, (ctx) => {
      if (!layers) return;
      paintGarment();
      ctx.drawImage(garmentCanvas, 0, 0);
    });
    canvas.overlayImage = new LayerObject(size.widthPx, size.heightPx, paintOverlay);

    // ---- viewport: fit the garment, or zoom into the print area
    const fit = () => {
      const s = state();
      const W = host.clientWidth;
      const H = host.clientHeight;
      if (!W || !H) return;
      canvas.setDimensions({ width: W, height: H });
      const m = mockupSize(s.side);
      const { p } = placementFor(s, s.side);
      const rect =
        s.zoom === "area"
          ? { x: p.left - p.width * 0.18, y: p.top - p.height * 0.14, w: p.width * 1.36, h: p.height * 1.28 }
          : { x: 0, y: 0, w: m.widthPx, h: m.heightPx };
      const pad = W < 640 ? 12 : 28;
      const k = Math.min((W - pad * 2) / rect.w, (H - pad * 2) / rect.h);
      canvas.setViewportTransform([k, 0, 0, k, (W - rect.w * k) / 2 - rect.x * k, (H - rect.h * k) / 2 - rect.y * k]);
      canvas.getObjects().forEach((o) => o.setCoords());
      canvas.requestRenderAll();
    };

    // ---- element <-> object conversion
    const halfExtentsMm = (obj: FabricObject, k: number) => {
      if (obj instanceof StudioText) return { hw: obj.layout.hw * obj.scaleX, hh: obj.layout.hh * obj.scaleY };
      return { hw: (obj.width * obj.scaleX) / 2 / k, hh: (obj.height * obj.scaleY) / 2 / k };
    };

    const constrain = (obj: FabricObject) => {
      const s = state();
      const { area, p } = placementFor(s, s.side);
      const k = p.pxPerMm;
      // minimum printable size
      if (obj instanceof StudioText) {
        const min = MIN_FONT_MM / obj.el.fontSize;
        if (obj.scaleX < min) obj.set({ scaleX: min, scaleY: min });
      } else {
        const minScale = (MIN_IMAGE_MM * k) / Math.min(obj.width, obj.height);
        if (obj.scaleX < minScale) obj.set({ scaleX: minScale, scaleY: minScale });
      }
      const { hw, hh } = halfExtentsMm(obj, k);
      const c = constrainToArea(
        { x: (obj.left - p.left) / k, y: (obj.top - p.top) / k, hw, hh, rotation: obj.angle },
        { width: area.widthMm, height: area.heightMm },
      );
      if (c.scale < 1) obj.set({ scaleX: obj.scaleX * c.scale, scaleY: obj.scaleY * c.scale });
      obj.set({ left: p.left + c.x * k, top: p.top + c.y * k });
      obj.setCoords();
    };

    const commit = (obj: ElementObject, opts: { history?: boolean } = {}) => {
      const s = state();
      const id = obj.sgId;
      const entry = id && entries.get(id);
      if (!entry) return;
      const { p } = placementFor(s, s.side);
      const k = p.pxPerMm;
      const rotation = round2(((((obj.angle + 180) % 360) + 360) % 360) - 180);
      const base = { x: round2((obj.left - p.left) / k), y: round2((obj.top - p.top) / k), rotation };
      if (entry.el.type === "text") {
        s.updateElement(id, { ...base, fontSize: round2(entry.el.fontSize * obj.scaleX) }, opts);
      } else {
        s.updateElement(id, { ...base, width: round2((obj.width * obj.scaleX) / k), height: round2((obj.height * obj.scaleY) / k) }, opts);
      }
    };

    const placeImage = (obj: FabricObject, el: ImageElement, p: { left: number; top: number; pxPerMm: number }) => {
      obj.set({
        left: p.left + el.x * p.pxPerMm,
        top: p.top + el.y * p.pxPerMm,
        angle: el.rotation,
        scaleX: (el.width * p.pxPerMm) / obj.width,
        scaleY: (el.height * p.pxPerMm) / obj.height,
      });
    };

    // ---- reconcile Fabric objects with the design document
    const sync = async () => {
      if (!layers || disposed) return;
      if (syncing) return void (pending = true);
      syncing = true;
      try {
        const s = state();
        const { p } = placementFor(s, s.side);
        const surface = s.doc.surfaces[s.side];
        const wanted = new Set(surface.elements.map((e) => e.id));

        for (const [id, entry] of entries) {
          if (!wanted.has(id)) {
            canvas.remove(entry.obj);
            entries.delete(id);
          }
        }

        for (const el of surface.elements) {
          const sig = `${s.side}|${surface.printAreaCode}|${JSON.stringify(el)}`;
          const entry = entries.get(el.id);
          if (entry && entry.sig === sig) continue;

          if (el.type === "text") {
            if (!isFontLoaded(el.fontId)) {
              loadDesignFont(el.fontId).then(() => sync(), () => undefined);
            }
            const obj = entry?.obj instanceof StudioText ? entry.obj : new StudioText({ ...CONTROL_STYLE });
            obj.apply(el, p.pxPerMm);
            obj.set({ left: p.left + el.x * p.pxPerMm, top: p.top + el.y * p.pxPerMm, angle: el.rotation });
            (obj as ElementObject).sgId = el.id;
            if (!entry) {
              obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
              canvas.add(obj);
            }
            entries.set(el.id, { obj, sig, el });
          } else {
            const asset = s.assets[el.assetId];
            if (!asset) continue;
            let obj = entry?.obj;
            if (!obj || (entry!.el.type === "image" && entry!.el.assetId !== el.assetId)) {
              if (obj) canvas.remove(obj);
              const img = await loadImg(asset.previewUrl);
              if (disposed) return;
              obj = new FabricImage(img, { ...CONTROL_STYLE });
              obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
              (obj as ElementObject).sgId = el.id;
              canvas.add(obj);
            }
            placeImage(obj, el, p);
            entries.set(el.id, { obj, sig, el });
          }
          entries.get(el.id)!.obj.setCoords();
        }

        // layer order follows the document
        surface.elements.forEach((el, i) => {
          const e = entries.get(el.id);
          if (e && canvas.getObjects().indexOf(e.obj) !== i) canvas.moveObjectTo(e.obj, i);
        });

        // keep everything printable: shrink/slide anything that no longer fits
        for (const el of surface.elements) {
          const e = entries.get(el.id);
          if (!e) continue;
          const before = { left: e.obj.left, top: e.obj.top, sx: e.obj.scaleX };
          constrain(e.obj);
          if (Math.abs(before.left - e.obj.left) > 0.01 || Math.abs(before.top - e.obj.top) > 0.01 || Math.abs(before.sx - e.obj.scaleX) > 1e-4) {
            commit(e.obj as ElementObject, { history: false });
          }
        }

        const active = canvas.getActiveObject() as ElementObject | undefined;
        if (s.selectedId && entries.has(s.selectedId)) {
          if (active?.sgId !== s.selectedId) canvas.setActiveObject(entries.get(s.selectedId)!.obj);
        } else if (active) {
          canvas.discardActiveObject();
        }
        canvas.requestRenderAll();
      } finally {
        syncing = false;
        if (pending) {
          pending = false;
          void sync();
        }
      }
    };

    // ---- canvas events
    const onTransform = (e: { target: FabricObject }) => constrain(e.target);
    canvas.on("object:moving", onTransform);
    canvas.on("object:scaling", onTransform);
    canvas.on("object:rotating", onTransform);
    canvas.on("object:modified", (e) => commit(e.target as ElementObject));
    canvas.on("selection:created", (e) => state().select((e.selected?.[0] as ElementObject)?.sgId ?? null));
    canvas.on("selection:updated", (e) => state().select((e.selected?.[0] as ElementObject)?.sgId ?? null));
    canvas.on("selection:cleared", () => {
      if (state().selectedId) state().select(null);
    });
    canvas.on("mouse:dblclick", (e: TPointerEventInfo) => {
      if (e.target instanceof StudioText) onEditTextRef.current?.();
    });

    // ---- store subscription
    let prev = state();
    const unsub = api.subscribe((s) => {
      const sideChanged = s.side !== prev.side;
      const zoomChanged = s.zoom !== prev.zoom;
      const areaChanged = s.doc.surfaces[s.side].printAreaCode !== prev.doc.surfaces[prev.side].printAreaCode;
      if (sideChanged) {
        for (const e of entries.values()) canvas.remove(e.obj);
        entries.clear();
      }
      if (sideChanged || zoomChanged || areaChanged) fit();
      if (s.doc !== prev.doc || s.side !== prev.side || s.selectedId !== prev.selectedId || s.assets !== prev.assets) void sync();
      if (s.doc.colourId !== prev.doc.colourId || sideChanged) canvas.requestRenderAll();
      prev = s;
    });

    const ro = new ResizeObserver(() => fit());
    ro.observe(host);

    // ---- load mockup layers, then first render
    (async () => {
      try {
        const p = state().product;
        const load = async (side: Side) => {
          const m = p.mockups[side];
          const [mask, shade, highlight] = await Promise.all([loadImg(m.maskUrl), loadImg(m.shadeUrl), loadImg(m.highlightUrl)]);
          return { mask, shade, highlight };
        };
        const [front, back] = await Promise.all([load("front"), load("back"), loadDesignFont("montserrat")]);
        if (disposed) return;
        layers = { front, back };
        fit();
        await sync();
        setReady(true);
      } catch (err) {
        console.error("[studio] failed to load mockups", err);
        if (!disposed) setLoadError(true);
      }
    })();

    return () => {
      disposed = true;
      unsub();
      ro.disconnect();
      void canvas.dispose();
    };
  }, [api]);

  return (
    <div ref={hostRef} className={className} data-ready={ready || undefined} data-testid="design-stage">
      <canvas ref={canvasElRef} aria-hidden />
      {!ready && !loadError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-2/3 w-1/2 animate-pulse rounded-[40%_40%_12%_12%] bg-surface-sunken" />
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
          The shirt preview couldn&apos;t load. Check your connection and refresh — your design is saved on this device.
        </div>
      )}
    </div>
  );
}
