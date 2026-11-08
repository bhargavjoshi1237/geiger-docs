import "server-only";
import { Link, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  BODY_LEADING,
  BODY_SIZE,
  CELL_PADDING_X,
  COLORS,
  CONTENT_WIDTH,
  HEADING_STYLES,
  LIST_INDENT,
  MARK_STYLES,
  QUOTE_INDENT,
  SPACE_EM,
  styles,
} from "./theme";
import { BODY_FONT } from "./fonts";
import { TokenRun } from "./token_run";
import { BRACE_GUARD, guardText, splitTokens } from "./tokens";

// Markdown body -> react-pdf blocks via mdast (remark-parse + remark-gfm); unknown nodes degrade to their text.

const parser = unified().use(remarkParse).use(remarkGfm);

const SAFE_LINK = /^(https?:|mailto:)/i;
const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "break",
  "html",
  "footnoteReference",
]);
// Containers stop indenting below this width so pathological nesting can't squeeze content to nothing.
const MIN_BLOCK_WIDTH = 100;
const CODE_PADDING = 20;
const TABLE_TEXT = { fontSize: 9.5, lineHeight: 1.45 };
const FOOTNOTE_TEXT = { fontSize: 8.5, lineHeight: 1.45 };
// Blocks up to these sizes are kept on one page; longer ones may break.
const KEEP_CODE_LINES = 25;
const KEEP_TEXT_CHARS = 600;

const merge = (...parts) => Object.assign({}, ...parts.filter(Boolean));
const isToken = (part) => typeof part !== "string";

// Hyphenation inserts a visible "-", so URLs, emails, paths and code stay whole unless they could never fit a line.
const LONG_WORD = 48;
const URLISH = /:\/\/|www\.|[/@\\]/;
const hyphenateProse = (word, builtin) => (URLISH.test(word) && word.length <= LONG_WORD ? [word] : builtin(word));
const hyphenateCode = (word, builtin) => (word.length <= LONG_WORD ? [word] : builtin(word));

// Leading and repeated spaces become no-break spaces, which react-pdf keeps (it drops plain leading spaces).
const keepIndent = (line) =>
  line
    .replace(/^ +/, (spaces) => "\u00a0".repeat(spaces.length))
    .replace(/ {2,}/g, (spaces) => `${"\u00a0".repeat(spaces.length - 1)} `);

function plainText(node) {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (node.type === "image" || node.type === "imageReference") return node.alt || "";
  return (node.children || []).map(plainText).join("");
}

const stripTags = (html) =>
  String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sliceOf(ctx, node) {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  return Number.isInteger(start) && Number.isInteger(end) ? ctx.source.slice(start, end) : null;
}

function collectDefinitions(node, definitions = new Map()) {
  if (node?.type === "definition" && node.identifier) definitions.set(node.identifier, node.url);
  for (const child of node?.children || []) collectDefinitions(child, definitions);
  return definitions;
}

// ---- Inline content: mdast phrasing -> flat runs ({ kind: text | token | break }) ----

function pushText(runs, value, marks, slice) {
  // Soft line breaks render as spaces, as in the app's MarkdownView.
  const text = String(value ?? "").replace(/[ \t]*\r?\n[ \t]*/g, " ");
  for (const part of splitTokens(text, slice)) {
    if (isToken(part)) runs.push({ kind: "token", token: part });
    else if (part) runs.push({ kind: "text", value: part, marks });
  }
}

function linkUrl(node, ctx) {
  if (node.type === "link") return node.url || "";
  return ctx.definitions.get(node.identifier) || "";
}

function collectRuns(nodes, ctx, marks = {}, runs = []) {
  for (const node of nodes || []) {
    switch (node.type) {
      case "text":
        pushText(runs, node.value, marks, sliceOf(ctx, node));
        break;
      case "inlineCode":
        pushText(runs, node.value, { ...marks, code: true }, sliceOf(ctx, node));
        break;
      case "emphasis":
        collectRuns(node.children, ctx, { ...marks, italic: true }, runs);
        break;
      case "strong":
        collectRuns(node.children, ctx, { ...marks, bold: true }, runs);
        break;
      case "delete":
        collectRuns(node.children, ctx, { ...marks, strike: true }, runs);
        break;
      case "link":
      case "linkReference": {
        const url = linkUrl(node, ctx);
        collectRuns(node.children, ctx, url ? { ...marks, link: url } : marks, runs);
        // Print the URL after the text unless the text already is the URL (autolinks).
        const label = plainText(node).trim();
        if (url && label !== url && `mailto:${label}` !== url) {
          runs.push({ kind: "text", value: ` (${url})`, marks: { ...marks, url: true } });
        }
        break;
      }
      case "image":
      case "imageReference":
        runs.push({ kind: "text", value: node.alt ? `[Image: ${node.alt}]` : "[Image]", marks: { ...marks, note: true } });
        break;
      case "break":
        runs.push({ kind: "break" });
        break;
      case "html":
        if (/^<br\s*\/?>$/i.test(String(node.value || "").trim())) runs.push({ kind: "break" });
        else pushText(runs, stripTags(node.value), marks, sliceOf(ctx, node));
        break;
      case "footnoteReference":
        runs.push({ kind: "text", value: `[${node.label || node.identifier}]`, marks: { ...marks, note: true } });
        break;
      default:
        if (Array.isArray(node.children)) collectRuns(node.children, ctx, marks, runs);
        else if (typeof node.value === "string") pushText(runs, node.value, marks, sliceOf(ctx, node));
    }
  }
  return runs;
}

