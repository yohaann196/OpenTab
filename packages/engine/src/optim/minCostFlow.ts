/**
 * Min-cost max-flow via successive shortest paths with Johnson potentials
 * (Dijkstra on reduced costs). Initial edge costs must be non-negative.
 *
 * Used for judge allocation where panels need k judges and a judge can sit on
 * at most one panel per flight.
 */
export class MinCostFlow {
  private readonly to: number[] = [];
  private readonly cap: number[] = [];
  private readonly cost: number[] = [];
  private readonly head: number[];
  private readonly next: number[] = [];

  constructor(readonly nodeCount: number) {
    this.head = new Array<number>(nodeCount).fill(-1);
  }

  /** Adds a directed edge; returns its id (the reverse edge is id ^ 1). */
  addEdge(from: number, to: number, capacity: number, cost: number): number {
    if (cost < 0) throw new Error("MinCostFlow requires non-negative costs");
    const id = this.to.length;
    this.pushEdge(from, to, capacity, cost);
    this.pushEdge(to, from, 0, -cost);
    return id;
  }

  private pushEdge(from: number, to: number, capacity: number, cost: number): void {
    this.to.push(to);
    this.cap.push(capacity);
    this.cost.push(cost);
    this.next.push(this.head[from]!);
    this.head[from] = this.to.length - 1;
  }

  /** Flow currently on edge `id` (as returned by addEdge). */
  flowOn(id: number): number {
    return this.cap[id ^ 1]!;
  }

  run(
    source: number,
    sink: number,
    maxFlow = Number.POSITIVE_INFINITY,
  ): { flow: number; cost: number } {
    const n = this.nodeCount;
    const potential = new Array<number>(n).fill(0);
    let flow = 0;
    let totalCost = 0;
    const dist = new Array<number>(n);
    const prevEdge = new Array<number>(n);

    while (flow < maxFlow) {
      dist.fill(Number.POSITIVE_INFINITY);
      prevEdge.fill(-1);
      dist[source] = 0;
      const heap = new MinHeap();
      heap.push(0, source);
      while (heap.size > 0) {
        const [d, u] = heap.pop()!;
        if (d > dist[u]!) continue;
        for (let e = this.head[u]!; e !== -1; e = this.next[e]!) {
          if (this.cap[e]! <= 0) continue;
          const v = this.to[e]!;
          const nd = d + this.cost[e]! + potential[u]! - potential[v]!;
          if (nd < dist[v]! - 1e-9) {
            dist[v] = nd;
            prevEdge[v] = e;
            heap.push(nd, v);
          }
        }
      }
      if (!Number.isFinite(dist[sink]!)) break;
      for (let v = 0; v < n; v++) {
        if (Number.isFinite(dist[v]!)) potential[v] = potential[v]! + dist[v]!;
      }
      let push = maxFlow - flow;
      for (let v = sink; v !== source; v = this.to[prevEdge[v]! ^ 1]!) {
        push = Math.min(push, this.cap[prevEdge[v]!]!);
      }
      for (let v = sink; v !== source; v = this.to[prevEdge[v]! ^ 1]!) {
        const e = prevEdge[v]!;
        this.cap[e] = this.cap[e]! - push;
        this.cap[e ^ 1] = this.cap[e ^ 1]! + push;
        totalCost += push * this.cost[e]!;
      }
      flow += push;
    }
    return { flow, cost: totalCost };
  }
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= this.keys[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] | undefined {
    if (this.keys.length === 0) return undefined;
    const top: [number, number] = [this.keys[0]!, this.vals[0]!];
    const lastK = this.keys.pop()!;
    const lastV = this.vals.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastK;
      this.vals[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.vals[a], this.vals[b]] = [this.vals[b]!, this.vals[a]!];
  }
}
