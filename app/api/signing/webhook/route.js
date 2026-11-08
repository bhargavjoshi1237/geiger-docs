import { fail, readJson } from "@/lib/server/http";
import { verifyWebhookSecret } from "@/lib/server/documenso";
import { applyWebhookEvent, isSigningConfigured, signingNotConfigured } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024 * 1024;

// Documenso team webhook: shared secret in X-Documenso-Secret, idempotent per event; slow work runs after the reply.
export async function POST(request) {
  if (!isSigningConfigured()) return signingNotConfigured();
  if (!verifyWebhookSecret(request.headers.get("x-documenso-secret"))) {
    return fail(401, "Invalid webhook secret.", "invalid_secret");
  }
  const body = await readJson(request, MAX_BODY_BYTES);
  if (!body) return fail(400, "Invalid webhook body.", "invalid_body");
  return applyWebhookEvent(body);
}