// Breaks "{{" inside text and at text/token seams, so only the tokens we emit can match Documenso's regex.
function guardRuns(runs) {
  return runs.map((run, index) => {
    if (run.kind !== "text") return run;
    let value = guardText(run.value);
    const next = runs[index + 1];
    const nextOpensBrace = next?.kind === "token" || (next?.kind === "text" && next.value.startsWith("{"));
    if (value.endsWith("{") && nextOpensBrace) value += BRACE_GUARD;
    return { ...run, value };
  });
}

// Monospace faces draw the hair-space guard a full cell wide, so it switches to the body face there.
function withGuards(value, mono) {
  if (!mono || !value.includes(BRACE_GUARD)) return value;
  return value.split(BRACE_GUARD).flatMap((part, index) =>
    index
      ? [
          <Text key={index} style={{ fontFamily: BODY_FONT }}>
            {BRACE_GUARD}
          </Text>,
          part,
        ]
      : [part],
  );
}

function markStyle(marks, fontSize) {
  if (!marks) return null;
  const style = merge(
    marks.bold && MARK_STYLES.bold,
    marks.italic && MARK_STYLES.italic,
    marks.strike && MARK_STYLES.strike,
    marks.code && { ...MARK_STYLES.code, fontSize: fontSize * 0.88 },
    marks.link && MARK_STYLES.link,
    marks.url && { ...MARK_STYLES.url, fontSize: fontSize * 0.88 },
    marks.note && MARK_STYLES.note,
  );
  return Object.keys(style).length ? style : null;
}

function renderRun(run, key, fontSize) {
  if (run.kind === "break") return "\n";
  const style = markStyle(run.marks, fontSize);
  const content = withGuards(run.value, run.marks?.code || run.marks?.mono);
  const href = run.marks?.link;
  if (href && SAFE_LINK.test(href)) {
    return (
      <Link key={key} src={href} style={merge(style, { textDecoration: "none" })}>
        {content}
      </Link>
    );
  }
  if (!style && typeof content === "string") return content;
  return (
    <Text key={key} style={style}>
      {content}
    </Text>
  );
}

// Whitespace that separates words; the hair-space brace guard stays inside its word.
const WORD_GAP = /([^\S\u200a]+)/;

// Words (styled fragments, each keeping one real trailing space so extracted text keeps its spaces), tokens and
// hard breaks, for laying a token-bearing block out word by word.
function buildItems(runs) {
  const items = [];
  let word = null;
  const endWord = () => {
    if (word) items.push(word);
    word = null;
  };
  for (const run of runs) {
    if (run.kind === "break") {
      endWord();
      items.push({ kind: "break" });
    } else if (run.kind === "token") {
      endWord();
      items.push({ kind: "token", token: run.token, space: false });
    } else {
      // An inline code span stays one item so its highlight isn't broken up word by word.
      for (const piece of run.marks?.code ? [run.value] : run.value.split(WORD_GAP)) {
        if (!piece) continue;
        if (WORD_GAP.test(piece)) {
          if (word) {
            word.fragments[word.fragments.length - 1].value += " ";
            endWord();
          } else if (items[items.length - 1]?.kind === "token") {
            items[items.length - 1].space = true;
          }
          continue;
        }
        if (!word) word = { kind: "word", fragments: [] };
        word.fragments.push({ kind: "text", value: piece, marks: run.marks });
      }
    }
  }
  endWord();
  return items;
}

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" };

