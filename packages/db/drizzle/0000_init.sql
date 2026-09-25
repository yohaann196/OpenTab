CREATE TYPE "public"."ballot_source" AS ENUM('judge', 'tab');--> statement-breakpoint
CREATE TYPE "public"."ballot_status" AS ENUM('pending', 'draft', 'submitted', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."conflict_kind" AS ENUM('conflict', 'strike');--> statement-breakpoint
CREATE TYPE "public"."conflict_source" AS ENUM('tab', 'judge', 'entry');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('active', 'dropped', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."event_format" AS ENUM('policy', 'ld', 'pf', 'congress', 'world_schools');--> statement-breakpoint
CREATE TYPE "public"."follow_channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."follow_target" AS ENUM('entry', 'judge', 'school', 'tournament');--> statement-breakpoint
CREATE TYPE "public"."judge_role" AS ENUM('chair', 'panelist', 'trainee', 'parliamentarian', 'scorer');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'director', 'tabber', 'checker', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."round_method" AS ENUM('random', 'protected', 'balanced', 'powermatch', 'round_robin', 'elim', 'congress', 'manual');--> statement-breakpoint
CREATE TYPE "public"."round_stage" AS ENUM('prelim', 'elim');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('draft', 'published', 'completed');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."snapshot_kind" AS ENUM('pairings', 'standings', 'speakers', 'bracket', 'chambers');--> statement-breakpoint
CREATE TYPE "public"."token_subject" AS ENUM('judge', 'entry');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('setup', 'live', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "access_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"token" text NOT NULL,
	"subject_type" "token_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairing_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"status" "ballot_status" DEFAULT 'pending' NOT NULL,
	"winner_entry_id" uuid,
	"rfd" text,
	"feedback" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"congress" jsonb,
	"source" "ballot_source" DEFAULT 'judge' NOT NULL,
	"entered_by_user_id" text,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"rfd_deadline" timestamp with time zone,
	"correction_request" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_entry" (
	"event_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"seed" integer NOT NULL,
	CONSTRAINT "break_entry_event_id_entry_id_pk" PRIMARY KEY("event_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "competitor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"pronouns" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"hide_public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"entry_id" uuid,
	"school_id" uuid,
	"kind" "conflict_kind" DEFAULT 'conflict' NOT NULL,
	"source" "conflict_source" DEFAULT 'tab' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "congress_speech" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pairing_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"legislation" text,
	"stance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"school_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "entry_status" DEFAULT 'active' NOT NULL,
	"seed" integer,
	"requires_accessible" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"format" "event_format" NOT NULL,
	"config" jsonb NOT NULL,
	"judge_pool_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"target_type" "follow_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"channel" "follow_channel" NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb,
	"user_id" text,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"school_id" uuid,
	"user_id" text,
	"name" text NOT NULL,
	"email" text,
	"rounds_owed" integer DEFAULT 0 NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"paradigm" text,
	"active" boolean DEFAULT true NOT NULL,
	"trainee" boolean DEFAULT false NOT NULL,
	"notes" text,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_block" (
	"judge_id" uuid NOT NULL,
	"timeslot_id" uuid NOT NULL,
	CONSTRAINT "judge_block_judge_id_timeslot_id_pk" PRIMARY KEY("judge_id","timeslot_id")
);
--> statement-breakpoint
CREATE TABLE "judge_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_pool_member" (
	"pool_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	CONSTRAINT "judge_pool_member_pool_id_judge_id_pk" PRIMARY KEY("pool_id","judge_id")
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"follow_id" uuid,
	"channel" "follow_channel" NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"flight" integer DEFAULT 1 NOT NULL,
	"bracket" integer,
	"bye" boolean DEFAULT false NOT NULL,
	"room_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"sides_pending" boolean DEFAULT false NOT NULL,
	"elim_slot" integer,
	"label" text,
	"winner_entry_id" uuid,
	"forfeit_entry_id" uuid,
	"explain" jsonb,
	"started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pairing_entry" (
	"pairing_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"side" "side",
	"position" integer DEFAULT 0 NOT NULL,
	"pulled_up" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pairing_entry_pairing_id_entry_id_pk" PRIMARY KEY("pairing_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "pairing_judge" (
	"pairing_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"role" "judge_role" DEFAULT 'panelist' NOT NULL,
	CONSTRAINT "pairing_judge_pairing_id_judge_id_pk" PRIMARY KEY("pairing_id","judge_id")
);
--> statement-breakpoint
CREATE TABLE "pref" (
	"sheet_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"ordinal" integer,
	"tier" integer,
	"strike" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pref_sheet_id_judge_id_pk" PRIMARY KEY("sheet_id","judge_id")
);
--> statement-breakpoint
CREATE TABLE "pref_sheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"kind" "snapshot_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"building" text,
	"capacity" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"accessible" boolean DEFAULT false NOT NULL,
	"online_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_block" (
	"room_id" uuid NOT NULL,
	"timeslot_id" uuid NOT NULL,
	CONSTRAINT "room_block_room_id_timeslot_id_pk" PRIMARY KEY("room_id","timeslot_id")
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"label" text NOT NULL,
	"stage" "round_stage" DEFAULT 'prelim' NOT NULL,
	"method" "round_method" NOT NULL,
	"timeslot_id" uuid,
	"flights" integer DEFAULT 1 NOT NULL,
	"panel_size" integer DEFAULT 1 NOT NULL,
	"motion" text,
	"motion_released" boolean DEFAULT false NOT NULL,
	"status" "round_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"scheduled_publish_at" timestamp with time zone,
	"ballots_released" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"region" text,
	"contact_email" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "speaker_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ballot_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reply" boolean DEFAULT false NOT NULL,
	"points" double precision NOT NULL,
	"rank" integer,
	"components" jsonb
);
--> statement-breakpoint
CREATE TABLE "timeslot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"location" text,
	"description" text,
	"status" "tournament_status" DEFAULT 'setup' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tournament_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tournament_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_pairing_id_pairing_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."pairing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_winner_entry_id_entry_id_fk" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_entered_by_user_id_user_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_entry" ADD CONSTRAINT "break_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_entry" ADD CONSTRAINT "break_entry_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor" ADD CONSTRAINT "competitor_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict" ADD CONSTRAINT "conflict_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict" ADD CONSTRAINT "conflict_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict" ADD CONSTRAINT "conflict_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict" ADD CONSTRAINT "conflict_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "congress_speech" ADD CONSTRAINT "congress_speech_pairing_id_pairing_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."pairing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "congress_speech" ADD CONSTRAINT "congress_speech_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_judge_pool_id_judge_pool_id_fk" FOREIGN KEY ("judge_pool_id") REFERENCES "public"."judge_pool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge" ADD CONSTRAINT "judge_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge" ADD CONSTRAINT "judge_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge" ADD CONSTRAINT "judge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_block" ADD CONSTRAINT "judge_block_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_block" ADD CONSTRAINT "judge_block_timeslot_id_timeslot_id_fk" FOREIGN KEY ("timeslot_id") REFERENCES "public"."timeslot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_pool" ADD CONSTRAINT "judge_pool_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_pool_member" ADD CONSTRAINT "judge_pool_member_pool_id_judge_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."judge_pool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_pool_member" ADD CONSTRAINT "judge_pool_member_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_follow_id_follow_id_fk" FOREIGN KEY ("follow_id") REFERENCES "public"."follow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing" ADD CONSTRAINT "pairing_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing" ADD CONSTRAINT "pairing_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing" ADD CONSTRAINT "pairing_winner_entry_id_entry_id_fk" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing" ADD CONSTRAINT "pairing_forfeit_entry_id_entry_id_fk" FOREIGN KEY ("forfeit_entry_id") REFERENCES "public"."entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_entry" ADD CONSTRAINT "pairing_entry_pairing_id_pairing_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."pairing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_entry" ADD CONSTRAINT "pairing_entry_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_judge" ADD CONSTRAINT "pairing_judge_pairing_id_pairing_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."pairing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_judge" ADD CONSTRAINT "pairing_judge_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref" ADD CONSTRAINT "pref_sheet_id_pref_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."pref_sheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref" ADD CONSTRAINT "pref_judge_id_judge_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."judge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pref_sheet" ADD CONSTRAINT "pref_sheet_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_snapshot" ADD CONSTRAINT "published_snapshot_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_timeslot_id_timeslot_id_fk" FOREIGN KEY ("timeslot_id") REFERENCES "public"."timeslot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_timeslot_id_timeslot_id_fk" FOREIGN KEY ("timeslot_id") REFERENCES "public"."timeslot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_score" ADD CONSTRAINT "speaker_score_ballot_id_ballot_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."ballot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_score" ADD CONSTRAINT "speaker_score_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_score" ADD CONSTRAINT "speaker_score_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeslot" ADD CONSTRAINT "timeslot_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_invite" ADD CONSTRAINT "tournament_invite_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_member" ADD CONSTRAINT "tournament_member_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_member" ADD CONSTRAINT "tournament_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_token_subject_idx" ON "access_token" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_log_tournament_idx" ON "audit_log" USING btree ("tournament_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ballot_pairing_judge" ON "ballot" USING btree ("pairing_id","judge_id");--> statement-breakpoint
CREATE INDEX "ballot_judge_idx" ON "ballot" USING btree ("judge_id");--> statement-breakpoint
CREATE INDEX "competitor_entry_idx" ON "competitor" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "conflict_judge_idx" ON "conflict" USING btree ("judge_id");--> statement-breakpoint
CREATE INDEX "congress_speech_pairing_idx" ON "congress_speech" USING btree ("pairing_id");--> statement-breakpoint
CREATE INDEX "entry_event_idx" ON "entry" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "entry_tournament_idx" ON "entry" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "event_tournament_idx" ON "event" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_unique" ON "follow" USING btree ("tournament_id","target_type","target_id","channel","endpoint");--> statement-breakpoint
CREATE INDEX "follow_target_idx" ON "follow" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "judge_tournament_idx" ON "judge" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "pairing_round_idx" ON "pairing" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "pairing_entry_entry_idx" ON "pairing_entry" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "pairing_judge_judge_idx" ON "pairing_judge" USING btree ("judge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pref_sheet_entry_unique" ON "pref_sheet" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "published_snapshot_ref" ON "published_snapshot" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX "published_snapshot_tournament_idx" ON "published_snapshot" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "room_tournament_idx" ON "room" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_event_seq" ON "round" USING btree ("event_id","seq");--> statement-breakpoint
CREATE INDEX "school_tournament_idx" ON "school" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "speaker_score_ballot_idx" ON "speaker_score" USING btree ("ballot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_member_unique" ON "tournament_member" USING btree ("tournament_id","user_id");