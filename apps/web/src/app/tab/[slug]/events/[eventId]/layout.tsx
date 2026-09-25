import { getEvent } from "@opentab/core";
import { FORMAT_LABELS } from "@opentab/engine";
import { notFound } from "next/navigation";
import { SubNav } from "@/components/tab/sub-nav";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const ev = await getEvent(db(), eventId).catch(() => null);
  if (!ev) notFound();
  const base = `/tab/${slug}/events/${eventId}`;
  const isCongress = ev.format === "congress";
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{ev.abbreviation}</Badge>
          <h1 className="text-xl font-semibold tracking-tight">{ev.name}</h1>
          <span className="text-sm text-fg-muted">{FORMAT_LABELS[ev.format]}</span>
        </div>
        <SubNav
          items={[
            { href: base, label: isCongress ? "Sessions" : "Rounds", exact: false },
            { href: `${base}/standings`, label: "Standings" },
            ...(isCongress ? [] : [{ href: `${base}/elims`, label: "Break & bracket" }]),
            { href: `/tab/${slug}/setup/events/${eventId}`, label: "Settings" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
