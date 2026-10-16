// Sürüm bilgisinin geçerli olduğunu ve her sayfada gösterildiğini denetler.
// Kullanım: node tests/version.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
vm.runInThisContext(read("js/version.js"));
const { APP_VERSION, UPDATED_AT, label } = globalThis.KK_VERSION;

assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/, "APP_VERSION 'büyük.orta.küçük' biçiminde olmalı");
assert.ok(!Number.isNaN(Date.parse(UPDATED_AT)), "UPDATED_AT geçerli bir tarih olmalı");
assert.ok(Date.parse(UPDATED_AT) <= Date.now() + 864e5, "UPDATED_AT gelecekte olmamalı");
assert.match(label(), new RegExp(`^Sürüm ${APP_VERSION.replace(/\./g, "\\.")} · Son güncelleme: `));

for (const page of ["index.html", "arena.html"]) {
  const html = read(page);
  assert.ok(html.includes("data-app-version"), `${page}: alt bilgide sürüm alanı yok`);
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  assert.match(scripts[0], /^js\/version\.js/, `${page}: version.js ilk yerel betik olmalı`);
  // Yerel CSS/JS dosyalarının hepsi aynı önbellek sürümünü kullanmalı; yoksa tarayıcı eski dosyayla yeni dosyayı karıştırabilir.
  const tags = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
  const vs = new Set(tags.map(t => (t.match(/\?v=(\w+)$/) || [])[1]));
  assert.equal(vs.size, 1, `${page}: yerel dosyalarda farklı ya da eksik ?v= değerleri var: ${[...vs]}`);
  assert.ok(!vs.has(undefined), `${page}: ?v= eksik olan yerel dosya var`);
}
console.log(`✔ ${label()}`);
