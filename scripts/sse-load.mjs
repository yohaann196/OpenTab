// Opens N SSE connections, fires one NOTIFY, and measures delivery.
import postgres from "postgres";

const N = Number(process.argv[2] ?? 300);
const base = process.argv[3] ?? "http://localhost:3001";
const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://opentab:opentab@localhost:5432/opentab",
  { max: 1 },
);
const [t] = await sql`select id from tournament where slug = 'opentab-invitational'`;
let connected = 0;
let received = 0;
const latencies = [];
let sentAt = 0;
const controllers = [];
await Promise.all(
  Array.from({ length: N }, async () => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const res = await fetch(`${base}/api/t/opentab-invitational/stream`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          if (buf.includes("event: hello") && !buf.includes("#counted")) {
            buf += "#counted";
            connected++;
          }
          if (buf.includes("load-test")) {
            received++;
            latencies.push(Date.now() - sentAt);
            break;
          }
        }
      } catch {}
    })();
  }),
);
const start = Date.now();
while (connected < N && Date.now() - start < 20000) await new Promise((r) => setTimeout(r, 100));
console.log(`connected ${connected}/${N}`);
sentAt = Date.now();
await sql`select pg_notify('opentab_events', ${JSON.stringify({ t: t.id, e: { type: "tournament.updated", note: "load-test" } })})`;
const wait = Date.now();
while (received < connected && Date.now() - wait < 10000)
  await new Promise((r) => setTimeout(r, 50));
latencies.sort((a, b) => a - b);
console.log(
  `delivered ${received}/${connected}; p50 ${latencies[Math.floor(latencies.length / 2)]}ms p99 ${latencies[Math.floor(latencies.length * 0.99)]}ms`,
);
for (const c of controllers) c.abort();
await sql.end();
process.exit(0);
