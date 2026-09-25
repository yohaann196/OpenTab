"use client";

import type { Format } from "@opentab/engine";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoundAction, generateDraftAction } from "@/app/tab/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/use-action";

const METHODS = [
  {
    value: "",
    label: "Automatic (recommended)",
    help: "Presets for the first rounds, then power-matching — as set in event settings.",
  },
  {
    value: "random",
    label: "Random preset",
    help: "Random pairings avoiding same-school and rematches.",
  },
  {
    value: "protected",
    label: "Protected preset",
    help: "Seeded high–low: top seeds meet bottom seeds.",
  },
  {
    value: "balanced",
    label: "Balanced preset",
    help: "Seeded so each half of the field meets the other.",
  },
  {
    value: "powermatch",
    label: "Power-matched",
    help: "Pair within win brackets, high–low, with minimal pull-ups.",
  },
  {
    value: "round_robin",
    label: "Round robin",
    help: "Everyone meets everyone (best for small pools).",
  },
  { value: "manual", label: "Manual", help: "Start empty and build the draw yourself." },
];

export function NewRoundButton({
  slug,
  eventId,
  format,
  timeslots,
  defaultStage,
  elimRemaining,
  previousRounds,
}: {
  slug: string;
  eventId: string;
  format: Format;
  timeslots: { id: string; label: string }[];
  defaultStage: "prelim" | "elim";
  elimRemaining: number;
  previousRounds: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"prelim" | "elim">(defaultStage);
  const [method, setMethod] = useState("");
  const { exec, pending } = useAction();
  const isCongress = format === "congress";
  const help = METHODS.find((m) => m.value === method)?.help;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New {isCongress ? "session" : "round"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`New ${isCongress ? "session" : "round"}`}
        description="We'll pair it, place judges and rooms, and run the pre-publish checks."
      >
        <form
          className="grid gap-4"
          action={async (fd) => {
            const breakSize = Number(fd.get("breakSize") || 0);
            const chambers = Number(fd.get("chambers") || 0);
            const cont = String(fd.get("continueFrom") || "");
            const res = await exec(
              () =>
                createRoundAction(slug, eventId, {
                  label: String(fd.get("label") || "") || undefined,
                  stage,
                  method: (method || undefined) as never,
                  timeslotId: String(fd.get("timeslotId") || "") || null,
                  flights: Number(fd.get("flights") || 1),
                  motion: String(fd.get("motion") || "") || null,
                  settings: {
                    ...(stage === "elim" && breakSize ? { breakSize } : {}),
                    ...(isCongress && chambers ? { chambers } : {}),
                    ...(isCongress && cont && stage === "prelim"
                      ? { continueFromRoundId: cont }
                      : {}),
                  },
                }),
              { quiet: true },
            );
            if (!res.ok) return;
            const gen = await exec(() => generateDraftAction(slug, res.data), { quiet: true });
            setOpen(false);
            router.push(
              `/tab/${slug}/events/${eventId}/rounds/${res.data}${gen.ok ? "?generated=1" : ""}`,
            );
          }}
        >
          <Field
            label="Stage"
            htmlFor="stage"
            hint={
              isCongress && stage === "elim"
                ? "The top legislators from each prelim chamber advance, seeded across new chambers."
                : undefined
            }
          >
            <NativeSelect
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as "prelim" | "elim")}
            >
              <option value="prelim">
                {isCongress ? "Preliminary session" : "Preliminary round"}
              </option>
              <option value="elim">{isCongress ? "Super session" : "Elimination round"}</option>
            </NativeSelect>
          </Field>
          {stage === "prelim" && !isCongress && (
            <Field label="Pairing method" htmlFor="method" hint={help}>
              <NativeSelect id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {stage === "elim" && !isCongress && (
            <Field
              label="Bracket size"
              htmlFor="breakSize"
              hint="Entries remaining at the start of this round."
            >
              <Input
                id="breakSize"
                name="breakSize"
                type="number"
                min={2}
                max={256}
                defaultValue={elimRemaining || 8}
              />
            </Field>
          )}
          {isCongress && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Chambers" htmlFor="chambers" hint="Leave blank to size automatically.">
                <Input id="chambers" name="chambers" type="number" min={1} max={40} />
              </Field>
              <Field
                label="Keep chambers from"
                htmlFor="continueFrom"
                hint="Sessions usually keep the same chambers."
              >
                <NativeSelect
                  id="continueFrom"
                  name="continueFrom"
                  defaultValue={previousRounds.at(-1)?.id ?? ""}
                >
                  <option value="">New chambers</option>
                  {previousRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Label"
              htmlFor="label"
              hint="Optional — e.g. “Round 3” or “Quarterfinals”."
            >
              <Input id="label" name="label" />
            </Field>
            <Field
              label="Timeslot"
              htmlFor="timeslotId"
              hint="Used to avoid double-booking judges and rooms."
            >
              <NativeSelect id="timeslotId" name="timeslotId">
                <option value="">None</option>
                {timeslots.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {!isCongress && (
            <Field
              label="Flights"
              htmlFor="flights"
              hint="Split debates into flights sharing judges and rooms."
            >
              <NativeSelect id="flights" name="flights" defaultValue="1">
                <option value="1">1 (no flights)</option>
                <option value="2">2 flights</option>
              </NativeSelect>
            </Field>
          )}
          {format === "world_schools" && (
            <Field label="Motion" htmlFor="motion" hint="Released to everyone when you choose.">
              <Textarea id="motion" name="motion" rows={2} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create &amp; pair
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
