// Problem bankasındaki tüm beklenen çıktıları referans çözümlere karşı doğrular.
// Kullanım: node tests/verify-problems.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL("../js/problems.js", import.meta.url), "utf8"), ctx);
const PROBLEMS = ctx.window.PROBLEMS;

const ref = {
  topla: (a, b) => a + b,
  ciftMi: n => n % 2 === 0,
  enBuyuk: d => Math.max(...d),
  faktoriyel: n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  tersCevir: s => [...s].reverse().join(""),
  sesliHarfSay: s => [...s].filter(c => "aeıioöuü".includes(c)).length,
  notHarfi: p => p >= 90 ? "AA" : p >= 80 ? "BA" : p >= 70 ? "BB" : p >= 60 ? "CB" : p >= 50 ? "CC" : "FF",
  ebob: (a, b) => b === 0 ? a : ref.ebob(b, a % b),
  fizzBuzz: n => Array.from({ length: n }, (_, i) => { i++; return i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i); }),
  palindromMu: s => { const t = s.replace(/\s/g, "").toLowerCase(); return t === [...t].reverse().join(""); },
  asalMi: n => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; },
  fibonacci: n => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; },
  ikiToplam: (d, h) => { const m = new Map(); for (let i = 0; i < d.length; i++) { if (m.has(h - d[i])) return [m.get(h - d[i]), i]; m.set(d[i], i); } },
  tekrarlariKaldir: d => [...new Set(d)],
  kelimeFrekans: m => { const o = {}; for (const w of m.split(/\s+/).filter(Boolean)) o[w] = (o[w] || 0) + 1; return o; },
  parantezDengeli: s => { const st = [], p = { ")": "(", "]": "[", "}": "{" }; for (const c of s) { if ("([{".includes(c)) st.push(c); else if (st.pop() !== p[c]) return false; } return st.length === 0; },
  ikiliArama: (d, h) => d.indexOf(h),
  anagramMi: (a, b) => [...a].sort().join("") === [...b].sort().join(""),
  transpoz: m => m[0].map((_, j) => m.map(r => r[j])),
  ortakOnek: k => { if (!k.length) return ""; let p = k[0]; for (const w of k) while (!w.startsWith(p)) p = p.slice(0, -1); return p; },
  sezar: (m, k) => m.replace(/[a-z]/gi, c => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26 + 26) % 26 + b); }),
  romenRakami: n => { const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let r = ""; for (const [v, s] of t) while (n >= v) { r += s; n -= v; } return r; },
  adaSayisi: g => { const v = g.map(r => r.map(() => false)); let c = 0; const dfs = (i, j) => { if (i < 0 || j < 0 || i >= g.length || j >= g[0].length || !g[i][j] || v[i][j]) return; v[i][j] = true; dfs(i + 1, j); dfs(i - 1, j); dfs(i, j + 1); dfs(i, j - 1); }; g.forEach((r, i) => r.forEach((x, j) => { if (x && !v[i][j]) { c++; dfs(i, j); } })); return c; },
  paraUstu: (ms, x) => { const dp = Array(x + 1).fill(Infinity); dp[0] = 0; for (let i = 1; i <= x; i++) for (const m of ms) if (m <= i) dp[i] = Math.min(dp[i], dp[i - m] + 1); return dp[x] === Infinity ? -1 : dp[x]; },
  enUzunArtan: d => { const dp = d.map(() => 1); for (let i = 0; i < d.length; i++) for (let j = 0; j < i; j++) if (d[j] < d[i]) dp[i] = Math.max(dp[i], dp[j] + 1); return d.length ? Math.max(...dp) : 0; },
};

let fail = 0;
const ids = new Set();
for (const p of PROBLEMS) {
  if (ids.has(p.id)) { console.error(`Yinelenen id: ${p.id}`); fail++; }
  ids.add(p.id);
  const f = ref[p.fn];
  if (!f) { console.error(`Referans çözüm yok: ${p.fn}`); fail++; continue; }
  if (!p.tests.some(t => !t.h)) { console.error(`${p.id}: görünür test yok`); fail++; }
  for (const t of p.tests) {
    const got = f(...structuredClone(t.in));
    if (JSON.stringify(got) !== JSON.stringify(t.out)) {
      console.error(`${p.id} ${JSON.stringify(t.in)} → beklenen ${JSON.stringify(t.out)}, referans ${JSON.stringify(got)}`);
      fail++;
    }
  }
}
console.log(fail ? `${fail} hata` : `${PROBLEMS.length} problem, tüm testler doğru ✔`);
process.exit(fail ? 1 : 0);
