"use client";

import { useState } from "react";
import { matches, SearchInput } from "@/components/tab/search-input";

export function JudgeDirectory({
  judges,
}: {
  judges: { id: string; name: string; paradigm: string | null; school: string | null }[];
}) {
  const [q, setQ] = useState("");
  const [withParadigm, setWithParadigm] = useState(false);
  const shown = judges.filter(
    (j) => (!withParadigm || j.paradigm) && matches(q, j.name, j.school, j.paradigm),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search names or paradigm text"
          className="w-full sm:w-80"
        />
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={withParadigm}
            onChange={(e) => setWithParadigm(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />{" "}
          Only with a paradigm
        </label>
        <span className="text-sm text-fg-muted">{shown.length} judges</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((j) => (
          <li key={j.id} className="rounded-xl border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{j.name}</h2>
              <span className="truncate text-xs text-fg-subtle">{j.school ?? "Hired"}</span>
            </div>
            {j.paradigm ? (
              <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-fg-muted">
                {j.paradigm}
              </p>
            ) : (
              <p className="mt-2 text-sm italic text-fg-subtle">No paradigm.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
