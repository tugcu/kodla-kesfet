(() => {
  const P = window.PROBLEMS;
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const XP = { kolay: 10, orta: 20, zor: 40 };
  const DIFF_LABEL = { kolay: "Kolay", orta: "Orta", zor: "Zor" };
  const LANGS = { js: "JavaScript", py: "Python" };

  // ---------- Kalıcı durum (localStorage; erişilemezse yalnızca bellekte tutulur) ----------
  // İlerleme, platforma giriş yapmış kullanıcıya göre ayrı tutulur; aynı tarayıcıyı
  // kullanan öğrenciler birbirinin XP'sini ve kodunu görmez. Giriş yoksa misafir verisi kullanılır.
  const who = (() => {
    try {
      const id = localStorage.getItem("kk-lms.session");
      const u = id && (JSON.parse(localStorage.getItem("kk-lms.v1")) || { users: [] }).users.find(x => x.id === id && x.active);
      return u ? { id: u.id, name: u.name } : null;
    } catch { return null; }
  })();
  const KEY = who ? `kodla-kesfet.v1.${who.id}` : "kodla-kesfet.v1";
  const blank = () => ({ xp: 0, solved: {}, hints: {}, attempts: {}, code: {}, lang: "js", streak: { count: 0, last: null }, theme: null });
  let S = blank();
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const liveStreak = () => S.streak.last && dayDiff(S.streak.last, today()) <= 1 ? S.streak.count : 0;
  function bumpStreak() {
    const t = today();
    if (S.streak.last === t) return;
    S.streak.count = S.streak.last && dayDiff(S.streak.last, t) === 1 ? S.streak.count + 1 : 1;
    S.streak.last = t;
  }

  function level(xp) {
    let lv = 1, need = 50;
    while (xp >= need) { xp -= need; lv++; need += 25; }
    return { lv, into: xp, need };
  }
  const TITLES = ["Çaylak", "Acemi", "Kodcu", "Problem Avcısı", "Algoritmacı", "Usta", "Sihirbaz"];
  const title = lv => TITLES[Math.min(lv - 1, TITLES.length - 1)];

  const pyName = n => n.replace(/[A-Z]/g, c => "_" + c.toLowerCase());
  const fnName = (p, lang) => lang === "py" ? pyName(p.fn) : p.fn;
  const starter = (p, lang) => lang === "py"
    ? `def ${pyName(p.fn)}(${p.params.join(", ")}):\n    # Kodunu buraya yaz\n    pass\n`
    : `function ${p.fn}(${p.params.join(", ")}) {\n  // Kodunu buraya yaz\n\n}\n`;
  const reward = p => Math.max(Math.round(XP[p.diff] * (1 - 0.25 * (S.hints[p.id] || 0))), Math.round(XP[p.diff] / 4));

  const BADGES = [
    { id: "ilk", icon: "🌱", name: "İlk Adım", desc: "İlk problemini çöz", test: s => s.n >= 1 },
    { id: "bes", icon: "🔥", name: "Isınma Turu", desc: "5 problem çöz", test: s => s.n >= 5 },
    { id: "on", icon: "⚡", name: "Çift Hane", desc: "10 problem çöz", test: s => s.n >= 10 },
    { id: "kolay", icon: "🧩", name: "Temeller Tamam", desc: "Tüm kolay problemleri çöz", test: s => P.filter(p => p.diff === "kolay").every(p => S.solved[p.id]) },
    { id: "zor", icon: "🏔️", name: "Zirve", desc: "Bir zor problem çöz", test: s => P.some(p => p.diff === "zor" && S.solved[p.id]) },
    { id: "ipucusuz", icon: "🧠", name: "Kendi Başına", desc: "İpucu almadan 5 problem çöz", test: s => Object.keys(S.solved).filter(id => !S.hints[id]).length >= 5 },
    { id: "py", icon: "🐍", name: "Pythonista", desc: "Python ile 3 problem çöz", test: s => Object.values(S.solved).filter(v => v.lang === "py").length >= 3 },
    { id: "iki-dil", icon: "🌐", name: "İki Dilli", desc: "Her iki dilde de en az bir problem çöz", test: s => ["js", "py"].every(l => Object.values(S.solved).some(v => v.lang === l)) },
    { id: "seri", icon: "📅", name: "İstikrar", desc: "3 günlük seri yakala", test: s => S.streak.count >= 3 },
    { id: "hepsi", icon: "🏆", name: "Arena Şampiyonu", desc: "Tüm problemleri çöz", test: s => s.n === P.length },
  ];
  const earned = () => { const s = { n: Object.keys(S.solved).length }; return BADGES.filter(b => b.test(s)); };

  // ---------- Tema ----------
  function applyTheme() {
    if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme;
    const dark = S.theme ? S.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    $("#themeBtn").textContent = dark ? "☀️" : "🌙";
    $("#themeBtn").title = dark ? "Açık tema" : "Koyu tema";
  }
  $("#themeBtn").onclick = () => {
    const dark = S.theme ? S.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    S.theme = dark ? "light" : "dark"; save(); applyTheme();
  };

  // ---------- Üst çubuk ----------
  function renderTop() {
    const L = level(S.xp);
    $("#topStats").innerHTML = `
      <span class="chip who" title="${who ? "İlerlemen bu hesaba kaydediliyor" : "Giriş yapmadın; ilerleme bu tarayıcıda misafir olarak saklanır"}">${who ? `👤 ${esc(who.name.split(" ")[0])}` : "👤 Misafir"}</span>
      <span class="chip" title="Günlük seri">🔥 ${liveStreak()}</span>
      <span class="chip" title="Toplam XP">⭐ ${S.xp} XP</span>
      <span class="chip lvl" title="${L.into}/${L.need} XP sonraki seviyeye">Sv. ${L.lv}<i style="--p:${(L.into / L.need) * 100}%"></i></span>`;
  }

  // ---------- Ana sayfa ----------
  const F = { diff: "hepsi", topic: "hepsi", status: "hepsi", q: "" };
  function renderHome() {
    document.title = "Kodla & Keşfet · Kod Arenası";
    const n = Object.keys(S.solved).length, L = level(S.xp), got = earned(), gotIds = new Set(got.map(b => b.id));
    const topics = [...new Set(P.map(p => p.topic))];
    const next = P.find(p => !S.solved[p.id]);
    $("#app").innerHTML = `
    <section class="hero">
      <div>
        <h1>Kodla, test et, seviye atla.</h1>
        <p>Tarayıcında <b>JavaScript</b> veya <b>Python</b> ile problem çöz. Kodun gizli testlerle anında değerlendirilir. Kurulum yok, hesap yok.</p>
        ${next ? `<a class="btn" href="#/p/${next.id}">${n ? "Kaldığın yerden devam et" : "İlk problemle başla"} →</a>` : `<span class="btn done">🏆 Tüm problemleri çözdün!</span>`}
      </div>
      <div class="stats">
        <div class="stat"><b>${n}<small>/${P.length}</small></b><span>Çözülen</span></div>
        <div class="stat"><b>${S.xp}</b><span>XP</span></div>
        <div class="stat"><b>${L.lv}</b><span>${title(L.lv)}</span></div>
        <div class="stat"><b>${liveStreak()}</b><span>Günlük seri</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="filters">
        <input id="q" type="search" placeholder="Problem ara…" value="${esc(F.q)}" aria-label="Problem ara">
        <select id="fDiff" aria-label="Zorluk"><option value="hepsi">Tüm zorluklar</option>${Object.keys(XP).map(d => `<option value="${d}" ${F.diff === d ? "selected" : ""}>${DIFF_LABEL[d]}</option>`).join("")}</select>
        <select id="fTopic" aria-label="Konu"><option value="hepsi">Tüm konular</option>${topics.map(t => `<option ${F.topic === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <select id="fStatus" aria-label="Durum"><option value="hepsi">Tümü</option><option value="cozulmedi" ${F.status === "cozulmedi" ? "selected" : ""}>Çözülmedi</option><option value="cozuldu" ${F.status === "cozuldu" ? "selected" : ""}>Çözüldü</option></select>
      </div>
      <div id="list" class="list"></div>
    </section>

    <section class="panel">
      <h2>Rozetler <small>${got.length}/${BADGES.length}</small></h2>
      <div class="badges">${BADGES.map(b => `<div class="badge ${gotIds.has(b.id) ? "on" : ""}" title="${esc(b.desc)}"><span>${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join("")}</div>
    </section>

    <section class="panel data">
      <div><h2>İlerlemen</h2><p class="mut">İlerlemen yalnızca bu tarayıcıda saklanır. Başka bir cihaza taşımak için dışa aktar.</p></div>
      <div class="row">
        <button class="ghost" id="exp">⬇ Dışa aktar</button>
        <label class="ghost btnlike">⬆ İçe aktar<input type="file" id="imp" accept="application/json" hidden></label>
        <button class="ghost danger" id="reset">Sıfırla</button>
      </div>
    </section>`;
    const upd = () => { F.q = $("#q").value; F.diff = $("#fDiff").value; F.topic = $("#fTopic").value; F.status = $("#fStatus").value; renderList(); };
    $("#q").oninput = upd; ["#fDiff", "#fTopic", "#fStatus"].forEach(s => $(s).onchange = upd);
    $("#exp").onclick = exportData;
    $("#imp").onchange = importData;
    $("#reset").onclick = () => { if (confirm("Tüm ilerlemen, XP'n ve kaydedilmiş kodların silinecek. Emin misin?")) { const t = S.theme; S = blank(); S.theme = t; save(); route(); } };
    renderList();
  }

  function renderList() {
    const q = F.q.trim().toLocaleLowerCase("tr");
    const rows = P.filter(p =>
      (F.diff === "hepsi" || p.diff === F.diff) &&
      (F.topic === "hepsi" || p.topic === F.topic) &&
      (F.status === "hepsi" || (F.status === "cozuldu") === !!S.solved[p.id]) &&
      (!q || (p.title + " " + p.topic).toLocaleLowerCase("tr").includes(q)));
    $("#list").innerHTML = rows.length ? rows.map(p => {
      const i = P.indexOf(p) + 1, s = S.solved[p.id];
      return `<a class="item ${s ? "solved" : ""}" href="#/p/${p.id}">
        <span class="num">${s ? "✓" : i}</span>
        <span class="t"><b>${esc(p.title)}</b><small>${esc(p.topic)}</small></span>
        <span class="diff ${p.diff}">${DIFF_LABEL[p.diff]}</span>
        <span class="xp">${s ? `+${s.xp}` : `${XP[p.diff]}`} XP</span>
      </a>`;
    }).join("") : `<p class="empty">Bu filtrelere uyan problem yok.</p>`;
  }

  function exportData() {
    const { code, ...rest } = S;
    const blob = new Blob([JSON.stringify({ app: "kodla-kesfet", v: 1, ...rest, code }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `kodla-kesfet-ilerleme-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importData(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      const d = JSON.parse(t);
      if (d.app !== "kodla-kesfet" || typeof d.solved !== "object") throw new Error();
      const theme = S.theme;
      S = Object.assign(blank(), d); S.theme = theme; delete S.app; delete S.v;
      save(); toast("İlerleme içe aktarıldı ✔"); route();
    }).catch(() => toast("Bu dosya geçerli bir ilerleme dosyası değil.", true));
  }

  // ---------- Kod editörü (CodeMirror varsa onu, yoksa düz textarea kullanır) ----------
  function makeEditor(host, value, lang, onChange, keys) {
    if (window.CodeMirror) {
      const cm = CodeMirror(host, {
        value, mode: lang === "py" ? "python" : "javascript", lineNumbers: true,
        indentUnit: lang === "py" ? 4 : 2, tabSize: 4, matchBrackets: true, autoCloseBrackets: true,
        extraKeys: {
          Tab: c => c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection(" ".repeat(c.getOption("indentUnit"))),
          "Shift-Tab": c => c.indentSelection("subtract"),
          "Ctrl-Enter": keys.run, "Cmd-Enter": keys.run,
          "Shift-Ctrl-Enter": keys.submit, "Shift-Cmd-Enter": keys.submit,
        },
      });
      cm.on("change", () => onChange(cm.getValue()));
      setTimeout(() => cm.refresh(), 0);
      return { get: () => cm.getValue(), set: v => cm.setValue(v), focus: () => cm.focus() };
    }
    const ta = document.createElement("textarea");
    ta.className = "fallback"; ta.value = value; ta.spellcheck = false; ta.setAttribute("aria-label", "Kod editörü");
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, n = lang === "py" ? 4 : 2;
        ta.setRangeText(" ".repeat(n), s, ta.selectionEnd, "end");
        onChange(ta.value);
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.shiftKey ? keys.submit : keys.run)(); }
    });
    ta.oninput = () => onChange(ta.value);
    host.appendChild(ta);
    return { get: () => ta.value, set: v => { ta.value = v; }, focus: () => ta.focus() };
  }

  // ---------- Problem sayfası ----------
  let busy = false;
  function renderProblem(p) {
    document.title = `${p.title} · Kodla & Keşfet`;
    const idx = P.indexOf(p), prev = P[idx - 1], next = P[idx + 1];
    let lang = S.lang in LANGS ? S.lang : "js";
    const codeKey = () => `${p.id}:${lang}`;
    const visible = p.tests.filter(t => !t.h);
    const hidden = p.tests.length - visible.length;
    const shown = () => S.hints[p.id] || 0;
    const showVal = (v, l) => {
      const rec = x => x === null ? (l === "py" ? "None" : "null") : typeof x === "boolean" ? (l === "py" ? (x ? "True" : "False") : String(x))
        : Array.isArray(x) ? "[" + x.map(rec).join(", ") + "]" : typeof x === "object" ? "{" + Object.entries(x).map(([k, w]) => JSON.stringify(k) + ": " + rec(w)).join(", ") + "}" : JSON.stringify(x);
      return rec(v);
    };

    $("#app").innerHTML = `
    <div class="crumbs"><a href="#/">← Tüm problemler</a><span>${idx + 1} / ${P.length}</span></div>
    <div class="workspace">
      <article class="panel desc">
        <div class="ph">
          <h1>${esc(p.title)} ${S.solved[p.id] ? `<span class="ok-tag">✓ Çözüldü</span>` : ""}</h1>
          <div class="meta"><span class="diff ${p.diff}">${DIFF_LABEL[p.diff]}</span><span class="tag">${esc(p.topic)}</span><span class="tag">${S.solved[p.id] ? `+${S.solved[p.id].xp}` : reward(p)} XP</span></div>
        </div>
        <div class="body">${p.desc}</div>
        <h3>Örnekler</h3>
        <div id="examples"></div>
        <p class="mut small">Gönderdiğinde bunlara ek olarak <b>${hidden} gizli test</b> de çalışır.</p>
        <h3>İpuçları</h3>
        <div id="hints"></div>
        <div class="pn">
          ${prev ? `<a href="#/p/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a href="#/p/${next.id}">${esc(next.title)} →</a>` : "<span></span>"}
        </div>
      </article>

      <section class="panel ide">
        <div class="bar">
          <div class="seg" role="tablist" aria-label="Dil">${Object.entries(LANGS).map(([k, v]) => `<button role="tab" data-lang="${k}" class="${k === lang ? "on" : ""}">${v}</button>`).join("")}</div>
          <button class="ghost sm" id="resetCode" title="Başlangıç koduna dön">↺ Sıfırla</button>
        </div>
        <div id="editor" class="editor"></div>
        <div class="actions">
          <span class="mut small kbd">Ctrl+Enter: çalıştır · Ctrl+Shift+Enter: gönder</span>
          <button class="ghost" id="runBtn">▶ Çalıştır</button>
          <button id="submitBtn">Gönder</button>
        </div>
        <div class="out">
          <div class="tabs"><button data-tab="res" class="on">Test Sonuçları</button><button data-tab="log">Konsol</button></div>
          <div id="outRes" class="pane"><p class="mut">Kodunu örnek testlerle denemek için <b>Çalıştır</b>'a, tüm testlerle değerlendirmek için <b>Gönder</b>'e bas.</p></div>
          <div id="outLog" class="pane" hidden><p class="mut">Kodundaki <code>console.log</code> / <code>print</code> çıktıları burada görünür.</p></div>
        </div>
      </section>
    </div>`;

    const renderExamples = () => {
      $("#examples").innerHTML = visible.map(t => `<pre class="ex"><span class="mut">›</span> ${esc(fnName(p, lang))}(${esc(t.in.map(v => showVal(v, lang)).join(", "))})\n<span class="mut">=</span> ${esc(showVal(t.out, lang))}</pre>`).join("");
    };
    const renderHints = () => {
      const n = shown();
      $("#hints").innerHTML = p.hints.slice(0, n).map((h, i) => `<div class="hint"><b>İpucu ${i + 1}</b> ${h}</div>`).join("") +
        (n < p.hints.length ? `<button class="ghost sm" id="hintBtn">💡 ${n ? "Bir ipucu daha" : "İpucu göster"}${S.solved[p.id] ? "" : ` <small>(ödül −%25)</small>`}</button>` : n ? "" : `<p class="mut small">Bu problem için ipucu yok.</p>`);
      const b = $("#hintBtn");
      if (b) b.onclick = () => { S.hints[p.id] = n + 1; save(); renderHints(); refreshMeta(); };
    };
    const refreshMeta = () => {
      const tag = $(".desc .meta .tag:last-child");
      if (tag) tag.textContent = `${S.solved[p.id] ? `+${S.solved[p.id].xp}` : reward(p)} XP`;
    };
    renderExamples(); renderHints();

    let saveT;
    const keys = { run: () => exec(false), submit: () => exec(true) };
    let ed;
    const mountEditor = () => {
      $("#editor").innerHTML = "";
      ed = makeEditor($("#editor"), S.code[codeKey()] ?? starter(p, lang), lang, v => {
        clearTimeout(saveT); saveT = setTimeout(() => { S.code[codeKey()] = v; save(); }, 300);
      }, keys);
    };
    mountEditor();

    document.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
      if (b.dataset.lang === lang) return;
      clearTimeout(saveT); S.code[codeKey()] = ed.get();
      lang = S.lang = b.dataset.lang; save();
      document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
      mountEditor(); renderExamples();
    });
    $("#resetCode").onclick = () => {
      if (!confirm("Kodun başlangıç hâline dönecek. Emin misin?")) return;
      delete S.code[codeKey()]; save(); ed.set(starter(p, lang));
    };
    const tab = t => document.querySelectorAll(".tabs button").forEach(b => {
      b.classList.toggle("on", b.dataset.tab === t);
      $(b.dataset.tab === "res" ? "#outRes" : "#outLog").hidden = b.dataset.tab !== t;
    });
    document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => tab(b.dataset.tab));
    $("#runBtn").onclick = keys.run;
    $("#submitBtn").onclick = keys.submit;

    async function exec(all) {
      if (busy) return;
      busy = true;
      clearTimeout(saveT); S.code[codeKey()] = ed.get(); save();
      const btns = [$("#runBtn"), $("#submitBtn")];
      btns.forEach(b => b.disabled = true);
      $("#outRes").innerHTML = `<p class="mut"><span class="spin"></span> ${all ? "Tüm testler" : "Örnek testler"} çalıştırılıyor…</p>`;
      tab("res");
      const res = await Runner.run({
        lang, code: ed.get(), fn: fnName(p, lang), tests: all ? p.tests : visible,
        timeoutMs: lang === "py" ? 6000 : 4000,
        onStatus: m => { const o = $("#outRes"); if (o) o.innerHTML = `<p class="mut"><span class="spin"></span> ${esc(m)}</p>`; },
      });
      busy = false;
      if (!document.body.contains(btns[0])) return; // kullanıcı bu arada başka sayfaya geçti
      btns.forEach(b => b.disabled = false);
      showLogs(res.logs);
      if (res.error) {
        $("#outRes").innerHTML = `<div class="verdict bad">⚠ Hata</div><pre class="err">${esc(res.error)}</pre>`;
        if (all) { S.attempts[p.id] = (S.attempts[p.id] || 0) + 1; save(); }
        return;
      }
      const pass = res.results.filter(r => r.ok).length, total = res.results.length, ok = pass === total;
      let head;
      if (all) {
        S.attempts[p.id] = (S.attempts[p.id] || 0) + 1;
        if (ok && !S.solved[p.id]) {
          const before = earned().map(b => b.id), lvBefore = level(S.xp).lv, gain = reward(p);
          S.solved[p.id] = { at: Date.now(), xp: gain, lang };
          S.xp += gain; bumpStreak();
          const fresh = earned().filter(b => !before.includes(b.id)), lvAfter = level(S.xp).lv;
          head = `<div class="verdict good">🎉 Kabul edildi! <b>+${gain} XP</b></div>` +
            (lvAfter > lvBefore ? `<p class="lvup">⬆ Seviye ${lvAfter}: <b>${title(lvAfter)}</b></p>` : "") +
            fresh.map(b => `<p class="newbadge">${b.icon} Yeni rozet: <b>${esc(b.name)}</b></p>`).join("");
          celebrate(); renderTop();
          const h1 = $(".desc h1"); if (h1 && !h1.querySelector(".ok-tag")) h1.insertAdjacentHTML("beforeend", ` <span class="ok-tag">✓ Çözüldü</span>`);
          refreshMeta();
          renderHints();
        } else if (ok) head = `<div class="verdict good">✓ Tüm testler geçti (bu problemi daha önce çözmüştün)</div>`;
        else head = `<div class="verdict bad">✗ ${total} testten ${pass} tanesi geçti</div>`;
        save();
      } else {
        head = ok ? `<div class="verdict good">✓ Örnek testler geçti. Şimdi <b>Gönder</b> ile gizli testleri de dene!</div>` : `<div class="verdict bad">✗ ${total} örnek testten ${pass} tanesi geçti</div>`;
      }
      const nextUnsolved = P.slice(idx + 1).concat(P.slice(0, idx)).find(q => !S.solved[q.id]);
      $("#outRes").innerHTML = head + `<div class="tests">${res.results.map((r, i) => `
        <details class="test ${r.ok ? "pass" : "fail"}" ${!r.ok && !r.hidden && res.results.findIndex(x => !x.ok) === i ? "open" : ""}>
          <summary>${r.ok ? "✓" : "✗"} ${r.hidden ? "Gizli test" : "Test"} ${i + 1}<small>${r.ms < 1 ? "<1" : Math.round(r.ms)} ms</small></summary>
          ${r.hidden ? (r.error ? `<pre class="err">${esc(r.error)}</pre>` : `<p class="mut small">Gizli testlerin girdisi gösterilmez. Uç durumları (boş girdi, negatif sayılar, tek eleman…) düşün.</p>`) :
            `<pre>${esc(r.call)}</pre><div class="kv"><span>Beklenen</span><code>${esc(r.expected)}</code>${r.error ? `<span>Hata</span><pre class="err">${esc(r.error)}</pre>` : `<span>Senin çıktın</span><code class="${r.ok ? "" : "bad"}">${esc(r.got)}</code>`}</div>`}
        </details>`).join("")}</div>` +
        (all && ok && nextUnsolved ? `<a class="btn" href="#/p/${nextUnsolved.id}">Sıradaki: ${esc(nextUnsolved.title)} →</a>` : "");
    }
    function showLogs(logs) {
      const o = $("#outLog");
      o.innerHTML = logs && logs.length ? `<pre class="log">${esc(logs.join("\n"))}</pre>` : `<p class="mut">Konsol çıktısı yok.</p>`;
      const b = document.querySelector('.tabs button[data-tab="log"]');
      b.textContent = logs && logs.length ? `Konsol (${logs.length})` : "Konsol";
    }
    ed.focus();
  }

  // ---------- Küçük yardımcılar ----------
  function toast(msg, bad) {
    const t = Object.assign(document.createElement("div"), { className: "toast" + (bad ? " bad" : ""), textContent: msg });
    document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
  }
  function celebrate() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div"); box.className = "confetti";
    const colors = ["var(--pr)", "var(--pr2)", "var(--ok)", "#f5b400", "#3aa0ff"];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("i");
      s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .3}s;animation-duration:${1.2 + Math.random()}s;transform:rotate(${Math.random() * 360}deg)`;
      box.appendChild(s);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  }

  // ---------- Yönlendirme ----------
  function route() {
    renderTop();
    const m = location.hash.match(/^#\/p\/([\w-]+)/);
    if (m && byId[m[1]]) renderProblem(byId[m[1]]); else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  applyTheme();
  route();
})();
