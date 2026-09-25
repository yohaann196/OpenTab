/**
 * Maximum-weight matching in general (non-bipartite) graphs.
 *
 * Implementation of Edmonds' blossom algorithm with the primal-dual method, as
 * described by Galil ("Efficient algorithms for finding maximum matching in
 * graphs", ACM Computing Surveys, 1986). Runs in O(n^3).
 *
 * The two-team pairing problem is expressed as a minimum-cost perfect matching:
 * every possible debate is an edge whose weight is (BIG - cost). Solving it in
 * one global optimization replaces the bracket-by-bracket backtracking used by
 * legacy tab software.
 *
 * Weights MUST be integers; that keeps all dual variables integral and avoids
 * floating-point drift.
 */

export type WeightedEdge = readonly [number, number, number];

/**
 * @param edges list of [i, j, weight] with i != j, vertices numbered 0..n-1
 * @param maxCardinality if true, only maximum-cardinality matchings are considered
 * @returns mate array: mate[v] is the vertex matched to v, or -1
 */
export function maxWeightMatching(
  edges: readonly WeightedEdge[],
  maxCardinality = false,
): number[] {
  if (edges.length === 0) return [];

  const nedge = edges.length;
  let nvertex = 0;
  let maxweight = 0;
  for (const [i, j, w] of edges) {
    if (i === j) throw new Error("self-loop in matching graph");
    if (!Number.isInteger(w)) throw new Error("matching weights must be integers");
    if (i >= nvertex) nvertex = i + 1;
    if (j >= nvertex) nvertex = j + 1;
    if (w > maxweight) maxweight = w;
  }

  // endpoint[p] is the vertex to which endpoint p is attached.
  const endpoint: number[] = new Array(2 * nedge);
  for (let p = 0; p < 2 * nedge; p++) endpoint[p] = edges[p >> 1]![p & 1]!;

  // neighbend[v] lists the remote endpoints of edges attached to v.
  const neighbend: number[][] = Array.from({ length: nvertex }, () => []);
  for (let k = 0; k < nedge; k++) {
    const [i, j] = edges[k]!;
    neighbend[i]!.push(2 * k + 1);
    neighbend[j]!.push(2 * k);
  }

  const mate: number[] = new Array(nvertex).fill(-1);
  const label: number[] = new Array(2 * nvertex).fill(0);
  const labelend: number[] = new Array(2 * nvertex).fill(-1);
  const inblossom: number[] = Array.from({ length: nvertex }, (_, i) => i);
  const blossomparent: number[] = new Array(2 * nvertex).fill(-1);
  const blossomchilds: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const blossombase: number[] = [
    ...Array.from({ length: nvertex }, (_, i) => i),
    ...new Array(nvertex).fill(-1),
  ];
  const blossomendps: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const bestedge: number[] = new Array(2 * nvertex).fill(-1);
  const blossombestedges: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const unusedblossoms: number[] = Array.from({ length: nvertex }, (_, i) => nvertex + i);
  const dualvar: number[] = [...new Array(nvertex).fill(maxweight), ...new Array(nvertex).fill(0)];
  const allowedge: boolean[] = new Array(nedge).fill(false);
  let queue: number[] = [];

  const slack = (k: number): number => {
    const [i, j, wt] = edges[k]!;
    return dualvar[i]! + dualvar[j]! - 2 * wt;
  };

  const blossomLeaves = (b: number, out: number[] = []): number[] => {
    if (b < nvertex) {
      out.push(b);
    } else {
      for (const t of blossomchilds[b]!) {
        if (t < nvertex) out.push(t);
        else blossomLeaves(t, out);
      }
    }
    return out;
  };

  const assignLabel = (w: number, t: number, p: number): void => {
    const b = inblossom[w]!;
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) {
      queue.push(...blossomLeaves(b));
    } else if (t === 2) {
      const base = blossombase[b]!;
      assignLabel(endpoint[mate[base]!]!, 1, mate[base]! ^ 1);
    }
  };

  const scanBlossom = (v: number, w: number): number => {
    const path: number[] = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v]!;
      if (label[b]! & 4) {
        base = blossombase[b]!;
        break;
      }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) {
        v = -1;
      } else {
        v = endpoint[labelend[b]!]!;
        b = inblossom[v]!;
        v = endpoint[labelend[b]!]!;
      }
      if (w !== -1) {
        const tmp = v;
        v = w;
        w = tmp;
      }
    }
    for (const b of path) label[b] = 1;
    return base;
  };

  const addBlossom = (base: number, k: number): void => {
    let [v, w] = edges[k]!;
    const bb = inblossom[base]!;
    let bv = inblossom[v]!;
    let bw = inblossom[w]!;
    const b = unusedblossoms.pop()!;
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path: number[] = [];
    const endps: number[] = [];
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]!);
      v = endpoint[labelend[bv]!]!;
      bv = inblossom[v]!;
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw]! ^ 1);
      w = endpoint[labelend[bw]!]!;
      bw = inblossom[w]!;
    }
    label[b] = 1;
    labelend[b] = labelend[bb]!;
    dualvar[b] = 0;
    for (const leaf of blossomLeaves(b)) {
      if (label[inblossom[leaf]!] === 2) queue.push(leaf);
      inblossom[leaf] = b;
    }
    const bestedgeto: number[] = new Array(2 * nvertex).fill(-1);
    for (const sub of path) {
      let nblists: number[][];
      if (blossombestedges[sub] === null) {
        nblists = blossomLeaves(sub).map((leaf) => neighbend[leaf]!.map((p) => p >> 1));
      } else {
        nblists = [blossombestedges[sub]!];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let [i, j] = edges[kk]!;
          if (inblossom[j] === b) {
            const tmp = i;
            i = j;
            j = tmp;
          }
          const bj = inblossom[j]!;
          if (
            bj !== b &&
            label[bj] === 1 &&
            (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]!))
          ) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[sub] = null;
      bestedge[sub] = -1;
    }
    const best = bestedgeto.filter((kk) => kk !== -1);
    blossombestedges[b] = best;
    bestedge[b] = -1;
    for (const kk of best) {
      if (bestedge[b] === -1 || slack(kk) < slack(bestedge[b]!)) bestedge[b] = kk;
    }
  };

  const expandBlossom = (b: number, endstage: boolean): void => {
    for (const s of blossomchilds[b]!) {
      blossomparent[s] = -1;
      if (s < nvertex) {
        inblossom[s] = s;
      } else if (endstage && dualvar[s] === 0) {
        expandBlossom(s, endstage);
      } else {
        for (const leaf of blossomLeaves(s)) inblossom[leaf] = s;
      }
    }
    if (!endstage && label[b] === 2) {
      const childs = blossomchilds[b]!;
      const endps = blossomendps[b]!;
      const entrychild = inblossom[endpoint[labelend[b]! ^ 1]!]!;
      let j = childs.indexOf(entrychild);
      let jstep: number;
      let endptrick: number;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      const at = <T>(arr: T[], idx: number): T => arr[idx < 0 ? arr.length + idx : idx]!;
      let p = labelend[b]!;
      while (j !== 0) {
        label[endpoint[p ^ 1]!] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]!] = 0;
        assignLabel(endpoint[p ^ 1]!, 2, p);
        allowedge[at(endps, j - endptrick) >> 1] = true;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[p >> 1] = true;
        j += jstep;
      }
      let bv = at(childs, j);
      label[endpoint[p ^ 1]!] = label[bv] = 2;
      labelend[endpoint[p ^ 1]!] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        bv = at(childs, j);
        if (label[bv] === 1) {
          j += jstep;
          continue;
        }
        let found = -1;
        for (const leaf of blossomLeaves(bv)) {
          if (label[leaf] !== 0) {
            found = leaf;
            break;
          }
        }
        if (found !== -1) {
          label[found] = 0;
          label[endpoint[mate[blossombase[bv]!]!]!] = 0;
          assignLabel(found, 2, labelend[found]!);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  };

  const augmentBlossom = (b: number, v: number): void => {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t]!;
    if (t >= nvertex) augmentBlossom(t, v);
    const childs = blossomchilds[b]!;
    const endps = blossomendps[b]!;
    const i = childs.indexOf(t);
    let j = i;
    let jstep: number;
    let endptrick: number;
    if (i & 1) {
      j -= childs.length;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    const at = <T>(arr: T[], idx: number): T => arr[idx < 0 ? arr.length + idx : idx]!;
    while (j !== 0) {
      j += jstep;
      t = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t >= nvertex) augmentBlossom(t, endpoint[p]!);
      j += jstep;
      t = at(childs, j);
      if (t >= nvertex) augmentBlossom(t, endpoint[p ^ 1]!);
      mate[endpoint[p]!] = p ^ 1;
      mate[endpoint[p ^ 1]!] = p;
    }
    blossomchilds[b] = [...childs.slice(i), ...childs.slice(0, i)];
    blossomendps[b] = [...endps.slice(i), ...endps.slice(0, i)];
    blossombase[b] = blossombase[blossomchilds[b]![0]!]!;
  };

  const augmentMatching = (k: number): void => {
    const [v, w] = edges[k]!;
    const starts: [number, number][] = [
      [v, 2 * k + 1],
      [w, 2 * k],
    ];
    for (let [s, p] of starts) {
      for (;;) {
        const bs = inblossom[s]!;
        if (bs >= nvertex) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]!]!;
        const bt = inblossom[t]!;
        s = endpoint[labelend[bt]!]!;
        const j = endpoint[labelend[bt]! ^ 1]!;
        if (bt >= nvertex) augmentBlossom(bt, j);
        mate[j] = labelend[bt]!;
        p = labelend[bt]! ^ 1;
      }
    }
  };

  for (let stage = 0; stage < nvertex; stage++) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < 2 * nvertex; b++) blossombestedges[b] = null;
    allowedge.fill(false);
    queue = [];

    for (let v = 0; v < nvertex; v++) {
      if (mate[v] === -1 && label[inblossom[v]!] === 0) assignLabel(v, 1, -1);
    }

    let augmented = false;
    for (;;) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop()!;
        for (const p of neighbend[v]!) {
          const k = p >> 1;
          const w = endpoint[p]!;
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0) allowedge[k] = true;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]!] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]!] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, k);
              } else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]!] === 1) {
            const b = inblossom[v]!;
            if (bestedge[b] === -1 || kslack < slack(bestedge[b]!)) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w]!)) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      let deltatype = -1;
      let delta = 0;
      let deltaedge = -1;
      let deltablossom = -1;

      if (!maxCardinality) {
        deltatype = 1;
        delta = Math.min(...dualvar.slice(0, nvertex));
      }
      for (let v = 0; v < nvertex; v++) {
        if (label[inblossom[v]!] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]!);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v]!;
          }
        }
      }
      for (let b = 0; b < 2 * nvertex; b++) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const d = Math.floor(slack(bestedge[b]!) / 2);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b]!;
          }
        }
      }
      for (let b = nvertex; b < 2 * nvertex; b++) {
        if (
          blossombase[b]! >= 0 &&
          blossomparent[b] === -1 &&
          label[b] === 2 &&
          (deltatype === -1 || dualvar[b]! < delta)
        ) {
          delta = dualvar[b]!;
          deltatype = 4;
          deltablossom = b;
        }
      }
      if (deltatype === -1) {
        deltatype = 1;
        delta = Math.max(0, Math.min(...dualvar.slice(0, nvertex)));
      }

      for (let v = 0; v < nvertex; v++) {
        const l = label[inblossom[v]!];
        if (l === 1) dualvar[v] = dualvar[v]! - delta;
        else if (l === 2) dualvar[v] = dualvar[v]! + delta;
      }
      for (let b = nvertex; b < 2 * nvertex; b++) {
        if (blossombase[b]! >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] = dualvar[b]! + delta;
          else if (label[b] === 2) dualvar[b] = dualvar[b]! - delta;
        }
      }

      if (deltatype === 1) {
        break;
      } else if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let [i, j] = edges[deltaedge]!;
        if (label[inblossom[i]!] === 0) {
          const tmp = i;
          i = j;
          j = tmp;
        }
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        const [i] = edges[deltaedge]!;
        queue.push(i);
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
    }

    if (!augmented) break;

    for (let b = nvertex; b < 2 * nvertex; b++) {
      if (blossomparent[b] === -1 && blossombase[b]! >= 0 && label[b] === 1 && dualvar[b] === 0) {
        expandBlossom(b, true);
      }
    }
  }

  for (let v = 0; v < nvertex; v++) {
    if (mate[v]! >= 0) mate[v] = endpoint[mate[v]!]!;
  }
  return mate;
}

