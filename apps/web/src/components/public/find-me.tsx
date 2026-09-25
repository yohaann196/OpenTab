"use client";

import type { SnapshotDebate } from "@opentab/core";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { DebateCard } from "./debate-card";

type Hit = {
  snapshot: {
    id: string;
    label: string;
    eventAbbr: string;
    eventName: string;
    sideLabels: [string, string] | null;
    format: string;
  };
  debate: SnapshotDebate;
  matched: string;
};

/** "Find me": type your name, code, school or judge name and see your room. */
export function FindMe({ slug }: { slug: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`opentab:findme:${slug}`);
      if (saved) setQ(saved);
    } catch {}
  }, [slug]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/public/t/${slug}/find?q=${encodeURIComponent(q.trim())}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setHits((await res.json()).results);
        localStorage.setItem(`opentab:findme:${slug}`, q.trim());
      } catch {}
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, slug]);
  return (
    <section className="space-y-3" aria-labelledby="findme">
      <h2 id="findme" className="text-lg font-semibold tracking-tight">
        Find your round
      </h2>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Your name, team code, school, or judge name"
          className="h-12 rounded-xl pl-11 text-base"
          aria-label="Search pairings"
        />
        {loading && (
          <Loader2
            className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-subtle"
            aria-hidden
          />
        )}
      </div>
      {hits && (
        <div aria-live="polite">
          {hits.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No match in the current pairings. Check the spelling, or the round may not be out yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={`${h.snapshot.id}-${h.debate.id}`} className="space-y-1">
                  <Link
                    href={`/t/${slug}/pairings/${h.snapshot.id}#d-${h.debate.id}`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {h.snapshot.eventAbbr} · {h.snapshot.label}
                  </Link>
                  <ul>
                    <DebateCard
                      d={h.debate}
                      sideLabels={h.snapshot.sideLabels}
                      isCongress={h.snapshot.format === "congress"}
                      highlight
                    />
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
