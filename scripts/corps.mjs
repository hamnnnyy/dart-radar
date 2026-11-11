// One-off: build public/corps.json (listed companies only) from DART corpCode.xml.
// Usage: DART_API_KEY=... npm run corps   (or put the key in .env.local)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const key = process.env.DART_API_KEY ?? readFileSync(".env.local", "utf8").match(/DART_API_KEY=(\S+)/)?.[1];
if (!key) throw new Error("DART_API_KEY missing");

const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`);
const buf = Buffer.from(await res.arrayBuffer());
if (buf[0] !== 0x50) throw new Error(buf.toString("utf8").slice(0, 300)); // not a zip = DART error message

const zip = join(mkdtempSync(join(tmpdir(), "dart-")), "c.zip");
writeFileSync(zip, buf);
const xml = execFileSync("unzip", ["-p", zip], { maxBuffer: 1 << 28 }).toString("utf8");

const cutoff = String(new Date().getFullYear() - 2) + "0101";
const tag = (s, t) => s.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1].trim() ?? "";
const corps = [...xml.matchAll(/<list>([\s\S]*?)<\/list>/g)]
  .map(([, s]) => [tag(s, "corp_code"), tag(s, "corp_name"), tag(s, "stock_code"), tag(s, "modify_date")])
  .filter((c) => c[2] && c[3] >= cutoff); // delisted firms keep stock_code but stop filing

writeFileSync("public/corps.json", JSON.stringify(corps.map((c) => c.slice(0, 3))));
console.log(`${corps.length} listed companies`);
