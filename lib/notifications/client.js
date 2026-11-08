"use client";

import { createNotifier } from "@geiger/notify";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/supabase/components/docs-client";
import { DOCS_NOTIFICATION_TYPES } from "./types";

const EXCERPT_LENGTH = 140;

let notifier = null;

// Sends as the signed-in user, so notify.send only reaches people who share an org with them.
function sessionNotifier() {
  if (!isSupabaseConfigured()) return null;
  if (!notifier) notifier = createNotifier(createClient(), { app: "docs", types: DOCS_NOTIFICATION_TYPES });
  return notifier;
}

const lower = (value) => String(value || "").trim().toLowerCase();

function excerpt(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : flat;
}

function documentData(document) {
  return { projectId: document?.projectId, documentId: document?.id, documentTitle: document?.title };
}

async function projectOrganizationId(projectId) {
  if (!projectId) return null;
  const { data, error } = await createClient()
    .schema("public")
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.organization_id ?? null;
}

// Org directory lookup (public.organization_members); null when the email isn't an org member.
async function orgMemberId(organizationId, email) {
  const { data, error } = await createClient()
    .schema("public")
    .rpc("organization_members", { p_org: organizationId });
  if (error) throw error;
  const address = lower(email);
  return (data || []).find((member) => lower(member.email) === address)?.user_id ?? null;
}

// Comment posted -> the document's creator, never yourself. Fire-and-forget: never throws or toasts.
export async function notifyCommentCreated({ document, comment, actorId }) {
  try {
    const creator = document?.createdBy;
    const sender = sessionNotifier();
    if (!sender || !creator || creator === actorId) return;
    await sender.notifyUser(creator, "docs.comment.created", {
      projectId: document.projectId,
      data: { ...documentData(document), commentId: comment?.id, excerpt: excerpt(comment?.body) },
    });
  } catch (error) {
    console.error("[docs.notify.comment]", error?.message ?? error);
  }
}

// Member added -> the invited person when their email resolves to an org member, never yourself.
export async function notifyDocumentShared({ document, email, role, actor, organizationId }) {
  try {
    const sender = sessionNotifier();
    if (!sender || !email || lower(email) === lower(actor?.email)) return;
    const orgId = organizationId || (await projectOrganizationId(document?.projectId));
    if (!orgId) return;
    const userId = await orgMemberId(orgId, email);
    if (!userId || userId === actor?.id) return;
    await sender.notifyUser(userId, "docs.document.shared", {
      organizationId: orgId,
      projectId: document.projectId,
      data: { ...documentData(document), role },
    });
  } catch (error) {
    console.error("[docs.notify.shared]", error?.message ?? error);
  }
}
