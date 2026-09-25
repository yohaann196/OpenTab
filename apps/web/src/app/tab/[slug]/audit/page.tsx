import { requireTournamentBySlug } from "@opentab/core";
import { auditLog } from "@opentab/db";
import { desc, eq } from "drizzle-orm";
import { Activity } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const rows = await db()
    .select({
      id: auditLog.id,
      summary: auditLog.summary,
      actor: auditLog.actorLabel,
      action: auditLog.action,
      at: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.tournamentId, t.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(500);
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = r.at.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: t.timezone,
    });
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Every change in the tab room: who did what, and when. Draw changes can be undone from each round's History tab."
      />
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" />
      ) : (
        [...byDay.entries()].map(([day, items]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-semibold text-fg-muted">{day}</h2>
            <ol className="divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[6rem_1fr_12rem] sm:items-center"
                >
                  <time className="text-xs tabular text-fg-subtle" dateTime={r.at.toISOString()}>
                    {r.at.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                      timeZone: t.timezone,
                    })}
                  </time>
                  <span>{r.summary}</span>
                  <span className="truncate text-xs text-fg-muted sm:text-right">{r.actor}</span>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
