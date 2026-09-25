"use client";

import {
  CONGRESS_TIEBREAK_KEYS,
  type EventConfig,
  type Format,
  presetFor,
  SPEAKER_TIEBREAK_KEYS,
  TEAM_TIEBREAK_KEYS,
  tiebreakLabel,
} from "@opentab/engine";
import { ArrowDown, ArrowUp, Braces, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { updateEventAction } from "@/app/tab/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/use-action";

type Obj = Record<string, unknown>;
const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc as Obj | undefined)?.[k], o);
function set<T>(o: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const clone = structuredClone(o) as Obj;
  let cur = clone;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Obj;
  cur[keys.at(-1)!] = value;
  return clone as T;
}

export function EventConfigEditor({
  slug,
  event,
  config: initial,
  pools,
  canEdit,
}: {
  slug: string;
  event: {
    id: string;
    name: string;
    abbreviation: string;
    format: Format;
    judgePoolId: string | null;
  };
  config: EventConfig;
  pools: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [config, setConfig] = useState<EventConfig>(initial);
  const [name, setName] = useState(event.name);
  const [abbr, setAbbr] = useState(event.abbreviation);
  const [poolId, setPoolId] = useState(event.judgePoolId ?? "");
  const [json, setJson] = useState<string | null>(null);
  const { exec, pending, findings } = useAction();
  const upd = (path: string, value: unknown) => setConfig((c) => set(c, path, value));
  const isCongress = config.format === "congress";

  const num = (
    path: string,
    label: string,
    help: string,
    opts: { min?: number; max?: number; step?: number } = {},
  ) => (
    <Field label={label} hint={help} htmlFor={path}>
      <Input
        id={path}
        type="number"
        disabled={!canEdit}
        value={String(get(config, path) ?? "")}
        min={opts.min}
        max={opts.max}
        step={opts.step ?? 1}
        onChange={(e) => upd(path, e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </Field>
  );
  const sel = (path: string, label: string, help: string, options: [string, string][]) => (
    <Field label={label} hint={help} htmlFor={path}>
      <NativeSelect
        id={path}
        disabled={!canEdit}
        value={String(get(config, path))}
        onChange={(e) => upd(path, e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
  const tog = (path: string, label: string, help: string) => (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-fg-muted">{help}</span>
      </span>
      <Switch
        checked={!!get(config, path)}
        disabled={!canEdit}
        onCheckedChange={(v) => upd(path, v)}
        aria-label={label}
      />
    </label>
  );

  const save = () =>
    exec(
      () =>
        updateEventAction(slug, event.id, {
          name,
          abbreviation: abbr,
          config,
          judgePoolId: poolId || null,
        }),
      { success: "Settings saved" },
    );

  return (
    <div className="space-y-6">
      {findings.length > 0 && (
        <Alert tone="danger" title="Some settings are invalid">
          <ul className="list-disc pl-4">
            {findings.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Event name" htmlFor="ev-name">
              <Input
                id="ev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Abbreviation" htmlFor="ev-abbr">
              <Input
                id="ev-abbr"
                value={abbr}
                onChange={(e) => setAbbr(e.target.value.toUpperCase())}
                maxLength={12}
                disabled={!canEdit}
              />
            </Field>
            <Field
              label="Judge pool"
              htmlFor="ev-pool"
              hint="Limit which judges can hear this event."
            >
              <NativeSelect
                id="ev-pool"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">All judges</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {isCongress
              ? num(
                  "prelimSessions",
                  "Prelim sessions",
                  "How many preliminary sessions chambers compete in.",
                  { min: 1, max: 8 },
                )
              : num("prelimRounds", "Prelim rounds", "Used for suggestions and the break.", {
                  min: 1,
                  max: 12,
                })}
          </CardContent>
        </Card>

        {isCongress ? (
          <Card>
            <CardHeader>
              <CardTitle>Chambers &amp; scoring</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {num(
                "chamberSize",
                "Target chamber size",
                "OpenTab sizes chambers to about this many legislators.",
                { min: 4, max: 40 },
              )}
              {num(
                "scorersPerChamber",
                "Scorers per chamber",
                "Judges scoring each chamber (plus the parliamentarian).",
                { min: 1, max: 9 },
              )}
              {num("speechPoints.min", "Speech points: min", "Lowest score for a single speech.", {
                min: 0,
                max: 10,
              })}
              {num("speechPoints.max", "Speech points: max", "Highest score for a single speech.", {
                min: 1,
                max: 10,
              })}
              {num(
                "ranksPerBallot",
                "Ranks per ballot",
                "How many legislators each scorer ranks.",
                { min: 1, max: 20 },
              )}
              {num(
                "advancePerChamber",
                "Advance per chamber",
                "How many from each chamber reach the next level.",
                { min: 1, max: 20 },
              )}
              <div className="space-y-3 sm:col-span-2">
                {tog(
                  "presidingOfficer.enabled",
                  "Score the presiding officer",
                  "Scorers give the PO points for the session.",
                )}
                {tog(
                  "parliamentarian",
                  "Parliamentarian ballot",
                  "The chair ranks the chamber too, used as a tiebreak.",
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Sides</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Side A label" htmlFor="sa">
                <Input
                  id="sa"
                  value={(config as { sideLabels: [string, string] }).sideLabels[0]}
                  onChange={(e) =>
                    upd("sideLabels", [
                      e.target.value,
                      (config as { sideLabels: [string, string] }).sideLabels[1],
                    ])
                  }
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Side B label" htmlFor="sb">
                <Input
                  id="sb"
                  value={(config as { sideLabels: [string, string] }).sideLabels[1]}
                  onChange={(e) =>
                    upd("sideLabels", [
                      (config as { sideLabels: [string, string] }).sideLabels[0],
                      e.target.value,
                    ])
                  }
                  disabled={!canEdit}
                />
              </Field>
              <div className="sm:col-span-2">
                {sel(
                  "sideMethod",
                  "How sides are decided",
                  "Flip locks sides opposite the previous round in even rounds. Balance evens out each team’s sides. Coin flip lets teams flip at the round (PF).",
                  [
                    ["flip", "Side-locked flips (LD / Policy)"],
                    ["balance", "Balance sides"],
                    ["coin_flip", "Coin flip at the round (PF)"],
                  ],
                )}
              </div>
              {num("teamSize", "Team size", "Competitors per entry.", { min: 1, max: 5 })}
              {num(
                "speakersPerTeam",
                "Speakers per round",
                "Competitors who speak in each debate.",
                { min: 1, max: 5 },
              )}
            </CardContent>
          </Card>
        )}

        {!isCongress && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Pairing</CardTitle>
                <CardDescription>
                  OpenTab finds the globally best pairing given these rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {num(
                  "pairing.presetRounds",
                  "Preset rounds",
                  "Rounds paired without results before power-matching starts.",
                  { min: 0, max: 10 },
                )}
                {sel("pairing.presetMethod", "Preset method", "How preset rounds are paired.", [
                  ["random", "Random"],
                  ["protected", "Protected (seeded high–low)"],
                  ["balanced", "Balanced seeds"],
                ])}
                {sel(
                  "pairing.powermatch",
                  "Power-matching",
                  "High–low pairs the top of a bracket with its bottom.",
                  [
                    ["high_low", "High–low"],
                    ["high_high", "High–high"],
                  ],
                )}
                {sel(
                  "pairing.bracketOrder",
                  "Order within brackets",
                  "How entries are seeded inside a win bracket.",
                  [
                    ["points", "Speaker points"],
                    ["sop", "SOP (seed + opponent seed)"],
                    ["opp_wins", "Opponent wins"],
                  ],
                )}
                {sel("pairing.pullup", "Pull-ups", "Which entry moves up when a bracket is odd.", [
                  ["highest", "Top of the lower bracket"],
                  ["lowest", "Bottom of the lower bracket"],
                  ["random", "Random"],
                ])}
                {sel("pairing.byePolicy", "Byes", "Who gets the bye in odd fields (never twice).", [
                  ["lowest", "Lowest-ranked"],
                  ["middle", "Middle of the field"],
                  ["random", "Random"],
                ])}
                <div className="space-y-3 sm:col-span-2">
                  {tog(
                    "pairing.avoidSameSchool",
                    "Avoid same-school debates",
                    "Strongly avoided; only allowed if there is truly no alternative.",
                  )}
                  {tog(
                    "pairing.avoidSameRegion",
                    "Avoid same-region debates",
                    "A soft preference, useful for national tournaments.",
                  )}
                  {tog(
                    "pairing.bracketByBallots",
                    "Bracket by ballots",
                    "Use ballot count instead of wins for brackets (multi-judge prelims).",
                  )}
                  {tog(
                    "byeCountsAsWin",
                    "Byes count as wins",
                    "A bye is recorded as a win with averaged points.",
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Judging</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {num("judging.prelimPanelSize", "Judges per prelim", "", { min: 1, max: 9 })}
                {num("judging.elimPanelSize", "Judges per elim", "", { min: 1, max: 9 })}
                {sel(
                  "judging.prefs",
                  "Mutual preference (MPJ)",
                  "Entries rate judges; OpenTab places judges both sides like.",
                  [
                    ["none", "Off (tab ratings only)"],
                    ["ordinal", "Ordinal rankings"],
                    ["tiers", "Tiers / categories"],
                  ],
                )}
                {num(
                  "judging.strikes",
                  "Strikes per entry",
                  "Judges an entry can refuse outright.",
                  { min: 0, max: 50 },
                )}
                {num(
                  "judging.maxPrefPercentile",
                  "Pref ceiling (%)",
                  "Avoid judges ranked below this percentile for either side.",
                  { min: 0, max: 100 },
                )}
                {num(
                  "judging.mutualityWeight",
                  "Mutuality weight",
                  "How much to favour judges both sides rate similarly.",
                  { min: 0, max: 10, step: 0.5 },
                )}
                <div className="space-y-3 sm:col-span-2">
                  {tog(
                    "judging.avoidRepeatJudging",
                    "Avoid repeat judging",
                    "Try not to give a judge the same entry twice.",
                  )}
                  {tog(
                    "judging.blockOutstandingBallots",
                    "Hold judges who owe ballots",
                    "Don't place a judge until their previous ballot is in.",
                  )}
                  {tog("judging.allowSameSchool", "Allow own-school judging", "Not recommended.")}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ballots</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {num("ballot.points.min", "Min points", "", { step: 0.5 })}
                {num("ballot.points.max", "Max points", "", { step: 0.5 })}
                {num("ballot.points.step", "Increment", "", { min: 0.01, step: 0.05 })}
                <div className="sm:col-span-3">
                  {sel(
                    "ballot.lowPointWin",
                    "Low-point wins",
                    "When the winner has fewer points than the loser.",
                    [
                      ["allow", "Allow"],
                      ["warn", "Allow, but ask the judge to confirm"],
                      ["forbid", "Not allowed"],
                    ],
                  )}
                </div>
                <div className="sm:col-span-3">
                  {num(
                    "ballot.rfdGraceHours",
                    "RFD grace period (hours)",
                    "Judges can finish their RFD this long after submitting the decision.",
                    { min: 0, max: 336 },
                  )}
                </div>
                <div className="space-y-3 sm:col-span-3">
                  {tog(
                    "ballot.speakerRanks",
                    "Rank speakers",
                    "Judges rank every speaker as well as giving points.",
                  )}
                  {tog(
                    "ballot.points.allowTies",
                    "Allow tied points",
                    "Two speakers can receive the same points.",
                  )}
                  {tog(
                    "ballot.requireRfd",
                    "Require an RFD",
                    "The ballot can't be submitted without one.",
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <TiebreakEditor
        title={isCongress ? "Tiebreaks" : "Team tiebreaks"}
        keys={isCongress ? CONGRESS_TIEBREAK_KEYS : TEAM_TIEBREAK_KEYS}
        value={
          (
            config as {
              tiebreaks: {
                key: string;
                drop?: { mode: "high" | "low" | "highlow"; count: number };
              }[];
            }
          ).tiebreaks
        }
        onChange={(v) => upd("tiebreaks", v)}
        canEdit={canEdit}
      />
      {!isCongress && (
        <TiebreakEditor
          title="Speaker award tiebreaks"
          keys={SPEAKER_TIEBREAK_KEYS}
          value={
            (
              config as {
                speakerTiebreaks: {
                  key: string;
                  drop?: { mode: "high" | "low" | "highlow"; count: number };
                }[];
              }
            ).speakerTiebreaks
          }
          onChange={(v) => upd("speakerTiebreaks", v)}
          canEdit={canEdit}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Braces className="size-4 text-brand" /> Advanced
          </CardTitle>
          <CardDescription>
            Edit the full configuration as JSON (including pairing cost weights). Validated when you
            save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {json === null ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setJson(JSON.stringify(config, null, 2))}
              disabled={!canEdit}
            >
              Edit JSON
            </Button>
          ) : (
            <>
              <Textarea
                className="min-h-80 font-mono text-xs"
                value={json}
                onChange={(e) => setJson(e.target.value)}
                aria-label="Configuration JSON"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    try {
                      setConfig(JSON.parse(json));
                      setJson(null);
                    } catch {
                      alert("That isn't valid JSON.");
                    }
                  }}
                >
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setJson(null)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex justify-end gap-2 rounded-xl border border-border bg-surface/90 p-3 shadow-lift backdrop-blur">
          <Button variant="ghost" onClick={() => setConfig(presetFor(event.format))}>
            <RotateCcw /> Reset to preset
          </Button>
          <Button onClick={save} loading={pending}>
            <Save /> Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

type Tb = { key: string; drop?: { mode: "high" | "low" | "highlow"; count: number } };

function TiebreakEditor({
  title,
  keys,
  value,
  onChange,
  canEdit,
}: {
  title: string;
  keys: readonly string[];
  value: Tb[];
  onChange: (v: Tb[]) => void;
  canEdit: boolean;
}) {
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Applied top to bottom: each tiebreak only separates entries tied on everything above it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ol className="space-y-2">
          {value.map((tb, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2"
            >
              <span className="w-5 text-sm tabular text-fg-subtle">{i + 1}.</span>
              <NativeSelect
                value={tb.key}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange(value.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))
                }
                className="h-8 w-auto"
                aria-label={`Tiebreak ${i + 1}`}
              >
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {tiebreakLabel({ key: k })}
                  </option>
                ))}
              </NativeSelect>
              {["points", "ranks", "rank_sum"].includes(tb.key) && (
                <NativeSelect
                  value={tb.drop ? `${tb.drop.mode}:${tb.drop.count}` : ""}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const [mode, count] = e.target.value.split(":");
                    onChange(
                      value.map((x, k) =>
                        k === i
                          ? {
                              key: x.key,
                              ...(e.target.value
                                ? { drop: { mode: mode as "high", count: Number(count) } }
                                : {}),
                            }
                          : x,
                      ),
                    );
                  }}
                  className="h-8 w-auto"
                  aria-label="Drop"
                >
                  <option value="">No drop</option>
                  <option value="highlow:1">Drop high &amp; low</option>
                  <option value="highlow:2">Drop 2 high &amp; 2 low</option>
                  <option value="low:1">Drop lowest</option>
                  <option value="high:1">Drop highest</option>
                </NativeSelect>
              )}
              {canEdit && (
                <span className="ml-auto flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove"
                    disabled={value.length === 1}
                    onClick={() => onChange(value.filter((_, k) => k !== i))}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange([...value, { key: keys.includes("coinflip") ? "coinflip" : keys[0]! }])
            }
          >
            <Plus /> Add tiebreak
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
