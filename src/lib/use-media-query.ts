"use client";

import { useSyncExternalStore } from "react";

/** Screen-size breakpoints shared by layouts (Tailwind: md = tablet, lg = desktop). */
export const TABLET_UP = "(min-width: 768px)";
export const DESKTOP_UP = "(min-width: 1024px)";

export function useMediaQuery(query: string, serverDefault = false) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}

export const matches = (query: string) => typeof window !== "undefined" && window.matchMedia(query).matches;
