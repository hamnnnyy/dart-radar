// Pure ratio math over DART fnlttSinglAcntAll rows. No I/O here so it can be tested in isolation.

export type Row = {
  sj_div: string; // BS, IS, CIS, CF, SCE
  account_id: string;
  account_nm: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
};

// Index 0 = oldest year, last = latest year. One report gives 3 years; the API route joins two reports for 5.
export type Series = (number | null)[];

const num = (s?: string): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/,/g, "").trim());
  return s.trim() === "" || s.trim() === "-" || Number.isNaN(n) ? null : n;
};

const series = (r: Row): Series => [num(r.bfefrmtrm_amount), num(r.frmtrm_amount), num(r.thstrm_amount)];

// Standard XBRL id first, account name as fallback: small companies often file custom ids.
function pick(rows: Row[], sj: string[], ids: string[], name?: RegExp): Series {
  const inSj = rows.filter((r) => sj.includes(r.sj_div));
  const hit =
    inSj.find((r) => ids.includes(r.account_id)) ?? (name ? inSj.find((r) => name.test(r.account_nm.replace(/\s/g, ""))) : undefined);
  return hit ? series(hit) : [null, null, null];
}

export function extract(rows: Row[]) {
  const IS = ["IS", "CIS"];
  return {
    assets: pick(rows, ["BS"], ["ifrs-full_Assets"], /^자산총계$/),
    liabilities: pick(rows, ["BS"], ["ifrs-full_Liabilities"], /^부채총계$/),
    equity: pick(rows, ["BS"], ["ifrs-full_Equity"], /^자본총계$/),
    currentAssets: pick(rows, ["BS"], ["ifrs-full_CurrentAssets"], /^유동자산$/),
    currentLiabilities: pick(rows, ["BS"], ["ifrs-full_CurrentLiabilities"], /^유동부채$/),
    revenue: pick(rows, IS, ["ifrs-full_Revenue"], /^(매출액|수익\(매출액\)|영업수익|매출)$/),
    operatingIncome: pick(rows, IS, ["dart_OperatingIncomeLoss"], /^영업이익(\(손실\))?$/),
    netIncome: pick(rows, IS, ["ifrs-full_ProfitLoss"], /^당기순이익(\(손실\))?$/),
    capital: pick(rows, ["BS"], ["ifrs-full_IssuedCapital"], /^자본금$/),
    operatingCashFlow: pick(rows, ["CF"], ["ifrs-full_CashFlowsFromUsedInOperatingActivities"], /^영업활동(으로인한)?현금흐름$/),
    // Interest expense is usually buried in notes; cash-flow "interest paid" is the reliable public proxy.
    interestPaid: pick(
      rows,
      ["CF"],
      ["ifrs-full_InterestPaidClassifiedAsOperatingActivities", "ifrs-full_InterestPaidClassifiedAsFinancingActivities"],
      /이자.*지급|이자지급/
    ).map((v) => (v === null ? null : Math.abs(v))),
  };
}

export type Accounts = ReturnType<typeof extract>;

const div = (a: number | null, b: number | null, scale = 100) =>
  a === null || b === null || b === 0 ? null : (a / b) * scale;

export type Level = "good" | "warn" | "bad" | "na";
export type Ratio = { key: string; label: string; unit: string; values: Series; levels: Level[]; hint: string; good: number; warn: number; higher: boolean };

function grade(v: number | null, good: number, warn: number, higherIsBetter = true): Level {
  if (v === null) return "na";
  if (higherIsBetter) return v >= good ? "good" : v >= warn ? "warn" : "bad";
  return v <= good ? "good" : v <= warn ? "warn" : "bad";
}

