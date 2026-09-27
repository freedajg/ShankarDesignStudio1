"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const EVENT = "sg-theme-change";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === "dark" || (pref === "system" && media().matches) ? "dark" : "light";
}

function apply(pref: ThemePreference) {
  document.documentElement.dataset.theme = resolve(pref);
  window.dispatchEvent(new Event(EVENT));
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // private mode: still switch for this page view
  }
  apply(pref);
}

function subscribe(onChange: () => void) {
  const mq = media();
  const onSystem = () => {
    if (readPreference() === "system") apply("system");
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onSystem); // another tab changed it
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onSystem);
    mq.removeEventListener("change", onSystem);
  };
}

/** The visitor's choice and the theme actually showing. */
export function useTheme(): { preference: ThemePreference; theme: ResolvedTheme } {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const theme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light" as const,
  );
  return { preference, theme };
}
