/**
 * OpenTab database schema (Postgres, Drizzle ORM).
 *
 * Conventions: snake_case columns, `*_id` foreign keys, uuid primary keys,
 * explicit ON DELETE behaviour, real enums. Format-specific configuration lives
 * in one typed JSONB column per event (validated by the engine's Zod schemas)
 * instead of key/value "settings" tables.
 */

import { randomBytes } from "node:crypto";
import type { EventConfig } from "@opentab/engine";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth (Better Auth core tables; ids are text)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const tournamentStatus = pgEnum("tournament_status", [
  "setup",
  "live",
  "completed",
  "archived",
]);
export const visibility = pgEnum("visibility", ["public", "unlisted", "private"]);
export const memberRole = pgEnum("member_role", [
  "owner",
  "director",
  "tabber",
  "checker",
  "viewer",
]);
export const eventFormat = pgEnum("event_format", [
  "policy",
  "ld",
  "pf",
  "congress",
  "world_schools",
]);
export const entryStatus = pgEnum("entry_status", ["active", "dropped", "waitlisted"]);
export const conflictKind = pgEnum("conflict_kind", ["conflict", "strike"]);
export const conflictSource = pgEnum("conflict_source", ["tab", "judge", "entry"]);
export const tokenSubject = pgEnum("token_subject", ["judge", "entry"]);
export const roundStage = pgEnum("round_stage", ["prelim", "elim"]);
export const roundMethod = pgEnum("round_method", [
  "random",
  "protected",
  "balanced",
  "powermatch",
  "round_robin",
  "elim",
  "congress",
  "manual",
]);
export const roundStatus = pgEnum("round_status", ["draft", "published", "completed"]);
export const side = pgEnum("side", ["A", "B"]);
export const judgeRole = pgEnum("judge_role", [
  "chair",
  "panelist",
  "trainee",
  "parliamentarian",
  "scorer",
]);
export const ballotStatus = pgEnum("ballot_status", ["pending", "draft", "submitted", "confirmed"]);
export const ballotSource = pgEnum("ballot_source", ["judge", "tab"]);
export const snapshotKind = pgEnum("snapshot_kind", [
  "pairings",
  "standings",
  "speakers",
  "bracket",
  "chambers",
]);
export const followTarget = pgEnum("follow_target", ["entry", "judge", "school", "tournament"]);
export const followChannel = pgEnum("follow_channel", ["push", "email"]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export interface TournamentSettings {
  /** Show only entry codes publicly (privacy for minors). */
  codesOnly?: boolean;
  /** Show judge names on public pairings. */
  showJudges?: boolean;
  /** Release RFDs/ballots to entries automatically once a round is completed. */
  releaseBallots?: boolean;
  /** Show standings publicly during the tournament. */
  publicStandings?: boolean;
  announcement?: string;
}

export const tournament = pgTable("tournament", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  location: text("location"),
  description: text("description"),
  status: tournamentStatus("status").notNull().default("setup"),
  visibility: visibility("visibility").notNull().default("public"),
  settings: jsonb("settings").$type<TournamentSettings>().notNull().default({}),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tournamentMember = pgTable(
  "tournament_member",
  {
    id: id(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournament.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tournament_member_unique").on(t.tournamentId, t.userId)],
);

export const tournamentInvite = pgTable("tournament_invite", {
  id: id(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournament.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRole("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const tournamentFk = () =>
  uuid("tournament_id")
    .notNull()
    .references(() => tournament.id, { onDelete: "cascade" });

export const timeslot = pgTable("timeslot", {
  id: id(),
  tournamentId: tournamentFk(),
  label: text("label").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  sort: integer("sort").notNull().default(0),
});

export const room = pgTable(
  "room",
  {
    id: id(),
    tournamentId: tournamentFk(),
    name: text("name").notNull(),
    building: text("building"),
    capacity: integer("capacity"),
    priority: integer("priority").notNull().default(0),
    accessible: boolean("accessible").notNull().default(false),
    onlineUrl: text("online_url"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("room_tournament_idx").on(t.tournamentId)],
);

export const roomBlock = pgTable(
  "room_block",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    timeslotId: uuid("timeslot_id")
      .notNull()
      .references(() => timeslot.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.timeslotId] })],
);

export const school = pgTable(
  "school",
  {
    id: id(),
    tournamentId: tournamentFk(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    region: text("region"),
    contactEmail: text("contact_email"),
  },
  (t) => [index("school_tournament_idx").on(t.tournamentId)],
);

export const judgePool = pgTable("judge_pool", {
  id: id(),
  tournamentId: tournamentFk(),
  name: text("name").notNull(),
});

export const event = pgTable(
  "event",
  {
    id: id(),
    tournamentId: tournamentFk(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation").notNull(),
    format: eventFormat("format").notNull(),
    config: jsonb("config").$type<EventConfig>().notNull(),
    judgePoolId: uuid("judge_pool_id").references(() => judgePool.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("event_tournament_idx").on(t.tournamentId)],
);

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export const entry = pgTable(
  "entry",
  {
    id: id(),
    tournamentId: tournamentFk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => school.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: entryStatus("status").notNull().default("active"),
    seed: integer("seed"),
    requiresAccessible: boolean("requires_accessible").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("entry_event_idx").on(t.eventId), index("entry_tournament_idx").on(t.tournamentId)],
);

export const competitor = pgTable(
  "competitor",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    pronouns: text("pronouns"),
    sort: integer("sort").notNull().default(0),
    /** Opt out of public display (privacy for minors). */
    hidePublic: boolean("hide_public").notNull().default(false),
  },
  (t) => [index("competitor_entry_idx").on(t.entryId)],
);

export const judge = pgTable(
  "judge",
  {
    id: id(),
    tournamentId: tournamentFk(),
    schoolId: uuid("school_id").references(() => school.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    roundsOwed: integer("rounds_owed").notNull().default(0),
    rating: integer("rating").notNull().default(5),
    paradigm: text("paradigm"),
    active: boolean("active").notNull().default(true),
    trainee: boolean("trainee").notNull().default(false),
    notes: text("notes"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("judge_tournament_idx").on(t.tournamentId)],
);

export const judgePoolMember = pgTable(
  "judge_pool_member",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => judgePool.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.poolId, t.judgeId] })],
);

export const judgeBlock = pgTable(
  "judge_block",
  {
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    timeslotId: uuid("timeslot_id")
      .notNull()
      .references(() => timeslot.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.judgeId, t.timeslotId] })],
);

export const conflict = pgTable(
  "conflict",
  {
    id: id(),
    tournamentId: tournamentFk(),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => entry.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => school.id, { onDelete: "cascade" }),
    kind: conflictKind("kind").notNull().default("conflict"),
    source: conflictSource("source").notNull().default("tab"),
    createdAt: createdAt(),
  },
  (t) => [index("conflict_judge_idx").on(t.judgeId)],
);

export const prefSheet = pgTable(
  "pref_sheet",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pref_sheet_entry_unique").on(t.entryId)],
);

export const pref = pgTable(
  "pref",
  {
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => prefSheet.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal"),
    tier: integer("tier"),
    strike: boolean("strike").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.sheetId, t.judgeId] })],
);

