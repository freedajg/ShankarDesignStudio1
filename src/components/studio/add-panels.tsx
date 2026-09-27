"use client";

import { ImagePlus, Loader2, Type, UploadCloud } from "lucide-react";
import type * as React from "react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { ACCEPT_ATTR } from "@/domain/artwork";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useStudio, useStudioApi } from "./context";
import type { AssetInfo } from "./store";

export function AddTextPanel({ onAdded, inputRef }: { onAdded?: () => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const addText = useStudio((s) => s.addText);
  const side = useStudio((s) => s.side);
  const [text, setText] = useState("");
  // unique per instance: desktop rail and mobile sheet can both be mounted
  const inputId = useId();
  const add = () => {
    const id = addText(text.trim() || undefined);
    if (!id) return toast.error("That side is full. Remove something to add more.");
    setText("");
    onAdded?.();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        Add text to the {side}
      </label>
      <div className="flex gap-2">
        <Input ref={inputRef} id={inputId} value={text} maxLength={200} placeholder="Your text" onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" aria-label="Add text">
          <Type aria-hidden /> Add
        </Button>
      </div>
    </form>
  );
}

export function useUpload() {
  const api = useStudioApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File, onAdded?: () => void) => {
    setError(null);
    const max = api.getState().settings.artwork.maxUploadBytes;
    if (file.size > max) {
      setError(`That file is too large. The limit is ${Math.round(max / 1024 / 1024)} MB.`);
      return;
    }
    if (!/\.(png|jpe?g)$/i.test(file.name) && !/^image\/(png|jpeg)$/.test(file.type)) {
      setError("Please upload a PNG or JPG image.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const { asset } = await apiFetch<{ asset: AssetInfo }>("/api/artwork", { form });
      if (!api.getState().addImage(asset)) {
        api.getState().registerAsset(asset);
        toast.error("That side is full. Remove something to add more.");
      } else {
        onAdded?.();
      }
    } catch (e) {
      setError((e as Error).message || "Your image couldn't be uploaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy, error, clearError: () => setError(null) };
}

export function UploadPanel({ onAdded }: { onAdded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { upload, busy, error } = useUpload();
  const assets = useStudio((s) => s.assets);
  const addImage = useStudio((s) => s.addImage);
  const side = useStudio((s) => s.side);
  const list = Object.values(assets);

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void upload(f, onAdded);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-5 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-line-strong",
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin text-accent-ink" aria-hidden /> : <UploadCloud className="size-6 text-ink-muted" aria-hidden />}
        <p className="text-sm font-medium">{busy ? "Uploading and checking your image…" : `Upload artwork to the ${side}`}</p>
        <p className="text-xs text-ink-muted">PNG or JPG. Transparent PNGs print best.</p>
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden /> Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          data-testid="upload-input"
          aria-label="Upload artwork"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f, onAdded);
          }}
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {list.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">Your uploads</p>
          <ul className="grid grid-cols-4 gap-2">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => addImage(a) && onAdded?.()}
                  className="grid aspect-square w-full place-items-center rounded-[var(--radius-sm)] border border-line bg-[conic-gradient(var(--color-checker-a)_25%,var(--color-checker-b)_0_50%,var(--color-checker-a)_0_75%,var(--color-checker-b)_0)] bg-[length:12px_12px] p-1 hover:border-accent"
                  aria-label={`Add ${a.originalFilename ?? "uploaded image"} again`}
                  title={a.originalFilename ?? undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked preview */}
                  <img src={a.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
