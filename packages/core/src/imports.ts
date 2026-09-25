import { competitor, type Db, entry, event, judge, room, school } from "@opentab/db";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { invalid } from "./errors";

/**
 * CSV import with column mapping, a dry-run preview with per-row errors, and
 * an atomic commit. Missing schools referenced by entries/judges are created.
 */

export type ImportKind = "schools" | "entries" | "judges" | "rooms";

export const IMPORT_FIELDS: Record<
  ImportKind,
  { key: string; label: string; required?: boolean; aliases: string[] }[]
> = {
  schools: [
    {
      key: "name",
      label: "School name",
      required: true,
      aliases: ["school", "institution", "school name", "team"],
    },
    { key: "code", label: "Code", aliases: ["abbr", "abbreviation", "short", "school code"] },
    { key: "region", label: "Region/state", aliases: ["state", "district", "region"] },
    { key: "contactEmail", label: "Contact email", aliases: ["email", "coach email", "contact"] },
  ],
  entries: [
    { key: "event", label: "Event", required: true, aliases: ["event", "division", "format"] },
    { key: "school", label: "School", aliases: ["school", "institution", "team school"] },
    { key: "code", label: "Entry code", aliases: ["code", "entry code", "team code"] },
    { key: "name", label: "Entry name", aliases: ["name", "team name", "entry name"] },
    {
      key: "competitor1",
      label: "Competitor 1",
      required: true,
      aliases: [
        "competitor 1",
        "debater 1",
        "speaker 1",
        "student 1",
        "competitor",
        "debater",
        "student",
        "first speaker",
      ],
    },
    {
      key: "competitor2",
      label: "Competitor 2",
      aliases: ["competitor 2", "debater 2", "speaker 2", "student 2", "partner", "second speaker"],
    },
    {
      key: "competitor3",
      label: "Competitor 3",
      aliases: ["competitor 3", "debater 3", "speaker 3", "student 3"],
    },
    {
      key: "competitor4",
      label: "Competitor 4",
      aliases: ["competitor 4", "debater 4", "speaker 4", "student 4"],
    },
    {
      key: "competitor5",
      label: "Competitor 5",
      aliases: ["competitor 5", "debater 5", "speaker 5", "student 5"],
    },
    { key: "seed", label: "Seed", aliases: ["seed", "rank"] },
    {
      key: "accessible",
      label: "Needs accessible room",
      aliases: ["accessible", "ada", "accessibility"],
    },
  ],
  judges: [
    {
      key: "name",
      label: "Name",
      required: true,
      aliases: ["judge", "judge name", "name", "full name"],
    },
    { key: "email", label: "Email", aliases: ["email", "e-mail"] },
    { key: "school", label: "School", aliases: ["school", "institution", "affiliation"] },
    {
      key: "rounds",
      label: "Rounds owed",
      aliases: ["rounds", "obligation", "rounds owed", "commitment"],
    },
    { key: "rating", label: "Tab rating (0–10)", aliases: ["rating", "tab rating", "quality"] },
    { key: "paradigm", label: "Paradigm", aliases: ["paradigm", "philosophy"] },
  ],
  rooms: [
    {
      key: "name",
      label: "Room",
      required: true,
      aliases: ["room", "name", "room name", "number"],
    },
    { key: "building", label: "Building", aliases: ["building", "site", "location"] },
    { key: "capacity", label: "Capacity", aliases: ["capacity", "seats", "size"] },
    { key: "priority", label: "Priority", aliases: ["priority", "quality", "rank"] },
    { key: "accessible", label: "Accessible", aliases: ["accessible", "ada", "wheelchair"] },
    {
      key: "onlineUrl",
      label: "Online room URL",
      aliases: ["url", "link", "online url", "zoom", "meet"],
    },
  ],
};

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [headers = [], ...rows] = res.data;
  return {
    headers: headers.map((h) => h.trim()),
    rows: rows.map((r) => r.map((c) => (c ?? "").trim())),
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Guesses a field → column index mapping from header names. */
export function guessMapping(kind: ImportKind, headers: string[]): Record<string, number | null> {
  const mapping: Record<string, number | null> = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS[kind]) {
    const candidates = [field.key, field.label, ...field.aliases].map(norm);
    let idx = headers.findIndex((h, i) => !used.has(i) && candidates.includes(norm(h)));
    if (idx === -1)
      idx = headers.findIndex(
        (h, i) => !used.has(i) && candidates.some((c) => norm(h).includes(c) && c.length > 3),
      );
    mapping[field.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

export interface PreviewRow {
  index: number;
  values: Record<string, string>;
  errors: string[];
}

const truthy = (v: string) => /^(y|yes|true|1|x)$/i.test(v.trim());

export function previewImport(
  kind: ImportKind,
  csv: ParsedCsv,
  mapping: Record<string, number | null>,
  ctx: { eventAbbrs: string[] },
): PreviewRow[] {
  const fields = IMPORT_FIELDS[kind];
  const eventSet = new Set(ctx.eventAbbrs.map((e) => e.toLowerCase()));
  return csv.rows.map((row, index) => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const col = mapping[f.key];
      values[f.key] = col != null ? (row[col] ?? "") : "";
    }
    const errors: string[] = [];
    for (const f of fields) if (f.required && !values[f.key]) errors.push(`${f.label} is required`);
    if (kind === "entries" && values.event && !eventSet.has(values.event.toLowerCase())) {
      errors.push(`Unknown event "${values.event}" (use one of ${ctx.eventAbbrs.join(", ")})`);
    }
    for (const numeric of ["seed", "rounds", "rating", "capacity", "priority"]) {
      if (values[numeric] && !/^\d+$/.test(values[numeric]!))
        errors.push(`${numeric} must be a whole number`);
    }
    if (values.rating && Number(values.rating) > 10) errors.push("rating must be 0–10");
    return { index, values, errors };
  });
}

function schoolCode(name: string): string {
  const words = name
    .replace(/\b(high school|school|academy|hs|prep|the)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name.slice(0, 4).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

export async function commitImport(
  db: Db,
  actor: Actor,
  tournamentId: string,
  kind: ImportKind,
  rows: PreviewRow[],
): Promise<{ created: number; schoolsCreated: number }> {
  const bad = rows.filter((r) => r.errors.length);
  if (bad.length) throw invalid(`${bad.length} row(s) have errors; fix them before importing`);
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "tabber");
    const schools = await tx.select().from(school).where(eq(school.tournamentId, tournamentId));
    const events = await tx.select().from(event).where(eq(event.tournamentId, tournamentId));
    let schoolsCreated = 0;
    const findOrCreateSchool = async (label: string): Promise<string | null> => {
      if (!label) return null;
      const l = label.toLowerCase();
      const found = schools.find((s) => s.name.toLowerCase() === l || s.code.toLowerCase() === l);
      if (found) return found.id;
      const [created] = await tx
        .insert(school)
        .values({ tournamentId, name: label, code: schoolCode(label) })
        .returning();
      schools.push(created!);
      schoolsCreated++;
      return created!.id;
    };

    let created = 0;
    for (const { values: v } of rows) {
      if (kind === "schools") {
        await tx.insert(school).values({
          tournamentId,
          name: v.name!,
          code: v.code || schoolCode(v.name!),
          region: v.region || null,
          contactEmail: v.contactEmail || null,
        });
      } else if (kind === "rooms") {
        await tx.insert(room).values({
          tournamentId,
          name: v.name!,
          building: v.building || null,
          capacity: v.capacity ? Number(v.capacity) : null,
          priority: v.priority ? Number(v.priority) : 0,
          accessible: v.accessible ? truthy(v.accessible) : false,
          onlineUrl: v.onlineUrl || null,
        });
      } else if (kind === "judges") {
        await tx.insert(judge).values({
          tournamentId,
          name: v.name!,
          email: v.email || null,
          schoolId: await findOrCreateSchool(v.school ?? ""),
          roundsOwed: v.rounds ? Number(v.rounds) : 0,
          rating: v.rating ? Number(v.rating) : 5,
          paradigm: v.paradigm || null,
        });
      } else {
        const ev = events.find((e) => e.abbreviation.toLowerCase() === v.event!.toLowerCase())!;
        const schoolId = await findOrCreateSchool(v.school ?? "");
        const sc = schools.find((s) => s.id === schoolId);
        const names = [
          v.competitor1,
          v.competitor2,
          v.competitor3,
          v.competitor4,
          v.competitor5,
        ].filter((n): n is string => !!n);
        const lastNames = names.map((n) => n.split(/\s+/).pop() ?? n);
        const code =
          v.code ||
          `${sc?.code ?? ""} ${lastNames.length === 1 ? names[0] : lastNames.map((n) => n[0]).join("")}`.trim();
        const [e] = await tx
          .insert(entry)
          .values({
            tournamentId,
            eventId: ev.id,
            schoolId,
            code,
            name: v.name || lastNames.join(" & "),
            seed: v.seed ? Number(v.seed) : null,
            requiresAccessible: v.accessible ? truthy(v.accessible) : false,
          })
          .returning();
        for (const [i, n] of names.entries())
          await tx.insert(competitor).values({ entryId: e!.id, name: n, sort: i });
      }
      created++;
    }
    await audit(tx, actor, {
      tournamentId,
      action: `import.${kind}`,
      entityType: kind,
      summary: `Imported ${created} ${kind}${schoolsCreated ? ` (+${schoolsCreated} new schools)` : ""}`,
    });
    return { created, schoolsCreated };
  });
}

/** Example CSVs shown in the import dialog. */
export const IMPORT_TEMPLATES: Record<ImportKind, string> = {
  schools: "School name,Code,State\nLincoln High School,LIN,NE\nRoosevelt Academy,ROO,IA\n",
  entries:
    "Event,School,Competitor 1,Competitor 2\nPF,Lincoln High School,Ava Nguyen,Liam Patel\nLD,Roosevelt Academy,Maya Chen,\n",
  judges:
    "Name,Email,School,Rounds owed,Rating\nJordan Lee,jordan@example.com,Lincoln High School,6,7\nSam Ortiz,,,,5\n",
  rooms: "Room,Building,Capacity,Priority,Accessible\n101,Main,30,10,yes\n102,Main,25,5,no\n",
};
