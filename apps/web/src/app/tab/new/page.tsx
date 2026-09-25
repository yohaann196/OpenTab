import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/ui/misc";
import { NewTournamentWizard } from "./wizard";

export const metadata: Metadata = { title: "New tournament" };

export default function NewTournamentPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface/70">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo href="/tab" />
          <Link href="/tab" className="text-sm text-fg-muted hover:text-fg">
            Cancel
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
        <PageHeader
          title="New tournament"
          description="Three quick steps. Everything can be changed later."
        />
        <NewTournamentWizard />
      </main>
    </div>
  );
}
