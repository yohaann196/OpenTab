import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Guide" };

const TOC = [
  ["getting-started", "Getting started"],
  ["import", "Importing your data"],
  ["pairing", "Pairing a round"],
  ["publishing", "Publishing & notifications"],
  ["ballots", "Ballots"],
  ["elims", "Breaks & elims"],
  ["congress", "Congress"],
  ["world-schools", "World Schools"],
  ["judges", "For judges"],
  ["competitors", "For competitors & coaches"],
  ["api", "Public API"],
  ["self-host", "Self-hosting"],
] as const;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 border-t border-border pt-10 text-2xl font-semibold tracking-tight first:border-0 first:pt-0"
    >
      {children}
    </h2>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Guide sections" className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Guide</p>
        <ul className="space-y-1 text-sm">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block rounded-md px-2 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="prose-sm max-w-3xl space-y-5 leading-relaxed text-fg [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg-muted [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-surface-2 [&_pre]:p-4 [&_pre]:text-[13px] [&_ul]:space-y-1 [&_ul]:text-fg-muted">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">The OpenTab guide</h1>
          <p className="text-lg">
            Everything a tab director, judge or competitor needs — in about ten minutes of reading.
          </p>
        </header>

        <H id="getting-started">Getting started</H>
        <p>
          <Link href="/sign-up" className="text-brand underline underline-offset-2">
            Create an account
          </Link>
          , then click <strong>New tournament</strong>. Pick your events from the format presets
          (LD, PF, Policy, Congress, World Schools) — each preset comes with sensible NSDA-style
          defaults for sides, points, tiebreaks and judging. You can change every rule later under
          an event&apos;s <strong>Settings</strong>, where each option explains itself in plain
          English.
        </p>
        <p>
          Invite your tab staff under <strong>Setup → Staff</strong>. Roles: <em>owner</em> and{" "}
          <em>director</em> manage the tournament; <em>tabber</em> pairs and publishes;{" "}
          <em>checker</em> enters and confirms ballots; <em>viewer</em> is read-only.
        </p>

        <H id="import">Importing your data</H>
        <p>
          Every data page (Schools, Entries, Judges, Rooms) has an <strong>Import CSV</strong>{" "}
          button. Drop a file exported from a spreadsheet or another system.
        </p>
        <ul>
          <li>Columns are matched automatically by name — adjust any mapping in the preview.</li>
          <li>
            Rows with problems (unknown event, missing names) are highlighted before anything is
            saved.
          </li>
          <li>Schools referenced by entries or judges are created for you.</li>
          <li>
            Entries only need an event, a school and competitor names; codes are generated if
            missing.
          </li>
        </ul>
        <p>
          Add conflicts under <strong>Data → Conflicts</strong>. Judges are automatically conflicted
          from their own school.
        </p>

        <H id="pairing">Pairing a round</H>
        <p>
          Open an event and click <strong>New round</strong>. OpenTab pairs it, places judges and
          rooms, and runs the pre-publish checks in one go. Early rounds use your preset method;
          later rounds are power-matched.
        </p>
        <ul>
          <li>
            <strong>Why this pairing?</strong> — every debate shows what the engine weighed: bracket
            position, pull-ups, side locks, same-school and rematch avoidance.
          </li>
          <li>
            <strong>Drag and drop</strong> teams to swap them, and judges between debates. Or click
            one team, then another, to swap without a mouse.
          </li>
          <li>
            <strong>Lock</strong> a debate to keep it when you re-pair the rest.
          </li>
          <li>
            <strong>History</strong> lists every change; click <em>Undo</em> to restore the draw
            from before it.
          </li>
          <li>
            The <strong>Issues</strong> panel lists every conflict, double-booking and missing room,
            with a suggested fix.
          </li>
        </ul>

        <H id="publishing">Publishing &amp; notifications</H>
        <p>
          <strong>Publish</strong> makes the round public, creates a ballot for every judge, and
          notifies followers by push notification and email. You can schedule publication for a set
          time. If you edit a published round, competitors keep seeing the published version until
          you click <strong>Update public pairings</strong>.
        </p>
        <p>
          Public pages update live — nobody needs to refresh — and they&apos;re served from cache so
          they stay fast when everyone checks at once.
        </p>

        <H id="ballots">Ballots</H>
        <p>
          The <strong>Ballots</strong> board shows every ballot live: missing, in progress,
          submitted or confirmed, and when each judge tapped &ldquo;I&apos;m in the room.&rdquo;
          Enter paper ballots from the same screen — the validation is identical to the judge&apos;s
          phone. Judges can submit the decision first and finish the RFD later; they can also send a
          correction request instead of walking to the tab room.
        </p>
        <p>
          Release ballots to entries per round from the round&apos;s <strong>More</strong> menu.
          Entries then see RFDs, comments and points in their private portal.
        </p>

        <H id="elims">Breaks &amp; elims</H>
        <p>
          On <strong>Break &amp; bracket</strong>, choose the break size. OpenTab shows who is last
          in and first out, and warns when the bubble is decided by tiebreaks. Partial brackets give
          byes to the top seeds. Pair each elim round with one click; sides switch from a previous
          meeting, or are decided by a coin flip. Same-school matchups are flagged as closeouts.
        </p>

        <H id="congress">Congress</H>
        <p>
          Sessions are split into chambers that spread schools and seeds evenly. Later sessions can
          keep the same chambers. Scorers rank legislators and score each speech on their phones;
          the presiding officer can be scored separately. Parliamentarians get a chamber tracker
          with a precedence/recency speaker queue and a speech log.
        </p>

        <H id="world-schools">World Schools</H>
        <p>
          Ballots score style, content and strategy for each speaker (defaults 40/40/20 of 60–80)
          plus a reply speech at half scale, and the winner must have the higher total. Set a motion
          on each round and release it when ready — everyone following the tournament is notified.
        </p>

        <H id="judges">For judges</H>
        <ul>
          <li>Open the private link or QR code the tab room gave you — no account or password.</li>
          <li>
            Your current room, teams and any online-room link are at the top. Tap &ldquo;I&apos;m in
            the room&rdquo; when you start.
          </li>
          <li>
            Your ballot saves on your phone as you go. If the Wi-Fi drops, it submits when
            you&apos;re back online.
          </li>
          <li>
            Short on time? Submit the decision now and finish the RFD later from the same page.
          </li>
        </ul>

        <H id="competitors">For competitors &amp; coaches</H>
        <ul>
          <li>
            Search your name on the tournament page (&ldquo;Find your round&rdquo;) to see your
            room, side and judge.
          </li>
          <li>Turn on notifications to hear about pairings the moment they&apos;re posted.</li>
          <li>
            With your entry&apos;s private link you can fill out pref sheets, and read ballots once
            the tab room releases them.
          </li>
        </ul>

        <H id="api">Public API</H>
        <p>
          Published data is available as JSON — no scraping required. The OpenAPI description is at{" "}
          <code>/api/v1/openapi.json</code>.
        </p>
        <pre>
          <code>{`GET /api/v1/public/tournaments?q=lincoln
GET /api/v1/public/t/{slug}
GET /api/v1/public/t/{slug}/rounds/{roundId}
GET /api/v1/public/t/{slug}/events/{eventId}/standings
GET /api/v1/public/t/{slug}/events/{eventId}/bracket
GET /api/v1/public/t/{slug}/find?q=nguyen`}</code>
        </pre>
        <p>
          Responses are cacheable. Please respect <code>Cache-Control</code> and keep to a few
          requests per second.
        </p>

        <H id="self-host">Self-hosting</H>
        <p>OpenTab runs on Node 22 and Postgres 16. The quickest way is Docker Compose:</p>
        <pre>
          <code>{`git clone https://github.com/yohaann196/opentab
cd opentab
cp .env.example .env        # set BETTER_AUTH_SECRET and APP_URL
docker compose up -d        # postgres + web + worker
docker compose exec web pnpm db:migrate`}</code>
        </pre>
        <p>
          Optional: set <code>SMTP_URL</code> for email, and generate Web Push keys with{" "}
          <code>pnpm --filter @opentab/worker vapid</code>. Put a CDN in front of <code>/t/*</code>{" "}
          and <code>/api/v1/public/*</code> for big tournaments.
        </p>
      </article>
    </div>
  );
}
