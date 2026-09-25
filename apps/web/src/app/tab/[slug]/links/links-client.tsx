"use client";

import { Check, Copy, KeyRound, Printer, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ensureTokensAction, rotateTokenAction } from "@/app/tab/actions";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/lib/use-action";
import { timeAgo } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  sub: string;
  email: string | null;
  token: string | null;
  lastUsedAt: string | null;
};

export function LinksClient({
  slug,
  tournamentId,
  appUrl,
  judges,
  entries,
}: {
  slug: string;
  tournamentId: string;
  appUrl: string;
  judges: Row[];
  entries: Row[];
}) {
  const { exec, pending } = useAction();
  const missing = [...judges, ...entries].filter((r) => !r.token).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {missing > 0 ? (
          <Button
            onClick={() =>
              exec(() => ensureTokensAction(slug, tournamentId), {
                success: (n) => `Created ${n} links`,
              })
            }
            loading={pending}
          >
            <Sparkles /> Create {missing} missing link{missing === 1 ? "" : "s"}
          </Button>
        ) : (
          <Badge tone="success">
            <Check /> Everyone has a link
          </Badge>
        )}
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <Link href={`/tab/${slug}/links/print?type=judge`} target="_blank">
            <Printer /> Print judge QR cards
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/tab/${slug}/links/print?type=entry`} target="_blank">
            <Printer /> Print entry QR cards
          </Link>
        </Button>
      </div>
      <Tabs defaultValue="judges">
        <TabsList>
          <TabsTrigger value="judges">Judges ({judges.length})</TabsTrigger>
          <TabsTrigger value="entries">Entries ({entries.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="judges" className="mt-4">
          <LinkTable
            rows={judges}
            kind="judge"
            slug={slug}
            tournamentId={tournamentId}
            appUrl={appUrl}
          />
        </TabsContent>
        <TabsContent value="entries" className="mt-4">
          <LinkTable
            rows={entries}
            kind="entry"
            slug={slug}
            tournamentId={tournamentId}
            appUrl={appUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LinkTable({
  rows,
  kind,
  slug,
  tournamentId,
  appUrl,
}: {
  rows: Row[];
  kind: "judge" | "entry";
  slug: string;
  tournamentId: string;
  appUrl: string;
}) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const { exec } = useAction();
  const shown = rows.filter((r) => matches(q, r.name, r.sub, r.email));
  if (rows.length === 0) return <EmptyState icon={KeyRound} title={`No ${kind}s yet`} />;
  return (
    <div className="space-y-3">
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={`Search ${kind}s`}
        className="w-full sm:w-72"
      />
      <Table>
        <THead>
          <TR>
            <TH>{kind === "judge" ? "Judge" : "Entry"}</TH>
            <TH>Link</TH>
            <TH>Last opened</TH>
            <TH className="w-28">
              <span className="sr-only">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {shown.map((r) => {
            const url = r.token ? `${appUrl}/p/${r.token}` : null;
            return (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-fg-subtle">{r.sub}</div>
                </TD>
                <TD className="max-w-72">
                  {url ? (
                    <code className="block truncate text-xs text-fg-muted">{url}</code>
                  ) : (
                    <span className="text-xs text-fg-subtle">Not created yet</span>
                  )}
                </TD>
                <TD className="text-xs text-fg-muted">
                  {r.lastUsedAt ? timeAgo(r.lastUsedAt) : "Never"}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    {url && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copy link for ${r.name}`}
                        onClick={async () => {
                          await navigator.clipboard.writeText(url);
                          setCopied(r.id);
                          toast.success("Link copied");
                          setTimeout(() => setCopied(null), 1500);
                        }}
                      >
                        {copied === r.id ? <Check /> : <Copy />}
                      </Button>
                    )}
                    {r.token && (
                      <ConfirmButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Reset link for ${r.name}`}
                        title={`Reset ${r.name}'s link?`}
                        description="The old link stops working immediately. Use this if a link was shared by mistake."
                        confirmLabel="Reset link"
                        onConfirm={() =>
                          exec(() => rotateTokenAction(slug, tournamentId, kind, r.id))
                        }
                      >
                        <RefreshCw />
                      </ConfirmButton>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
