/**
 * Round-robin scheduling (circle method), optionally split into pods.
 *
 * Returns, for each round, the list of pairs. A `null` opponent is a bye
 * (odd-sized pods). Sides alternate so each entry is as balanced as possible.
 */
export function roundRobinSchedule(ids: readonly string[]): [string, string | null][][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [string, string | null][][] = [];
  const fixed = list[0]!;
  let rot = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const current = [fixed, ...rot];
    const pairs: [string, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      let a = current[i]!;
      let b = current[n - 1 - i]!;
      // Alternate sides by round for balance; keep byes on the right.
      if ((r + i) % 2 === 1) [a, b] = [b, a];
      if (a === null) [a, b] = [b, a];
      if (a !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    rot = [rot[rot.length - 1]!, ...rot.slice(0, -1)];
  }
  return rounds;
}

/** Splits seeded entries (best first) into `podCount` pods by snake order. */
export function snakePods<T>(seeded: readonly T[], podCount: number): T[][] {
  const pods: T[][] = Array.from({ length: podCount }, () => []);
  seeded.forEach((item, i) => {
    const lap = Math.floor(i / podCount);
    const idx = lap % 2 === 0 ? i % podCount : podCount - 1 - (i % podCount);
    pods[idx]!.push(item);
  });
  return pods;
}
