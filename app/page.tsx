"use client";

import { useEffect, useMemo, useState } from "react";
import { ratios, isZombie, score, type Accounts, type Ratio, type Level } from "@/lib/ratios";
import { signals, type Audit, type HolderChange, type Signal } from "@/lib/signals";
import { KSIC } from "@/lib/ksic";

type Corp = [code: string, name: string, stock: string];
type Peers = { byCorp: Record<string, string>; ind: Record<string, { n: number; r: Record<string, number[]> }> };
type Pick = { code: string; name: string; ksic: string; rev: number; grade: string; debt: number | null; icr: number | null };
type Featured = { zombie: Pick[]; risky: Pick[]; solid: Pick[] };
type Result = {
  name: string; code?: string; stock?: string; ksic?: string;
  year: number; fs: "CFS" | "OFS" | "MANUAL"; accounts: Accounts; audit: Audit; holders: HolderChange[];
};

const EXAMPLES = ["삼성전자", "대한항공", "카카오", "위니아"];
const LABEL: Record<Level, string> = { good: "양호", warn: "주의", bad: "위험", na: "데이터 없음" };

const fmt = (v: number | null, unit: string) =>
  v === null ? "–" : v === Infinity ? "무차입" : `${v.toLocaleString("ko-KR", { maximumFractionDigits: unit === "배" ? 2 : 1 })}${unit}`;
const eok = (v: number | null) => (v === null ? "–" : Math.round(v / 1e8).toLocaleString("ko-KR"));
const money = (v: number | null): [string, string] =>
  v === null ? ["–", ""] : Math.abs(v) >= 1e12 ? [(v / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 1 }), "조"] : [eok(v), "억"];
const yoy = (s: (number | null)[]) => (s[1] === null || s[2] === null || s[1] === 0 ? null : ((s[2] - s[1]) / Math.abs(s[1])) * 100);

// Peer stats store debt-free ICR as 9999 (JSON has no Infinity); match that here.
const CAP = 9999;
const median = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : null);
// "상위 X%": share of peers that are better than or equal to this company.
function topPct(a: number[], v: number | null, higher: boolean) {
  if (v === null || a.length < 5) return null;
  const x = Math.min(v, CAP);
  const better = a.filter((p) => (higher ? p > x : p < x)).length;
  return Math.max(1, Math.round(((better + 1) / a.length) * 100));
}

