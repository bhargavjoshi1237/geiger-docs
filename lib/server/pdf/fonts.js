import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Noto Sans (SIL OFL 1.1, fonts/OFL.txt) for body text: broad Latin, Greek and Cyrillic coverage, unlike WinAnsi Helvetica.
export const BODY_FONT = "Noto Sans";
export const MONO_FONT = "Noto Sans Mono";

// Resolved from the project root: next.config.mjs traces this folder into the signing routes for Vercel.
const FONT_DIR = path.join(process.cwd(), "lib", "server", "pdf", "fonts");

const BODY_FACES = [
  { file: "NotoSans-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { file: "NotoSans-Bold.ttf", fontWeight: 700, fontStyle: "normal" },
  { file: "NotoSans-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
  { file: "NotoSans-BoldItalic.ttf", fontWeight: 700, fontStyle: "italic" },
];
const MONO_FILE = "NotoSansMono-Regular.ttf";

const fontPath = (file) => path.join(FONT_DIR, file);

// Registers both families once per process; throws when a font file is missing so the caller sees a real failure.
export function registerFonts() {
  if (Font.getRegisteredFontFamilies().includes(BODY_FONT)) return;
  const missing = [...BODY_FACES.map((face) => face.file), MONO_FILE].filter((file) => !fs.existsSync(fontPath(file)));
  if (missing.length) throw new Error(`[docs.pdf] Missing font files in ${FONT_DIR}: ${missing.join(", ")}`);

  Font.register({
    family: BODY_FONT,
    fonts: BODY_FACES.map(({ file, fontWeight, fontStyle }) => ({ src: fontPath(file), fontWeight, fontStyle })),
  });
  // One upright face serves every weight/style so inherited bold or italic never fails font resolution inside code.
  Font.register({
    family: MONO_FONT,
    fonts: [400, 700].flatMap((fontWeight) =>
      ["normal", "italic"].map((fontStyle) => ({ src: fontPath(MONO_FILE), fontWeight, fontStyle })),
    ),
  });
}
