import { linksFor, listEntries, listJudges, requireTournamentBySlug } from "@opentab/core";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/session";
import { PrintButton } from "./print-button";

/** Printable sheet of QR cards: cut them out and hand them to judges / teams at registration. */
export default async function PrintLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const { type = "judge" } = await searchParams;
  const t = await requireTournamentBySlug(db(), slug);
  await requireStaff(t.id, "tabber");
  const kind = type === "entry" ? "entry" : "judge";
  const links = await linksFor(db(), t.id, kind);
  const byId = new Map(links.map((l) => [l.subjectId, l.token]));
  const people =
    kind === "judge"
      ? (await listJudges(db(), t.id)).map((j) => ({
          id: j.id,
          title: j.name,
          sub: j.schoolName ?? "",
        }))
      : (await listEntries(db(), t.id)).map((e) => ({
          id: e.id,
          title: e.code,
          sub: `${e.eventAbbr} · ${e.competitors.map((c) => c.name).join(", ")}`,
        }));
  const cards = await Promise.all(
    people
      .filter((p) => byId.has(p.id))
      .map(async (p) => {
        const url = `${env.appUrl}/p/${byId.get(p.id)}`;
        return {
          ...p,
          url,
          svg: await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
        };
      }),
  );
  return (
    <div className="bg-white p-6 text-black print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">
          {t.name} — {kind === "judge" ? "judge" : "entry"} QR cards ({cards.length})
        </h1>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.id}
            className="break-inside-avoid rounded-lg border border-dashed border-neutral-400 p-4 text-center"
          >
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">{t.name}</div>
            <div className="mt-1 truncate font-semibold">{c.title}</div>
            {c.sub && <div className="truncate text-xs text-neutral-600">{c.sub}</div>}
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated server-side by the qrcode library from our own URL */}
            <div
              className="mx-auto my-3 size-32 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: c.svg }}
            />
            <div className="text-[10px] text-neutral-600">
              Scan to{" "}
              {kind === "judge"
                ? "see your rounds and submit ballots"
                : "see your pairings and results"}
              . Keep this private.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
