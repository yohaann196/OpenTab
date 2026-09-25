import { getPrefSheet } from "@opentab/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTokenActor } from "@/lib/session";
import { PrefSheet } from "./pref-sheet";

export const dynamic = "force-dynamic";

export default async function PrefsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTokenActor(token);
  if (!t || t.resolved.subjectType !== "entry") notFound();
  const sheet = await getPrefSheet(db(), t.resolved.subjectId).catch(() => null);
  if (!sheet || sheet.settings.prefs === "none") notFound();
  return (
    <div className="space-y-4">
      <Link
        href={`/p/${token}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Judge preferences</h1>
        <p className="text-sm text-fg-muted">
          {sheet.settings.prefs === "ordinal"
            ? "Drag judges into the order you'd most like them. The top of the list is your first choice."
            : "Sort each judge into a tier. Stay within each tier's limits."}{" "}
          Your own school&apos;s judges and conflicts are excluded automatically.
        </p>
      </div>
      <PrefSheet
        token={token}
        mode={sheet.settings.prefs}
        strikesAllowed={sheet.settings.strikes}
        tiers={sheet.settings.tiers}
        judges={sheet.judges}
        initial={sheet.prefs}
        submittedAt={sheet.submittedAt?.toISOString() ?? null}
      />
    </div>
  );
}
