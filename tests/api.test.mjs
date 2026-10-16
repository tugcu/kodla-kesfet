// API iş kurallarını (yetki, kilitler, not görünürlüğü, sürüm geçişi, hesap sıfırlama) Node üzerinde test eder.
// Kullanım: node tests/api.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

// Tarayıcıdaki localStorage'ın basit bir taklidi.
class MemStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
globalThis.localStorage = new MemStorage();

const load = f => vm.runInThisContext(readFileSync(new URL("../js/" + f, import.meta.url), "utf8"), { filename: f });
load("storage-version.js"); load("seed.js"); load("api.js");
const { API, KK_STORAGE } = globalThis;
// Kod ödevleri için sahte çalıştırıcı: koddaki "OK" sayısı kadar test geçer.
globalThis.Runner = { run: async ({ code, tests }) => ({ results: tests.map((t, i) => ({ ok: i < (code.match(/OK/g) || []).length, hidden: !!t.h })) }) };

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("✔", name); };
const rejects = (p, re) => assert.rejects(p, e => re.test(e.message));
const PW = { admin: "admin123", ogretmen: "ogretmen123" };
const as = async u => { await API.logout(); return API.login(u, PW[u] || "ogrenci123"); };
const STUDENTS = ["ayse", "zeynep", "elif"];

await API.init();
await as("ogretmen");
const COURSE = (await API.listCourses())[0].id;
const FULL = (await API.getCourse(COURSE)).items; // öğretmen görünümü: doğru cevaplar dahil
const GRADABLE = FULL.filter(i => i.type !== "video").length;
const byTitle = t => FULL.find(i => i.title.startsWith(t));

// Öğrenciyi ders akışında ilk `count` adımı tamamlamış hâle getirir (öğretmen onayları dahil).
async function advance(u, count) {
  for (const it of FULL.slice(0, count)) {
    await as(u);
    if (it.type === "video") await API.markWatched(it.id);
    else if (it.type === "quiz") await API.submitQuiz(it.id, it.questions.map(q => q.correct));
    else if (it.type === "exam") await API.submitExam(it.id, it.questions.map(q => q.correct));
    else {
      const payload = it.kind === "code" ? { code: "OK ".repeat(it.code.tests.length) } : it.kind === "open" ? { answers: it.questions.map(() => "cevap") } : { answers: it.questions.map(q => q.correct) };
      await API.submitAssignment(it.id, payload);
      if (it.blocking) {
        await as("ogretmen");
        const s = (await API.listSubmissions({ status: "pending" })).find(x => x.itemId === it.id);
        await API.gradeSubmission(s.id, { score: 100 });
      }
    }
  }
}
const progressOf = async u => { await as(u); return (await API.listCourses())[0].progress; };

await test("ilk giriş: hiçbir öğrencide hazır ilerleme yok, herkes Bölüm 1 videosundan başlar", async () => {
  for (const u of STUDENTS) {
    const p = await progressOf(u);
    assert.equal(p.done, 0, `${u} sıfır adımla başlamalı`);
    assert.equal(p.complete, false);
    assert.deepEqual(p.rows.map(r => r.locked), FULL.map((_, i) => i > 0), `${u}: yalnızca ilk adım açık olmalı`);
    assert.equal(FULL[0].type, "video");
    assert.match(FULL[0].title, /Bölüm 1/);
    assert.deepEqual((await API.myGrades(COURSE)).rows.map(r => r.state), Array(GRADABLE).fill("none"));
  }
  await as("ogretmen");
  assert.equal((await API.listSubmissions()).length, 0, "hazır teslim olmamalı");
});

await test("giriş: hatalı şifre reddedilir, roller doğru", async () => {
  await rejects(API.login("admin", "yanlis"), /hatalı/);
  assert.equal((await as("admin")).role, "admin");
  assert.equal((await as("ogretmen")).role, "teacher");
  assert.equal((await as("ayse")).role, "student");
});

