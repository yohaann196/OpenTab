import type { JudgingSettings } from "../formats/schemas";
import type { Finding } from "../types";

/**
 * Mutual-preference judging (MPJ) helpers.
 *
 * Preferences are normalised to a percentile 0–100 (lower = more preferred)
 * so ordinal and tiered systems share one allocation cost model.
 */

export interface PrefInput {
  judgeId: string;
  ordinal?: number | null;
  tier?: number | null;
  strike?: boolean;
}

export type PrefValue = number | "strike";

/**
 * Ordinals → percentiles, weighted by each judge's rounds of obligation: a
 * judge who can hear 6 rounds occupies more of the "pool" than one who can
 * hear 2, which is how coaches actually experience the pref sheet.
 */
export function ordinalsToPercentiles(
  prefs: readonly PrefInput[],
  roundsOwed: ReadonlyMap<string, number>,
): Map<string, PrefValue> {
  const out = new Map<string, PrefValue>();
  const ranked = prefs
    .filter((p) => !p.strike && p.ordinal != null)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const weight = (id: string) => Math.max(1, roundsOwed.get(id) ?? 1);
  const total = ranked.reduce((acc, p) => acc + weight(p.judgeId), 0);
  let cum = 0;
  for (const p of ranked) {
    const w = weight(p.judgeId);
    out.set(p.judgeId, total === 0 ? 50 : Math.round(((cum + w / 2) / total) * 1000) / 10);
    cum += w;
  }
  for (const p of prefs) if (p.strike) out.set(p.judgeId, "strike");
  return out;
}

/** Tier k (1-based) → the midpoint percentile of that tier's quota band. */
export function tiersToPercentiles(
  prefs: readonly PrefInput[],
  tiers: JudgingSettings["tiers"],
): Map<string, PrefValue> {
  const out = new Map<string, PrefValue>();
  const bands: [number, number][] = [];
  let start = 0;
  const n = tiers.length || 6;
  for (let i = 0; i < n; i++) {
    const t = tiers[i];
    const width = t ? (t.minPct + t.maxPct) / 2 : 100 / n;
    bands.push([start, Math.min(100, start + width)]);
    start += width;
  }
  for (const p of prefs) {
    if (p.strike) {
      out.set(p.judgeId, "strike");
      continue;
    }
    if (p.tier == null) continue;
    const band = bands[Math.max(0, Math.min(bands.length - 1, p.tier - 1))]!;
    out.set(p.judgeId, Math.round(((band[0] + band[1]) / 2) * 10) / 10);
  }
  return out;
}

export function normalisePrefs(
  prefs: readonly PrefInput[],
  settings: JudgingSettings,
  roundsOwed: ReadonlyMap<string, number>,
): Map<string, PrefValue> {
  if (settings.prefs === "tiers") return tiersToPercentiles(prefs, settings.tiers);
  if (settings.prefs === "ordinal") return ordinalsToPercentiles(prefs, roundsOwed);
  const out = new Map<string, PrefValue>();
  for (const p of prefs) if (p.strike) out.set(p.judgeId, "strike");
  return out;
}

/** Validates a submitted pref sheet against the event rules. */
export function validatePrefSheet(
  prefs: readonly PrefInput[],
  judgeIds: readonly string[],
  settings: JudgingSettings,
  roundsOwed: ReadonlyMap<string, number> = new Map(),
): Finding[] {
  const findings: Finding[] = [];
  const pool = new Set(judgeIds);
  const strikes = prefs.filter((p) => p.strike);
  if (strikes.length > settings.strikes) {
    findings.push({
      code: "too_many_strikes",
      severity: "error",
      message: `${strikes.length} strikes used; ${settings.strikes} allowed.`,
    });
  }
  for (const p of prefs) {
    if (!pool.has(p.judgeId)) {
      findings.push({
        code: "unknown_judge",
        severity: "error",
        message: "Pref for a judge not in this pool.",
        judgeIds: [p.judgeId],
      });
    }
  }
  if (settings.prefs === "ordinal") {
    const seen = new Map<number, string>();
    for (const p of prefs) {
      if (p.strike || p.ordinal == null) continue;
      if (seen.has(p.ordinal)) {
        findings.push({
          code: "duplicate_ordinal",
          severity: "error",
          message: `Ordinal ${p.ordinal} used twice.`,
          judgeIds: [seen.get(p.ordinal)!, p.judgeId],
        });
      }
      seen.set(p.ordinal, p.judgeId);
    }
    const missing = judgeIds.filter((j) => !prefs.some((p) => p.judgeId === j));
    if (missing.length) {
      findings.push({
        code: "unrated_judges",
        severity: "warning",
        message: `${missing.length} judge(s) not yet ranked.`,
        judgeIds: missing,
      });
    }
  }
  if (settings.prefs === "tiers" && settings.tiers.length) {
    const weight = (id: string) => Math.max(1, roundsOwed.get(id) ?? 1);
    const total = judgeIds.reduce((acc, j) => acc + weight(j), 0);
    settings.tiers.forEach((t, i) => {
      const used = prefs
        .filter((p) => !p.strike && p.tier === i + 1)
        .reduce((acc, p) => acc + weight(p.judgeId), 0);
      const pct = total ? (used / total) * 100 : 0;
      if (pct < t.minPct - 1e-9 || pct > t.maxPct + 1e-9) {
        findings.push({
          code: "tier_quota",
          severity: "error",
          message: `Tier ${t.name}: ${pct.toFixed(1)}% of the pool (allowed ${t.minPct}–${t.maxPct}%).`,
        });
      }
    });
  }
  return findings;
}
