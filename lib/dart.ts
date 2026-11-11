// DART Open API calls shared by the route handler and the peers build script.
import type { Row } from "./ratios.ts";

const BASE = "https://opendart.fss.or.kr/api";

type Json = { status: string; message: string; list?: Record<string, string>[] } & Record<string, unknown>;

export async function dart(path: string, params: Record<string, string>, key: string, init?: RequestInit): Promise<Json> {
  const qs = new URLSearchParams({ crtfc_key: key, ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`, init);
  return (await res.json()) as Json;
}

export class DartError extends Error {}

// Latest annual report: last year first (filed by end of March), consolidated before separate.
export async function latestStatements(corp: string, key: string, init?: RequestInit) {
  const now = new Date().getFullYear();
  for (const year of [now - 1, now - 2]) {
    for (const fs of ["CFS", "OFS"] as const) {
      const j = await dart("fnlttSinglAcntAll.json", { corp_code: corp, bsns_year: String(year), reprt_code: "11011", fs_div: fs }, key, init);
      if (j.status === "000" && j.list?.length) return { year, fs, rows: j.list as unknown as Row[] };
      if (j.status !== "013") throw new DartError(`DART ${j.status}: ${j.message}`);
    }
  }
  return null;
}