export function ratios(a: Accounts): Ratio[] {
  const y = a.assets.map((_, i) => i);
  const debt = y.map((i) => (a.equity[i] !== null && a.equity[i]! <= 0 ? null : div(a.liabilities[i], a.equity[i])));
  const current = y.map((i) => div(a.currentAssets[i], a.currentLiabilities[i]));
  const equityRatio = y.map((i) => div(a.equity[i], a.assets[i]));
  const margin = y.map((i) => div(a.operatingIncome[i], a.revenue[i]));
  const growth = y.map((i) => (i === 0 ? null : div(sub(a.revenue[i], a.revenue[i - 1]), a.revenue[i - 1])));
  // No interest paid = no borrowing cost, treat as safely covered.
  const icr = y.map((i) => (a.interestPaid[i] === 0 && a.operatingIncome[i] !== null ? Infinity : div(a.operatingIncome[i], a.interestPaid[i], 1)));

  return [
    {
      key: "debt", label: "부채비율", unit: "%", values: debt,
      levels: y.map((i) => (a.equity[i] !== null && a.equity[i]! <= 0 ? "bad" : grade(debt[i], 100, 200, false))),
      good: 100, warn: 200, higher: false,
      hint: "부채총계 / 자본총계. 200% 초과 시 재무 레버리지 과다로 봄. 자본이 0 이하면 완전자본잠식.",
    },
    { key: "current", label: "유동비율", unit: "%", values: current, levels: current.map((v) => grade(v, 150, 100)), good: 150, warn: 100, higher: true, hint: "유동자산 / 유동부채. 1년 안에 갚을 빚을 1년 안에 현금화할 자산으로 감당하는지. 100% 미만은 단기 유동성 위험." },
    { key: "equity", label: "자기자본비율", unit: "%", values: equityRatio, levels: equityRatio.map((v) => grade(v, 50, 30)), good: 50, warn: 30, higher: true, hint: "자본총계 / 자산총계. 자산 중 남의 돈이 아닌 비중." },
    { key: "margin", label: "영업이익률", unit: "%", values: margin, levels: margin.map((v) => grade(v, 5, 0)), good: 5, warn: 0, higher: true, hint: "영업이익 / 매출액. 본업으로 돈을 버는 힘." },
    { key: "growth", label: "매출성장률", unit: "%", values: growth, levels: growth.map((v) => grade(v, 5, 0)), good: 5, warn: 0, higher: true, hint: "전년 대비 매출 증감." },
    { key: "icr", label: "이자보상배율", unit: "배", values: icr, levels: icr.map((v) => grade(v, 3, 1)), good: 3, warn: 1, higher: true, hint: "영업이익 / 이자지급액(현금흐름표). 1 미만이면 영업으로 번 돈으로 이자도 못 냄." },
  ];
}

const sub = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

// 한국은행 기준 한계기업: 이자보상배율 3년 연속 1 미만 (최근 3년).
export function isZombie(rs: Ratio[]): boolean | null {
  const icr = rs.find((r) => r.key === "icr")!.values.slice(-3);
  if (icr.some((v) => v === null)) return null;
  return icr.every((v) => v! < 1);
}

const POINTS: Record<Level, number> = { good: 100, warn: 60, bad: 15, na: 0 };

// Simple self-made health score over the latest year, not a credit rating.
// `latest` swaps in other levels for the same ratios, e.g. industry-relative ones.
export function score(rs: Ratio[], latest = rs.map((r) => r.levels.at(-1)!)): { score: number; grade: string } | null {
  const ls = latest.filter((l) => l !== "na");
  if (!ls.length) return null;
  let s = Math.round(ls.reduce((t, l) => t + POINTS[l], 0) / ls.length);
  if (isZombie(rs)) s = Math.min(s, 30);
  return { score: s, grade: s >= 85 ? "A" : s >= 70 ? "B" : s >= 50 ? "C" : "D" };
}

// Industry-relative level from "상위 X%": top 40% good, bottom 25% bad.
export const peerLevel = (top: number): Level => (top <= 40 ? "good" : top <= 75 ? "warn" : "bad");
