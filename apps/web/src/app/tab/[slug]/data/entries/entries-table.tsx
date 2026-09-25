"use client";

import {
  Accessibility,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { deleteRecordAction, saveEntryAction, setEntryStatusAction } from "@/app/tab/actions";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  eventId: string;
  schoolId: string | null;
  code: string;
  name: string;
  status: "active" | "dropped" | "waitlisted";
  seed: number | null;
  requiresAccessible: boolean;
  schoolName: string | null;
  eventAbbr: string;
  competitors: { id: string; name: string; email: string | null; hidePublic: boolean }[];
};
type Ev = { id: string; abbreviation: string; name: string; teamSize: number };

export function EntriesTable({
  slug,
  tournamentId,
  entries,
  events,
  schools,
}: {
  slug: string;
  tournamentId: string;
  entries: Entry[];
  events: Ev[];
  schools: { id: string; name: string; code: string }[];
}) {
  const [q, setQ] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [showDropped, setShowDropped] = useState(true);
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const { exec, pending } = useAction();

  const rows = useMemo(
    () =>
      entries.filter(
        (e) =>
          (eventFilter === "all" || e.eventId === eventFilter) &&
          (showDropped || e.status === "active") &&
          matches(q, e.code, e.name, e.schoolName, ...e.competitors.map((c) => c.name)),
      ),
    [entries, eventFilter, showDropped, q],
  );

  const ev = events.find((e) => e.id === (editing?.eventId ?? events[0]?.id));
  const compCount = Math.max(ev?.teamSize ?? 1, editing?.competitors?.length ?? 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search code, name, school, competitor"
          className="w-full sm:w-80"
        />
        <NativeSelect
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="w-auto"
          aria-label="Filter by event"
        >
          <option value="all">All events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.abbreviation} — {e.name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <Switch
            checked={showDropped}
            onCheckedChange={setShowDropped}
            aria-label="Show dropped entries"
          />{" "}
          Show dropped
        </label>
        <span className="text-sm text-fg-muted">{rows.length} shown</span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setEditing({ eventId: events[0]?.id, competitors: [] })}
          disabled={events.length === 0}
        >
          <Plus /> Add entry
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={Users} title="No entries yet">
          Import a CSV with one row per entry — event, school and competitor names are all you need.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Event</TH>
              <TH>Competitors</TH>
              <TH>School</TH>
              <TH className="text-right">Seed</TH>
              <TH>Status</TH>
              <TH className="w-12">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((e) => (
              <TR key={e.id} className={cn(e.status !== "active" && "opacity-60")}>
                <TD className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {e.code}
                    {e.requiresAccessible && (
                      <Accessibility
                        className="size-3.5 text-brand"
                        aria-label="Needs accessible room"
                      />
                    )}
                  </span>
                </TD>
                <TD>
                  <Badge tone="brand">{e.eventAbbr}</Badge>
                </TD>
                <TD className="text-fg-muted">{e.competitors.map((c) => c.name).join(", ")}</TD>
                <TD className="text-fg-muted">{e.schoolName ?? "—"}</TD>
                <TD className="text-right tabular">{e.seed ?? ""}</TD>
                <TD>
                  <Badge
                    tone={
                      e.status === "active"
                        ? "success"
                        : e.status === "dropped"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {e.status}
                  </Badge>
                </TD>
                <TD>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.code}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(e)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      {e.status === "active" ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            exec(() => setEntryStatusAction(slug, tournamentId, e.id, "dropped"))
                          }
                        >
                          <UserMinus /> Drop
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() =>
                            exec(() => setEntryStatusAction(slug, tournamentId, e.id, "active"))
                          }
                        >
                          <RotateCcw /> Restore
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={() =>
                          exec(() => deleteRecordAction(slug, tournamentId, "entry", e.id))
                        }
                      >
                        <Trash2 /> Delete permanently
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.id ? `Edit ${editing.code}` : "Add entry"} size="lg">
            <form
              className="grid gap-4"
              action={async (fd) => {
                const competitors = Array.from({ length: compCount }, (_, i) => ({
                  name: String(fd.get(`c${i}`) ?? "").trim(),
                  email: String(fd.get(`ce${i}`) ?? "").trim(),
                  hidePublic: fd.get(`ch${i}`) === "on",
                })).filter((c) => c.name);
                const seed = String(fd.get("seed") ?? "");
                const res = await exec(() =>
                  saveEntryAction(slug, tournamentId, {
                    id: editing.id,
                    eventId: String(fd.get("eventId")),
                    schoolId: String(fd.get("schoolId") || "") || null,
                    code: String(fd.get("code")),
                    name: String(fd.get("name") || fd.get("code")),
                    seed: seed ? Number(seed) : null,
                    requiresAccessible: fd.get("accessible") === "on",
                    status: editing.status ?? "active",
                    competitors,
                  }),
                );
                if (res.ok) setEditing(null);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Event" htmlFor="e-event">
                  <NativeSelect
                    id="e-event"
                    name="eventId"
                    defaultValue={editing.eventId}
                    onChange={(e) => setEditing({ ...editing, eventId: e.target.value })}
                  >
                    {events.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.abbreviation} — {x.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="School" htmlFor="e-school">
                  <NativeSelect id="e-school" name="schoolId" defaultValue={editing.schoolId ?? ""}>
                    <option value="">Unaffiliated</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Code" htmlFor="e-code" hint="Shown on pairings, e.g. “Lincoln AN”.">
                  <Input id="e-code" name="code" defaultValue={editing.code} required />
                </Field>
                <Field label="Name" htmlFor="e-name" hint="Optional full name.">
                  <Input id="e-name" name="name" defaultValue={editing.name} />
                </Field>
              </div>
              <fieldset className="grid gap-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium">Competitors</legend>
                {Array.from({ length: compCount }, (_, i) => {
                  const c = editing.competitors?.[i];
                  return (
                    <div
                      key={`${editing.id ?? "new"}-${i}`}
                      className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <Input
                        name={`c${i}`}
                        defaultValue={c?.name}
                        placeholder={`Competitor ${i + 1}`}
                        aria-label={`Competitor ${i + 1} name`}
                        required={i === 0}
                      />
                      <Input
                        name={`ce${i}`}
                        defaultValue={c?.email ?? ""}
                        placeholder="Email (optional)"
                        type="email"
                        aria-label={`Competitor ${i + 1} email`}
                      />
                      <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
                        <input
                          type="checkbox"
                          name={`ch${i}`}
                          defaultChecked={c?.hidePublic}
                          className="accent-[var(--brand)]"
                        />{" "}
                        Hide publicly
                      </label>
                    </div>
                  );
                })}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Seed" htmlFor="e-seed" hint="Optional; used by seeded presets.">
                  <Input
                    id="e-seed"
                    name="seed"
                    type="number"
                    min={1}
                    defaultValue={editing.seed ?? ""}
                  />
                </Field>
                <label className="flex items-center gap-2 self-center text-sm">
                  <input
                    type="checkbox"
                    name="accessible"
                    defaultChecked={editing.requiresAccessible}
                    className="size-4 accent-[var(--brand)]"
                  />
                  Needs an accessible room
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save entry
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