// A block that contains tokens flows as a wrapping row of words, so each token stays one unbroken run; a list
// marker (lead) hangs in front of the first word so it shares that row's baseline and page.
function renderTokenFlow(runs, ctx, { key, style, textStyle, align, minPresenceAhead, lead }) {
  const spacing = textStyle.fontSize * SPACE_EM;
  return (
    <View
      key={key}
      minPresenceAhead={minPresenceAhead}
      style={merge(style, styles.wordFlow, { justifyContent: JUSTIFY[align] || "flex-start" })}
    >
      {lead ? lead.render("hang") : null}
      {buildItems(runs).map((item, index) => {
        if (item.kind === "break") return <View key={index} style={styles.lineBreak} />;
        if (item.kind === "token") {
          return (
            <TokenRun key={index} token={item.token} maxWidth={ctx.width} marginRight={item.space ? spacing : 0} />
          );
        }
        const mono = item.fragments.some((fragment) => fragment.marks?.mono);
        return (
          <Text key={index} style={textStyle} hyphenationCallback={mono ? hyphenateCode : hyphenateProse}>
            {item.fragments.map((fragment, part) => renderRun(fragment, part, textStyle.fontSize))}
          </Text>
        );
      })}
    </View>
  );
}

// Phrasing content as one block: flowing text, or a word-by-word row when it carries field tokens (or wordFlow).
function renderInline(nodes, ctx, { key, style, textStyle: extra, align, minPresenceAhead, lead, wordFlow } = {}) {
  const runs = guardRuns(collectRuns(nodes, ctx));
  if (!runs.some((run) => run.kind === "token" || (run.kind === "text" && run.value.trim()))) return null;
  const textStyle = merge(
    { fontSize: ctx.fontSize, lineHeight: ctx.lineHeight, color: ctx.color },
    extra,
    align && { textAlign: align },
  );
  if (wordFlow || runs.some((run) => run.kind === "token")) {
    return renderTokenFlow(runs, ctx, { key, style, textStyle, align, minPresenceAhead, lead });
  }
  return (
    <Text
      key={key}
      minPresenceAhead={minPresenceAhead}
      hyphenationCallback={hyphenateProse}
      style={merge(style, textStyle)}
    >
      {runs.map((run, index) => renderRun(run, index, textStyle.fontSize))}
    </Text>
  );
}

// ---- Blocks ----

// Drops the outer margin of the first block on the page and the last block inside a container.
const edge = (ctx, { first, last }) =>
  merge(first && ctx.top && { marginTop: 0 }, last && ctx.flush && { marginBottom: 0 });

function renderHeading(node, ctx, key, position) {
  const level = HEADING_STYLES[Math.min(Math.max(Number(node.depth) || 1, 1), 4)];
  const { fontSize, lineHeight, marginTop, marginBottom } = level;
  return renderInline(node.children, { ...ctx, fontSize, lineHeight }, {
    key,
    style: merge({ marginTop, marginBottom }, edge(ctx, position)),
    textStyle: styles.heading,
    minPresenceAhead: 48,
  });
}

function renderBlockquote(node, ctx, key, position) {
  if (ctx.width - QUOTE_INDENT < MIN_BLOCK_WIDTH) {
    return <View key={key}>{renderBlocks(node.children, { ...ctx, top: false })}</View>;
  }
  const inner = { ...ctx, width: ctx.width - QUOTE_INDENT, color: COLORS.muted, top: false, flush: true };
  return (
    <View key={key} style={merge(styles.blockquote, edge(ctx, position))}>
      {renderBlocks(node.children, inner)}
    </View>
  );
}

// placement "hang": first item of a word row, pulled into the indent; "anchor": pinned to a block's top-left.
// Shape markers get an explicit line-box height; text markers must not (react-pdf drops a Text given a height).
function ListMarker({ ordered, number, checked, depth, ctx, width, placement }) {
  const lineBox = ctx.fontSize * ctx.lineHeight;
  const place = placement === "hang" ? { marginLeft: -width } : { ...styles.listMarker, left: -width };
  const shapePlace = placement === "hang" ? { ...place, height: lineBox } : place;
  if (typeof checked === "boolean") {
    const size = ctx.fontSize * 0.82;
    return (
      <View style={{ ...styles.checkbox, width, paddingTop: (lineBox - size) / 2 + ctx.fontSize * 0.08, ...shapePlace }}>
        <Svg width={size} height={size} viewBox="0 0 10 10">
          <Rect
            x="0.6"
            y="0.6"
            width="8.8"
            height="8.8"
            rx="1.6"
            stroke={checked ? COLORS.text : COLORS.faint}
            strokeWidth={0.9}
            fill={checked ? COLORS.text : COLORS.paper}
          />
          {checked ? (
            <Path d="M2.6 5.2 L4.3 6.9 L7.5 3.4" stroke={COLORS.paper} strokeWidth={1.3} fill="none" />
          ) : null}
        </Svg>
      </View>
    );
  }
  if (ordered) {
    return (
      <Text
        style={{ ...styles.listNumber, width, fontSize: ctx.fontSize, lineHeight: ctx.lineHeight, color: ctx.color, ...place }}
      >
        {`${number}.`}
      </Text>
    );
  }
  // Filled dot, hollow dot, then a small square, repeating with depth.
  const shape = depth % 3;
  const size = shape === 2 ? 3.6 : 4.2;
  const dot = {
    width: size,
    height: size,
    borderRadius: shape === 2 ? 0 : size / 2,
    backgroundColor: shape === 1 ? COLORS.paper : ctx.color,
    borderWidth: shape === 1 ? 0.8 : 0,
    borderColor: ctx.color,
  };
  return (
    <View style={{ ...styles.bulletBox, width, paddingTop: (lineBox - size) / 2 + ctx.fontSize * 0.08, ...shapePlace }}>
      <View style={dot} />
    </View>
  );
}

