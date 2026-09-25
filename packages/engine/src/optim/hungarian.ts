/**
 * Rectangular assignment problem (Hungarian algorithm, Jonker–Volgenant style
 * shortest augmenting paths with potentials). O(n^2 m).
 *
 * Given an n x m cost matrix with n <= m, assigns every row to a distinct
 * column minimising the total cost. Entries may be `Infinity` to forbid an
 * assignment; if a row can only be assigned to forbidden columns it is left
 * unassigned (-1).
 */
export function solveAssignment(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0]!.length;
  if (m < n) {
    // Transpose so rows <= cols, then map back.
    const t: number[][] = Array.from({ length: m }, (_, j) =>
      Array.from({ length: n }, (_, i) => cost[i]![j]!),
    );
    const colForRow = solveAssignment(t);
    const out = new Array<number>(n).fill(-1);
    colForRow.forEach((row, col) => {
      if (row >= 0) out[row] = col;
    });
    return out;
  }

  // Replace Infinity by a large finite penalty so the algorithm always completes;
  // assignments that land on a forbidden cell are reported as -1.
  let maxFinite = 0;
  for (const row of cost)
    for (const c of row) if (Number.isFinite(c) && Math.abs(c) > maxFinite) maxFinite = Math.abs(c);
  const FORBID = (maxFinite + 1) * (n + 1) * 4;
  const a = (i: number, j: number): number => {
    const c = cost[i]![j]!;
    return Number.isFinite(c) ? c : FORBID;
  };

  // 1-indexed arrays per the classic formulation.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row assigned to column j
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a(i0 - 1, j - 1) - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    const row = p[j]!;
    if (row > 0 && Number.isFinite(cost[row - 1]![j - 1]!)) result[row - 1] = j - 1;
  }
  return result;
}
