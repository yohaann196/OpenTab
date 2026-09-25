"use client";

import { Mic, Trash2 } from "lucide-react";
import { useState } from "react";
import { addSpeechViaLink, removeSpeechViaLink } from "@/app/p/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

export function ChamberTracker({
  token,
  pairingId,
  entries,
  queue,
  speeches,
}: {
  token: string;
  pairingId: string;
  entries: { id: string; code: string; name: string }[];
  queue: { entryId: string; seat: number; speeches: number; lastSpoke: number }[];
  speeches: {
    id: string;
    entryId: string;
    seq: number;
    legislation: string | null;
    stance: string | null;
  }[];
}) {
  const { exec, pending } = useAction();
  const [legislation, setLegislation] = useState(speeches.at(-1)?.legislation ?? "");
  const [stance, setStance] = useState<"aff" | "neg">(
    speeches.at(-1)?.stance === "aff" ? "neg" : "aff",
  );
  const name = (id: string) => entries.find((e) => e.id === id)?.code ?? "?";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg-muted">
          Speaker queue (precedence, then recency)
        </h2>
        <div className="grid gap-2 rounded-2xl border border-border bg-surface p-3 shadow-soft">
          <Input
            value={legislation}
            onChange={(e) => setLegislation(e.target.value)}
            placeholder="Current legislation"
            aria-label="Current legislation"
          />
          <NativeSelect
            value={stance}
            onChange={(e) => setStance(e.target.value as "aff" | "neg")}
            aria-label="Next speech side"
          >
            <option value="aff">Next speech: affirmation</option>
            <option value="neg">Next speech: negation</option>
          </NativeSelect>
        </div>
        <ol className="space-y-1.5">
          {queue.map((q, i) => (
            <li
              key={q.entryId}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-soft",
                i === 0 && "border-brand/40 bg-brand-soft/60",
              )}
            >
              <span className="w-5 text-sm tabular text-fg-subtle">{i + 1}</span>
              <span className="flex-1 font-medium">{name(q.entryId)}</span>
              <Badge>{q.speeches} spoken</Badge>
              <Button
                size="sm"
                variant={i === 0 ? "primary" : "secondary"}
                loading={pending}
                onClick={() =>
                  exec(
                    async () => {
                      const res = await addSpeechViaLink(token, pairingId, {
                        entryId: q.entryId,
                        legislation,
                        stance,
                      });
                      if (res.ok) setStance((s) => (s === "aff" ? "neg" : "aff"));
                      return res;
                    },
                    { success: `${name(q.entryId)} is speaking` },
                  )
                }
              >
                <Mic /> Speaks
              </Button>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg-muted">Speech log ({speeches.length})</h2>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
          {speeches.length === 0 && <li className="p-4 text-sm text-fg-muted">No speeches yet.</li>}
          {[...speeches].reverse().map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-6 tabular text-fg-subtle">{s.seq}</span>
              <span className="flex-1">
                <span className="font-medium">{name(s.entryId)}</span>
                <span className="block text-xs text-fg-muted">
                  {s.stance === "aff" ? "Affirmation" : s.stance === "neg" ? "Negation" : ""}{" "}
                  {s.legislation ? `· ${s.legislation}` : ""}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove speech"
                onClick={() => exec(() => removeSpeechViaLink(token, pairingId, s.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