function renderList(node, ctx, key, position) {
  const items = node.children || [];
  const depth = ctx.listDepth || 0;
  const start = Number.isInteger(node.start) ? node.start : 1;
  const digits = String(start + items.length - 1).length;
  const wanted = node.ordered ? Math.max(LIST_INDENT, digits * ctx.fontSize * 0.6 + 8) : LIST_INDENT;
  const markerWidth = Math.max(0, Math.min(wanted, ctx.width - MIN_BLOCK_WIDTH));
  const inner = {
    ...ctx,
    width: ctx.width - markerWidth,
    listDepth: depth + 1,
    tight: !node.spread,
    top: false,
    flush: true,
  };
  return (
    <View key={key} style={merge(styles.list, depth > 0 && styles.nestedList, edge(ctx, position))}>
      {items.map((item, index) => {
        const renderMarker = (placement) => (
          <ListMarker
            ordered={node.ordered}
            number={start + index}
            checked={item.checked}
            depth={depth}
            ctx={ctx}
            width={markerWidth}
            placement={placement}
          />
        );
        const children = item.children || [];
        const head = children[0];
        const itemStyle = merge(styles.listItem, { paddingLeft: markerWidth });
        // A first paragraph lays out word by word with the marker as its first item, so a page break can't separate
        // them (react-pdf mis-paginates unbreakable rows nested in lists, so wrap={false} is not an option).
        if (markerWidth > 0 && head?.type === "paragraph") {
          const style = merge(inner.tight ? styles.tightParagraph : styles.paragraph, children.length === 1 && { marginBottom: 0 });
          const lead = { width: markerWidth, render: renderMarker };
          return (
            <View key={index} style={itemStyle}>
              {renderInline(head.children, inner, { key: "head", style, lead, wordFlow: true }) ?? renderMarker("hang")}
              {renderBlocks(children.slice(1), inner)}
            </View>
          );
        }
        // Other first blocks (nested list, code, table) carry the marker anchored to their top-left.
        const [first, ...rest] = renderBlocks(children, inner);
        return (
          <View key={index} style={itemStyle}>
            <View style={styles.listHead}>
              {markerWidth > 0 ? renderMarker("anchor") : null}
              {first ?? <Text> </Text>}
            </View>
            {rest}
          </View>
        );
      })}
    </View>
  );
}

function renderCode(node, ctx, key, position) {
  const value = String(node.value ?? "").replace(/\t/g, "    ");
  const parts = splitTokens(value, sliceOf(ctx, node));
  const style = merge(styles.codeBlock, edge(ctx, position));
  const keep = value.split("\n").length <= KEEP_CODE_LINES;
  if (!parts.some(isToken)) {
    const text = guardText(value.split("\n").map(keepIndent).join("\n"));
    return (
      <View key={key} wrap={!keep} style={style}>
        <Text style={styles.codeText} hyphenationCallback={hyphenateCode}>
          {withGuards(text, true) || " "}
        </Text>
      </View>
    );
  }
  // With tokens, lines keep their breaks but lay out word by word (indentation collapses).
  const runs = [];
  for (const part of parts) {
    if (isToken(part)) {
      runs.push({ kind: "token", token: part });
      continue;
    }
    part.split("\n").forEach((line, index) => {
      if (index > 0) runs.push({ kind: "break" });
      if (line) runs.push({ kind: "text", value: line, marks: { mono: true } });
    });
  }
  return (
    <View key={key} wrap={!keep} style={style}>
      {renderTokenFlow(guardRuns(runs), { ...ctx, width: ctx.width - CODE_PADDING }, { textStyle: styles.codeText })}
    </View>
  );
}

