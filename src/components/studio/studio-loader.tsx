"use client";

import dynamic from "next/dynamic";
import type { StudioInit } from "./store";

/** The studio is an interactive app (canvas, local drafts) — rendered on the client only. */
const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-label="Loading the design studio">
      <div className="h-14 border-b border-line bg-surface" />
      <div className="grid flex-1 place-items-center">
        <div className="h-[55vh] w-[40vh] animate-pulse rounded-[40%_40%_10%_10%] bg-surface-sunken" />
      </div>
      <div className="h-16 border-t border-line bg-surface" />
    </div>
  ),
});

export function StudioLoader(props: { init: StudioInit; recoverLocal: boolean }) {
  return <Studio {...props} />;
}
