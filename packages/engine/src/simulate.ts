import type { DebateConfig } from "./formats/schemas";
import { Rng } from "./rng";
import type {
  BallotResult,
  CompetitorInfo,
  DebateResult,
  EntryInfo,
  JudgeInfo,
  RoomInfo,
  Side,
  SpeakerScore,
} from "./types";

/**
 * Synthetic tournament generator and result simulator. Used by property tests,
 * benchmarks and the demo seed so every algorithm is exercised on realistic
 * fields (school clustering, skill spread, judge noise).
 */

export interface SimSchool {
  id: string;
  name: string;
  code: string;
  region: string;
}

export interface SimTournament {
  schools: SimSchool[];
  entries: EntryInfo[];
  competitors: CompetitorInfo[];
  judges: JudgeInfo[];
  rooms: RoomInfo[];
  /** Latent skill per entry id (higher is better). */
  strength: Map<string, number>;
}

const SCHOOL_NAMES = [
  "Lincoln",
  "Jefferson",
  "Roosevelt",
  "Washington",
  "Kennedy",
  "Franklin",
  "Madison",
  "Hamilton",
  "Adams",
  "Monroe",
  "Harrison",
  "Truman",
  "Carver",
  "Douglass",
  "Tubman",
  "Chavez",
  "Parks",
  "Einstein",
  "Curie",
  "Newton",
  "Da Vinci",
  "Galileo",
  "Hopper",
  "Lovelace",
  "Turing",
  "Sagan",
  "Edison",
  "Tesla",
  "Wright",
  "Earhart",
  "Keller",
  "Anthony",
  "Stanton",
  "Mandela",
  "Gandhi",
  "King",
  "Marshall",
  "Ginsburg",
  "Sotomayor",
  "Obama",
];
const SUFFIXES = ["High School", "Academy", "Prep", "HS", "Magnet"];
const FIRST = [
  "Ava",
  "Liam",
  "Maya",
  "Noah",
  "Zoe",
  "Ethan",
  "Priya",
  "Lucas",
  "Aria",
  "Mateo",
  "Leah",
  "Omar",
  "Nina",
  "Kai",
  "Sofia",
  "Eli",
  "Ivy",
  "Jonah",
  "Ruby",
  "Arjun",
  "Hana",
  "Diego",
  "Tess",
  "Malik",
  "Chloe",
  "Ravi",
  "Emma",
  "Theo",
  "Lina",
  "Sam",
  "Nora",
  "Jae",
  "Ada",
  "Felix",
  "Iris",
  "Owen",
];
const LAST = [
  "Nguyen",
  "Smith",
  "Patel",
  "Garcia",
  "Kim",
  "Johnson",
  "Chen",
  "Williams",
  "Singh",
  "Brown",
  "Lopez",
  "Davis",
  "Khan",
  "Martinez",
  "Lee",
  "Wilson",
  "Shah",
  "Taylor",
  "Wong",
  "Anderson",
  "Rivera",
  "Thomas",
  "Park",
  "Moore",
  "Cohen",
  "Jackson",
  "Ali",
  "White",
  "Gupta",
  "Harris",
];
const REGIONS = ["CA", "TX", "NY", "FL", "IL", "MN", "GA", "WA"];

export interface GenerateOptions {
  seed: string;
  entries: number;
  schools?: number;
  teamSize?: number;
  judges?: number;
  rooms?: number;
  idPrefix?: string;
}

