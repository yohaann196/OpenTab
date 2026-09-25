"use client";

import { useRouter } from "next/navigation";
import { saveBallotViaLink } from "@/app/p/actions";
import { BallotForm } from "@/components/ballot/ballot-form";
import type { BallotFormData } from "@/components/ballot/types";

export function JudgeBallot({ token, data }: { token: string; data: BallotFormData }) {
  const router = useRouter();
  return (
    <BallotForm
      data={data}
      mode="judge"
      onDone={() => router.refresh()}
      save={async (input, mode) => {
        try {
          const res = await saveBallotViaLink(token, data.ballotId, input, mode);
          return res.ok
            ? { ok: true, warnings: res.data.warnings }
            : { ok: false, error: res.error, findings: res.findings };
        } catch {
          // Server actions throw on network failure: queue locally and retry.
          return { ok: false, error: "Network error", network: true };
        }
      }}
    />
  );
}
