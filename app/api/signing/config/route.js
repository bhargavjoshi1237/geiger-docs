import { getSessionUser } from "@/lib/server/supabase";
import { ok, unauthorized } from "@/lib/server/http";
import { isSigningConfigured } from "@/lib/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether signing can be used here: Documenso env + the service-role key are both set.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return ok({ configured: isSigningConfigured() });
}
