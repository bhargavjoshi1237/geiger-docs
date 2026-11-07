import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FileText,
  FolderOpen,
  History,
  MessageSquare,
  Share2,
} from "lucide-react";
import Footer from "@geiger/ui/footer";
import { SuiteHeader } from "@geiger/ui/suite-header";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Docs - Geiger Studio",
  description: "Write, organize and share your team's documents.",
};

const features = [
  { title: "Documents", description: "Write in Markdown with a live preview, and track every document from draft to published.", icon: FileText },
  { title: "Collections", description: "Group related documents so the right ones are always a click away.", icon: FolderOpen },
  { title: "Templates", description: "Start from reusable templates for the documents your team writes again and again.", icon: BookOpen },
  { title: "Version history", description: "Every save is a version. Preview any of them and restore it in one click.", icon: History },
  { title: "Sharing", description: "Keep a document in the workspace, publish a read-only link, or invite specific people.", icon: Share2 },
  { title: "Comments", description: "Discuss a document right next to it, with commenters who can't change the text.", icon: MessageSquare },
];

const faqs = [
  { question: "What is Geiger Docs?", answer: "The document workspace of the Geiger suite: write, organize, version and share your team's documents in one place." },
  { question: "How is it different from Geiger Notes?", answer: "Notes is a free-form canvas for thinking. Docs holds the structured documents that come out of it, ready to review, publish and share." },
  { question: "Can I share a document outside my team?", answer: "Yes. Turn on a public link for a read-only page anyone can open, or invite specific people as viewers, commenters or editors." },
  { question: "Is signing on the roadmap?", answer: "Yes. Sending documents for signature with an audit trail is planned as the next major area." },
];

function FaqItem({ question, answer }) {
  return (
    <details className="group border-b border-border py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium text-foreground">
        {question}
        <span className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
    </details>
  );
}

function PrimaryLink({ children }) {
  return (
    <Link
      href="/project"
      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export default function DocsLandingPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground">
      <SuiteHeader
        label="Geiger Docs"
        logoSrc={`${BASE_PATH}/logo1.svg`}
        homeHref={BASE_PATH || "/"}
        dashboardHref="/project"
      />

      <main className="relative z-10 flex flex-1 flex-col pt-16 sm:pt-20">
        <section className="mx-auto mb-10 mt-10 w-full max-w-6xl px-4 sm:mt-16 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
              Write, organize and share your team&apos;s documents.
            </h1>
            <p className="mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
              Geiger Docs brings documents, collections, templates, version history and
              sharing into one focused workspace, right next to the rest of your suite.
            </p>
            <PrimaryLink>Continue to Docs</PrimaryLink>
          </div>
        </section>

        <section id="features" className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-sm border border-border bg-surface-subtle p-5">
              <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-16 flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row">
          <div className="md:w-[35%]">
            <h2 className="text-3xl font-semibold text-foreground">Questions & Answers</h2>
          </div>
          <div className="md:w-[65%]">
            {faqs.map((faq) => (
              <FaqItem key={faq.question} {...faq} />
            ))}
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
            <h2 className="mb-8 text-4xl font-black tracking-tight text-foreground">TRY GEIGER NOW</h2>
            <PrimaryLink>Open Docs</PrimaryLink>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
