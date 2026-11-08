import "server-only";
import { splitFieldTokens } from "@/lib/signing/fields";
import { BODY_FONT } from "./fonts";

// Documenso field tokens in the PDF: one unbreakable Helvetica run per token, sized so the detected box is a usable field.

// Documenso (@libpdf/core) takes the field box from the token's glyph boxes. Non-embedded Helvetica has no font
// descriptor, so libpdf falls back to ascent 800 / descent -200: box height = font size, width = Helvetica advance widths.
// Tokens with non-ASCII option values fall back to the embedded body font, which Helvetica (WinAnsi) can't cover.
const TOKEN_FONT = "Helvetica";

// Font size per field type, plus the minimum box width it should reach (signature: about 193x28 pt for {{signature, r1}}).
const TOKEN_SIZES = {
  signature: { fontSize: 28, minWidth: 140 },
  initials: { fontSize: 24, minWidth: 64 },
  checkbox: { fontSize: 18, minWidth: 0 },
  radio: { fontSize: 18, minWidth: 0 },
  default: { fontSize: 20, minWidth: 80 },
};
// Narrow containers (table cells, deep lists) shrink a token down to this before letting it overflow instead of wrapping.
const MIN_TOKEN_FONT_SIZE = 10;
// Extra width on the token's text box so kerning or rounding can never push part of it onto a second line.
const WIDTH_SLACK = 1.04;

// Helvetica advance widths (Adobe AFM, WinAnsi) for ASCII 32-126, in 1/1000 em.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

// Width in em; non-ASCII glyphs (only possible in option values) are counted generously as a full em.
function measureEm(text, ascii) {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] * (ascii ? 1 : 1.15) : 1000;
  }
  return units / 1000;
}

// Markdown soft breaks inside a token render as one space (Documenso trims around commas, so detection is unaffected).
const tokenText = (raw) => raw.replace(/\s*\n\s*/g, " ");

// Font, size and text-box width for one token; maxWidth is the room available in its container.
export function tokenLayout(token, maxWidth) {
  const text = tokenText(token.raw);
  const ascii = PRINTABLE_ASCII.test(text);
  const em = Math.max(measureEm(text, ascii), 0.1);
  const spec = TOKEN_SIZES[token.type] || TOKEN_SIZES.default;
  let fontSize = Math.min(Math.max(spec.fontSize, spec.minWidth / em), spec.fontSize * 1.25);
  if (maxWidth > 0 && em * fontSize * WIDTH_SLACK > maxWidth) {
    fontSize = Math.max(MIN_TOKEN_FONT_SIZE, maxWidth / (em * WIDTH_SLACK));
  }
  fontSize = Math.floor(fontSize * 2) / 2;
  return {
    text,
    fontFamily: ascii ? TOKEN_FONT : BODY_FONT,
    fontSize,
    width: Math.ceil(em * fontSize * WIDTH_SLACK + 1),
  };
}

// A hair space (U+200A) between braces: zero-width characters don't work, fontkit draws them as a zero-advance
// space that libpdf sorts after the second brace.
export const BRACE_GUARD = "\u200a";

// Breaks every "{{" in ordinary text so Documenso only ever detects the tokens we emit. libpdf matches
// /\{\{([^}]+)\}\}/ across the whole page, so a stray "{{" earlier on a page would otherwise swallow the next real
// token, and text that only looks like a token (escaped, split by formatting, "R1") would become a field.
export const guardText = (value) => String(value ?? "").replace(/\{(?=\{)/g, `{${BRACE_GUARD}`);

const collapseWhitespace = (value) => value.replace(/\s+/g, " ");

// Strings and token objects for a text value; a token counts only when it appears verbatim in the source slice
// (so "\{\{signature, r1\}\}" or entity-encoded braces stay plain text, matching parseFieldTokens on the raw body).
export function splitTokens(value, sourceSlice) {
  const parts = splitFieldTokens(value);
  if (sourceSlice == null) return parts;
  const source = collapseWhitespace(sourceSlice);
  return parts.map((part) =>
    typeof part === "string" || source.includes(collapseWhitespace(part.raw)) ? part : part.raw,
  );
}
