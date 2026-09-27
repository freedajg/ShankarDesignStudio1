/**
 * Runs in <head> before the page paints, so a dark-mode visitor never sees a
 * white flash. Reads the saved choice (light / dark / system) and sets
 * <html data-theme>. Kept tiny and dependency-free; mirrored by src/lib/theme.ts.
 */
export const THEME_STORAGE_KEY = "sg-theme";

export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
