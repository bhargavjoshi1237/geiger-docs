import "server-only";
import { createServerNotifier } from "@geiger/notify/server";
import { adminClient } from "@/lib/server/supabase";
import { DOCS_NOTIFICATION_TYPES } from "@/lib/notifications/types";

// Server-side notification sends on the service role (webhooks, route handlers); no-ops without SUPABASE_SERVICE_ROLE_KEY.

const SIGNING_TYPES = new Set(["signed", "completed", "declined", "cancelled", "expired"]);

// Events the signer caused carry their name as the actor; the rest show the type icon.
const SIGNER_ACTOR_TYPES = new Set(["signed", "declined", "expired"]);

let notifier = null;

function serverNotifier() {
  const admin = adminClient();
  if (!admin) return null;
  if (!notifier) notifier = createServerNotifier({ supabase: admin, app: "docs", types: DOCS_NOTIFICATION_TYPES });
  return notifier;
}

// Optional context so org-scoped bells and unread counts include the notification.
async function projectOrganizationId(projectId) {
  const { data, error } = await adminClient()
    .schema("public")
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) console.error("[docs.notify.signing] organization", error.message);
  return data?.organization_id ?? null;
}

// Signing lifecycle -> the given users. type: signed | completed | declined | cancelled | expired. Never throws.
export async function notifySigningEvent({
  type,
  projectId,
  documentId,
  documentTitle,
  recipientsUserIds,
  recipientName,
} = {}) {
  try {
    if (!SIGNING_TYPES.has(type)) {
      console.error("[docs.notify.signing] unknown type", type);
      return;
    }
    const userIds = [...new Set((recipientsUserIds || []).filter(Boolean))];
    if (!userIds.length || !documentId) return;
    const sender = serverNotifier();
    if (!sender) return;
    const organizationId = projectId ? await projectOrganizationId(projectId) : null;
    const actor = recipientName && SIGNER_ACTOR_TYPES.has(type) ? { name: recipientName } : undefined;
    await sender.notifyUsers(userIds, `docs.signing.${type}`, {
      organizationId,
      projectId,
      actor,
      data: { projectId, documentId, documentTitle, recipientName },
    });
  } catch (error) {
    console.error("[docs.notify.signing]", error?.message ?? error);
  }
}
