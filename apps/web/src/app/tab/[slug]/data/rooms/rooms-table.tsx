"use client";

import { Accessibility, DoorOpen, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteRecordAction, saveRoomAction } from "@/app/tab/actions";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type Room = {
  id: string;
  name: string;
  building: string | null;
  capacity: number | null;
  priority: number;
  accessible: boolean;
  onlineUrl: string | null;
  active: boolean;
};

export function RoomsTable({
  slug,
  tournamentId,
  rooms,
}: {
  slug: string;
  tournamentId: string;
  rooms: Room[];
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Room> | null>(null);
  const { exec, pending } = useAction();
  const rows = rooms
    .filter((r) => matches(q, r.name, r.building))
    .sort(
      (a, b) =>
        b.priority - a.priority || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search rooms"
          className="w-full sm:w-72"
        />
        <span className="text-sm text-fg-muted">
          {rooms.filter((r) => r.active).length} active · {rooms.filter((r) => r.accessible).length}{" "}
          accessible
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setEditing({ priority: 0, active: true })}
        >
          <Plus /> Add room
        </Button>
      </div>
      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No rooms yet">
          Add physical rooms or online meeting links. Import from CSV to add many at once.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Room</TH>
              <TH>Building</TH>
              <TH className="text-right">Priority</TH>
              <TH className="text-right">Capacity</TH>
              <TH>Features</TH>
              <TH className="w-24">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} className={cn(!r.active && "opacity-60")}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="text-fg-muted">{r.building ?? "—"}</TD>
                <TD className="text-right tabular">{r.priority}</TD>
                <TD className="text-right tabular">{r.capacity ?? "—"}</TD>
                <TD className="space-x-1">
                  {r.accessible && (
                    <Badge tone="brand">
                      <Accessibility /> accessible
                    </Badge>
                  )}
                  {r.onlineUrl && (
                    <Badge>
                      <Link2 /> online
                    </Badge>
                  )}
                  {!r.active && <Badge tone="danger">inactive</Badge>}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditing(r)}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${r.name}`}
                      title={`Delete room ${r.name}?`}
                      description="Debates using this room will need a new one."
                      confirmLabel="Delete"
                      onConfirm={() =>
                        exec(() => deleteRecordAction(slug, tournamentId, "room", r.id))
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
          <DialogContent title={editing.id ? `Edit room ${editing.name}` : "Add room"}>
            <form
              className="grid gap-4"
              action={async (fd) => {
                const cap = String(fd.get("capacity") ?? "");
                const res = await exec(() =>
                  saveRoomAction(slug, tournamentId, {
                    id: editing.id,
                    name: String(fd.get("name")),
                    building: String(fd.get("building") ?? ""),
                    capacity: cap ? Number(cap) : null,
                    priority: Number(fd.get("priority") || 0),
                    accessible: fd.get("accessible") === "on",
                    onlineUrl: String(fd.get("onlineUrl") ?? ""),
                    active: fd.get("active") === "on",
                  }),
                );
                if (res.ok) setEditing(null);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Room" htmlFor="r-name">
                  <Input id="r-name" name="name" defaultValue={editing.name} required autoFocus />
                </Field>
                <Field label="Building" htmlFor="r-building">
                  <Input id="r-building" name="building" defaultValue={editing.building ?? ""} />
                </Field>
                <Field label="Priority" htmlFor="r-priority" hint="Higher = better room.">
                  <Input
                    id="r-priority"
                    name="priority"
                    type="number"
                    min={0}
                    defaultValue={editing.priority ?? 0}
                  />
                </Field>
                <Field label="Capacity" htmlFor="r-capacity">
                  <Input
                    id="r-capacity"
                    name="capacity"
                    type="number"
                    min={1}
                    defaultValue={editing.capacity ?? ""}
                  />
                </Field>
              </div>
              <Field
                label="Online room link"
                htmlFor="r-url"
                hint="Shown to competitors and judges on pairings."
              >
                <Input
                  id="r-url"
                  name="onlineUrl"
                  type="url"
                  defaultValue={editing.onlineUrl ?? ""}
                  placeholder="https://"
                />
              </Field>
              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="accessible"
                    defaultChecked={editing.accessible}
                    className="size-4 accent-[var(--brand)]"
                  />{" "}
                  Wheelchair accessible
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing.active ?? true}
                    className="size-4 accent-[var(--brand)]"
                  />{" "}
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save room
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
