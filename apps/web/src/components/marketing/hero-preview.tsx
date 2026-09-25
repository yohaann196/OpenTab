"use client";

import { Check, Clock, MapPin, Wifi } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const PAIRINGS = [
  { aff: "Lincoln AN", neg: "Roosevelt CK", room: "214", judge: "J. Rivera", bracket: "3–0" },
  { aff: "Hopper MP", neg: "Carver LS", room: "118", judge: "A. Okafor", bracket: "3–0" },
  { aff: "Curie DW", neg: "Tubman RS", room: "220", judge: "S. Patel", bracket: "2–1" },
  { aff: "Douglass EJ", neg: "Sagan TK", room: "105", judge: "M. Chen", bracket: "2–1" },
];

/** Animated product preview for the hero: live pairings board + phone ballot. */
export function HeroPreview() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 2200);
    return () => clearInterval(id);
  }, [reduce]);
  const pts = [28.6, 28.9, 29.1, 29.3][step]!;

  return (
    <div
      className="relative mx-auto h-[440px] w-full max-w-[560px] select-none sm:h-[480px]"
      aria-hidden
    >
      {/* Pairings board */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute left-0 top-6 w-[88%] rounded-xl border border-border bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Varsity LD
            </div>
            <div className="text-sm font-semibold">Round 4 pairings</div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="size-2 animate-pulse-dot rounded-full bg-success" />
            Live
          </span>
        </div>
        <ul className="divide-y divide-border">
          {PAIRINGS.map((p, i) => (
            <motion.li
              key={p.aff}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.08 }}
              className={`grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2.5 text-[13px] ${i === 0 ? "bg-brand-soft/60" : ""}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-aff-soft px-1.5 py-px text-[10px] font-semibold text-aff">
                    AFF
                  </span>
                  <span className="truncate font-medium">{p.aff}</span>
                  <span className="text-fg-subtle">vs</span>
                  <span className="rounded bg-neg-soft px-1.5 py-px text-[10px] font-semibold text-[color-mix(in_oklch,var(--neg)_75%,var(--fg))]">
                    NEG
                  </span>
                  <span className="truncate font-medium">{p.neg}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-fg-subtle">
                  {p.judge} · {p.bracket} bracket
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-fg-muted">
                <MapPin className="size-3" /> {p.room}
              </span>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      {/* Phone ballot */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -6, 0] }}
        transition={
          reduce
            ? {}
            : {
                opacity: { duration: 0.6, delay: 0.3 },
                y: { duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
              }
        }
        className="absolute bottom-0 right-0 w-[210px] rounded-[2rem] border-[6px] border-fg/90 bg-surface p-3 shadow-lift sm:w-[230px]"
      >
        <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-fg/20" />
        <div className="flex items-center justify-between text-[10px] text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> 2:14 PM
          </span>
          <span className="inline-flex items-center gap-1">
            <Wifi className="size-3" /> Saved
          </span>
        </div>
        <div className="mt-2 rounded-xl bg-brand-soft p-2.5">
          <div className="text-[10px] font-medium text-brand-soft-fg">Your round · Room 214</div>
          <div className="text-[13px] font-semibold">Lincoln AN vs Roosevelt CK</div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-medium text-fg-muted">Speaker points</div>
          {[
            ["Ava Nguyen", pts],
            ["Carlos Kim", 28.4],
          ].map(([name, v]) => (
            <div
              key={name as string}
              className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5"
            >
              <span className="text-[12px]">{name}</span>
              <motion.span
                key={String(v)}
                initial={reduce ? false : { scale: 1.2, color: "var(--brand)" }}
                animate={{ scale: 1, color: "var(--fg)" }}
                className="tabular text-[13px] font-semibold"
              >
                {Number(v).toFixed(1)}
              </motion.span>
            </div>
          ))}
          <div className="text-[11px] font-medium text-fg-muted">Decision</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border-2 border-aff bg-aff-soft py-1.5 text-center text-[11px] font-semibold text-aff">
              Aff wins
            </div>
            <div className="rounded-lg border border-border py-1.5 text-center text-[11px] text-fg-subtle">
              Neg wins
            </div>
          </div>
          <motion.div
            animate={
              step === 3
                ? { backgroundColor: "var(--success)" }
                : { backgroundColor: "var(--brand)" }
            }
            className="mt-1 flex items-center justify-center gap-1 rounded-lg py-2 text-[12px] font-semibold text-brand-fg"
          >
            {step === 3 ? (
              <>
                <Check className="size-3.5" /> Submitted
              </>
            ) : (
              "Review & submit"
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Notification toast */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
        className="absolute right-4 top-0 hidden w-60 rounded-xl border border-border bg-surface/95 p-3 shadow-lift backdrop-blur sm:block"
      >
        <div className="text-[11px] font-semibold">OpenTab · now</div>
        <div className="text-[12px] text-fg-muted">
          Round 4 is out: you're Aff vs Roosevelt CK in Room 214.
        </div>
      </motion.div>
    </div>
  );
}
