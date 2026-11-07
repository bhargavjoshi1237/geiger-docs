import { toast } from "sonner";
import { publicDocumentUrl } from "@/components/internal/screens/documents/constants";

// "Ada Lovelace" -> "AL", "ada@acme.io" -> "AD"; used for Avatar fallbacks.
export function initials(value) {
  const text = String(value || "").split("@")[0].trim();
  if (!text) return "?";
  const parts = text.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : text.slice(0, 2);
  return letters.toUpperCase();
}

// Copies the read-only public link and reports the outcome.
export async function copyPublicLink(id) {
  try {
    await navigator.clipboard.writeText(publicDocumentUrl(id));
    toast.success("Public link copied");
    return true;
  } catch {
    toast.error("Couldn't copy the link.");
    return false;
  }
}
