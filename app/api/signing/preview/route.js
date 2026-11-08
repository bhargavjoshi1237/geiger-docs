import { fail, readJson } from "@/lib/server/http";
import { requireDocument } from "@/lib/server/documents";
import { isSigningConfigured, renderSigningPreview, signingNotConfigured } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Content-Disposition with an ASCII fallback name plus the UTF-8 original.
function inlineDisposition(title) {
  const name = `${String(title || "Document").replace(/[\u0000-\u001f\u007f"\\/]+/g, "").trim() || "Document"}.pdf`;
  const ascii = name.replace(/[^\x20-\x7e]+/g, "").trim() || "Document.pdf";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// The saved document as the PDF recipients will sign, with the given recipients (positions follow array order).
export async function POST(request) {
  if (!isSigningConfigured()) return signingNotConfigured();
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid request body.", "invalid_body");
  const guard = await requireDocument(body.documentId, { need: "read" });
  if (guard.error) return guard.error;
  const result = await renderSigningPreview({ document: guard.document, recipients: body.recipients });
  if (result.error) return result.error;
  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": inlineDisposition(guard.document.title),
      "Cache-Control": "private, no-store",
    },
  });
}
