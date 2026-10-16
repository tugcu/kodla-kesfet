// API iş kurallarını (yetki, kilitler, not görünürlüğü) Node üzerinde test eder.
// Kullanım: node tests/api.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const load = f => vm.runInThisContext(readFileSync(new URL("../js/" + f, import.meta.url), "utf8"), { filename: f });
load("seed.js"); load("api.js");
const { API } = globalThis;
// Kod ödevleri için sahte çalıştırıcı: koddaki "OK" sayısı kadar test geçer.
globalThis.Runner = { run: async ({ code, tests }) => ({ results: tests.map((t, i) => ({ ok: i < (code.match(/OK/g) || []).length, hidden: !!t.h })) }) };

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("✔", name); };
const rejects = (p, re) => assert.rejects(p, e => re.test(e.message));
const as = async u => { await API.logout(); return API.login(u, u === "admin" ? "admin123" : u === "ogretmen" ? "ogretmen123" : "ogrenci123"); };

await API.init();

await test("giriş: hatalı şifre reddedilir, roller doğru", async () => {
  await rejects(API.login("admin", "yanlis"), /hatalı/);
  assert.equal((await as("admin")).role, "admin");
  assert.equal((await as("ogretmen")).role, "teacher");
  assert.equal((await as("ayse")).role, "student");
});

await test("öğrenci yönetici/öğretmen işlemlerini yapamaz", async () => {
  await as("ayse");
  await rejects(API.listUsers(), /yetkin yok/);
  await rejects(API.createCourse({ title: "x" }), /yetkin yok/);
  const [c] = await API.listCourses();
  await rejects(API.saveItem(c.id, { type: "video", title: "x", youtubeId: "abcdefghijk" }), /yetkin yok/);
});

await test("öğrenci doğru cevapları ve gizli testleri göremez", async () => {
  await as("zeynep");
  const [c] = await API.listCourses();
  const full = await API.getCourse(c.id);
  for (const it of full.items) {
    (it.questions || []).forEach(q => assert.equal(q.correct, undefined));
    if (it.code) assert.ok(it.code.tests.every(t => !t.h));
  }
});

await test("kilitler: Zeynep quiz 1'i geçmeden 2. videoyu izleyemez", async () => {
  await as("zeynep");
  const [c] = await API.listCourses();
  const { items, progress } = await API.getCourse(c.id);
  const v2 = items.find(i => i.title.startsWith("Bölüm 2"));
  assert.equal(progress.rows.find(r => r.itemId === v2.id).locked, true);
  await rejects(API.markWatched(v2.id), /kilitli/);
  const q1 = items.find(i => i.title.startsWith("Quiz 1"));
  const r1 = await API.submitQuiz(q1.id, [0, 0, 0, 0]);
  assert.equal(r1.passed, false);
  assert.equal(r1.detail[0].correct, undefined, "showAnswers=false iken doğru cevap sızmamalı");
  const r2 = await API.submitQuiz(q1.id, [1, 1, 1, 0]); // %75 = baraj
  assert.equal(r2.passed, true);
  await API.markWatched(v2.id);
  await rejects(API.submitQuiz(q1.id, [1, 1, 1, 1]), /zaten geçtin/);
});

await test("engelleyici ödev: onay ve geçer not gelmeden sonraki bölüm açılmaz", async () => {
  await as("ayse");
  const [c] = await API.listCourses();
  let { items, progress } = await API.getCourse(c.id);
  const v3 = items.find(i => i.title.startsWith("Bölüm 3")), o1 = items.find(i => i.title.startsWith("Ödev 1"));
  let row = progress.rows.find(r => r.itemId === v3.id);
  assert.equal(row.locked, true); assert.match(row.blocker, /Ödev 1/);
  const subs = await API.mySubmissions(o1.id);
  assert.equal(subs.at(-1).autoScore, undefined, "onaysız ödevin notu görünmemeli");

  await as("ogretmen");
  const pend = await API.listSubmissions({ status: "pending" });
  const ayseSub = pend.find(s => s.studentName === "Ayşe Yılmaz");
  await rejects(API.gradeSubmission(ayseSub.id, { score: 120 }), /0 ile 100/);
  await API.gradeSubmission(ayseSub.id, { score: 40, feedback: "Tekrar dene" });

  await as("ayse");
  ({ progress } = await API.getCourse(c.id));
  assert.equal(progress.rows.find(r => r.itemId === v3.id).locked, true, "geçmeyen not kilidi açmamalı");
  assert.equal((await API.mySubmissions(o1.id)).at(-1).score, 40, "onaylı not görünmeli");
  await API.submitAssignment(o1.id, { code: "OK OK OK OK OK" });

  await as("ogretmen");
  const again = (await API.listSubmissions({ status: "pending" })).find(s => s.studentName === "Ayşe Yılmaz");
  assert.equal(again.autoScore, 100);
  await API.gradeSubmission(again.id, { score: 100 });

  await as("ayse");
  ({ progress } = await API.getCourse(c.id));
  assert.equal(progress.rows.find(r => r.itemId === v3.id).locked, false);
});

