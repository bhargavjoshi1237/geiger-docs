import Link from "next/link";
import Image from "next/image";
import { ArrowRight, FileText, FolderOpen, BookOpen, History, Share2, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";

const assetPrefix = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Docs - Geiger Studio",
  description: "Your team's knowledge base, organized.",
};

const features = [
  { title: "Documents", description: "Write and edit rich documents with collaborative formatting tools.", icon: FileText },
  { title: "Collections", description: "Group related documents into organized collections for easy navigation.", icon: FolderOpen },
  { title: "Templates", description: "Start quickly with reusable templates for common document types.", icon: BookOpen },
  { title: "Version History", description: "Track every change and restore any previous version of a document.", icon: History },
  { title: "Sharing & Export", description: "Share documents with teammates or export them in multiple formats.", icon: Share2 },
  { title: "Permissions", description: "Control who can view, comment, or edit each document and collection.", icon: ShieldCheck },
];

const faqs = [
  { question: "What is Geiger Docs?", answer: "Geiger Docs is a documentation workspace for creating, organizing, and sharing your team's knowledge." },
  { question: "Where is the workspace?", answer: "The full Docs workspace lives at /home once you're signed in." },
  { question: "Can I organize docs into folders?", answer: "Yes. Collections let you group documents hierarchically and apply shared permissions." },
  { question: "Is it part of Geiger Studio?", answer: "Yes. Docs is one product in the Geiger Studio suite, sharing authentication with other tools." },
];

function FaqItem({ question, answer }) {
  return (
    <details className="group border-b border-border py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium text-foreground transition-colors hover:text-foreground">
        {question}
        <span className="mt-0.5 text-foreground0 transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
    </details>
  );
}

function Footer() {
  return (
    <footer className="relative z-30 border-t border-border/50 bg-background px-6 pb-8 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Image src={`${assetPrefix}/logo1.svg`} alt="Logo" width={20} height={20} />
              <span className="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-base font-bold tracking-tight text-transparent">
                Geiger Studios
              </span>
            </div>
            <p className="max-w-sm text-sm text-foreground0">Built to Manage. Designed to Create.</p>
          </div>
          <div>
            <h4 className="mb-4 font-bold text-foreground">Product</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/org" className="transition-colors hover:text-foreground">Workspace</Link></li>
              <li><Link href="#features" className="transition-colors hover:text-foreground">Features</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-bold text-foreground">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#" className="transition-colors hover:text-foreground">About</Link></li>
              <li><Link href="#" className="transition-colors hover:text-foreground">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 text-sm text-foreground0 md:flex-row">
          <p>&copy; {new Date().getFullYear()} Geiger Studios. All rights reserved.</p>
        </div>
      </div>
      <div className="relative z-0 mt-10 flex justify-center">
        <h1 className="pointer-events-none select-none text-[13vw] font-bold leading-none tracking-tight text-foreground/5">
          GEIGER STUDIO
        </h1>
      </div>
    </footer>
  );
}

export default function DocsLandingPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground selection:bg-indigo-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <SiteHeader productName="Docs" />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 flex w-full max-w-6xl items-start justify-start px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">
              Your team's knowledge base, organized.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Geiger Docs brings documents, collections, templates, and version history into a focused workspace for your team's knowledge.
            </p>
            <Link
              href="/org"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white sm:text-base"
            >
              Continue to Docs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section id="features" className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-sm border border-border bg-[#191919] p-5">
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-16 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-white">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            {faqs.map((faq) => <FaqItem key={faq.question} {...faq} />)}
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <h2 className="mb-8 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              TRY GEIGER NOW
            </h2>
            <Link
              href="/org"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
            >
              Open Docs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
