import { NextResponse } from "next/server";
import { notFound } from "@/lib/server/http";
import {
  SIGNING_FILE_KINDS,
  isSigningConfigured,
  requireSigningRequest,
  signingFileUrl,
  signingNotConfigured,
} from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// kind = signed | certificate | audit -> 302 to a 60-second signed URL in the private docs-signing bucket.
export async function GET(request, { params }) {
  if (!isSigningConfigured()) return signingNotConfigured();
  const { id, kind } = await params;
  if (!SIGNING_FILE_KINDS.includes(kind)) return notFound("File not found.");
  const guard = await requireSigningRequest(id, { need: "read" });
  if (guard.error) return guard.error;
  const result = await signingFileUrl({ requestId: guard.requestId, kind });
  if (result.error) return result.error;
  const response = NextResponse.redirect(result.url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