/**
 * Minimum-cost perfect matching on a complete graph of `n` vertices.
 *
 * `cost(i, j)` must return a non-negative integer, or `null` to forbid the pair.
 * Returns the list of matched pairs [i, j] with i < j, or throws if no perfect
 * matching exists (only possible when pairs are forbidden or n is odd).
 */
export function minCostPerfectMatching(
  n: number,
  cost: (i: number, j: number) => number | null,
): [number, number][] {
  if (n === 0) return [];
  if (n % 2 !== 0) throw new Error("perfect matching requires an even number of vertices");
  const raw: [number, number, number][] = [];
  let maxCost = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = cost(i, j);
      if (c === null) continue;
      if (c < 0 || !Number.isFinite(c)) throw new Error(`invalid pair cost ${c}`);
      const ci = Math.round(c);
      raw.push([i, j, ci]);
      if (ci > maxCost) maxCost = ci;
    }
  }
  // Maximise sum(BIG - cost) over maximum-cardinality matchings == minimise cost.
  const big = maxCost + 1;
  if (big * (n / 2) > Number.MAX_SAFE_INTEGER / 4) {
    throw new Error("pair costs too large for exact matching");
  }
  const weighted: WeightedEdge[] = raw.map(([i, j, c]) => [i, j, big - c] as const);
  const mate = maxWeightMatching(weighted, true);
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const m = mate[i] ?? -1;
    if (m === -1) throw new Error("no perfect matching exists under the given constraints");
    if (i < m) pairs.push([i, m]);
  }
  return pairs;
}
