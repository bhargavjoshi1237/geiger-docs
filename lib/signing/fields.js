// Documenso placeholder fields written into Markdown, e.g. {{signature, r1}} (isomorphic: parse, build, validate).

// Types offered in the editor's Insert field menu.
export const FIELD_TYPES = [
  { value: "signature", label: "Signature" },
  { value: "initials", label: "Initials" },
  { value: "name", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "date", label: "Date signed" },
  { value: "text", label: "Text" },
];

// Every type Documenso detects in a PDF; anything else stays plain text.
const DETECTED_TYPES = new Set([
  "signature",
  "initials",
  "name",
  "email",
  "date",
  "text",
  "number",
  "radio",
  "checkbox",
  "dropdown",
]);

const TYPE_LABELS = Object.fromEntries(FIELD_TYPES.map((type) => [type.value, type.label]));

// {{type, rN[, key=value…]}} on one line (Documenso also accepts RN); a fresh global regex per call avoids shared lastIndex state.
const TOKEN_SOURCE = String.raw`\{\{\s*([a-zA-Z]+)\s*,\s*[rR](\d+)\s*((?:,\s*[a-zA-Z]+\s*=\s*[^,{}\n]*)*)\}\}`;
// A known type with no recipient ({{signature}}): Documenso ignores it on upload, so we flag it.
const UNASSIGNED_SOURCE = String.raw`\{\{\s*([a-zA-Z]+)\s*\}\}`;

export const fieldTokenRegex = () => new RegExp(TOKEN_SOURCE, "g");

export const fieldTypeLabel = (type) =>
  TYPE_LABELS[type] || `${type.charAt(0).toUpperCase()}${type.slice(1)}`;

function parseOptions(source) {
  const options = {};
  for (const part of String(source || "").split(",")) {
    const [key, ...rest] = part.split("=");
    if (key?.trim() && rest.length) options[key.trim().toLowerCase()] = rest.join("=").trim();
  }
  return options;
}

function toToken(match) {
  const type = match[1].toLowerCase();
  if (!DETECTED_TYPES.has(type)) return null;
  return {
    raw: match[0],
    type,
    position: Number(match[2]),
    options: parseOptions(match[3]),
    index: match.index,
  };
}

// Builds the exact token Documenso detects, e.g. buildFieldToken("date", 2) -> "{{date, r2}}".
export function buildFieldToken(type, position, options = {}) {
  const extras = Object.entries(options)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `, ${key}=${value}`)
    .join("");
  return `{{${type}, r${position}${extras}}}`;
}

// Every recognised token in a body, in document order.
export function parseFieldTokens(body) {
  const tokens = [];
  for (const match of String(body || "").matchAll(fieldTokenRegex())) {
    const token = toToken(match);
    if (token) tokens.push(token);
  }
  return tokens;
}

// Splits a text run into strings and token objects so renderers can draw tokens as chips.
export function splitFieldTokens(text) {
  const source = String(text ?? "");
  const parts = [];
  let cursor = 0;
  for (const token of parseFieldTokens(source)) {
    if (token.index > cursor) parts.push(source.slice(cursor, token.index));
    parts.push(token);
    cursor = token.index + token.raw.length;
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

// Body + recipients in position order ([{ role }]) -> first problem as a user-facing message, or null.
export function validateFieldTokens(body, recipients) {
  const list = Array.isArray(recipients) ? recipients : [];
  for (const match of String(body || "").matchAll(new RegExp(UNASSIGNED_SOURCE, "g"))) {
    if (DETECTED_TYPES.has(match[1].toLowerCase())) {
      return `${match[0]} has no recipient. Use the form {{${match[1].toLowerCase()}, r1}}.`;
    }
  }
  for (const token of parseFieldTokens(body)) {
    const recipient = list[token.position - 1];
    if (!recipient) {
      const count = list.length === 1 ? "1 recipient is" : `${list.length} recipients are`;
      return `${token.raw} refers to recipient ${token.position}, but only ${count} added.`;
    }
    if (recipient.role !== "signer") {
      const role = recipient.role === "cc" ? "a CC" : `an ${recipient.role}`;
      return `${token.raw} is assigned to recipient ${token.position}, who is ${role}. Only signers can have fields.`;
    }
  }
  return null;
}
