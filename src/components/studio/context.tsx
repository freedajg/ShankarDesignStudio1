"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStudioStore, type StudioInit, type StudioStore, type StudioStoreApi } from "./store";

const Ctx = createContext<StudioStoreApi | null>(null);

export function StudioProvider({ init, children }: { init: StudioInit; children: ReactNode }) {
  const [store] = useState(() => createStudioStore(init));
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStudioApi(): StudioStoreApi {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStudio must be used inside <StudioProvider>");
  return store;
}

export function useStudio<T>(selector: (s: StudioStore) => T): T {
  return useStore(useStudioApi(), selector);
}
