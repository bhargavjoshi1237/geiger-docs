import Link from "next/link";
import { Eye } from "lucide-react";
import ThemeToggle from "@geiger/ui/theme-toggle";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Slim chrome for the public read-only document page: brand bar, content column, muted footer.
export function PublicDocumentShell({ children }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/logo1.svg`} alt="" className="geiger-logo h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              Geiger Docs
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-text-tertiary sm:inline-flex">
              <Eye className="h-3.5 w-3.5" />
              Read-only
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Shared with{" "}
          <Link href="/" className="font-medium text-text-secondary hover:text-foreground">
            Geiger Docs
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default PublicDocumentShell;
