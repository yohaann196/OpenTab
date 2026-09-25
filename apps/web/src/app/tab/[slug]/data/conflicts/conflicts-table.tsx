"use client";

import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { addConflictAction, removeConflictAction } from "@/app/tab/actions";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";

export function ConflictsTable({
  slug,
  tournamentId,
  conflicts,
  judges,
  entries,
  schools,
}: {
  slug: string;
  tournamentId: string;
  conflicts: {
    id: string;
    kind: string;
    source: string;
    judgeName: string;
    target: string;
    targetType: string;
  }[];
  judges: { id: string; name: string }[];
  entries: { id: string; label: string }[];
  schools: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<"entry" | "school">("entry");
  const { exec, pending } = useAction();
  const rows = conflicts.filter((c) => matches(q, c.judgeName, c.target));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search by judge or entry"
          className="w-full sm:w-72"
        />
        <span className="text-sm text-fg-muted">{conflicts.length} total</span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setOpen(true)}
          disabled={judges.length === 0}
        >
          <Plus /> Add conflict
        </Button>
      </div>
      {conflicts.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No conflicts recorded">
          Add conflicts for former coaches, relatives, or anyone who shouldn&apos;t judge a
          particular entry or school.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Judge</TH>
              <TH>Can&apos;t judge</TH>
              <TH>Type</TH>
              <TH>Source</TH>
              <TH className="w-12">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.judgeName}</TD>
                <TD>
                  {c.target} <span className="text-xs text-fg-subtle">({c.targetType})</span>
                </TD>
                <TD>
                  <Badge tone={c.kind === "strike" ? "warning" : "danger"}>{c.kind}</Badge>
                </TD>
                <TD className="capitalize text-fg-muted">{c.source}</TD>
                <TD>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove conflict"
                    onClick={() => exec(() => removeConflictAction(slug, tournamentId, c.id))}
                  >
                    <Trash2 />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add conflict">
          <form
            className="grid gap-4"
            action={async (fd) => {
              const res = await exec(() =>
                addConflictAction(slug, tournamentId, {
                  judgeId: String(fd.get("judgeId")),
                  entryId: targetType === "entry" ? String(fd.get("targetId")) : null,
                  schoolId: targetType === "school" ? String(fd.get("targetId")) : null,
                  kind: fd.get("kind") === "strike" ? "strike" : "conflict",
                }),
              );
              if (res.ok) setOpen(false);
            }}
          >
            <Field label="Judge" htmlFor="c-judge">
              <NativeSelect id="c-judge" name="judgeId" required>
                {judges.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field label="Against" htmlFor="c-type">
                <NativeSelect
                  id="c-type"
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as "entry" | "school")}
                >
                  <option value="entry">An entry</option>
                  <option value="school">A whole school</option>
                </NativeSelect>
              </Field>
              <Field label={targetType === "entry" ? "Entry" : "School"} htmlFor="c-target">
                <NativeSelect id="c-target" name="targetId" required key={targetType}>
                  {(targetType === "entry"
                    ? entries.map((e) => ({ id: e.id, name: e.label }))
                    : schools
                  ).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field
              label="Type"
              htmlFor="c-kind"
              hint="Strikes come from pref sheets; conflicts are personal or ethical."
            >
              <NativeSelect id="c-kind" name="kind">
                <option value="conflict">Conflict</option>
                <option value="strike">Strike</option>
              </NativeSelect>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Add conflict
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
