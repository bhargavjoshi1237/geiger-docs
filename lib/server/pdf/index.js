import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { DocumentPdf } from "./document";
import { registerFonts } from "./fonts";

// Markdown -> PDF for Documenso: fields are {{type, rN}} tokens Documenso detects in the text and turns into fields.

const RENDER_TIMEOUT_MS = 30_000;

// Signers in position order; a missing or invalid position falls back to the recipient's place in the list.
function signersOf(recipients) {
  const list = Array.isArray(recipients) ? recipients : [];
  return list
    .map((recipient, index) => {
      const position = Number(recipient?.position);
      return {
        position: Number.isInteger(position) && position > 0 ? position : index + 1,
        name: String(recipient?.name ?? "").trim(),
        email: String(recipient?.email ?? "").trim(),
        role: recipient?.role,
      };
    })
    .filter((recipient) => recipient.role === "signer")
    .sort((a, b) => a.position - b.position);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[docs.pdf] Rendering timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// { title, body, recipients: [{ position, name, email, role }], signaturePage } -> PDF Buffer; throws only on render failure.
export async function renderDocumentPdf({ title, body, recipients, signaturePage = true } = {}) {
  registerFonts();
  const element = createElement(DocumentPdf, {
    title: String(title ?? "").trim() || "Untitled document",
    body: String(body ?? ""),
    signers: signaturePage ? signersOf(recipients) : [],
  });
  return withTimeout(renderToBuffer(element), RENDER_TIMEOUT_MS);
}
