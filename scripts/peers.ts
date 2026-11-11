// One-off: build public/peers.json (industry distributions of each ratio) for every listed company.
// ~2 DART calls per company; results are cached in scripts/.cache so a rerun resumes.
// Usage: npm run peers
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { ratios, extract, score, isZombie } from "../lib/ratios.ts";
import { dart, latestStatements } from "../lib/dart.ts";

const key = process.env.DART_API_KEY ?? readFileSync(".env.local", "utf8").match(/DART_API_KEY=(\S+)/)?.[1];
if (!key) throw new Error("DART_API_KEY missing");

// rev/score/zombie feed the "주목할 기업" lists on the home page.
type Cached = { ksic: string; v: Record<string, number | null> | null; rev?: number | null; grade?: string | null; zombie?: boolean | null };
const CACHE = "scripts/.cache";
mkdirSync(CACHE, { recursive: true });

const corps: [string, string, string][] = JSON.parse(readFileSync("public/corps.json", "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function one(code: string): Promise<Cached> {
  const file = `${CACHE}/${code}.json`;
  const old: Cached | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (old && "rev" in old) return old;
  let ksic = old?.ksic;
  if (ksic === undefined) {
    const co = await dart("company.json", { corp_code: code }, key!);
    if (co.status !== "000") throw new Error(`company ${code}: ${co.status} ${co.message}`);
    ksic = String(co.induty_code ?? "").slice(0, 2);
  }
  const st = await latestStatements(code, key!);
  const acc = st ? extract(st.rows) : null;
  const rs = acc ? ratios(acc) : null;
  const out: Cached = {
    ksic,
    v: rs ? Object.fromEntries(rs.map((r) => [r.key, r.values.at(-1)!])) : null,
    rev: acc?.revenue.at(-1) ?? null,
    grade: rs ? (score(rs)?.grade ?? null) : null,
    zombie: rs ? isZombie(rs) : null,
  };
  writeFileSync(file, JSON.stringify(out));
  return out;
}

// ponytail: fixed 2 workers + 120ms gap keeps us well under DART's rate limit; no adaptive backoff.
const results = new Map<string, Cached>();
let i = 0, done = 0;
async function worker() {
  while (i < corps.length) {
    const [code] = corps[i++];
    results.set(code, await one(code));
    if (++done % 100 === 0) console.log(`${done}/${corps.length}`);
    await sleep(120);
  }
}
await Promise.all([worker(), worker()]);

// JSON has no Infinity: debt-free ICR is stored as a large cap so it still sorts to the top.
const CAP = 9999;
const byCorp: Record<string, string> = {};
const ind: Record<string, { n: number; r: Record<string, number[]> }> = {};
for (const [code, { ksic, v }] of results) {
  if (!ksic) continue;
  byCorp[code] = ksic;
  if (!v) continue;
  const g = (ind[ksic] ??= { n: 0, r: {} });
  g.n++;
  for (const [k, x] of Object.entries(v)) {
    if (x === null || Number.isNaN(x)) continue;
    (g.r[k] ??= []).push(Math.round(Math.min(x, CAP) * 10) / 10);
  }
}
for (const g of Object.values(ind)) for (const a of Object.values(g.r)) a.sort((x, y) => x - y);

writeFileSync("public/peers.json", JSON.stringify({ byCorp, ind }));

// Home page picks, biggest by revenue first so the names are recognisable.
// Financial industries (64-66) are skipped: liquidity/leverage ratios do not apply to them.
const name = new Map(corps.map((c) => [c[0], c[1]]));
const pool = [...results].filter(([, c]) => c.v && c.rev && !["64", "65", "66"].includes(c.ksic)).sort((a, b) => b[1].rev! - a[1].rev!);
const pick = (f: (c: Cached) => boolean) =>
  pool.filter(([, c]) => f(c)).slice(0, 6).map(([code, c]) => ({ code, name: name.get(code), ksic: c.ksic, rev: c.rev, grade: c.grade, debt: c.v!.debt, icr: c.v!.icr }));
writeFileSync("public/featured.json", JSON.stringify({
  zombie: pick((c) => c.zombie === true),
  risky: pick((c) => c.grade === "D" && c.zombie !== true),
  solid: pick((c) => c.grade === "A"),
}));
console.log(`peers: ${Object.keys(byCorp).length} companies, ${Object.keys(ind).length} industries`);
