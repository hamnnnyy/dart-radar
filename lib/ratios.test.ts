import assert from "node:assert/strict";
import { extract, ratios, isZombie, score, peerLevel, type Row } from "./ratios.ts";

const row = (sj_div: string, account_id: string, account_nm: string, b: string, f: string, t: string): Row => ({
  sj_div, account_id, account_nm, bfefrmtrm_amount: b, frmtrm_amount: f, thstrm_amount: t,
});

const rows: Row[] = [
  row("BS", "ifrs-full_Assets", "자산총계", "1000", "1000", "1000"),
  row("BS", "ifrs-full_Liabilities", "부채총계", "600", "700", "1,100"),
  row("BS", "ifrs-full_Equity", "자본총계", "400", "300", "-100"),
  row("BS", "x", "유동 자산", "300", "300", "300"),
  row("BS", "ifrs-full_CurrentLiabilities", "유동부채", "200", "300", "400"),
  row("CIS", "ifrs-full_Revenue", "매출액", "1000", "1100", "990"),
  row("CIS", "dart_OperatingIncomeLoss", "영업이익", "50", "20", "-10"),
  row("CF", "custom", "이자의 지급", "-100", "-100", "-100"),
];

const r = ratios(extract(rows));
const get = (k: string) => r.find((x) => x.key === k)!;

assert.deepEqual(get("debt").values, [150, 700 / 3, null]); // equity <= 0 -> null value
assert.equal(get("debt").levels[2], "bad"); // ...but graded as 자본잠식
assert.deepEqual(get("current").values, [150, 100, 75]); // name fallback ignores spaces
assert.deepEqual(get("icr").values, [0.5, 0.2, -0.1]); // interest paid sign flipped
assert.equal(get("growth").values[0], null);
assert.equal(Math.round(get("growth").values[1]!), 10);
assert.equal(isZombie(r), true);

const noDebt = ratios(extract([row("CIS", "dart_OperatingIncomeLoss", "영업이익", "1", "1", "1"), row("CF", "c", "이자지급", "0", "0", "0")]));
assert.equal(noDebt.find((x) => x.key === "icr")!.values[2], Infinity);
assert.equal(isZombie(noDebt), false);

assert.equal(score(r)!.grade, "D"); // zombie caps score
assert.equal(score(noDebt)!.score, 100);
assert.equal(r.filter((x) => x.good === undefined).length, 0);

// 5 years (two reports joined): zombie looks at the latest 3 only, growth at each previous year.
const five = { ...extract(rows) };
for (const k of Object.keys(five) as (keyof typeof five)[]) five[k] = [five[k][0], five[k][1], ...five[k]];
const r5 = ratios(five);
assert.equal(r5[0].values.length, 5);
assert.equal(isZombie(ratios({ ...five, interestPaid: [1, 1, 0, 0, 0], operatingIncome: [-1, -1, 1, 1, 1] })), false);
assert.equal(isZombie(ratios({ ...five, interestPaid: [0, 0, 100, 100, 100] })), true);

// Industry-relative levels feed the same score.
assert.equal(peerLevel(10), "good");
assert.equal(peerLevel(60), "warn");
assert.equal(peerLevel(90), "bad");
assert.equal(score(noDebt, ["warn"])!.score, 60);

console.log("ratios ok");
