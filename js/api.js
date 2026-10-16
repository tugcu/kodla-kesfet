// Uygulamanın veri katmanı. Arayüz yalnızca bu dosyadaki asenkron API'yi kullanır;
// yetki kontrolleri, cevap anahtarlarının öğrenciden gizlenmesi ve not görünürlüğü
// burada uygulanır. Demo sürümde veriler tarayıcıda (localStorage + IndexedDB) tutulur;
// gerçek kullanımda aynı fonksiyon imzalarıyla bir sunucuya (ör. Supabase) taşınabilir.
(function (root) {
  const KEY = "kk-lms.v1", SESSION = "kk-lms.session";
  const mem = {};
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { if (e && e.name === "QuotaExceededError") throw new ApiError("Tarayıcı depolama alanı doldu."); mem[k] = v; } },
    del: k => { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
  };

  class ApiError extends Error {}
  const fail = msg => { throw new ApiError(msg); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => Date.now();
  const clone = x => JSON.parse(JSON.stringify(x));

  async function hash(username, password) {
    const text = `kk:${username.toLowerCase()}:${password}`;
    if (root.crypto && root.crypto.subtle) {
      const buf = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return "f" + (h >>> 0).toString(16);
  }

  // ---------- Dosya deposu (IndexedDB; yoksa bellek) ----------
  const Files = (() => {
    const memFiles = new Map();
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!root.indexedDB) return rej(new Error("no idb"));
      const r = indexedDB.open("kk-lms-files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => { const t = d.transaction("files", mode); const q = fn(t.objectStore("files")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
    };
    return {
      async put(id, blob) { try { await tx("readwrite", s => s.put(blob, id)); } catch { memFiles.set(id, blob); } },
      async get(id) { try { return (await tx("readonly", s => s.get(id))) || memFiles.get(id); } catch { return memFiles.get(id); } },
      async clear() { memFiles.clear(); try { await tx("readwrite", s => s.clear()); } catch {} },
      async del(id) { memFiles.delete(id); try { await tx("readwrite", s => s.delete(id)); } catch {} },
    };
  })();

  // ---------- Veritabanı ----------
  let db = null;
  const emptyDb = () => ({ version: 1, users: [], courses: [], items: [], submissions: [], progress: {}, files: [] });
  function load() {
    if (db) return db;
    try { db = JSON.parse(ls.get(KEY)); } catch { db = null; }
    return db;
  }
  const persist = () => ls.set(KEY, JSON.stringify(db));

  async function ensureSeed() {
    if (load()) return;
    db = emptyDb();
    await root.KK_SEED(db, { uid, hash, now });
    persist();
  }

  // ---------- Oturum ----------
  function currentUser() {
    const id = ls.get(SESSION);
    const u = id && db.users.find(x => x.id === id);
    if (!u || !u.active) return null;
    return u;
  }
  function need(...roles) {
    const u = currentUser();
    if (!u) fail("Oturumun sona erdi. Lütfen tekrar giriş yap.");
    if (roles.length && !roles.includes(u.role)) fail("Bu işlem için yetkin yok.");
    return u;
  }
  const publicUser = u => u && ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, createdAt: u.createdAt });

  // ---------- Yardımcılar ----------
  const course = id => db.courses.find(c => c.id === id) || fail("Ders bulunamadı.");
  const item = id => db.items.find(i => i.id === id) || fail("İçerik bulunamadı.");
  const itemsOf = cid => db.items.filter(i => i.courseId === cid).sort((a, b) => a.order - b.order);
  const isTeacherOf = (u, c) => u.role === "teacher" && c.teacherIds.includes(u.id);
  const isStudentOf = (u, c) => u.role === "student" && c.studentIds.includes(u.id);
  function canTeach(u, c) {
    if (!isTeacherOf(u, c)) fail("Bu dersin öğretmeni değilsin.");
    if (c.status !== "active") fail("Bu ders iptal edilmiş; değişiklik yapılamaz.");
  }
  const gradable = it => it.type === "quiz" || it.type === "assignment" || it.type === "exam";
  const needsApproval = it => it.type === "assignment" || it.type === "exam";

  // Öğrenciye gönderilecek içerik: doğru cevaplar ve gizli test beklentileri çıkarılır.
  function sanitizeItem(it) {
    const x = clone(it);
    if (x.questions) x.questions.forEach(q => delete q.correct);
    if (x.code) x.code.tests = x.code.tests.filter(t => !t.h);
    return x;
  }
  // Öğretmen onayı olmadan öğrencinin ödev/sınav notunu görmesini engeller.
  function sanitizeSub(s, it) {
    const x = clone(s);
    if (needsApproval(it) && x.status !== "approved") {
      delete x.score; delete x.autoScore; delete x.feedback; delete x.detail;
    }
    if (it.type === "quiz" && !it.showAnswers && x.detail) x.detail = x.detail.map(d => ({ ok: d.ok }));
    return x;
  }

  function scoreChoices(questions, answers) {
    const detail = questions.map((q, i) => ({ ok: answers[i] === q.correct, correct: q.correct, given: answers[i] ?? null }));
    const n = detail.filter(d => d.ok).length;
    return { detail, score: questions.length ? Math.round((n / questions.length) * 100) : 0 };
  }

  // Öğrencinin bir dersteki ilerlemesini ve her içeriğin kilit durumunu hesaplar.
  // Bir içerik, kendisinden önceki tüm "geçit" koşulları sağlanmışsa açılır:
  // video izlenmeli, quiz geçilmeli, engelleyici ödev onaylanmış geçer not almalı.
  function progressFor(c, studentId) {
    const items = itemsOf(c.id);
    const prog = db.progress[`${studentId}:${c.id}`] || { watched: {} };
    const subs = db.submissions.filter(s => s.courseId === c.id && s.studentId === studentId).sort((a, b) => a.submittedAt - b.submittedAt);
    let open = true, blocker = null;
    const rows = items.map(it => {
      const mine = subs.filter(s => s.itemId === it.id);
      const last = mine[mine.length - 1] || null;
      let done = false, gate = true, state;
      if (it.type === "video") {
        done = gate = !!prog.watched[it.id];
        state = done ? "İzlendi" : "İzlenmedi";
      } else if (it.type === "quiz") {
        const best = mine.reduce((m, s) => Math.max(m, s.score), -1);
        done = gate = mine.some(s => s.passed);
        state = done ? `Geçti · %${best}` : mine.length ? `Geçemedi · en iyi %${best}` : "Çözülmedi";
      } else {
        done = !!last;
        const okSub = mine.find(s => s.status === "approved" && s.score >= it.passPct);
        if (it.type === "assignment" && it.blocking) gate = !!okSub;
        state = !last ? "Teslim edilmedi" : last.status === "approved" ? `Notlandı · ${last.score}` : "Değerlendirme bekliyor";
      }
      const row = { itemId: it.id, type: it.type, locked: !open, done, gate, state, attempts: mine.length, blocker: open ? null : blocker };
      if (open && !gate) { open = false; blocker = it.title; }
      return row;
    });
    const total = rows.length, doneN = rows.filter(r => r.done).length;
    return { rows, total, done: doneN, pct: total ? Math.round((doneN / total) * 100) : 0, complete: total > 0 && doneN === total };
  }

  const level = score => score >= 85 ? "Çok iyi" : score >= 70 ? "İyi" : score >= 50 ? "Orta" : "Geliştirilmeli";

  // ---------- Genel API ----------
  const API = {
    ApiError,
    async init() { await ensureSeed(); return publicUser(currentUser()); },
    me: async () => publicUser(currentUser()),

    async login(username, password) {
      await ensureSeed();
      const u = db.users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase());
      if (!u || u.passwordHash !== await hash(u.username, password)) fail("Kullanıcı adı veya şifre hatalı.");
      if (!u.active) fail("Bu hesap kapatılmış. Yöneticine başvur.");
      ls.set(SESSION, u.id);
      return publicUser(u);
    },
    async logout() { ls.del(SESSION); },
    async changePassword(oldPw, newPw) {
      const u = need();
      if (u.passwordHash !== await hash(u.username, oldPw)) fail("Mevcut şifre hatalı.");
      if (String(newPw).length < 6) fail("Yeni şifre en az 6 karakter olmalı.");
      u.passwordHash = await hash(u.username, newPw); persist();
    },

    // Oturumdaki öğrencinin yalnızca kendi ilerlemesini siler: izlenen videolar, quiz/ödev/sınav
    // teslimleri, yüklediği dosyalar, kod taslakları ve Kod Arenası verisi. Hesap bilgileri
    // ve diğer öğrencilerin verisi değişmez. Kilit durumları teslimlerden hesaplandığı için
    // kendiliğinden ilk duruma döner.
    async resetMyProgress() {
      const u = need("student");
      const mine = db.submissions.filter(s => s.studentId === u.id);
      const fileIds = new Set(mine.filter(s => s.file).map(s => s.file.id));
      db.files.filter(f => f.ownerId === u.id).forEach(f => fileIds.add(f.id));
      db.submissions = db.submissions.filter(s => s.studentId !== u.id);
      db.files = db.files.filter(f => !fileIds.has(f.id));
      Object.keys(db.progress).filter(k => k.startsWith(u.id + ":")).forEach(k => delete db.progress[k]);
      persist();
      for (const id of fileIds) await Files.del(id);
      if (root.KK_STORAGE) try { root.KK_STORAGE.clearProgressKeys(u.id); } catch {}
    },

    // ----- Yönetici -----
    async listUsers() {
      need("admin");
      return db.users.map(publicUser);
    },
    async createUser({ name, username, password, role }) {
      need("admin");
      name = String(name || "").trim(); username = String(username || "").trim();
      if (!name || !username) fail("Ad ve kullanıcı adı zorunlu.");
      if (!/^[a-z0-9._-]{3,}$/i.test(username)) fail("Kullanıcı adı en az 3 karakter olmalı; yalnızca harf, rakam, nokta, tire içerebilir.");
      if (!["admin", "teacher", "student"].includes(role)) fail("Geçersiz rol.");
      if (String(password || "").length < 6) fail("Şifre en az 6 karakter olmalı.");
      if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) fail("Bu kullanıcı adı zaten kullanılıyor.");
      const u = { id: uid(), name, username, role, active: true, createdAt: now(), passwordHash: await hash(username, password) };
      db.users.push(u); persist();
      return publicUser(u);
    },
    async setUserActive(id, active) {
      const me = need("admin");
      if (id === me.id && !active) fail("Kendi hesabını kapatamazsın.");
      const u = db.users.find(x => x.id === id) || fail("Kullanıcı bulunamadı.");
      u.active = !!active; persist();
    },
    async updateUser(id, { name }) {
      need("admin");
      const u = db.users.find(x => x.id === id) || fail("Kullanıcı bulunamadı.");
      if (name !== undefined) { name = String(name).trim(); if (!name) fail("Ad boş olamaz."); u.name = name; }
      persist();
    },
    async resetPassword(id, password) {
      need("admin");
      const u = db.users.find(x => x.id === id) || fail("Kullanıcı bulunamadı.");
      if (String(password || "").length < 6) fail("Şifre en az 6 karakter olmalı.");
      u.passwordHash = await hash(u.username, password); persist();
    },
    async createCourse({ title, description }) {
      need("admin");
      title = String(title || "").trim(); if (!title) fail("Ders adı zorunlu.");
      const c = { id: uid(), title, description: String(description || "").trim(), status: "active", teacherIds: [], studentIds: [], createdAt: now() };
      db.courses.push(c); persist(); return clone(c);
    },
    async updateCourse(id, patch) {
      need("admin");
      const c = course(id);
      if (patch.title !== undefined) { const t = String(patch.title).trim(); if (!t) fail("Ders adı boş olamaz."); c.title = t; }
      if (patch.description !== undefined) c.description = String(patch.description).trim();
      if (patch.status !== undefined) { if (!["active", "cancelled"].includes(patch.status)) fail("Geçersiz durum."); c.status = patch.status; }
      persist(); return clone(c);
    },
    async setCourseMembers(id, { teacherIds, studentIds }) {
      need("admin");
      const c = course(id);
      const check = (ids, role) => ids.forEach(x => { const u = db.users.find(y => y.id === x); if (!u || u.role !== role) fail("Geçersiz kullanıcı seçimi."); });
      if (teacherIds) { check(teacherIds, "teacher"); c.teacherIds = [...new Set(teacherIds)]; }
      if (studentIds) { check(studentIds, "student"); c.studentIds = [...new Set(studentIds)]; }
      persist();
    },
    async resetDemo() {
      need("admin");
      db = emptyDb(); await Files.clear(); await root.KK_SEED(db, { uid, hash, now }); persist();
      if (root.KK_STORAGE) try { root.KK_STORAGE.clearProgressKeys(null); } catch {}
      ls.del(SESSION);
    },

    // ----- Ortak: dersler -----
    async listCourses() {
      const u = need();
      let list = db.courses;
      if (u.role === "teacher") list = list.filter(c => c.teacherIds.includes(u.id));
      if (u.role === "student") list = list.filter(c => c.studentIds.includes(u.id) && c.status === "active");
      return list.map(c => {
        const x = clone(c);
        x.itemCount = itemsOf(c.id).length;
        x.teachers = c.teacherIds.map(id => db.users.find(y => y.id === id)).filter(Boolean).map(t => t.name);
        if (u.role === "student") x.progress = progressFor(c, u.id);
        if (u.role === "teacher") x.pending = db.submissions.filter(s => s.courseId === c.id && s.status === "pending").length;
        return x;
      });
    },
    async getCourse(id) {
      const u = need();
      const c = course(id);
      const out = clone(c);
      out.teachers = c.teacherIds.map(x => publicUser(db.users.find(y => y.id === x))).filter(Boolean);
      if (u.role === "student") {
        if (!isStudentOf(u, c) || c.status !== "active") fail("Bu derse erişimin yok.");
        out.items = itemsOf(id).map(sanitizeItem);
        out.progress = progressFor(c, u.id);
        delete out.studentIds;
      } else {
        if (u.role === "teacher" && !isTeacherOf(u, c)) fail("Bu dersin öğretmeni değilsin.");
        out.items = itemsOf(id).map(clone);
        out.students = c.studentIds.map(x => publicUser(db.users.find(y => y.id === x))).filter(Boolean);
      }
      return out;
    },

    // ----- Öğretmen: içerik -----
    async saveItem(courseId, data) {
      const u = need("teacher");
      const c = course(courseId); canTeach(u, c);
      const it = data.id ? item(data.id) : null;
      if (it && it.courseId !== courseId) fail("İçerik bu derse ait değil.");
      const x = validateItem(data);
      if (it) Object.assign(it, x, { id: it.id, courseId, order: it.order, updatedAt: now() });
      else db.items.push({ ...x, id: uid(), courseId, order: itemsOf(courseId).reduce((m, i) => Math.max(m, i.order), 0) + 1, createdAt: now() });
      persist();
    },
    async deleteItem(id) {
      const u = need("teacher");
      const it = item(id); canTeach(u, course(it.courseId));
      db.items = db.items.filter(i => i.id !== id);
      db.submissions = db.submissions.filter(s => s.itemId !== id);
      persist();
    },
    async moveItem(id, dir) {
      const u = need("teacher");
      const it = item(id); canTeach(u, course(it.courseId));
      const list = itemsOf(it.courseId), i = list.indexOf(it), j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      [list[i].order, list[j].order] = [list[j].order, list[i].order];
      persist();
    },

    // ----- Öğretmen: değerlendirme -----
    async listSubmissions({ courseId, status } = {}) {
      const u = need("teacher");
      const mine = db.courses.filter(c => c.teacherIds.includes(u.id) && (!courseId || c.id === courseId)).map(c => c.id);
      return db.submissions
        .filter(s => mine.includes(s.courseId) && (!status || s.status === status))
        .filter(s => needsApproval(db.items.find(i => i.id === s.itemId) || {}))
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .map(s => ({ ...clone(s), studentName: (db.users.find(x => x.id === s.studentId) || {}).name, itemTitle: (db.items.find(i => i.id === s.itemId) || {}).title, itemType: (db.items.find(i => i.id === s.itemId) || {}).type, courseTitle: course(s.courseId).title }));
    },
    async getSubmission(id) {
      const u = need("teacher");
      const s = db.submissions.find(x => x.id === id) || fail("Teslim bulunamadı.");
      const c = course(s.courseId);
      if (!isTeacherOf(u, c)) fail("Bu dersin öğretmeni değilsin.");
      const it = item(s.itemId);
      const history = db.submissions.filter(x => x.itemId === s.itemId && x.studentId === s.studentId).sort((a, b) => a.submittedAt - b.submittedAt).map(x => ({ id: x.id, submittedAt: x.submittedAt, status: x.status, score: x.score }));
      return { sub: clone(s), item: clone(it), course: { id: c.id, title: c.title, status: c.status }, student: publicUser(db.users.find(x => x.id === s.studentId)), history };
    },
    async gradeSubmission(id, { score, feedback }) {
      const u = need("teacher");
      const s = db.submissions.find(x => x.id === id) || fail("Teslim bulunamadı.");
      canTeach(u, course(s.courseId));
      score = Number(score);
      if (!Number.isFinite(score) || score < 0 || score > 100) fail("Not 0 ile 100 arasında olmalı.");
      Object.assign(s, { score: Math.round(score * 10) / 10, feedback: String(feedback || "").trim(), status: "approved", approvedAt: now(), gradedBy: u.id });
      persist();
    },
    async gradebook(courseId) {
      const u = need("teacher", "admin");
      const c = course(courseId);
      if (u.role === "teacher" && !isTeacherOf(u, c)) fail("Bu dersin öğretmeni değilsin.");
      const items = itemsOf(courseId);
      const cols = items.filter(gradable).map(i => ({ id: i.id, title: i.title, type: i.type, passPct: i.passPct }));
      const rows = c.studentIds.map(sid => {
        const st = db.users.find(x => x.id === sid);
        const p = progressFor(c, sid);
        const cells = cols.map(col => {
          const mine = db.submissions.filter(s => s.itemId === col.id && s.studentId === sid).sort((a, b) => a.submittedAt - b.submittedAt);
          if (!mine.length) return { state: "none" };
          if (col.type === "quiz") { const best = Math.max(...mine.map(s => s.score)); return { state: "graded", score: best, pass: best >= col.passPct, attempts: mine.length }; }
          const last = mine[mine.length - 1];
          return last.status === "approved" ? { state: "graded", score: last.score, pass: last.score >= col.passPct, subId: last.id } : { state: "pending", auto: last.autoScore, subId: last.id };
        });
        return { student: publicUser(st), progress: { pct: p.pct, done: p.done, total: p.total }, cells };
      });
      return { course: { id: c.id, title: c.title }, cols, rows };
    },

    // ----- Öğrenci -----
    async markWatched(itemId) {
      const u = need("student");
      const it = item(itemId), c = course(it.courseId);
      if (!isStudentOf(u, c)) fail("Bu derse erişimin yok.");
      assertOpen(c, u, it);
      const k = `${u.id}:${c.id}`;
      (db.progress[k] = db.progress[k] || { watched: {} }).watched[it.id] = now();
      persist();
    },
    async mySubmissions(itemId) {
      const u = need("student");
      const it = item(itemId);
      if (!isStudentOf(u, course(it.courseId))) fail("Bu derse erişimin yok.");
      return db.submissions.filter(s => s.itemId === itemId && s.studentId === u.id).sort((a, b) => a.submittedAt - b.submittedAt).map(s => sanitizeSub(s, it));
    },
    async submitQuiz(itemId, answers) {
      const { u, it, c, mine } = studentCtx(itemId, "quiz");
      if (mine.some(s => s.passed)) fail("Bu quizi zaten geçtin.");
      if (it.maxAttempts && mine.length >= it.maxAttempts) fail("Deneme hakkın bitti. Öğretmenine başvur.");
      checkAnswers(it, answers);
      const { detail, score } = scoreChoices(it.questions, answers);
      const s = { id: uid(), courseId: c.id, itemId: it.id, studentId: u.id, answers, detail, score, autoScore: score, passed: score >= it.passPct, status: "graded", submittedAt: now() };
      db.submissions.push(s); persist();
      return { ...sanitizeSub(s, it), progress: progressFor(c, u.id) };
    },
    async submitExam(itemId, answers) {
      const { u, it, c, mine } = studentCtx(itemId, "exam");
      if (mine.length >= (it.maxAttempts || 1)) fail("Bu sınavı zaten tamamladın.");
      checkAnswers(it, answers);
      const { detail, score } = scoreChoices(it.questions, answers);
      db.submissions.push({ id: uid(), courseId: c.id, itemId: it.id, studentId: u.id, answers, detail, autoScore: score, status: "pending", submittedAt: now() });
      persist();
      return { progress: progressFor(c, u.id) };
    },
    // payload: test → {answers:[index]}, open → {answers:[metin]}, file → {note, file: File}, code → {code}
    async submitAssignment(itemId, payload) {
      const { u, it, c, mine } = studentCtx(itemId, "assignment");
      const last = mine[mine.length - 1];
      if (last && last.status === "approved" && last.score >= it.passPct) fail("Bu ödevden zaten geçer not aldın.");
      if (last && last.status === "approved" && !it.blocking) fail("Bu ödev notlandırıldı; yeniden teslim edilemez.");
      const s = { id: uid(), courseId: c.id, itemId: it.id, studentId: u.id, status: "pending", submittedAt: now() };
      if (it.kind === "test") {
        checkAnswers(it, payload.answers);
        const r = scoreChoices(it.questions, payload.answers);
        Object.assign(s, { answers: payload.answers, detail: r.detail, autoScore: r.score });
      } else if (it.kind === "open") {
        const a = (payload.answers || []).map(x => String(x || "").trim());
        if (a.length !== it.questions.length || a.some(x => !x)) fail("Tüm soruları cevapla.");
        s.answers = a;
      } else if (it.kind === "file") {
        const f = payload.file;
        if (!f) fail("Bir dosya seç.");
        const maxMb = it.maxFileMb || 5;
        if (f.size > maxMb * 1024 * 1024) fail(`Dosya en fazla ${maxMb} MB olabilir.`);
        const fid = uid();
        await Files.put(fid, f);
        db.files.push({ id: fid, name: f.name, size: f.size, type: f.type, ownerId: u.id, courseId: c.id });
        Object.assign(s, { note: String(payload.note || "").trim(), file: { id: fid, name: f.name, size: f.size, type: f.type } });
      } else if (it.kind === "code") {
        const code = String(payload.code || "");
        if (!code.trim()) fail("Kod boş olamaz.");
        if (!root.Runner) fail("Kod çalıştırıcı yüklenemedi.");
        const res = await root.Runner.run({ lang: it.code.lang, code, fn: it.code.fn, tests: it.code.tests, timeoutMs: it.code.lang === "py" ? 6000 : 4000 });
        const results = res.results ? res.results.map(r => ({ ok: r.ok, hidden: r.hidden, error: r.error || null })) : [];
        const pass = results.filter(r => r.ok).length;
        Object.assign(s, { code, error: res.error || null, detail: results, autoScore: results.length ? Math.round((pass / results.length) * 100) : 0 });
      } else fail("Bilinmeyen ödev türü.");
      // Bekleyen önceki teslim varsa yerine geçer.
      if (last && last.status === "pending") db.submissions = db.submissions.filter(x => x.id !== last.id);
      db.submissions.push(s); persist();
      return { progress: progressFor(c, u.id) };
    },
    async myGrades(courseId) {
      const u = need("student");
      const c = course(courseId);
      if (!isStudentOf(u, c)) fail("Bu derse erişimin yok.");
      const items = itemsOf(courseId).filter(gradable);
      const rows = items.map(it => {
        const mine = db.submissions.filter(s => s.itemId === it.id && s.studentId === u.id).sort((a, b) => a.submittedAt - b.submittedAt);
        const last = mine[mine.length - 1];
        if (!last) return { item: sanitizeItem(it), state: "none" };
        if (it.type === "quiz") { const best = Math.max(...mine.map(s => s.score)); return { item: sanitizeItem(it), state: "graded", score: best, pass: best >= it.passPct, attempts: mine.length }; }
        if (last.status !== "approved") return { item: sanitizeItem(it), state: "pending" };
        return { item: sanitizeItem(it), state: "graded", score: last.score, pass: last.score >= it.passPct, feedback: last.feedback };
      });
      const exam = rows.filter(r => r.item.type === "exam" && r.state === "graded").pop();
      return { rows, finalLevel: exam ? { score: exam.score, label: level(exam.score) } : null };
    },

    // ----- Dosyalar -----
    async getFile(fileId) {
      const u = need();
      const meta = db.files.find(f => f.id === fileId) || fail("Dosya bulunamadı.");
      const c = course(meta.courseId);
      if (!(meta.ownerId === u.id || isTeacherOf(u, c) || u.role === "admin")) fail("Bu dosyaya erişimin yok.");
      const blob = await Files.get(fileId);
      if (!blob) fail("Dosya içeriği bu tarayıcıda bulunamadı.");
      return { ...meta, blob };
    },

    // Test ve yardımcı amaçlı (arayüz kullanmaz)
    _progressFor: (cid, sid) => progressFor(course(cid), sid),
    _reset: () => { db = null; },
  };

  function studentCtx(itemId, type) {
    const u = need("student");
    const it = item(itemId), c = course(it.courseId);
    if (it.type !== type) fail("Geçersiz içerik türü.");
    if (!isStudentOf(u, c) || c.status !== "active") fail("Bu derse erişimin yok.");
    assertOpen(c, u, it);
    const mine = db.submissions.filter(s => s.itemId === it.id && s.studentId === u.id).sort((a, b) => a.submittedAt - b.submittedAt);
    return { u, it, c, mine };
  }
  function assertOpen(c, u, it) {
    const row = progressFor(c, u.id).rows.find(r => r.itemId === it.id);
    if (!row || row.locked) fail("Bu içerik henüz kilitli. Önceki adımları tamamla.");
  }
  function checkAnswers(it, answers) {
    if (!Array.isArray(answers) || answers.length !== it.questions.length || answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= it.questions[i].options.length))
      fail("Tüm soruları cevapla.");
  }

  function validateItem(d) {
    const title = String(d.title || "").trim();
    if (!title) fail("Başlık zorunlu.");
    const base = { type: d.type, title, description: String(d.description || "").trim() };
    const pct = v => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) fail("Baraj/geçme notu 0–100 arasında olmalı."); return Math.round(n); };
    const choiceQs = qs => {
      if (!Array.isArray(qs) || !qs.length) fail("En az bir soru ekle.");
      return qs.map((q, i) => {
        const text = String(q.text || "").trim(), options = (q.options || []).map(o => String(o).trim());
        if (!text) fail(`${i + 1}. sorunun metni boş.`);
        if (options.length < 2 || options.some(o => !o)) fail(`${i + 1}. soruda en az iki dolu seçenek olmalı.`);
        if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= options.length) fail(`${i + 1}. soru için doğru cevabı işaretle.`);
        return { text, options, correct: q.correct };
      });
    };
    switch (d.type) {
      case "video": {
        const yt = root.KK_parseYouTube ? root.KK_parseYouTube(d.youtubeId || "") : d.youtubeId;
        if (!yt) fail("Geçerli bir YouTube bağlantısı veya video kimliği gir.");
        return { ...base, youtubeId: yt, minutes: d.minutes ? Number(d.minutes) : null };
      }
      case "quiz":
        return { ...base, passPct: pct(d.passPct), maxAttempts: Math.max(0, parseInt(d.maxAttempts) || 0), showAnswers: !!d.showAnswers, questions: choiceQs(d.questions) };
      case "exam":
        return { ...base, passPct: pct(d.passPct), maxAttempts: Math.max(1, parseInt(d.maxAttempts) || 1), questions: choiceQs(d.questions) };
      case "assignment": {
        const a = { ...base, kind: d.kind, blocking: !!d.blocking, passPct: pct(d.passPct) };
        if (d.kind === "test") a.questions = choiceQs(d.questions);
        else if (d.kind === "open") {
          a.questions = (d.questions || []).map(q => ({ text: String(q.text || "").trim() })).filter(q => q.text);
          if (!a.questions.length) fail("En az bir açık uçlu soru ekle.");
        } else if (d.kind === "file") a.maxFileMb = Math.min(20, Math.max(1, Number(d.maxFileMb) || 5));
        else if (d.kind === "code") {
          const cd = d.code || {};
          if (!["py", "js"].includes(cd.lang)) fail("Kod dili seç.");
          if (!/^[A-Za-z_]\w*$/.test(cd.fn || "")) fail("Geçerli bir fonksiyon adı gir.");
          if (!Array.isArray(cd.tests) || !cd.tests.length) fail("En az bir test ekle.");
          if (!cd.tests.some(t => !t.h)) fail("En az bir örnek (görünür) test olmalı.");
          a.code = { lang: cd.lang, fn: cd.fn, starter: String(cd.starter || ""), tests: cd.tests.map(t => ({ in: t.in, out: t.out, ...(t.h ? { h: true } : {}) })) };
        } else fail("Ödev türü seç.");
        return a;
      }
      default: fail("Bilinmeyen içerik türü.");
    }
  }

  root.API = API;
})(typeof window !== "undefined" ? window : globalThis);
