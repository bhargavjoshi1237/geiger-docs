import "server-only";
import { StyleSheet } from "@react-pdf/renderer";
import { BODY_FONT, MONO_FONT } from "./fonts";

// Print palette and type scale for the signing PDF (white paper, near-black text, one muted accent).

export const PAGE = {
  size: "A4",
  width: 595.28,
  height: 841.89,
  marginX: 60,
  marginTop: 64,
  marginBottom: 76,
};
export const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;
const FOOTER_HEIGHT = 20;
const FOOTER_OFFSET = 34;
const FOOTER_PAGE_WIDTH = 100;

export const COLORS = {
  paper: "#ffffff",
  text: "#1f2328",
  muted: "#59636e",
  faint: "#8c959f",
  rule: "#d0d7de",
  hairline: "#e5e8eb",
  surface: "#f6f8fa",
  codeInline: "#eff1f3",
  link: "#0b57d0",
  token: "#6b7a99",
};

// A unitless lineHeight is resolved against the same style's fontSize (react-pdf falls back to 18), so set both.
export const BODY_SIZE = 10.5;
export const BODY_LEADING = 1.55;
export const LIST_INDENT = 16;
export const QUOTE_INDENT = 12;
export const CELL_PADDING_X = 6;
// Noto Sans space advance (260/1000 em): the gap between words when a paragraph is laid out word by word.
export const SPACE_EM = 0.26;

export const HEADING_STYLES = {
  1: { fontSize: 18, marginTop: 18, marginBottom: 8, lineHeight: 1.3 },
  2: { fontSize: 15, marginTop: 16, marginBottom: 6, lineHeight: 1.3 },
  3: { fontSize: 12.5, marginTop: 14, marginBottom: 5, lineHeight: 1.35 },
  4: { fontSize: 11, marginTop: 12, marginBottom: 4, lineHeight: 1.4 },
};

// Inline marks; code keeps its own family and size so it reads the same inside headings and tables.
export const MARK_STYLES = {
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  strike: { textDecoration: "line-through" },
  code: { fontFamily: MONO_FONT, backgroundColor: COLORS.codeInline, color: COLORS.text },
  link: { color: COLORS.link },
  url: { color: COLORS.faint },
  note: { color: COLORS.muted, fontStyle: "italic" },
};

export const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.paper,
    color: COLORS.text,
    fontFamily: BODY_FONT,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LEADING,
    paddingTop: PAGE.marginTop,
    paddingBottom: PAGE.marginBottom,
    paddingHorizontal: PAGE.marginX,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  titleRule: {
    marginTop: 10,
    marginBottom: 18,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.rule,
  },
  heading: { fontWeight: 700, color: COLORS.text },
  paragraph: { marginBottom: 8 },
  tightParagraph: { marginBottom: 2 },
  wordFlow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  lineBreak: { width: "100%", height: 0 },
  token: {
    color: COLORS.token,
    fontWeight: 400,
    fontStyle: "normal",
    textDecoration: "none",
    textTransform: "none",
    letterSpacing: 0,
    lineHeight: 1,
  },
  // Keeps neighbours clear of Documenso's whiteout, which covers the token box plus a 1 pt border.
  tokenBox: { paddingTop: 3, paddingBottom: 1 },
  blockquote: {
    marginBottom: 8,
    paddingLeft: QUOTE_INDENT - 3,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.rule,
    color: COLORS.muted,
  },
  codeBlock: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 0.75,
    borderColor: COLORS.hairline,
    borderRadius: 3,
  },
  codeText: { fontFamily: MONO_FONT, fontSize: 8.75, lineHeight: 1.5, color: COLORS.text },
  list: { marginBottom: 8 },
  nestedList: { marginTop: 2, marginBottom: 0 },
  listItem: { marginBottom: 2 },
  listHead: { position: "relative" },
  listMarker: { position: "absolute", top: 0 },
  listBody: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  listNumber: { textAlign: "right", paddingRight: 5 },
  bulletBox: { alignItems: "center" },
  checkbox: { alignItems: "flex-start", paddingLeft: 1 },
  table: {
    marginBottom: 10,
    borderWidth: 0.75,
    borderColor: COLORS.rule,
    borderRadius: 2,
  },
  tableRow: { flexDirection: "row" },
  tableRowDivider: { borderTopWidth: 0.75, borderTopColor: COLORS.rule },
  tableHeader: { backgroundColor: COLORS.surface },
  tableCell: { paddingVertical: 4, paddingHorizontal: CELL_PADDING_X, flexShrink: 1, flexBasis: 0 },
  tableCellDivider: { borderLeftWidth: 0.75, borderLeftColor: COLORS.rule },
  tableText: { fontSize: 9.5, lineHeight: 1.45 },
  rule: { marginVertical: 12, borderBottomWidth: 0.75, borderBottomColor: COLORS.rule },
  footnote: { fontSize: 8.5, color: COLORS.muted, marginBottom: 4 },
  // Anchored from the top: a bottom-anchored fixed footer with a render() page number breaks react-pdf on long documents.
  footer: {
    position: "absolute",
    left: PAGE.marginX,
    right: PAGE.marginX,
    top: PAGE.height - FOOTER_OFFSET - FOOTER_HEIGHT,
    height: FOOTER_HEIGHT,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.hairline,
    fontSize: 8,
    lineHeight: 1.3,
    color: COLORS.faint,
  },
  footerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingRight: 16,
    marginRight: FOOTER_PAGE_WIDTH,
    textOverflow: "ellipsis",
  },
  // The page number is its own fixed element: react-pdf skips render() text nested inside a fixed View.
  footerPage: {
    position: "absolute",
    right: PAGE.marginX,
    top: PAGE.height - FOOTER_OFFSET - FOOTER_HEIGHT + 8,
    width: FOOTER_PAGE_WIDTH,
    textAlign: "right",
    fontSize: 8,
    lineHeight: 1.3,
    color: COLORS.faint,
  },
  // Signature page.
  signaturesHeading: { fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 },
  signaturesIntro: { color: COLORS.muted, marginBottom: 18 },
  signatureBlock: {
    marginBottom: 16,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderWidth: 0.75,
    borderColor: COLORS.hairline,
    borderRadius: 4,
  },
  recipientLabel: {
    fontSize: 8,
    lineHeight: 1.3,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: 6,
  },
  // The line sits a few points below the token box so it survives Documenso's whiteout.
  fieldLine: {
    paddingBottom: 4,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.text,
    alignItems: "flex-start",
  },
  fieldCaption: { fontSize: 8, lineHeight: 1.3, color: COLORS.muted, marginTop: 3 },
  fieldRow: { flexDirection: "row", marginTop: 14 },
  fieldColumn: { flexGrow: 1, flexBasis: 0 },
  fieldGap: { width: 24 },
  signerName: { marginTop: 12, fontSize: BODY_SIZE, fontWeight: 700, lineHeight: 1.35 },
  signerEmail: { fontSize: BODY_SIZE, color: COLORS.muted, lineHeight: 1.35 },
});
