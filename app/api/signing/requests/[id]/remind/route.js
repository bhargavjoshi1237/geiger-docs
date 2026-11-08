import { fail, ok, readJson } from "@/lib/server/http";
import { isSigningConfigured, remindSigning, requireSigningRequest, signingNotConfigured } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-sends the signing email: { recipientIds? } (our recipient ids); defaults to everyone still due to sign.
export async function POST(request, { params }) {
  if (!isSigningConfigured()) return signingNotConfigured();
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid request body.", "invalid_body");
  const guard = await requireSigningRequest(id, { need: "edit" });
  if (guard.error) return guard.error;
  const result = await remindSigning({ requestId: guard.requestId, recipientIds: body.recipientIds });
  if (result.error) return result.error;
  return ok({ ok: true });
}