await test("öğrenci yönetici/öğretmen işlemlerini yapamaz; öğretmen ve yönetici hesabı sıfırlayamaz", async () => {
  await as("ayse");
  await rejects(API.listUsers(), /yetkin yok/);
  await rejects(API.createCourse({ title: "x" }), /yetkin yok/);
  await rejects(API.saveItem(COURSE, { type: "video", title: "x", youtubeId: "abcdefghijk" }), /yetkin yok/);
  await as("ogretmen"); await rejects(API.resetMyProgress(), /yetkin yok/);
  await as("admin"); await rejects(API.resetMyProgress(), /yetkin yok/);
});

await test("öğrenci doğru cevapları ve gizli testleri göremez", async () => {
  await as("zeynep");
  for (const it of (await API.getCourse(COURSE)).items) {
    (it.questions || []).forEach(q => assert.equal(q.correct, undefined));
    if (it.code) assert.ok(it.code.tests.every(t => !t.h));
  }
});

await test("kilitler: video izlenmeden quiz, quiz geçilmeden sonraki video açılmaz", async () => {
  await as("zeynep");
  const q1 = byTitle("Quiz 1"), v1 = byTitle("Bölüm 1"), v2 = byTitle("Bölüm 2");
  await rejects(API.submitQuiz(q1.id, [1, 1, 1, 1]), /kilitli/);
  await API.markWatched(v1.id);
  await rejects(API.markWatched(v2.id), /kilitli/);
  const r1 = await API.submitQuiz(q1.id, [0, 0, 0, 0]);
  assert.equal(r1.passed, false);
  assert.equal(r1.detail[0].correct, undefined, "showAnswers=false iken doğru cevap sızmamalı");
  const r2 = await API.submitQuiz(q1.id, [1, 1, 1, 0]); // %75 = baraj
  assert.equal(r2.passed, true);
  await API.markWatched(v2.id);
  await rejects(API.submitQuiz(q1.id, [1, 1, 1, 1]), /zaten geçtin/);
});

await test("engelleyici ödev: onay ve geçer not gelmeden sonraki bölüm açılmaz", async () => {
  const o1 = byTitle("Ödev 1"), v3 = byTitle("Bölüm 3");
  await advance("ayse", FULL.indexOf(o1));
  await as("ayse");
  await API.submitAssignment(o1.id, { code: "OK OK" });
  let row = (await API.getCourse(COURSE)).progress.rows.find(r => r.itemId === v3.id);
  assert.equal(row.locked, true); assert.match(row.blocker, /Ödev 1/);
  assert.equal((await API.mySubmissions(o1.id)).at(-1).autoScore, undefined, "onaysız ödevin notu görünmemeli");

  await as("ogretmen");
  const sub = (await API.listSubmissions({ status: "pending" })).find(s => s.studentName === "Ayşe Yılmaz");
  assert.equal(sub.autoScore, 40);
  await rejects(API.gradeSubmission(sub.id, { score: 120 }), /0 ile 100/);
  await API.gradeSubmission(sub.id, { score: 40, feedback: "Tekrar dene" });

  await as("ayse");
  assert.equal((await API.getCourse(COURSE)).progress.rows.find(r => r.itemId === v3.id).locked, true, "geçmeyen not kilidi açmamalı");
  assert.equal((await API.mySubmissions(o1.id)).at(-1).score, 40, "onaylı not görünmeli");
  await API.submitAssignment(o1.id, { code: "OK OK OK OK OK" });
  await as("ogretmen");
  const again = (await API.listSubmissions({ status: "pending" })).find(s => s.studentName === "Ayşe Yılmaz");
  await API.gradeSubmission(again.id, { score: 100 });
  await as("ayse");
  assert.equal((await API.getCourse(COURSE)).progress.rows.find(r => r.itemId === v3.id).locked, false);
});

