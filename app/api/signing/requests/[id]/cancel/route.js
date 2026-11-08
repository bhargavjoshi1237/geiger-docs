import { fail, ok, readJson } from "@/lib/server/http";
import {
  canForceClose,
  cancelSigning,
  isSigningConfigured,
  requireSigningRequest,
  signingNotConfigured,
} from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancels an open request: { reason?, force? }. reason is passed to Documenso; force: true (document owner only, works
// without Documenso) closes it locally even when Documenso can't be reached. -> { request }; 409 once it's closed.
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid request body.", "invalid_body");
  const force = body.force === true;
  if (!(force ? canForceClose() : isSigningConfigured())) return signingNotConfigured();
  const guard = await requireSigningRequest(id, { need: "edit" });
  if (guard.error) return guard.error;
  const result = await cancelSigning({
    requestId: guard.requestId,
    reason: body.reason,
    actorId: guard.user.id,
    force,
    access: guard.access,
  });
  if (result.error) return result.error;
  return ok({ request: result.request });
}
