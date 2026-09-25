"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Client-side so marketing pages stay statically rendered and cacheable. */
export function HeaderAuth() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <div className="h-8 w-36" aria-hidden />;
  if (data) {
    return (
      <Button asChild size="sm">
        <Link href="/tab">Tab room</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/sign-up">Run a tournament</Link>
      </Button>
    </>
  );
}