await test("sınav notu öğretmen onayına kadar gizli; ders sonu seviyesi hesaplanır", async () => {
  await advance("elif", FULL.length);
  assert.equal((await progressOf("elif")).complete, true);
  let g = await API.myGrades(COURSE);
  assert.equal(g.rows.find(r => r.item.type === "exam").state, "pending");
  assert.equal(g.finalLevel, null);
  await as("ogretmen");
  const s = (await API.listSubmissions({ status: "pending" })).find(x => x.itemType === "exam");
  assert.equal(s.autoScore, 100);
  await API.gradeSubmission(s.id, { score: 88 });
  await as("elif");
  g = await API.myGrades(COURSE);
  assert.deepEqual(g.finalLevel, { score: 88, label: "Çok iyi" });
});

await test("hesabı sıfırla: yalnızca o öğrencinin ilerlemesi silinir, hesap ve diğer öğrenciler korunur", async () => {
  const before = { ayse: await progressOf("ayse"), zeynep: await progressOf("zeynep"), elif: await progressOf("elif") };
  assert.ok(before.ayse.done > 0 && before.zeynep.done > 0 && before.elif.done > 0);
  await as("ogretmen");
  const subsBefore = await API.listSubmissions();
  // Tarayıcıdaki öğrenciye özel anahtarlar
  const ids = Object.fromEntries((await (await as("admin"), API.listUsers())).map(u => [u.username, u.id]));
  for (const u of ["ayse", "zeynep"]) {
    localStorage.setItem(`kodla-kesfet.v1.${ids[u]}`, "{}");
    localStorage.setItem(`kk-lms.draft.${ids[u]}.x`, "kod");
    localStorage.setItem(`kk-lms.done.${ids[u]}.${COURSE}`, "1");
  }

  await as("ayse");
  await API.resetMyProgress();

  const ayse = await progressOf("ayse");
  assert.equal(ayse.done, 0);
  assert.deepEqual(ayse.rows.map(r => r.locked), FULL.map((_, i) => i > 0), "kilitler ilk duruma dönmeli");
  assert.deepEqual((await API.myGrades(COURSE)).rows.map(r => r.state), Array(GRADABLE).fill("none"));
  assert.deepEqual(await progressOf("zeynep"), before.zeynep, "Zeynep'in ilerlemesi değişmemeli");
  assert.deepEqual(await progressOf("elif"), before.elif, "Elif'in ilerlemesi değişmemeli");
  await as("ogretmen");
  const subsAfter = await API.listSubmissions();
  assert.ok(subsAfter.every(s => s.studentName !== "Ayşe Yılmaz"));
  assert.equal(subsAfter.length, subsBefore.filter(s => s.studentName !== "Ayşe Yılmaz").length);
  for (const k of [`kodla-kesfet.v1.${ids.ayse}`, `kk-lms.draft.${ids.ayse}.x`, `kk-lms.done.${ids.ayse}.${COURSE}`]) assert.equal(localStorage.getItem(k), null, k);
  for (const k of [`kodla-kesfet.v1.${ids.zeynep}`, `kk-lms.draft.${ids.zeynep}.x`, `kk-lms.done.${ids.zeynep}.${COURSE}`]) assert.notEqual(localStorage.getItem(k), null, k);
  assert.equal((await as("ayse")).username, "ayse", "şifre ve hesap korunmalı");
});