function renderTable(node, ctx, key, position) {
  const rows = node.children || [];
  const columns = Math.max(0, ...rows.map((row) => (row.children || []).length));
  if (!columns) return null;
  // Columns share the width in proportion to their longest cell, within limits.
  const weights = Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(0, ...rows.map((row) => plainText(row.children?.[column]).length));
    return Math.min(Math.max(longest, 4), 40);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const align = node.align || [];
  return (
    <View key={key} style={merge(styles.table, edge(ctx, position))}>
      {rows.map((row, rowIndex) => {
        const cells = row.children || [];
        const length = cells.reduce((sum, cell) => sum + plainText(cell).length, 0);
        return (
          <View
            key={rowIndex}
            wrap={length > KEEP_TEXT_CHARS}
            style={merge(styles.tableRow, rowIndex > 0 && styles.tableRowDivider, rowIndex === 0 && styles.tableHeader)}
          >
            {weights.map((weight, column) => {
              const cell = cells[column];
              const width = Math.max((ctx.width * weight) / total - CELL_PADDING_X * 2, 24);
              return (
                <View
                  key={column}
                  style={merge(styles.tableCell, column > 0 && styles.tableCellDivider, { flexGrow: weight })}
                >
                  {cell
                    ? renderInline(cell.children, { ...ctx, ...TABLE_TEXT, width }, {
                        textStyle: rowIndex === 0 ? MARK_STYLES.bold : null,
                        align: align[column] || undefined,
                      })
                    : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function renderFootnote(node, ctx, key, position) {
  const labelWidth = 22;
  const inner = {
    ...ctx,
    ...FOOTNOTE_TEXT,
    color: COLORS.muted,
    width: ctx.width - labelWidth,
    tight: true,
    top: false,
    flush: true,
  };
  return (
    <View key={key} style={merge({ flexDirection: "row", marginBottom: 4 }, edge(ctx, position))}>
      <Text style={{ ...FOOTNOTE_TEXT, width: labelWidth, color: COLORS.muted }}>
        {guardText(`[${node.label || node.identifier}]`)}
      </Text>
      <View style={styles.listBody}>{renderBlocks(node.children, inner)}</View>
    </View>
  );
}

function renderBlock(node, ctx, key, position) {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.children, ctx, {
        key,
        style: merge(ctx.tight ? styles.tightParagraph : styles.paragraph, edge(ctx, position)),
      });
    case "heading":
      return renderHeading(node, ctx, key, position);
    case "blockquote":
      return renderBlockquote(node, ctx, key, position);
    case "list":
      return renderList(node, ctx, key, position);
    case "code":
      return renderCode(node, ctx, key, position);
    case "table":
      return renderTable(node, ctx, key, position);
    case "thematicBreak":
      return <View key={key} style={merge(styles.rule, edge(ctx, position))} />;
    case "html": {
      const text = stripTags(node.value);
      return text
        ? renderInline([{ type: "text", value: text, position: node.position }], ctx, {
            key,
            style: merge(styles.paragraph, edge(ctx, position)),
          })
        : null;
    }
    case "definition":
      return null;
    case "footnoteDefinition":
      return renderFootnote(node, ctx, key, position);
    default:
      if (Array.isArray(node.children) && node.children.length) {
        if (node.children.every((child) => PHRASING.has(child.type))) {
          return renderInline(node.children, ctx, { key, style: merge(styles.paragraph, edge(ctx, position)) });
        }
        return <View key={key}>{renderBlocks(node.children, { ...ctx, top: false })}</View>;
      }
      if (typeof node.value === "string" && node.value.trim()) {
        return renderInline([{ type: "text", value: node.value, position: node.position }], ctx, {
          key,
          style: merge(styles.paragraph, edge(ctx, position)),
        });
      }
      return null;
  }
}

function renderBlocks(nodes, ctx) {
  const list = (nodes || []).filter((node) => node && node.type !== "definition");
  return list
    .map((node, index) => renderBlock(node, ctx, index, { first: index === 0, last: index === list.length - 1 }))
    .filter(Boolean);
}

// Markdown source -> array of react-pdf block elements for the document page.
export function renderMarkdown(body) {
  const source = String(body ?? "");
  if (!source.trim()) return [];
  const tree = parser.parse(source);
  const ctx = {
    source,
    definitions: collectDefinitions(tree),
    width: CONTENT_WIDTH,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LEADING,
    color: COLORS.text,
    listDepth: 0,
    tight: false,
    top: true,
    flush: false,
  };
  return renderBlocks(tree.children, ctx);
}
