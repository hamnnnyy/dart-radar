import assert from "node:assert/strict";
import { signals, controlChanges } from "./signals.ts";
import type { Accounts } from "./ratios.ts";

const s = (a: number | null, b: number | null, c: number | null) => [a, b, c];
const base: Accounts = {
  assets: s(100, 100, 100), liabilities: s(50, 50, 50), equity: s(50, 50, 30), currentAssets: s(1, 1, 1), currentLiabilities: s(1, 1, 1),
  revenue: s(100, 100, 60), operatingIncome: s(-1, -1, 5), netIncome: s(1, 1, 1), interestPaid: s(0, 0, 0), capital: s(40, 40, 40), operatingCashFlow: s(1, 1, -3),
};

const t = (x: ReturnType<typeof signals>) => x.map((v) => v.title);

const r = signals(base, { opinion: "적정", auditor: "A", notes: "계속기업 관련 중요한 불확실성" }, [], 2025);
assert.ok(!t(r).some((x) => x.startsWith("감사의견"))); // 적정 is fine
assert.ok(t(r).includes("계속기업 불확실성"));
assert.ok(t(r).includes("자본잠식률 25%"));
assert.equal(r.find((x) => x.title.startsWith("자본잠식률"))!.level, "warn");
assert.ok(t(r).includes("이익의 질 의심"));
assert.ok(t(r).includes("매출 급감 -40%"));
assert.ok(!t(r).some((x) => x.includes("영업손실"))); // latest year is profit
assert.equal(r[0].level, "bad"); // bad first

const w = signals({ ...base, equity: s(1, 1, -5), operatingIncome: s(-1, -1, -1) }, { opinion: "부적정", auditor: "B", notes: "-" }, [], 2025);
assert.ok(t(w).includes("감사의견 부적정"));
assert.ok(t(w).includes("완전자본잠식"));
assert.ok(t(w).includes("3년 연속 영업손실"));

const h = [
  { date: "2014년 11월 04일", name: "(주)가" }, { date: "2016년 07월 08일", name: "가" },
  { date: "2024년 03월 01일", name: "나" }, { date: "2025년 05월 01일", name: "다" },
];
assert.equal(controlChanges(h, 2023), 2); // 가→나, 나→다; (주)가→가 is not a change
assert.equal(controlChanges(h, 2025), 1);

console.log("signals ok");
