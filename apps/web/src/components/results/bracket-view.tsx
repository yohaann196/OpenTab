import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BracketData {
  breakSize: number;
  champion: string | null;
  rounds: {
    id: string;
    label: string;
    status: string;
    matches: {
      pairingId: string;
      slot: number;
      bye: boolean;
      winnerId: string | null;
      entries: {
        entryId: string;
        code: string;
        seed: number | null;
        side: "A" | "B" | null;
        ballots: number;
      }[];
    }[];
  }[];
}

/** Visual single-elimination bracket; scrolls horizontally on phones. */
export function BracketView({
  data,
  sideLabels,
}: {
  data: BracketData;
  sideLabels?: [string, string] | null;
}) {
  if (data.rounds.length === 0) return null;
  return (
    <div className="space-y-4">
      {data.champion && (
        <div className="flex items-center gap-3 rounded-xl border border-[oklch(0.8_0.12_85)]/50 bg-[oklch(0.97_0.04_90)] p-4 dark:bg-[oklch(0.3_0.06_85)]">
          <Crown className="size-6 text-[oklch(0.7_0.15_80)]" aria-hidden />
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Champion
            </div>
            <div className="text-lg font-semibold">{data.champion}</div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {data.rounds.map((r, ri) => (
            <div key={r.id} className="flex w-60 flex-col">
              <div className="mb-3 text-sm font-semibold">{r.label}</div>
              <ol
                className="flex flex-1 flex-col justify-around gap-3"
                style={{ paddingTop: ri ? `${2 ** ri * 12}px` : 0 }}
              >
                {r.matches.map((m) => (
                  <li
                    key={m.pairingId}
                    className="overflow-hidden rounded-lg border border-border bg-surface shadow-soft"
                  >
                    {m.entries.map((e) => {
                      const won = m.winnerId === e.entryId;
                      const lost = m.winnerId && !won;
                      return (
                        <div
                          key={e.entryId}
                          className={cn(
                            "flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0",
                            won && "bg-success-soft font-semibold",
                            lost && "text-fg-subtle",
                          )}
                        >
                          <span className="w-5 text-right text-xs tabular text-fg-subtle">
                            {e.seed ?? ""}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{e.code}</span>
                          {sideLabels && e.side && !m.bye && (
                            <span className="text-[10px] uppercase text-fg-subtle">
                              {e.side === "A" ? sideLabels[0] : sideLabels[1]}
                            </span>
                          )}
                          {!m.bye && m.winnerId && (
                            <span className="text-xs tabular">{e.ballots}</span>
                          )}
                        </div>
                      );
                    })}
                    {m.bye && <div className="px-3 py-1 text-xs text-fg-subtle">Bye</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