/** Private links for judges and entries (no password needed). */
export const accessToken = pgTable(
  "access_token",
  {
    id: id(),
    tournamentId: tournamentFk(),
    token: text("token").notNull().unique(),
    subjectType: tokenSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("access_token_subject_idx").on(t.subjectType, t.subjectId)],
);

// ---------------------------------------------------------------------------
// Competition
// ---------------------------------------------------------------------------

export interface RoundSettings {
  /** Elim rounds: bracket size of the break (e.g. 16). */
  breakSize?: number;
  reseed?: boolean;
  /** Congress: number of chambers. */
  chambers?: number;
  /** Continue chambers from this round (Congress sessions). */
  continueFromRoundId?: string;
}

export const round = pgTable(
  "round",
  {
    id: id(),
    tournamentId: tournamentFk(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    label: text("label").notNull(),
    stage: roundStage("stage").notNull().default("prelim"),
    method: roundMethod("method").notNull(),
    timeslotId: uuid("timeslot_id").references(() => timeslot.id, { onDelete: "set null" }),
    flights: integer("flights").notNull().default(1),
    panelSize: integer("panel_size").notNull().default(1),
    motion: text("motion"),
    motionReleased: boolean("motion_released").notNull().default(false),
    status: roundStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledPublishAt: timestamp("scheduled_publish_at", { withTimezone: true }),
    ballotsReleased: boolean("ballots_released").notNull().default(false),
    settings: jsonb("settings").$type<RoundSettings>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("round_event_seq").on(t.eventId, t.seq)],
);

export const pairing = pgTable(
  "pairing",
  {
    id: id(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    flight: integer("flight").notNull().default(1),
    bracket: integer("bracket"),
    bye: boolean("bye").notNull().default(false),
    roomId: uuid("room_id").references(() => room.id, { onDelete: "set null" }),
    locked: boolean("locked").notNull().default(false),
    sidesPending: boolean("sides_pending").notNull().default(false),
    /** Elim bracket slot / Congress chamber label. */
    elimSlot: integer("elim_slot"),
    label: text("label"),
    /** Cached decision: winning entry (two-team). */
    winnerEntryId: uuid("winner_entry_id").references(() => entry.id, { onDelete: "set null" }),
    forfeitEntryId: uuid("forfeit_entry_id").references(() => entry.id, { onDelete: "set null" }),
    explain: jsonb("explain").$type<{ term: string; cost: number; detail: string }[]>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (t) => [index("pairing_round_idx").on(t.roundId)],
);

export const pairingEntry = pgTable(
  "pairing_entry",
  {
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => pairing.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    side: side("side"),
    position: integer("position").notNull().default(0),
    pulledUp: boolean("pulled_up").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.pairingId, t.entryId] }),
    index("pairing_entry_entry_idx").on(t.entryId),
  ],
);

