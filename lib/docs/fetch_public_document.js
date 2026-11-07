// Server-side anonymous read of one public document for the ISR /d/[id] route; never throws, null on any miss.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVALIDATE = 10;

// One PostgREST row from the docs schema, or null on a missing row / failed request.
async function readRow(url, key, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "docs",
    },
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function fetchPublicDocument(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !UUID.test(String(id || ""))) return null;
  try {
    const doc = await readRow(
      url,
      key,
      `documents?id=eq.${encodeURIComponent(id)}&share_mode=eq.public&deleted_at=is.null&select=id,project_id,title,body,status,updated_at&limit=1`,
    );
    if (!doc) return null;

    // The project can switch public links off in Settings; no settings row means the default (on).
    if (doc.project_id) {
      if (!UUID.test(String(doc.project_id))) return null;
      const settings = await readRow(
        url,
        key,
        `settings?project_id=eq.${encodeURIComponent(doc.project_id)}&select=allow_public_links&limit=1`,
      );
      if (settings && settings.allow_public_links === false) return null;
    }

    return {
      id: doc.id,
      title: doc.title || "Untitled",
      body: doc.body ?? "",
      status: doc.status ?? "Draft",
      updatedAt: doc.updated_at ?? null,
    };
  } catch (err) {
    console.error("[docs.d/:id] public read failed", err);
    return null;
  }
}