export default function Page() {
  const [corps, setCorps] = useState<Corp[]>([]);
  const [peers, setPeers] = useState<Peers | null>(null);
  const [featured, setFeatured] = useState<Featured | null>(null);
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Both optional: they only add industry comparison and the home page lists.
    fetch("/peers.json").then((r) => r.json()).then(setPeers).catch(() => {});
    fetch("/featured.json").then((r) => r.json()).then(setFeatured).catch(() => {});
    fetch("/corps.json")
      .then((r) => r.json())
      .then((list: Corp[]) => {
        setCorps(list);
        // ?c=<corp_code> makes a result shareable as a link.
        const c = list.find((x) => x[0] === new URLSearchParams(location.search).get("c"));
        if (c) load(c, false);
      })
      .catch(() => setErr("기업 목록을 불러오지 못했습니다."));
  }, []);

  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return corps
      .filter((c) => c[1].includes(s) || c[2] === s)
      .sort((a, b) => Number(!a[1].startsWith(s)) - Number(!b[1].startsWith(s)) || a[1].length - b[1].length)
      .slice(0, 8);
  }, [q, corps]);

  async function load(c: Corp, push = true) {
    setMode("search"); setQ(c[1]); setOpen(false); setErr(""); setRes(null); setLoading(true);
    if (push) history.replaceState(null, "", `?c=${c[0]}`);
    try {
      const r = await fetch(`/api/fin?corp=${c[0]}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRes({ name: c[1], code: c[0], stock: c[2], ...j });
    } catch (e) {
      setErr((e as Error).message || "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  function reset(m: "search" | "manual") {
    setMode(m); setRes(null); setQ(""); setErr(""); history.replaceState(null, "", "/");
  }

  const home = !res && !loading && !err && mode === "search";

  return (
    <>
      <header className="top">
        <div className="wrap bar">
          <a className="logo" href="/" onClick={(e) => { e.preventDefault(); reset("search"); }}>
            <Mark /> RADAR
          </a>
          <span className="tag">DART Open API · 상장 {corps.length ? corps.length.toLocaleString() : "…"}개사</span>
        </div>
        <div className={`wrap hero ${home ? "" : "slim"}`}>
          {home && (
            <>
              <p className="eyebrow">기업 재무건전성 · 부실 조기경보</p>
              <h1>재무제표 속 위험 신호,<br />3년 추이로 한눈에.</h1>
              <p className="lead">
                6개 핵심 비율을 <b>업종 평균</b>과 비교하고, 감사의견·자본잠식·최대주주 변경 같은 <b>부실 징후</b>와 <b>한계기업</b> 여부를 함께 점검합니다.
              </p>
            </>
          )}
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === "search"} onClick={() => mode !== "search" && reset("search")}>상장사 검색</button>
            <button role="tab" aria-selected={mode === "manual"} onClick={() => mode !== "manual" && reset("manual")}>비상장 · 직접 입력</button>
          </div>
          {mode === "search" ? (
            <>
              <div className="search">
                <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <input
                  value={q}
                  placeholder="회사명 또는 종목코드"
                  aria-label="회사 검색"
                  onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  onKeyDown={(e) => e.key === "Enter" && hits[0] && load(hits[0])}
                />
                {open && hits.length > 0 && (
                  <ul className="drop">
                    {hits.map((c) => (
                      <li key={c[0]}>
                        <button onMouseDown={(e) => e.preventDefault()} onClick={() => load(c)}>
                          {c[1]} <small>{c[2]}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {home && (
                <div className="chips">
                  <span>예시</span>
                  {EXAMPLES.map((n) => {
                    const c = corps.find((x) => x[1] === n);
                    return c && <button key={n} onClick={() => load(c)}>{n}</button>;
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="lead small">공시 의무가 없는 중소기업도 재무제표 숫자만 넣으면 같은 기준으로 진단합니다. 입력값은 브라우저 밖으로 전송되지 않습니다.</p>
          )}
        </div>
      </header>

      <main className="wrap">
        {mode === "manual" && <ManualForm onSubmit={(r) => { setRes(r); setTimeout(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }), 50); }} />}
        {loading && <Skeleton />}
        {err && <div className="card error"><b>조회할 수 없습니다</b><p>{err}</p></div>}
        {res && <Report r={res} peers={peers} />}
        {home && featured && <FeaturedLists f={featured} corps={corps} onPick={load} />}
        {home && <HowTo />}
        <footer>
          데이터: 금융감독원 전자공시시스템(DART) Open API · 사업보고서 기준. 이자보상배율의 이자비용은 현금흐름표 이자지급액으로 대신합니다(직접 입력 시 이자비용).
          업종 비교는 상장사 최신 사업보고서를 KSIC 중분류로 묶은 분포입니다.
          <br />점수와 판정 구간은 일반적인 참고 기준으로 만든 자체 산식이며, 실제 신용평가·보증심사 모형과 무관한 개인 학습용 프로젝트입니다.
        </footer>
      </main>
    </>
  );
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" /><circle cx="16" cy="16" r="8" /><path d="M16 16 L27 8" /><circle cx="22" cy="12" r="2.2" className="blip" />
    </svg>
  );
}

function Report({ r, peers }: { r: Result; peers: Peers | null }) {
  const rs = ratios(r.accounts);
  const zombie = isZombie(rs);
  const sc = score(rs);
  const sig = signals(r.accounts, r.audit, r.holders, r.year);
  const ksic = r.ksic ?? (r.code ? peers?.byCorp[r.code] : undefined);
  const group = ksic ? peers?.ind[ksic] : undefined;
  const years = [r.year - 2, r.year - 1, r.year];
  const flagged = rs.filter((x) => x.levels[2] === "bad");
  const warned = rs.filter((x) => x.levels[2] === "warn");
  const badSig = sig.filter((s) => s.level === "bad").length;
  const level: Level = zombie || flagged.length >= 2 || badSig ? "bad" : flagged.length || warned.length || sig.length ? "warn" : "good";
  const title = zombie ? "한계기업 신호" : badSig ? "부실 징후 감지" : level === "bad" ? "재무 위험 다수" : level === "warn" ? "일부 주의 필요" : "재무 상태 양호";
  const a = r.accounts;

  const kpis: [string, (number | null)[]][] = [
    ["매출액", a.revenue], ["영업이익", a.operatingIncome], ["당기순이익", a.netIncome], ["자본총계", a.equity],
  ];
  const table: [string, (number | null)[]][] = [
    ...kpis.slice(0, 3), ["자산총계", a.assets], ["부채총계", a.liabilities], ["자본총계", a.equity], ["자본금", a.capital],
    ["영업활동현금흐름", a.operatingCashFlow], [r.fs === "MANUAL" ? "이자비용" : "이자지급액", a.interestPaid],
  ];

  return (
    <section className="report" id="report">
      <div className={`summary card ${level}`}>
        <div className="who">
          <div>
            <h2>{r.name}</h2>
            <p className="meta">
              {r.stock && <span>{r.stock}</span>}
              {ksic && <span>{KSIC[ksic] ?? `KSIC ${ksic}`}</span>}
              <span>{r.year} {r.fs === "MANUAL" ? "직접 입력" : "사업보고서"}</span>
              {r.fs !== "MANUAL" && <span>{r.fs === "CFS" ? "연결" : "별도"}</span>}
            </p>
          </div>
          {r.fs !== "MANUAL" && (
            <a className="dart" href={`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(r.name)}`} target="_blank" rel="noreferrer">
              DART 원문 ↗
            </a>
          )}
        </div>
        <div className="body">
          <Gauge s={sc?.score ?? null} grade={sc?.grade ?? "–"} level={zombie || sc?.grade === "D" ? "bad" : sc?.grade === "C" ? "warn" : sc ? "good" : "na"} />
          <div className="verdict">
            <span className={`pill ${level}`}>{title}</span>
            <p>
              {zombie
                ? "이자보상배율이 3년 연속 1 미만입니다. 영업으로 번 돈으로 이자도 감당하지 못하는 상태가 이어지고 있습니다."
                : level === "good"
                  ? "최근 연도 기준 주요 지표가 모두 양호 구간이고, 부실 징후가 발견되지 않았습니다."
                  : `위험 지표 ${flagged.length}개 · 주의 지표 ${warned.length}개 · 부실 징후 ${sig.length}건`}
            </p>
            <ul className="flags">
              {[...flagged, ...warned].map((x) => (
                <li key={x.key}><i className={`dot ${x.levels[2]}`} />{x.label} <b>{show(x, 2)}</b></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="kpis">
        {kpis.map(([k, v]) => {
          const d = yoy(v);
          return (
            <div key={k} className="kpi">
              <span>{k}</span>
              <b>{money(v[2])[0]}<small>{money(v[2])[1]}</small></b>
              <em className={d === null ? "" : d >= 0 ? "up" : "down"}>{d === null ? "–" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}</em>
            </div>
          );
        })}
      </div>

      <h3 className="sec">부실 조기경보 <small>{r.fs === "MANUAL" ? "재무 기반 신호" : "감사의견 · 자본잠식 · 손익 · 현금흐름 · 최대주주"}</small></h3>
      <Signals list={sig} audit={r.audit} manual={r.fs === "MANUAL"} />

      <h3 className="sec">
        지표별 3개년 추이
        {group && <small>업종 비교: {KSIC[ksic!] ?? ksic} 상장사 {group.n}곳</small>}
      </h3>
      <div className="grid">{rs.map((x) => <RatioCard key={x.key} r={x} years={years} peer={group?.r[x.key]} />)}</div>

      <h3 className="sec">주요 계정 <small>단위: 억원</small></h3>
      <div className="card flush">
        <table>
          <thead><tr><th />{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>{table.map(([k, v]) => <tr key={k}><td>{k}</td>{v.map((x, i) => <td key={i} className={x !== null && x < 0 ? "neg" : ""}>{eok(x)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function Signals({ list, audit, manual }: { list: Signal[]; audit: Audit; manual: boolean }) {
  return (
    <div className="card signals">
      {list.length === 0 ? (
        <p className="clear"><i className="dot good" />감지된 부실 징후 없음</p>
      ) : (
        <ul>
          {list.map((s) => (
            <li key={s.title} className={s.level}>
              <span className={`pill sm ${s.level}`}>{s.level === "bad" ? "경보" : "주의"}</span>
              <div><b>{s.title}</b><p>{s.detail}</p></div>
            </li>
          ))}
        </ul>
      )}
      {!manual && <p className="note">감사의견: {audit ? `${audit.opinion} (${audit.auditor})` : "공시 데이터에서 확인 불가"}</p>}
    </div>
  );
}

function Gauge({ s, grade, level }: { s: number | null; grade: string; level: Level }) {
  const C = 2 * Math.PI * 52;
  return (
    <div className={`gauge ${level}`}>
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" className="track" />
        <circle cx="60" cy="60" r="52" className="val" strokeDasharray={`${((s ?? 0) / 100) * C} ${C}`} />
      </svg>
      <div><b>{grade}</b><span>{s ?? "–"}점</span></div>
    </div>
  );
}

// 3-point line with threshold guides (+ industry median); the y-domain includes guides so they stay visible.
function Spark({ r, med }: { r: Ratio; med: number | null }) {
  const W = 260, H = 84, P = 10;
  const vals = r.values.map((v) => (v === null ? null : Number.isFinite(v) ? v : null));
  const guides: [string, number][] = [["good", r.good], ["warn", r.warn]];
  if (med !== null && med < CAP) guides.push(["peer", med]);
  const nums = [...vals.filter((v): v is number => v !== null), ...guides.map((g) => g[1])];
  let lo = Math.min(...nums), hi = Math.max(...nums);
  const pad = (hi - lo || 1) * 0.15; lo -= pad; hi += pad;
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const x = (i: number) => 24 + i * ((W - 48) / 2);
  const pts = r.values.map((v, i) => (v === null ? null : [x(i), v === Infinity ? P : y(v)] as const));
  const line = pts.filter(Boolean).map((p) => p!.join(",")).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`}>
      {guides.map(([k, v]) => (
        <g key={k} className={`th ${k}`}>
          <line x1="0" x2={W} y1={y(v)} y2={y(v)} />
          {k !== "peer" && <text x={k === "good" ? W - 2 : 2} y={y(v) - 3} textAnchor={k === "good" ? "end" : "start"}>{v}</text>}
        </g>
      ))}
      <polyline points={line} />
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="5" className={r.levels[i]} />)}
    </svg>
  );
}

