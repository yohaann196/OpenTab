import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <main id="main" className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-slide-up">{children}</div>
        </div>
        <p className="text-xs text-fg-subtle">
          Judging today? You don&apos;t need an account — use the private link from your tournament.{" "}
          <Link href="/tournaments" className="text-brand hover:underline">
            Find a tournament
          </Link>
        </p>
      </main>
      <aside
        className="relative hidden overflow-hidden border-l border-border bg-surface-2 lg:block"
        aria-hidden
      >
        <div className="bg-grid absolute inset-0 opacity-70" />
        <div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md space-y-4">
            <p className="text-2xl font-medium leading-snug tracking-tight text-balance">
              &ldquo;Round 5 paired, judged and published in under a minute — and I could see
              exactly why every debate was paired the way it was.&rdquo;
            </p>
            <footer className="text-sm text-fg-muted">
              The experience we&apos;re building for every tab room.
            </footer>
          </blockquote>
        </div>
      </aside>
    </div>
  );
}
