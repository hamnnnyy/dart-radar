import { extract } from "@/lib/ratios";
import { dart, latestStatements, statements, DartError } from "@/lib/dart";
import type { Audit, HolderChange } from "@/lib/signals";

const KEY = process.env.DART_API_KEY;
const CACHE = { next: { revalidate: 86400 } }; // annual reports change rarely

// Audit table repeats rows per period; take the current period that actually has an opinion.
async function audit(corp: string, year: number): Promise<Audit> {
  const j = await dart("accnutAdtorNmNdAdtOpinion.json", { corp_code: corp, bsns_year: String(year), reprt_code: "11011" }, KEY!, CACHE);
  const r = j.list?.find((x) => x.bsns_year?.includes("당기") && x.adt_opinion && x.adt_opinion !== "-");
  return r ? { opinion: r.adt_opinion, auditor: r.adtor, notes: [r.adt_reprt_spcmnt_matter, r.emphs_matter, r.core_adt_matter].join(" ") } : null;
}

async function holders(corp: string, year: number): Promise<HolderChange[]> {
  const j = await dart("hyslrChgSttus.json", { corp_code: corp, bsns_year: String(year), reprt_code: "11011" }, KEY!, CACHE);
  return (j.list ?? []).filter((x) => x.change_on && x.change_on !== "-").map((x) => ({ date: x.change_on, name: x.mxmm_shrholdr_nm }));
}

export async function GET(req: Request) {
  if (!KEY) return Response.json({ error: "DART_API_KEY 미설정" }, { status: 500 });
  const corp = new URL(req.url).searchParams.get("corp") ?? "";
  if (!/^\d{8}$/.test(corp)) return Response.json({ error: "corp_code는 8자리 숫자" }, { status: 400 });

  try {
    const st = await latestStatements(corp, KEY, CACHE);
    if (!st) return Response.json({ error: "최근 2년 사업보고서 재무제표 없음 (상장폐지·합병·신규상장 등)" }, { status: 404 });
    // Non-financial signals are a bonus: a failure there must not hide the statements.
    // The report from 3 years earlier adds 2 more fiscal years (5 in total); its oldest year is dropped.
    const [a, h, old] = await Promise.all([
      audit(corp, st.year).catch(() => null),
      holders(corp, st.year).catch(() => []),
      statements(corp, st.year - 3, st.fs, KEY, CACHE).catch(() => null),
    ]);
    const acc = extract(st.rows);
    if (old) {
      const prev = extract(old);
      for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] = [...prev[k].slice(1), ...acc[k]];
    }
    return Response.json({ year: st.year, fs: st.fs, accounts: acc, audit: a, holders: h });
  } catch (e) {
    if (e instanceof DartError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
