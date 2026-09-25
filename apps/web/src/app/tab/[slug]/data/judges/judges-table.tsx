"use client";

import { Gavel, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  checkInJudgeAction,
  deleteRecordAction,
  saveJudgeAction,
  setJudgeBlocksAction,
} from "@/app/tab/actions";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type Judge = {
  id: string;
  name: string;
  email: string | null;
  schoolId: string | null;
  schoolName: string | null;
  roundsOwed: number;
  rating: number;
  paradigm: string | null;
  active: boolean;
  trainee: boolean;
  checkedInAt: string | null;
};

export function JudgesTable({
  slug,
  tournamentId,
  judges,
  schools,
  timeslots,
  blocks,
}: {
  slug: string;
  tournamentId: string;
  judges: Judge[];
  schools: { id: string; name: string }[];
  timeslots: { id: string; label: string }[];
  blocks: { judgeId: string; timeslotId: string }[];
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Judge> | null>(null);
  const { exec, pending } = useAction();
  const rows = useMemo(
    () => judges.filter((j) => matches(q, j.name, j.email, j.schoolName)),
    [judges, q],
  );
  const checkedIn = judges.filter((j) => j.checkedInAt).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search judges"
          className="w-full sm:w-72"
        />
        <span className="text-sm text-fg-muted">
          {judges.length} judges · {checkedIn} checked in
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setEditing({ rating: 5, roundsOwed: 0, active: true })}
        >
          <Plus /> Add judge
        </Button>
      </div>
      {judges.length === 0 ? (
        <EmptyState icon={Gavel} title="No judges yet">
          Import judges from CSV. Each judge gets a private ballot link — no account needed.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>School</TH>
              <TH className="text-right">Rating</TH>
              <TH className="text-right">Rounds owed</TH>
              <TH>Status</TH>
              <TH>Checked in</TH>
              <TH className="w-24">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((j) => (
              <TR key={j.id} className={cn(!j.active && "opacity-60")}>
                <TD>
                  <div className="font-medium">{j.name}</div>
                  {j.email && <div className="text-xs text-fg-subtle">{j.email}</div>}
                </TD>
                <TD className="text-fg-muted">
                  {j.schoolName ?? <span className="text-fg-subtle">Hired / none</span>}
                </TD>
                <TD className="text-right">
                  <RatingPips value={j.rating} />
                </TD>
                <TD className="text-right tabular">{j.roundsOwed}</TD>
                <TD className="space-x-1">
                  {!j.active && <Badge tone="danger">inactive</Badge>}
                  {j.trainee && (
                    <Badge tone="warning">
                      <GraduationCap /> trainee
                    </Badge>
                  )}
                  {j.active && !j.trainee && <Badge tone="success">active</Badge>}
                  {blocks.some((b) => b.judgeId === j.id) && <Badge>limited</Badge>}
                </TD>
                <TD>
                  <Switch
                    checked={!!j.checkedInAt}
                    onCheckedChange={(v) =>
                      exec(() => checkInJudgeAction(slug, tournamentId, j.id, v), { quiet: true })
                    }
                    aria-label={`${j.name} checked in`}
                  />
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${j.name}`}
                      onClick={() => setEditing(j)}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${j.name}`}
                      title={`Delete ${j.name}?`}
                      description="This removes the judge and any ballots they have. Consider marking them inactive instead."
                      confirmLabel="Delete"
                      onConfirm={() =>
                        exec(() => deleteRecordAction(slug, tournamentId, "judge", j.id))
                      }
                    >
                      <Trash2 />
                    </ConfirmButton>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.id ? `Edit ${editing.name}` : "Add judge"} size="lg">
            <form
              className="grid gap-4"
              action={async (fd) => {
                const res = await exec(() =>
                  saveJudgeAction(slug, tournamentId, {
                    id: editing.id,
                    name: String(fd.get("name")),
                    email: String(fd.get("email") ?? ""),
                    schoolId: String(fd.get("schoolId") || "") || null,
                    roundsOwed: Number(fd.get("roundsOwed") || 0),
                    rating: Number(fd.get("rating") || 5),
                    paradigm: String(fd.get("paradigm") ?? ""),
                    active: fd.get("active") === "on",
                    trainee: fd.get("trainee") === "on",
                  }),
                );
                if (res.ok && timeslots.length) {
                  const blocked = timeslots
                    .filter((t) => fd.get(`ts-${t.id}`) !== "on")
                    .map((t) => t.id);
                  await exec(() => setJudgeBlocksAction(slug, tournamentId, res.data, blocked), {
                    quiet: true,
                  });
                }
                if (res.ok) setEditing(null);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="j-name">
                  <Input id="j-name" name="name" defaultValue={editing.name} required autoFocus />
                </Field>
                <Field
                  label="Email"
                  htmlFor="j-email"
                  hint="Used to send their private ballot link."
                >
                  <Input
                    id="j-email"
                    name="email"
                    type="email"
                    defaultValue={editing.email ?? ""}
                  />
                </Field>
                <Field label="School" htmlFor="j-school" hint="Judges never hear their own school.">
                  <NativeSelect id="j-school" name="schoolId" defaultValue={editing.schoolId ?? ""}>
                    <option value="">Hired / unaffiliated</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Rating" htmlFor="j-rating" hint="0–10">
                    <Input
                      id="j-rating"
                      name="rating"
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={editing.rating ?? 5}
                    />
                  </Field>
                  <Field label="Rounds owed" htmlFor="j-owed">
                    <Input
                      id="j-owed"
                      name="roundsOwed"
                      type="number"
                      min={0}
                      max={30}
                      defaultValue={editing.roundsOwed ?? 0}
                    />
                  </Field>
                </div>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing.active ?? true}
                    className="size-4 accent-[var(--brand)]"
                  />{" "}
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="trainee"
                    defaultChecked={editing.trainee}
                    className="size-4 accent-[var(--brand)]"
                  />{" "}
                  Trainee / shadow (doesn&apos;t vote)
                </label>
              </div>
              {timeslots.length > 0 && (
                <fieldset className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-medium">Available for</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {timeslots.map((t) => (
                      <label key={t.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name={`ts-${t.id}`}
                          defaultChecked={
                            !blocks.some((b) => b.judgeId === editing.id && b.timeslotId === t.id)
                          }
                          className="size-4 accent-[var(--brand)]"
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <Field
                label="Paradigm"
                htmlFor="j-paradigm"
                hint="Shown publicly and on pref sheets. Markdown is fine."
              >
                <Textarea
                  id="j-paradigm"
                  name="paradigm"
                  rows={5}
                  defaultValue={editing.paradigm ?? ""}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save judge
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function RatingPips({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Rating ${value}/10`}>
      <span className="flex gap-px" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-sm",
              i < Math.round(value / 2) ? "bg-brand" : "bg-surface-3",
            )}
          />
        ))}
      </span>
      <span className="text-xs tabular text-fg-muted">{value}</span>
    </span>
  );
}
