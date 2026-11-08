import { ok } from "@/lib/server/http";
import { isSigningConfigured, requireSigningRequest, signingNotConfigured, syncSigningRequest } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Refreshes a request from Documenso and rewrites the document's signing status (editors): { request }.
export async function POST(request, { params }) {
  if (!isSigningConfigured()) return signingNotConfigured();
  const { id } = await params;
  const guard = await requireSigningRequest(id, { need: "edit" });
  if (guard.error) return guard.error;
  const result = await syncSigningRequest({ requestId: guard.requestId, actorId: guard.user.id });
  if (result.error) return result.error;
  return ok({ request: result.request });
}
