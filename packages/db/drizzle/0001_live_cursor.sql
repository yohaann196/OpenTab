CREATE TABLE "live_cursor" (
	"tournament_id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"last_event" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_cursor" ADD CONSTRAINT "live_cursor_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE cascade ON UPDATE no action;