export function generateTournament(opts: GenerateOptions): SimTournament {
  const rng = new Rng(opts.seed);
  const p = opts.idPrefix ?? "";
  const nSchools = opts.schools ?? Math.max(2, Math.round(opts.entries / 4));
  const teamSize = opts.teamSize ?? 2;
  const schools: SimSchool[] = Array.from({ length: nSchools }, (_, i) => {
    const base = SCHOOL_NAMES[i % SCHOOL_NAMES.length]!;
    const suffix = SUFFIXES[i % SUFFIXES.length]!;
    const lap = Math.floor(i / SCHOOL_NAMES.length);
    return {
      id: `${p}s${i + 1}`,
      name: `${base} ${suffix}${lap ? ` ${lap + 1}` : ""}`,
      code: `${base.slice(0, 3).toUpperCase()}${lap ? lap + 1 : ""}`,
      region: REGIONS[i % REGIONS.length]!,
    };
  });

  // Schools have skewed sizes: a few big programs, many small ones.
  const weights = schools.map(() => 0.3 + rng.next() ** 2 * 3);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const pickSchool = (): SimSchool => {
    let r = rng.next() * totalW;
    for (let i = 0; i < schools.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return schools[i]!;
    }
    return schools[schools.length - 1]!;
  };

  const entries: EntryInfo[] = [];
  const competitors: CompetitorInfo[] = [];
  const strength = new Map<string, number>();
  const perSchool = new Map<string, number>();
  for (let i = 0; i < opts.entries; i++) {
    const school = pickSchool();
    const n = (perSchool.get(school.id) ?? 0) + 1;
    perSchool.set(school.id, n);
    const id = `${p}e${i + 1}`;
    const names = Array.from({ length: teamSize }, () => ({
      first: rng.pick(FIRST),
      last: rng.pick(LAST),
    }));
    const code =
      teamSize === 1
        ? `${school.code} ${names[0]!.first[0]}${names[0]!.last}`
        : `${school.code} ${names.map((x) => x.last[0]).join("")}${n > 1 ? n : ""}`;
    entries.push({
      id,
      code,
      schoolId: school.id,
      regionId: school.region,
      seed: null,
      requiresAccessible: rng.next() < 0.03,
      active: true,
    });
    names.forEach((nm, k) => {
      competitors.push({ id: `${id}c${k + 1}`, entryId: id, name: `${nm.first} ${nm.last}` });
    });
    strength.set(id, rng.normal(0, 1));
  }
  // Seeds: noisy view of strength.
  [...entries]
    .sort(
      (a, b) =>
        strength.get(b.id)! + rng.normal(0, 0.5) - (strength.get(a.id)! + rng.normal(0, 0.5)),
    )
    .forEach((e, i) => {
      e.seed = i + 1;
    });

  const nJudges = opts.judges ?? Math.ceil(opts.entries * 0.75);
  const judges: JudgeInfo[] = Array.from({ length: nJudges }, (_, i) => {
    const hired = rng.next() < 0.25;
    return {
      id: `${p}j${i + 1}`,
      name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      schoolId: hired ? null : pickSchool().id,
      rating: Math.round(Math.min(10, Math.max(1, rng.normal(6, 2)))),
      roundsOwed: 6,
      roundsJudged: 0,
      available: true,
    };
  });

  const nRooms = opts.rooms ?? Math.ceil(opts.entries / 2) + 4;
  const rooms: RoomInfo[] = Array.from({ length: nRooms }, (_, i) => ({
    id: `${p}r${i + 1}`,
    name: `${100 + i + 1}`,
    priority: nRooms - i,
    capacity: 30,
    accessible: i % 5 === 0,
    available: true,
  }));

  return { schools, entries, competitors, judges, rooms, strength };
}

function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = Math.round((clamped - min) / step) * step + min;
  return Math.round(Math.min(max, snapped) * 100) / 100;
}

export interface SimulateDebateInput {
  roundId: string;
  roundSeq: number;
  stage: "prelim" | "elim";
  pairingId: string;
  entries: { entryId: string; side: Side }[];
  judgeIds: string[];
  bye?: boolean;
  pulledUpIds?: string[];
}

/** Simulates judges' ballots for a debate. */
export function simulateDebate(
  debate: SimulateDebateInput,
  sim: Pick<SimTournament, "competitors" | "strength">,
  config: DebateConfig,
  rng: Rng,
): DebateResult {
  if (debate.bye || debate.entries.length < 2) {
    return {
      roundId: debate.roundId,
      roundSeq: debate.roundSeq,
      stage: debate.stage,
      pairingId: debate.pairingId,
      sides: debate.entries,
      bye: true,
      ballots: [],
    };
  }
  const [a, b] = debate.entries as [
    { entryId: string; side: Side },
    { entryId: string; side: Side },
  ];
  const sa = sim.strength.get(a.entryId) ?? 0;
  const sb = sim.strength.get(b.entryId) ?? 0;
  const { min, max, step } = config.ballot.points;
  const mid = (min + max) / 2 + (max - min) * 0.1;
  const spread = (max - min) / 6;
  const ballots: BallotResult[] = debate.judgeIds.map((judgeId, ji) => {
    const judgeBias = rng.normal(0, 0.3);
    const perf = (s: number) => s + rng.normal(0, 0.6);
    const pa = perf(sa);
    const pb = perf(sb);
    const winnerId = pa >= pb ? a.entryId : b.entryId;
    const scores: SpeakerScore[] = [];
    for (const [side, perfV] of [
      [a, pa],
      [b, pb],
    ] as const) {
      const comps = sim.competitors
        .filter((c) => c.entryId === side.entryId)
        .slice(0, config.speakersPerTeam);
      comps.forEach((c, k) => {
        const pts = snap(mid + spread * (perfV + judgeBias + rng.normal(0, 0.3)), min, max, step);
        scores.push({ entryId: side.entryId, competitorId: c.id, position: k + 1, points: pts });
      });
    }
    // Enforce no low-point wins (most judges do).
    const tot = (id: string) =>
      scores.filter((s) => s.entryId === id).reduce((acc, s) => acc + s.points, 0);
    const loser = winnerId === a.entryId ? b.entryId : a.entryId;
    if (tot(loser) > tot(winnerId)) {
      for (const s of scores) {
        if (s.entryId === loser)
          s.points = snap(s.points - (tot(loser) - tot(winnerId)) - step, min, max, step);
      }
    }
    // Speaker ranks if the format uses them.
    if (config.ballot.speakerRanks) {
      [...scores]
        .sort((x, y) => y.points - x.points)
        .forEach((s, i) => {
          s.rank = i + 1;
        });
    }
    return { judgeId, winnerId, scores, chair: ji === 0 };
  });
  return {
    roundId: debate.roundId,
    roundSeq: debate.roundSeq,
    stage: debate.stage,
    pairingId: debate.pairingId,
    sides: debate.entries,
    pulledUpIds: debate.pulledUpIds,
    ballots,
  };
}
