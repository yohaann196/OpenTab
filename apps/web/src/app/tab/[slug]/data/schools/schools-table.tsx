"use client";

import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteRecordAction, saveSchoolAction } from "@/app/tab/actions";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";

type School = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  contactEmail: string | null;
};

export function SchoolsTable({
  slug,
  tournamentId,
  schools,
  counts,
}: {
  slug: string;
  tournamentId: string;
  schools: School[];
  counts: Record<string, { entries: number; judges: number }>;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<School> | null>(null);
  const { exec, pending } = useAction();
  const rows = schools.filter((s) => matches(q, s.name, s.code, s.region));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search schools"
          className="w-full sm:w-72"
        />
        <span className="text-sm text-fg-muted">{rows.length} schools</span>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({})}>
          <Plus /> Add school
        </Button>
      </div>
      {schools.length === 0 ? (
        <EmptyState icon={Building2} title="No schools yet">
          Import a CSV, or they&apos;ll be created automatically when you import entries and judges.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>School</TH>
              <TH>Code</TH>
              <TH>Region</TH>
              <TH className="text-right">Entries</TH>
              <TH className="text-right">Judges</TH>
              <TH className="w-24">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="font-mono text-xs">{s.code}</TD>
                <TD className="text-fg-muted">{s.region ?? "—"}</TD>
                <TD className="text-right tabular">{counts[s.id]?.entries ?? 0}</TD>
                <TD className="text-right tabular">{counts[s.id]?.judges ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${s.name}`}
                      title={`Delete ${s.name}?`}
                      description="Entries and judges from this school will be kept but no longer linked to it."
                      confirmLabel="Delete"
                      onConfirm={() =>
                        exec(() => deleteRecordAction(slug, tournamentId, "school", s.id))
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
          <DialogContent title={editing.id ? "Edit school" : "Add school"}>
            <form
              className="grid gap-4"
              action={async (fd) => {
                const res = await exec(() =>
                  saveSchoolAction(slug, tournamentId, {
                    id: editing.id,
                    name: String(fd.get("name")),
                    code: String(fd.get("code")),
                    region: String(fd.get("region") ?? ""),
                    contactEmail: String(fd.get("contactEmail") ?? ""),
                  }),
                );
                if (res.ok) setEditing(null);
              }}
            >
              <Field label="Name" htmlFor="s-name">
                <Input id="s-name" name="name" defaultValue={editing.name} required autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Code" htmlFor="s-code" hint="Short label shown in entry codes.">
                  <Input
                    id="s-code"
                    name="code"
                    defaultValue={editing.code}
                    required
                    maxLength={20}
                  />
                </Field>
                <Field label="Region / state" htmlFor="s-region">
                  <Input id="s-region" name="region" defaultValue={editing.region ?? ""} />
                </Field>
              </div>
              <Field label="Contact email" htmlFor="s-email">
                <Input
                  id="s-email"
                  name="contactEmail"
                  type="email"
                  defaultValue={editing.contactEmail ?? ""}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
