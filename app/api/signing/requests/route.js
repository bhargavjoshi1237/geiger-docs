import { fail, ok, readJson } from "@/lib/server/http";
import { requireDocument } from "@/lib/server/documents";
import { isSigningConfigured, sendForSignature, signingNotConfigured } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a document for signature: 201 { request }; 409 when one is open or it's already signed; 502 when Documenso fails.
export async function POST(request) {
  if (!isSigningConfigured()) return signingNotConfigured();
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid request body.", "invalid_body");
  const guard = await requireDocument(body.documentId, { need: "edit" });
  if (guard.error) return guard.error;
  const result = await sendForSignature({ document: guard.document, user: guard.user, input: body });
  if (result.error) return result.error;
  return ok({ request: result.request }, 201);
}