// Debt ratio is undefined when equity <= 0; say why instead of a dash.
const show = (r: Ratio, i: number) => (r.key === "debt" && r.values[i] === null && r.levels[i] === "bad" ? "자본잠식" : fmt(r.values[i], r.unit));

function RatioCard({ r, years, peer }: { r: Ratio; years: number[]; peer?: number[] }) {
  const med = peer ? median(peer) : null;
  const top = peer ? topPct(peer, r.values[2], r.higher) : null;
  return (
    <article className="ratio">
      <header>
        <h4>{r.label}</h4>
        <span className={`pill sm ${r.levels[2]}`}>{LABEL[r.levels[2]]}</span>
      </header>
      <div className="big">{show(r, 2)}</div>
      {med !== null && (
        <p className="peer">
          <i />업종 중앙값 <b>{fmt(med >= CAP ? Infinity : med, r.unit)}</b>
          {top !== null && <span className={top <= 30 ? "good" : top >= 70 ? "bad" : ""}>업종 상위 {top}%</span>}
        </p>
      )}
      <Spark r={r} med={med} />
      <div className="years">{years.map((y, i) => <span key={y}><i className={`dot ${r.levels[i]}`} />{y}<b>{show(r, i)}</b></span>)}</div>
      <p className="hint">{r.hint} <em>기준: 양호 {r.higher ? "≥" : "≤"} {r.good}{r.unit}, 주의 {r.higher ? "≥" : "≤"} {r.warn}{r.unit}</em></p>
    </article>
  );
}