await test("veri sürümü: eşleşmezse ilerleme bir kez silinir, hesaplar ve dersler korunur", async () => {
  assert.equal(localStorage.getItem(KK_STORAGE.VERSION_KEY), "2");
  assert.equal(KK_STORAGE.migrate(), false, "sürüm eşleşirken bir şey silinmemeli");
  const usersBefore = (await (await as("admin"), API.listUsers())).length;
  await API.createUser({ name: "Kalıcı Öğrenci", username: "kalici", password: "sifre123", role: "student" });
  localStorage.setItem("kodla-kesfet.v1", "{\"xp\":50}");
  localStorage.setItem("kk-lms.theme", "dark");
  assert.ok(JSON.parse(localStorage.getItem("kk-lms.v1")).submissions.length > 0);

  localStorage.setItem(KK_STORAGE.VERSION_KEY, "1"); // tarayıcıda eski sürüm verisi kalmış gibi
  assert.equal(KK_STORAGE.migrate(), true);
  API._reset();
  const db = JSON.parse(localStorage.getItem("kk-lms.v1"));
  assert.equal(db.submissions.length, 0); assert.deepEqual(db.progress, {}); assert.equal(db.files.length, 0);
  assert.equal(db.users.length, usersBefore + 1, "hesaplar silinmemeli");
  assert.ok(db.items.length >= FULL.length, "ders içerikleri silinmemeli");
  assert.equal(localStorage.getItem("kodla-kesfet.v1"), null);
  assert.equal(localStorage.getItem("kk-lms.theme"), "dark", "ilerleme dışı tercihler korunmalı");
  assert.equal(localStorage.getItem(KK_STORAGE.VERSION_KEY), "2");
  await API.logout(); assert.equal((await API.login("kalici", "sifre123")).name, "Kalıcı Öğrenci", "eski şifreyle giriş yapılabilmeli");
  for (const u of STUDENTS) assert.equal((await progressOf(u)).done, 0);

  // Sürüm kaydedildikten sonra yeni ilerleme korunur.
  await advance("zeynep", 1);
  KK_STORAGE.migrate(); API._reset();
  assert.equal((await progressOf("zeynep")).done, 1);
});

await test("yönetici: hesap kapatma girişi engeller, ders iptali öğrenciden gizler", async () => {
  await as("admin");
  const zeynep = (await API.listUsers()).find(u => u.username === "zeynep");
  await API.setUserActive(zeynep.id, false);
  await rejects(as("zeynep"), /kapatılmış/);
  await API.login("admin", "admin123");
  await API.setUserActive(zeynep.id, true);
  await API.updateCourse(COURSE, { status: "cancelled" });
  await as("ayse");
  assert.equal((await API.listCourses()).length, 0);
  await as("ogretmen");
  await rejects(API.saveItem(COURSE, { type: "video", title: "x", youtubeId: "abcdefghijk" }), /iptal/);
  await as("admin");
  await API.updateCourse(COURSE, { status: "active" });
});

await test("yönetici kullanıcı oluşturur ve derse atar; öğretmen içerik ekler/taşır/siler", async () => {
  await as("admin");
  await rejects(API.createUser({ name: "A", username: "ayse", password: "123456", role: "student" }), /zaten/);
  const u = await API.createUser({ name: "Yeni Öğrenci", username: "yeni", password: "sifre123", role: "student" });
  const full = await API.getCourse(COURSE);
  await API.setCourseMembers(COURSE, { studentIds: [...full.students.map(s => s.id), u.id] });
  await rejects(API.setCourseMembers(COURSE, { teacherIds: [u.id] }), /Geçersiz/);
  await API.logout();
  await API.login("yeni", "sifre123");
  assert.equal((await API.listCourses())[0].progress.done, 0);

  await as("ogretmen");
  await rejects(API.saveItem(COURSE, { type: "quiz", title: "Q", passPct: 50, questions: [{ text: "?", options: ["a", "b"] }] }), /doğru cevabı/);
  await API.saveItem(COURSE, { type: "quiz", title: "Ek Quiz", passPct: 50, questions: [{ text: "?", options: ["a", "b"], correct: 0 }] });
  let items = (await API.getCourse(COURSE)).items;
  const added = items.at(-1);
  assert.equal(added.title, "Ek Quiz");
  await API.moveItem(added.id, -1);
  items = (await API.getCourse(COURSE)).items;
  assert.equal(items.at(-2).id, added.id);
  await API.deleteItem(added.id);
  assert.ok(!(await API.getCourse(COURSE)).items.some(i => i.id === added.id));
});

console.log(`\n${n} test geçti`);
