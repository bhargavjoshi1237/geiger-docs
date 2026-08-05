import { redirect } from "next/navigation";
import { DOCS_APP_URL } from "@/lib/app-url";

// The workspace moved out of this repo.
//
// Geiger Docs is now a Documenso fork (geiger-docs-app) deployed on its own
// origin; this project keeps the marketing site and the suite shell. The
// placeholder workspace that used to live here is retired, and the route
// forwards so existing links and bookmarks still land somewhere useful.
export default function HomePage() {
  redirect(DOCS_APP_URL);
}
