// Early-warning signals beyond ratios: audit opinion, going concern, capital impairment,
// persistent losses, earnings quality, control changes. Pure, so it is testable.
import type { Accounts } from "./ratios.ts";

export type Signal = { level: "bad" | "warn"; title: string; detail: string };
export type Audit = { opinion: string; auditor: string; notes: string } | null;
export type HolderChange = { date: string; name: string };

const norm = (n: string) => n.replace(/\(주\)|㈜|주식회사|\s/g, "");
const yearOf = (d: string) => Number(d.match(/\d{4}/)?.[0] ?? 0);

// Number of times the largest shareholder actually changed (name differs from the previous entry) since `from`.
export function controlChanges(list: HolderChange[], from: number): number {
  const rows = list.filter((h) => yearOf(h.date)).sort((a, b) => a.date.localeCompare(b.date));
  let n = 0;
  for (let i = 1; i < rows.length; i++) if (norm(rows[i].name) !== norm(rows[i - 1].name) && yearOf(rows[i].date) >= from) n++;
  return n;
}

export function signals(a: Accounts, audit: Audit, holders: HolderChange[], year: number): Signal[] {
  const out: Signal[] = [];
  const last = (s: (number | null)[]) => s[2];

  if (audit && /한정|부적정|거절/.test(audit.opinion))
    out.push({ level: "bad", title: `감사의견 ${audit.opinion}`, detail: `${audit.auditor}. 비적정 감사의견은 재무제표 신뢰성 문제이자 상장 유지 요건 위반 사유입니다.` });
  if (audit && /계속기업/.test(audit.notes))
    out.push({ level: "bad", title: "계속기업 불확실성", detail: "감사보고서에 계속기업으로서의 존속능력에 대한 언급이 있습니다." });

  const cap = last(a.capital), eq = last(a.equity);
  if (eq !== null && eq <= 0) out.push({ level: "bad", title: "완전자본잠식", detail: "자본총계가 0 이하입니다. 자산을 모두 팔아도 부채를 갚지 못하는 상태입니다." });
  else if (cap && eq !== null && eq < cap) {
    const rate = ((cap - eq) / cap) * 100;
    out.push({ level: rate >= 50 ? "bad" : "warn", title: `자본잠식률 ${rate.toFixed(0)}%`, detail: "누적 손실로 자본총계가 자본금보다 작습니다. 50% 이상이면 관리종목 지정 사유입니다." });
  }

  let losses = 0;
  for (let i = 2; i >= 0 && (a.operatingIncome[i] ?? 0) < 0; i--) losses++;
  if (losses >= 2) out.push({ level: losses >= 3 ? "bad" : "warn", title: `${losses}년 연속 영업손실`, detail: "본업에서 손실이 이어지고 있습니다." });

  const oi = last(a.operatingIncome), ocf = last(a.operatingCashFlow);
  if (oi !== null && ocf !== null && oi > 0 && ocf < 0)
    out.push({ level: "warn", title: "이익의 질 의심", detail: "영업이익은 흑자인데 영업활동현금흐름은 적자입니다. 매출채권·재고가 쌓이는 흑자부도 위험 신호일 수 있습니다." });

  const [r1, r2] = [a.revenue[1], a.revenue[2]];
  if (r1 && r2 !== null && r1 > 0 && (r2 - r1) / r1 <= -0.3)
    out.push({ level: "warn", title: `매출 급감 ${(((r2 - r1) / r1) * 100).toFixed(0)}%`, detail: "전년 대비 매출이 30% 이상 줄었습니다." });

  const ch = controlChanges(holders, year - 2);
  if (ch) out.push({ level: ch >= 2 ? "bad" : "warn", title: `최대주주 변경 ${ch}회 (최근 3년)`, detail: "잦은 경영권 변동은 경영 불안정과 부실 징후로 봅니다." });

  return out.sort((x, y) => Number(x.level !== "bad") - Number(y.level !== "bad"));
}