await test("sınav notu öğretmen onayına kadar gizli; seviye hesaplanır", async () => {
  await as("elif");
  const [c] = await API.listCourses();
  let g = await API.myGrades(c.id);
  assert.equal(g.rows.find(r => r.item.type === "exam").state, "pending");
  assert.equal(g.finalLevel, null);
  await as("ogretmen");
  const s = (await API.listSubmissions({ status: "pending" })).find(x => x.itemType === "exam");
  assert.equal(s.autoScore, 88);
  await API.gradeSubmission(s.id, { score: s.autoScore });
  await as("elif");
  g = await API.myGrades(c.id);
  assert.deepEqual(g.finalLevel, { score: 88, label: "Çok iyi" });
});

await test("yönetici: hesap kapatma girişi engeller, ders iptali öğrenciden gizler", async () => {
  await as("admin");
  const users = await API.listUsers();
  const zeynep = users.find(u => u.username === "zeynep");
  await API.setUserActive(zeynep.id, false);
  await rejects(as("zeynep"), /kapatılmış/);
  await API.login("admin", "admin123");
  await API.setUserActive(zeynep.id, true);
  const [c] = await API.listCourses();
  await API.updateCourse(c.id, { status: "cancelled" });
  await as("ayse");
  assert.equal((await API.listCourses()).length, 0);
  await as("ogretmen");
  await rejects(API.saveItem(c.id, { type: "video", title: "x", youtubeId: "abcdefghijk" }), /iptal/);
  await as("admin");
  await API.updateCourse(c.id, { status: "active" });
});

await test("yönetici kullanıcı oluşturur ve derse atar; öğretmen içerik ekler/taşır/siler", async () => {
  await as("admin");
  await rejects(API.createUser({ name: "A", username: "ayse", password: "123456", role: "student" }), /zaten/);
  const u = await API.createUser({ name: "Yeni Öğrenci", username: "yeni", password: "sifre123", role: "student" });
  const [c] = await API.listCourses();
  const full = await API.getCourse(c.id);
  await API.setCourseMembers(c.id, { studentIds: [...full.students.map(s => s.id), u.id] });
  await rejects(API.setCourseMembers(c.id, { teacherIds: [u.id] }), /Geçersiz/);
  await API.logout();
  await API.login("yeni", "sifre123");
  assert.equal((await API.listCourses()).length, 1);

  await as("ogretmen");
  await rejects(API.saveItem(c.id, { type: "quiz", title: "Q", passPct: 50, questions: [{ text: "?", options: ["a", "b"] }] }), /doğru cevabı/);
  await API.saveItem(c.id, { type: "quiz", title: "Ek Quiz", passPct: 50, questions: [{ text: "?", options: ["a", "b"], correct: 0 }] });
  let items = (await API.getCourse(c.id)).items;
  const added = items.at(-1);
  assert.equal(added.title, "Ek Quiz");
  await API.moveItem(added.id, -1);
  items = (await API.getCourse(c.id)).items;
  assert.equal(items.at(-2).id, added.id);
  await API.deleteItem(added.id);
  assert.ok(!(await API.getCourse(c.id)).items.some(i => i.id === added.id));
});

console.log(`\n${n} test geçti`);
