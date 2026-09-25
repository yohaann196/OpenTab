import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (start === end) return `${month(s)} ${s.getDate()}, ${s.getFullYear()}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${month(s)} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${month(s)} ${s.getDate()} – ${month(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
