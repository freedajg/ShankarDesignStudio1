/**
 * Copies the curated design fonts (latin subset woff2) from fontsource into
 * public/fonts/design, plus their OFL licences. Run: npx tsx scripts/copy-fonts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { DESIGN_FONTS, fontFileName } from "../src/domain/fonts";

const out = path.join(process.cwd(), "public", "fonts", "design");
fs.mkdirSync(path.join(out, "licenses"), { recursive: true });

for (const font of DESIGN_FONTS) {
  const pkg = path.join(process.cwd(), "node_modules", "@fontsource", font.id);
  for (const face of font.faces) {
    const src = path.join(pkg, "files", `${font.id}-latin-${face}.woff2`);
    fs.copyFileSync(src, path.join(out, fontFileName(font.id, face)));
  }
  fs.copyFileSync(path.join(pkg, "LICENSE"), path.join(out, "licenses", `${font.id}.txt`));
  console.log("copied", font.id, font.faces.join(", "));
}
