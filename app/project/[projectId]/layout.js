// Server entry for the project workspace; the chrome is a client component and segment config can't live there.
import ProjectWorkspaceLayout from "./workspace_layout";

// Nothing here reads the request, so the shell prerenders and data resolves client-side.
export const dynamic = "force-static";

export default function ProjectLayout({ children }) {
  return <ProjectWorkspaceLayout>{children}</ProjectWorkspaceLayout>;
}
