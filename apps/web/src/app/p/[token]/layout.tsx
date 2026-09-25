import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTokenActor } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your tournament",
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTokenActor(token);
  if (!t) notFound();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href={`/p/${token}`} className="flex min-w-0 items-center gap-2">
            <LogoMark className="size-6" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">
                {t.resolved.tournamentName}
              </span>
              <span className="block truncate text-xs leading-tight text-fg-muted">
                {t.resolved.subjectType === "judge" ? "Judge" : "Entry"} · {t.resolved.name}
              </span>
            </span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-5">
        {children}
      </main>
      <footer className="mx-auto flex max-w-2xl items-center gap-1.5 px-4 pb-8 text-xs text-fg-subtle">
        <KeyRound className="size-3.5" aria-hidden /> This is your private link — don&apos;t share
        it. Lost it? Ask the tab room.
      </footer>
    </div>
  );
}