// Manual input for unlisted SMEs. Amounts in 백만원, three fiscal years.
const FIELDS: [keyof Accounts | "", string][] = [
  ["revenue", "매출액"], ["operatingIncome", "영업이익"], ["netIncome", "당기순이익"],
  ["assets", "자산총계"], ["liabilities", "부채총계"], ["capital", "자본금"],
  ["currentAssets", "유동자산"], ["currentLiabilities", "유동부채"],
  ["interestPaid", "이자비용"], ["operatingCashFlow", "영업활동현금흐름"],
];
type Form = Record<string, [string, string, string]>;
const blank = (): Form => Object.fromEntries(FIELDS.map(([k]) => [k, ["", "", ""]]));
// Fictional sample: thin paper profit, negative operating cash, eroding capital: shows several signals at once.
const SAMPLE: Form = {
  revenue: ["8200", "7600", "6100"], operatingIncome: ["410", "120", "60"], netIncome: ["260", "30", "-80"],
  assets: ["6400", "6900", "7100"], liabilities: ["3900", "4700", "5300"], capital: ["2500", "2500", "2500"],
  currentAssets: ["2600", "2300", "1900"], currentLiabilities: ["2100", "2500", "2800"],
  interestPaid: ["140", "180", "230"], operatingCashFlow: ["380", "-60", "-240"],
};

