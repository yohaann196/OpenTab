import Link from "next/link";
import { getSession } from "@/lib/session";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";

const NAV = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
];

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-1.5 text-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <Button asChild size="sm">
              <Link href="/tab">Tab room</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Run a tournament</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
