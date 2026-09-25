"use client";

import { FORMAT_LABELS, type Format } from "@opentab/engine";
import {
  ArrowRight,
  Clock,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  addEventAction,
  deleteEventAction,
  deleteTimeslotAction,
  removeMemberAction,
  setMemberAction,
  updateTournamentAction,
  upsertTimeslotAction,
} from "@/app/tab/actions";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/use-action";

type Role = "owner" | "director" | "tabber" | "checker" | "viewer";

export function SetupClient({
  slug,
  me,
  canManage,
  tournament: t,
  events,
  timeslots,
  members,
  roleDescriptions,
}: {
  slug: string;
  me: string;
  canManage: boolean;
  tournament: {
    id: string;
    name: string;
    location: string | null;
    description: string | null;
    timezone: string;
    startsOn: string;
    endsOn: string;
    status: "setup" | "live" | "completed" | "archived";
    visibility: "public" | "unlisted" | "private";
    settings: {
      codesOnly?: boolean;
      showJudges?: boolean;
      releaseBallots?: boolean;
      publicStandings?: boolean;
      announcement?: string;
    };
  };
  events: { id: string; name: string; abbreviation: string; format: Format }[];
  timeslots: { id: string; label: string; startsAt: string | null }[];
  members: { userId: string; name: string; email: string; role: Role }[];
  roleDescriptions: Record<Role, string>;
}) {
  const { exec, pending } = useAction();
  const [settings, setSettings] = useState(t.settings);
  const setFlag = (key: keyof typeof settings, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: value }));
    void exec(() => updateTournamentAction(slug, t.id, { settings: { [key]: value } }), {
      success: "Saved",
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4 text-brand" /> Tournament
          </CardTitle>
        </CardHeader>
        <form
          action={async (fd) => {
            await exec(() =>
              updateTournamentAction(slug, t.id, {
                name: String(fd.get("name")),
                location: String(fd.get("location") || "") || null,
                description: String(fd.get("description") || "") || null,
                startsOn: String(fd.get("startsOn")),
                endsOn: String(fd.get("endsOn")),
                status: fd.get("status") as typeof t.status,
                visibility: fd.get("visibility") as typeof t.visibility,
                settings: { announcement: String(fd.get("announcement") ?? "") },
              }),
            );
          }}
        >
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="t-name">
              <Input id="t-name" name="name" defaultValue={t.name} required disabled={!canManage} />
            </Field>
            <Field label="Location" htmlFor="t-loc">
              <Input
                id="t-loc"
                name="location"
                defaultValue={t.location ?? ""}
                disabled={!canManage}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" htmlFor="t-start">
                <Input
                  id="t-start"
                  name="startsOn"
                  type="date"
                  defaultValue={t.startsOn}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Ends" htmlFor="t-end">
                <Input
                  id="t-end"
                  name="endsOn"
                  type="date"
                  defaultValue={t.endsOn}
                  disabled={!canManage}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Status"
                htmlFor="t-status"
                hint="“Live” highlights it on the public directory."
              >
                <NativeSelect
                  id="t-status"
                  name="status"
                  defaultValue={t.status}
                  disabled={!canManage}
                >
                  <option value="setup">Setting up</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </NativeSelect>
              </Field>
              <Field label="Visibility" htmlFor="t-vis" hint="Unlisted: reachable by link only.">
                <NativeSelect
                  id="t-vis"
                  name="visibility"
                  defaultValue={t.visibility}
                  disabled={!canManage}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Description" htmlFor="t-desc" className="md:col-span-2">
              <Textarea
                id="t-desc"
                name="description"
                rows={3}
                defaultValue={t.description ?? ""}
                disabled={!canManage}
              />
            </Field>
            <Field
              label="Announcement banner"
              htmlFor="t-ann"
              hint="Shown at the top of the public tournament page."
              className="md:col-span-2"
            >
              <Input
                id="t-ann"
                name="announcement"
                defaultValue={t.settings.announcement ?? ""}
                disabled={!canManage}
              />
            </Field>
          </CardContent>
          {canManage && (
            <CardFooter className="justify-end">
              <Button type="submit" loading={pending}>
                Save details
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-brand" /> Events
          </CardTitle>
          <CardDescription>
            Each event starts from a format preset. Open settings to change rules, tiebreaks and
            judging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <Badge tone="brand">{e.abbreviation}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-fg-muted">{FORMAT_LABELS[e.format]}</div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/tab/${slug}/setup/events/${e.id}`}>
                    Settings <ArrowRight />
                  </Link>
                </Button>
                {canManage && (
                  <ConfirmButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${e.name}`}
                    title={`Delete ${e.name}?`}
                    description="This deletes the event with all of its entries, rounds and ballots. This can't be undone."
                    confirmLabel="Delete event"
                    onConfirm={() => exec(() => deleteEventAction(slug, e.id))}
                  >
                    <Trash2 />
                  </ConfirmButton>
                )}
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-3 py-4 text-sm text-fg-muted">No events yet.</li>
            )}
          </ul>
          {canManage && (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
              action={async (fd) => {
                const format = fd.get("format") as Format;
                await exec(() =>
                  addEventAction(slug, t.id, {
                    format,
                    name: String(fd.get("name") || FORMAT_LABELS[format]),
                    abbreviation: String(fd.get("abbr") || format.toUpperCase().slice(0, 4)),
                  }),
                );
              }}
            >
              <NativeSelect name="format" aria-label="Format">
                {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </NativeSelect>
              <Input name="name" placeholder="Event name" aria-label="Event name" />
              <Input name="abbr" placeholder="Abbr." aria-label="Abbreviation" maxLength={12} />
              <Button type="submit" variant="secondary" loading={pending}>
                <Plus /> Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand" /> Privacy &amp; publishing
          </CardTitle>
          <CardDescription>
            Many competitors are minors. These controls apply to every public page and the public
            API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              [
                "codesOnly",
                "Show entry codes only",
                "Hide competitor names and entry names publicly.",
              ],
              [
                "showJudges",
                "Show judge names on pairings",
                "Competitors see who is judging their round.",
              ],
              [
                "publicStandings",
                "Allow public standings",
                "Standings are still only shown after you publish them.",
              ],
              [
                "releaseBallots",
                "Release ballots after each round",
                "Entries can read RFDs and points in their portal once you release a round.",
              ],
            ] as const
          ).map(([key, label, help]) => (
            <label key={key} className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-fg-muted">{help}</span>
              </span>
              <Switch
                checked={!!settings[key]}
                disabled={!canManage}
                onCheckedChange={(v) => setFlag(key, v)}
                aria-label={label}
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <TimeslotsCard slug={slug} tournamentId={t.id} timeslots={timeslots} canManage={canManage} />
      <StaffCard
        slug={slug}
        tournamentId={t.id}
        me={me}
        members={members}
        canManage={canManage}
        roleDescriptions={roleDescriptions}
      />
    </div>
  );
}

function TimeslotsCard({
  slug,
  tournamentId,
  timeslots,
  canManage,
}: {
  slug: string;
  tournamentId: string;
  timeslots: { id: string; label: string; startsAt: string | null }[];
  canManage: boolean;
}) {
  const { exec, pending } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4 text-brand" /> Schedule
        </CardTitle>
        <CardDescription>
          Timeslots let OpenTab avoid double-booking judges and rooms across events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {timeslots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 font-medium">{s.label}</span>
              <span className="text-fg-muted">
                {s.startsAt
                  ? new Date(s.startsAt).toLocaleString([], {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "No time set"}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${s.label}`}
                  onClick={() => exec(() => deleteTimeslotAction(slug, tournamentId, s.id))}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
          {timeslots.length === 0 && (
            <li className="px-3 py-4 text-sm text-fg-muted">No timeslots yet.</li>
          )}
        </ul>
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            action={async (fd) => {
              await exec(() =>
                upsertTimeslotAction(slug, tournamentId, {
                  label: String(fd.get("label")),
                  startsAt: String(fd.get("startsAt") || "") || null,
                }),
              );
            }}
          >
            <Input name="label" placeholder="e.g. Round 1" required aria-label="Timeslot label" />
            <Input name="startsAt" type="datetime-local" aria-label="Start time" />
            <Button type="submit" variant="secondary" loading={pending}>
              <Plus /> Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function StaffCard({
  slug,
  tournamentId,
  me,
  members,
  canManage,
  roleDescriptions,
}: {
  slug: string;
  tournamentId: string;
  me: string;
  members: { userId: string; name: string; email: string; role: Role }[];
  canManage: boolean;
  roleDescriptions: Record<Role, string>;
}) {
  const { exec, pending } = useAction();
  const [role, setRole] = useState<Role>("tabber");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-brand" /> Staff
        </CardTitle>
        <CardDescription>Give your tab team access. They need an OpenTab account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {m.name} {m.userId === me && <span className="text-fg-subtle">(you)</span>}
                </div>
                <div className="truncate text-xs text-fg-muted">{m.email}</div>
              </div>
              <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
              {canManage && m.userId !== me && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => exec(() => removeMemberAction(slug, tournamentId, m.userId))}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <form
            className="space-y-2"
            action={async (fd) => {
              await exec(() => setMemberAction(slug, tournamentId, String(fd.get("email")), role));
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <Input
                name="email"
                type="email"
                placeholder="colleague@school.edu"
                required
                aria-label="Email"
              />
              <NativeSelect
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                aria-label="Role"
              >
                {(["director", "tabber", "checker", "viewer", "owner"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="secondary" loading={pending}>
                <UserPlus /> Add
              </Button>
            </div>
            <p className="text-xs text-fg-muted">{roleDescriptions[role]}</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