export const pairingJudge = pgTable(
  "pairing_judge",
  {
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => pairing.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    role: judgeRole("role").notNull().default("panelist"),
  },
  (t) => [
    primaryKey({ columns: [t.pairingId, t.judgeId] }),
    index("pairing_judge_judge_idx").on(t.judgeId),
  ],
);

export interface CongressBallotData {
  speeches: { entryId: string; points: number }[];
  ranks: { entryId: string; rank: number }[];
  po?: { entryId: string; points: number } | null;
}

export interface BallotFeedback {
  /** Per-entry written comments (entryId → text). */
  comments?: Record<string, string>;
  /** Tab-only notes. */
  privateNote?: string;
}

export const ballot = pgTable(
  "ballot",
  {
    id: id(),
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => pairing.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => judge.id, { onDelete: "cascade" }),
    status: ballotStatus("status").notNull().default("pending"),
    winnerEntryId: uuid("winner_entry_id").references(() => entry.id, { onDelete: "set null" }),
    rfd: text("rfd"),
    feedback: jsonb("feedback").$type<BallotFeedback>().notNull().default({}),
    congress: jsonb("congress").$type<CongressBallotData>(),
    source: ballotSource("source").notNull().default("judge"),
    enteredByUserId: text("entered_by_user_id").references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rfdDeadline: timestamp("rfd_deadline", { withTimezone: true }),
    correctionRequest: text("correction_request"),
    version: integer("version").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ballot_pairing_judge").on(t.pairingId, t.judgeId),
    index("ballot_judge_idx").on(t.judgeId),
  ],
);

export const speakerScore = pgTable(
  "speaker_score",
  {
    id: id(),
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => ballot.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => competitor.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    reply: boolean("reply").notNull().default(false),
    points: doublePrecision("points").notNull(),
    rank: integer("rank"),
    components: jsonb("components").$type<{ style: number; content: number; strategy: number }>(),
  },
  (t) => [index("speaker_score_ballot_idx").on(t.ballotId)],
);

/** Congress speech log kept by the PO / parliamentarian. */
export const congressSpeech = pgTable(
  "congress_speech",
  {
    id: id(),
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => pairing.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    legislation: text("legislation"),
    stance: text("stance"),
    createdAt: createdAt(),
  },
  (t) => [index("congress_speech_pairing_idx").on(t.pairingId)],
);

export const breakEntry = pgTable(
  "break_entry",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.entryId] })],
);

// ---------------------------------------------------------------------------
// Read models, notifications, audit
// ---------------------------------------------------------------------------

/** Immutable published views; public pages read only from here. */
export const publishedSnapshot = pgTable(
  "published_snapshot",
  {
    id: id(),
    tournamentId: tournamentFk(),
    kind: snapshotKind("kind").notNull(),
    refId: uuid("ref_id").notNull(),
    version: integer("version").notNull().default(1),
    data: jsonb("data").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("published_snapshot_ref").on(t.kind, t.refId),
    index("published_snapshot_tournament_idx").on(t.tournamentId),
  ],
);

export const follow = pgTable(
  "follow",
  {
    id: id(),
    tournamentId: tournamentFk(),
    targetType: followTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    channel: followChannel("channel").notNull(),
    /** Email address, or the push subscription endpoint. */
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    unsubscribeToken: text("unsubscribe_token")
      .notNull()
      .$defaultFn(() => randomBytes(18).toString("hex")),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("follow_unique").on(
      t.tournamentId,
      t.targetType,
      t.targetId,
      t.channel,
      t.endpoint,
    ),
    index("follow_target_idx").on(t.targetType, t.targetId),
  ],
);

export const notificationLog = pgTable("notification_log", {
  id: id(),
  tournamentId: tournamentFk(),
  followId: uuid("follow_id").references(() => follow.id, { onDelete: "set null" }),
  channel: followChannel("channel").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    tournamentId: tournamentFk(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_tournament_idx").on(t.tournamentId, t.createdAt)],
);