function ManualForm({ onSubmit }: { onSubmit: (r: Result) => void }) {
  const [name, setName] = useState("");
  const [ksic, setKsic] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [f, setF] = useState<Form>(blank);
  const years = [year - 2, year - 1, year];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = (s: string) => (s.trim() === "" || Number.isNaN(Number(s.replace(/,/g, ""))) ? null : Number(s.replace(/,/g, "")) * 1e6);
    const acc = Object.fromEntries(FIELDS.map(([k]) => [k, f[k].map(n)])) as unknown as Accounts;
    acc.equity = [0, 1, 2].map((i) => (acc.assets[i] === null || acc.liabilities[i] === null ? null : acc.assets[i]! - acc.liabilities[i]!));
    onSubmit({ name: name.trim() || "입력 기업", ksic: ksic || undefined, year, fs: "MANUAL", accounts: acc, audit: null, holders: [] });
  }

  return (
    <form className="card manual" onSubmit={submit}>
      <div className="row">
        <label>기업명<input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ㈜가나정밀" /></label>
        <label>업종 (비교 기준)
          <select value={ksic} onChange={(e) => setKsic(e.target.value)}>
            <option value="">선택 안 함</option>
            {Object.entries(KSIC).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
          </select>
        </label>
        <label>최근 결산연도<input type="number" value={year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value))} /></label>
      </div>
      <div className="sheet">
        <span className="h">단위: 백만원</span>{years.map((y) => <span key={y} className="h">{y}</span>)}
        {FIELDS.map(([k, label]) => (
          <div key={k} className="line">
            <span>{label}</span>
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                inputMode="decimal"
                aria-label={`${years[i]} ${label}`}
                value={f[k][i]}
                onChange={(e) => setF({ ...f, [k]: f[k].map((v, j) => (j === i ? e.target.value : v)) as Form[string] })}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="ghost" onClick={() => { setF(SAMPLE); setName("가상기업 A (예시)"); setKsic("29"); }}>예시 값 채우기</button>
        <button type="button" className="ghost" onClick={() => { setF(blank()); setName(""); }}>초기화</button>
        <button type="submit" className="primary">진단하기</button>
      </div>
      <p className="note">자본총계는 자산총계 − 부채총계로 계산합니다. 빈 칸은 데이터 없음으로 처리합니다.</p>
    </form>
  );
}

function Skeleton() {
  return (
    <section className="report" aria-busy>
      <div className="card sk" style={{ height: 220 }} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi sk" style={{ height: 92 }} />)}</div>
      <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="ratio sk" style={{ height: 260 }} />)}</div>
    </section>
  );
}

function FeaturedLists({ f, corps, onPick }: { f: Featured; corps: Corp[]; onPick: (c: Corp) => void }) {
  const cols: [keyof Featured, string, string, Level, (p: Pick) => string][] = [
    ["zombie", "한계기업 신호", "이자보상배율(이자지급액 기준) 3년 연속 1 미만", "bad", (p) => `이자보상배율 ${fmt(p.icr, "배")}`],
    ["risky", "재무 위험 대형사", "건전성 점수 D등급", "warn", (p) => `부채비율 ${p.debt === null ? "자본잠식" : fmt(p.debt, "%")}`],
    ["solid", "재무 우량 대형사", "건전성 점수 A등급", "good", (p) => `부채비율 ${fmt(p.debt, "%")}`],
  ];
  return (
    <section className="featured">
      <h3 className="sec">주목할 기업 <small>상장사 최신 사업보고서 · 매출 규모순 · 금융업 제외</small></h3>
      <div className="cols">
        {cols.map(([k, title, sub, level, metric]) => (
          <div key={k} className={`col card ${level}`}>
            <header><span className={`pill sm ${level}`}>{title}</span><small>{sub}</small></header>
            <ol>
              {f[k].map((p) => {
                const c = corps.find((x) => x[0] === p.code);
                return (
                  <li key={p.code}>
                    <button onClick={() => c && onPick(c)}>
                      <span className="nm"><b>{p.name}</b><small>{KSIC[p.ksic] ?? ""}</small></span>
                      <span className="mt"><b>{money(p.rev).join("")}</b><small>{metric(p)}</small></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowTo() {
  const steps = [
    ["01", "공시 수집", "DART Open API로 최근 사업보고서의 재무제표, 감사의견, 최대주주 변동 내역을 가져옵니다."],
    ["02", "비율 산출", "안정성·유동성·수익성·성장성·이자상환능력 6개 지표를 3개년으로 계산합니다."],
    ["03", "업종 비교", "상장사 전체를 KSIC 업종별로 묶어 중앙값과 업종 내 순위를 보여줍니다."],
    ["04", "부실 조기경보", "비적정 감사의견, 자본잠식, 연속 영업손실, 흑자부도 신호, 한계기업을 표시합니다."],
  ];
  return (
    <section className="how">
      {steps.map(([n, t, d]) => (
        <div key={n}><span>{n}</span><h4>{t}</h4><p>{d}</p></div>
      ))}
    </section>
  );
}
