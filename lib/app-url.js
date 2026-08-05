// Where the Geiger Docs product actually lives.
//
// This repo is the marketing site and suite shell; the workspace itself is the
// Documenso fork in geiger-docs-app, deployed separately. Every "open the app"
// link goes through here so the destination is configurable per environment.
export const DOCS_APP_URL =
  process.env.NEXT_PUBLIC_DOCS_APP_URL || "https://docs.geiger.studio";
