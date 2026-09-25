import { Compass } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md space-y-6 text-center">
        <Logo className="justify-center" />
        <Compass className="mx-auto size-10 text-brand" aria-hidden />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
          <p className="text-fg-muted">
            The link may be mistyped, the round may not be published yet, or a private link may have
            been reset by the tab room.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <Link href="/tournaments">Find a tournament</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
