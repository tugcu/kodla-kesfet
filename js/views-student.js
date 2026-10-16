// Öğrenci görünümleri: derslerim, ders oynatıcı (video → quiz → ödev → sınav), notlarım.
(() => {
  const { $, $$, esc, nl2br, fmtDate, fmtSize, TYPE, KIND } = UI;

  const firstName = n => n.split(" ")[0];
  const nextRow = p => p.rows.find(r => !r.locked && !r.done) || p.rows.filter(r => !r.locked).pop();

  // ---------- Derslerim ----------
  App.route("#/", ["student"], async (_, main) => {
    document.title = "Derslerim · Kodla & Keşfet";
    const courses = await API.listCourses();
    main.innerHTML = `
      <section class="hello">
        <h1>Merhaba ${esc(firstName(App.user.name))} 👋</h1>
        <p class="mut">Kaldığın yerden devam etmeye hazır mısın?</p>
      </section>
      <div class="cards">
        ${courses.map(c => {
          const p = c.progress, nx = nextRow(p);
          return `<article class="panel ccard">
            <div class="cc-top"><span class="cc-ico">🐍</span><div><h2>${esc(c.title)}</h2><p class="mut small">${esc(c.teachers.join(", "))}</p></div></div>
            <p>${esc(c.description)}</p>
            <div class="pbar"><i style="width:${p.pct}%"></i></div>
            <p class="mut small">${p.done}/${p.total} adım tamamlandı · %${p.pct}</p>
            <div class="row">
              <a class="btn" href="#/c/${c.id}${nx ? "/" + nx.itemId : ""}">${p.complete ? "Dersi gözden geçir" : p.done ? "Devam et →" : "Başla →"}</a>
              <a class="ghost btnlike" href="#/c/${c.id}/grades">Notlarım</a>
            </div>
          </article>`;
        }).join("") || `<div class="panel empty-state"><div class="big">📚</div><h2>Henüz bir derse kayıtlı değilsin</h2><p class="mut">Yöneticin seni bir derse eklediğinde burada görünecek.</p></div>`}
        <a class="panel ccard arena" href="arena.html">
          <div class="cc-top"><span class="cc-ico">⚡</span><div><h2>Kod Arenası</h2><p class="mut small">Serbest alıştırma</p></div></div>
          <p>25 programlama problemiyle pratik yap: kodun anında test edilsin, XP kazan, rozetleri topla.</p>
          <span class="btnlike ghost">Arenaya git →</span>
        </a>
      </div>`;
  });

  // ---------- Ders oynatıcı ----------
  App.route("#/c/:cid", ["student"], p => coursePlayer(p.cid, null));
  App.route("#/c/:cid/:iid", ["student"], p => p.iid === "grades" ? gradesView(p.cid) : coursePlayer(p.cid, p.iid));

  const celebratedKey = cid => `kk-lms.done.${App.user.id}.${cid}`;

  async function coursePlayer(cid, iid) {
    const c = await API.getCourse(cid);
    const main = App.main();
    document.title = `${c.title} · Kodla & Keşfet`;
    const rows = Object.fromEntries(c.progress.rows.map(r => [r.itemId, r]));
    if (!iid) { const nx = nextRow(c.progress); if (nx) return App.go(`#/c/${cid}/${nx.itemId}`); }
    const idx = c.items.findIndex(i => i.id === iid);
    if (idx < 0 && c.items.length) return App.go(`#/c/${cid}`);
    const it = c.items[idx], row = it && rows[it.id];

    main.innerHTML = `
      <div class="crumbs"><a href="#/">← Derslerim</a><a href="#/c/${cid}/grades">Notlarım</a></div>
      <section class="course-head">
        <h1>${esc(c.title)}</h1>
        <div class="pbar big"><i style="width:${c.progress.pct}%"></i></div>
        <p class="mut small">${c.progress.done}/${c.progress.total} adım tamamlandı</p>
      </section>
      <div class="player">
        <nav class="steps" aria-label="Ders adımları">
          ${c.items.map((x, i) => {
            const r = rows[x.id];
            const ico = r.locked ? "🔒" : r.done && r.gate ? "✅" : r.done ? "⏳" : TYPE[x.type][0];
            return `<a class="step ${x.id === iid ? "cur" : ""} ${r.locked ? "lock" : ""} ${r.done ? "done" : ""} ${r.done && !r.gate ? "wait" : ""}" href="${r.locked ? "javascript:void 0" : `#/c/${cid}/${x.id}`}" ${r.locked ? 'aria-disabled="true"' : ""}>
              <b>${ico}</b><span><small>${TYPE[x.type][1]}${x.type === "assignment" && x.blocking ? " · zorunlu" : ""}</small>${esc(x.title)}<em>${esc(r.state)}</em></span></a>`;
          }).join("")}
        </nav>
        <section class="panel stage" id="stage"></section>
      </div>`;
    const cur = $(".step.cur");
    if (cur && matchMedia("(max-width: 860px)").matches) cur.scrollIntoView({ inline: "center", block: "nearest" });
    const stage = $("#stage");
    if (!it) { stage.innerHTML = `<div class="empty-state"><div class="big">🛠️</div><h2>Bu derse henüz içerik eklenmedi</h2></div>`; return; }

    const next = c.items[idx + 1];
    const goNext = async () => {
      const fresh = await API.getCourse(cid);
      let seen = "x"; try { seen = localStorage.getItem(celebratedKey(cid)); } catch {}
      if (fresh.progress.complete && !seen) { try { localStorage.setItem(celebratedKey(cid), "1"); } catch {} return App.go(`#/c/${cid}/grades`); }
      const n = next && fresh.progress.rows.find(r => r.itemId === next.id);
      App.go(n && !n.locked ? `#/c/${cid}/${next.id}` : `#/c/${cid}`);
    };
    const nextBtn = (label = "Sonraki adım →") => next ? `<button class="nextBtn">${label}</button>` : `<button class="nextBtn">Dersi bitir 🏁</button>`;
    const bindNext = () => $$(".nextBtn", stage).forEach(b => b.onclick = goNext);

    if (row.locked) {
      stage.innerHTML = `<div class="empty-state"><div class="big">🔒</div><h2>Bu adım henüz kilitli</h2><p>Önce <b>${esc(row.blocker)}</b> adımını tamamlaman gerekiyor.</p></div>`;
      return;
    }
    const head = `<p class="kicker">${TYPE[it.type][0]} ${TYPE[it.type][1]} · ${idx + 1}/${c.items.length}</p><h2>${esc(it.title)}</h2>${it.description ? `<p class="desc">${nl2br(it.description)}</p>` : ""}`;

    if (it.type === "video") {
      stage.innerHTML = `${head}${UI.ytEmbed(it.youtubeId)}
        <div class="row end">${row.done ? nextBtn() : `<button id="watched">Videoyu izledim, devam et →</button>`}</div>`;
      bindNext();
      const w = $("#watched");
      if (w) w.onclick = async () => { w.disabled = true; await API.markWatched(it.id); goNext(); };
    } else if (it.type === "quiz") renderQuiz(stage, it, row, head, { nextBtn, bindNext, cid, items: c.items, idx });
    else if (it.type === "assignment") await renderAssignment(stage, it, row, head, { nextBtn, bindNext, cid });
    else if (it.type === "exam") await renderExam(stage, it, row, head, { nextBtn, bindNext, cid });
  }

  // Çoktan seçmeli soruları çizer; answers dizisi kullanıcının seçimlerini tutar.
  function questionsHtml(qs, name, detail, showCorrect) {
    return qs.map((q, i) => `<fieldset class="q" ${detail ? "disabled" : ""}><legend><span>${i + 1}</span> ${esc(q.text)}</legend>
      ${q.options.map((o, j) => {
        let cls = "opt";
        if (detail) {
          const d = detail[i];
          if (d.given === j) cls += d.ok ? " right" : " wrong";
          else if (showCorrect && d.correct === j) cls += " right ghosted";
        }
        return `<label class="${cls}"><input type="radio" name="${name}${i}" value="${j}" ${detail && detail[i].given === j ? "checked" : ""}><span>${esc(o)}</span></label>`;
      }).join("")}</fieldset>`).join("");
  }
  const collect = (form, n, name) => Array.from({ length: n }, (_, i) => { const x = form.querySelector(`input[name="${name}${i}"]:checked`); return x ? Number(x.value) : null; });
  const bindProgressCount = (form, n, name, btn) => {
    const upd = () => { const k = collect(form, n, name).filter(x => x !== null).length; btn.disabled = k < n; btn.dataset.count = `${k}/${n}`; $(".cnt", btn.parentNode).textContent = `${k}/${n} soru cevaplandı`; };
    form.addEventListener("change", upd); upd();
  };

  // ---------- Quiz ----------
  async function renderQuiz(stage, it, row, head, ctx) {
    const subs = await API.mySubmissions(it.id);
    const passed = subs.find(s => s.passed);
    const left = it.maxAttempts ? it.maxAttempts - subs.length : Infinity;
    const info = `<p class="pill-row"><span class="pill">Baraj: %${it.passPct}</span><span class="pill">${it.questions.length} soru</span>${it.maxAttempts ? `<span class="pill">Deneme: ${subs.length}/${it.maxAttempts}</span>` : ""}</p>`;
    if (passed) {
      stage.innerHTML = `${head}${info}<div class="res pass">🎉 Bu quizi %${passed.score} ile geçtin.</div><div class="row end">${ctx.nextBtn()}</div>`;
      return ctx.bindNext();
    }
    if (left <= 0) {
      stage.innerHTML = `${head}${info}<div class="res fail">Deneme hakkın bitti. Devam edebilmek için öğretmeninle görüş.</div>`;
      return;
    }
    stage.innerHTML = `${head}${info}<form id="qf">${questionsHtml(it.questions, "q")}<div class="row end"><span class="cnt mut small"></span><button type="submit">Cevapları kontrol et</button></div></form>`;
    const form = $("#qf");
    bindProgressCount(form, it.questions.length, "q", $('button[type="submit"]', form));
    form.onsubmit = async e => {
      e.preventDefault();
      const answers = collect(form, it.questions.length, "q");
      let r;
      try { r = await API.submitQuiz(it.id, answers); } catch (err) { return UI.toast(err.message, "bad"); }
      const prevVideo = ctx.items.slice(0, ctx.idx).reverse().find(x => x.type === "video");
      const n = r.detail.filter(d => d.ok).length;
      stage.innerHTML = `${head}${info}
        <div class="res ${r.passed ? "pass" : "fail"}">${r.passed ? `🎉 Harika! ${it.questions.length} sorudan ${n} doğru (%${r.score}).` : `${it.questions.length} sorudan ${n} doğru (%${r.score}). Geçmek için en az %${it.passPct} gerekli. Biraz daha çalışıp yeniden dene 💪`}</div>
        <div class="review">${questionsHtml(it.questions, "r", r.detail.map((d, i) => ({ ...d, given: answers[i] })), it.showAnswers)}</div>
        <div class="row end">${r.passed ? ctx.nextBtn() : `${prevVideo ? `<a class="ghost btnlike" href="#/c/${ctx.cid}/${prevVideo.id}">Videoyu tekrar izle</a>` : ""}${(it.maxAttempts ? it.maxAttempts - subs.length - 1 : 1) > 0 ? `<button id="retry">Tekrar dene</button>` : ""}`}</div>`;
      if (r.passed) { UI.celebrate(); ctx.bindNext(); }
      const rt = $("#retry"); if (rt) rt.onclick = () => App.reload();
      $(".res", stage).scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  // ---------- Teslim durumu kartı ----------
  function statusCard(it, last) {
    if (!last) return "";
    if (last.status !== "approved")
      return `<div class="res wait">⏳ ${fmtDate(last.submittedAt)} tarihinde teslim ettin. Öğretmenin değerlendirdiğinde notun burada görünecek.${it.type === "assignment" && it.blocking ? " Bu ödevden geçer not almadan sonraki adıma geçemezsin." : ""}</div>`;
    const ok = last.score >= it.passPct;
    return `<div class="res ${ok ? "pass" : "fail"}"><b>Notun: ${last.score}</b> <span class="mut">(geçme notu ${it.passPct})</span>${last.feedback ? `<p class="fb">💬 ${nl2br(last.feedback)}</p>` : ""}</div>`;
  }

  // ---------- Ödev ----------
  async function renderAssignment(stage, it, row, head, ctx) {
    const subs = await API.mySubmissions(it.id);
    const last = subs[subs.length - 1];
    const okApproved = last && last.status === "approved" && last.score >= it.passPct;
    const canSubmit = !last || last.status === "pending" || (it.blocking && !okApproved);
    const info = `<p class="pill-row"><span class="pill">${KIND[it.kind]}</span><span class="pill">Geçme notu: ${it.passPct}</span><span class="pill ${it.blocking ? "warn" : ""}">${it.blocking ? "🔐 Geçmeden ilerlenemez" : "İlerlemeyi kilitlemez"}</span></p>`;
    const canGoOn = !it.blocking || okApproved;
    const footer = canGoOn ? `<div class="row end">${!last && !it.blocking ? `<span class="mut small">İstersen önce sonraki adıma geçebilirsin.</span>` : ""}${ctx.nextBtn()}</div>` : "";
    stage.innerHTML = `${head}${info}${statusCard(it, last)}<div id="aform"></div>${footer}`;
    ctx.bindNext();
    if (!canSubmit) return;
    const box = $("#aform");
    const verb = last && last.status === "pending" ? "Teslimi güncelle" : last ? "Yeniden teslim et" : "Teslim et";
    const done = async (fn) => {
      try { await fn(); UI.toast("Ödevin teslim edildi ✔", "good"); App.reload(); }
      catch (e) { UI.toast(e.message, "bad"); }
    };

    if (it.kind === "test") {
      box.innerHTML = `<form id="af">${questionsHtml(it.questions, "a")}<div class="row end"><span class="cnt mut small"></span><button type="submit">${verb}</button></div></form>`;
      const f = $("#af");
      bindProgressCount(f, it.questions.length, "a", $('button[type="submit"]', f));
      f.onsubmit = e => { e.preventDefault(); done(() => API.submitAssignment(it.id, { answers: collect(f, it.questions.length, "a") })); };
    } else if (it.kind === "open") {
      const prev = last && last.status === "pending" ? last.answers || [] : [];
      box.innerHTML = `<form id="af">${it.questions.map((q, i) => `<label class="oq"><span><b>${i + 1}.</b> ${esc(q.text)}</span><textarea name="a${i}" rows="4" required>${esc(prev[i] || "")}</textarea></label>`).join("")}<div class="row end"><button type="submit">${verb}</button></div></form>`;
      $("#af").onsubmit = e => { e.preventDefault(); done(() => API.submitAssignment(it.id, { answers: it.questions.map((_, i) => e.target[`a${i}`].value) })); };
    } else if (it.kind === "file") {
      box.innerHTML = `<form id="af">
        ${last && last.file ? `<p class="mut small">Önceki teslim: <a href="#" id="myfile">📄 ${esc(last.file.name)}</a> (${fmtSize(last.file.size)})</p>` : ""}
        <label class="drop"><input type="file" name="f" required><span>📤 Dosya seç ya da buraya sürükle<small>En fazla ${it.maxFileMb || 5} MB</small></span></label>
        <label>Not (isteğe bağlı)<textarea name="n" rows="2">${esc(last && last.status === "pending" ? last.note || "" : "")}</textarea></label>
        <div class="row end"><button type="submit">${verb}</button></div></form>`;
      const inp = $('input[type="file"]', box);
      inp.onchange = () => { $(".drop span", box).firstChild.textContent = inp.files[0] ? `📄 ${inp.files[0].name} (${fmtSize(inp.files[0].size)})` : "📤 Dosya seç ya da buraya sürükle"; };
      const mf = $("#myfile"); if (mf) mf.onclick = async e => { e.preventDefault(); const f = await API.getFile(last.file.id); UI.download(f.blob, f.name); };
      $("#af").onsubmit = e => { e.preventDefault(); done(() => API.submitAssignment(it.id, { file: inp.files[0], note: e.target.n.value })); };
    } else if (it.kind === "code") renderCodeTask(box, it, last, verb, done);
  }

  // Kod ödevi: örnek testleri tarayıcıda çalıştırma + teslim.
  function renderCodeTask(box, it, last, verb, done) {
    const cd = it.code, lang = cd.lang;
    const draftKey = `kk-lms.draft.${App.user.id}.${it.id}`;
    let draft = null; try { draft = localStorage.getItem(draftKey); } catch {}
    const initial = draft ?? (last && last.code) ?? cd.starter ?? "";
    box.innerHTML = `
      <h3>Örnekler</h3>
      ${cd.tests.map(t => `<pre class="ex"><span class="mut">›</span> ${esc(cd.fn)}(${esc(t.in.map(v => UI.showVal(v, lang)).join(", "))})\n<span class="mut">=</span> ${esc(UI.showVal(t.out, lang))}</pre>`).join("")}
      <p class="mut small">Teslim ettiğinde bunlara ek olarak gizli testler de çalışır. Kod ${lang === "py" ? "Python" : "JavaScript"} ile yazılmalı.</p>
      <div class="ide">
        <div class="bar"><span class="pill">${lang === "py" ? "🐍 Python" : "JavaScript"}</span><button class="ghost sm" id="rc" type="button">↺ Başlangıç kodu</button></div>
        <div id="ed" class="editor"></div>
        <div class="actions"><span class="mut small kbd">Ctrl+Enter: örnekleri çalıştır</span><button class="ghost" id="run" type="button">▶ Örnekleri çalıştır</button><button id="sub" type="button">${verb}</button></div>
        <div class="pane" id="out"><p class="mut">Kodunu örnek testlerle denemek için <b>Örnekleri çalıştır</b>'a bas.</p></div>
      </div>`;
    let t;
    const run = async () => {
      const out = $("#out"); out.innerHTML = `<p class="mut"><span class="spin"></span> Çalıştırılıyor…</p>`;
      $("#run").disabled = true;
      const res = await Runner.run({ lang, code: ed.get(), fn: cd.fn, tests: cd.tests, timeoutMs: lang === "py" ? 6000 : 4000, onStatus: m => out.innerHTML = `<p class="mut"><span class="spin"></span> ${esc(m)}</p>` });
      $("#run").disabled = false;
      if (res.error) { out.innerHTML = `<div class="verdict bad">⚠ Hata</div><pre class="err">${esc(res.error)}</pre>`; return; }
      const pass = res.results.filter(r => r.ok).length;
      out.innerHTML = `<div class="verdict ${pass === res.results.length ? "good" : "bad"}">${pass === res.results.length ? "✓ Örnek testler geçti. Şimdi teslim edebilirsin!" : `✗ ${res.results.length} örnek testten ${pass} tanesi geçti`}</div>
        ${res.results.map((r, i) => `<details class="test ${r.ok ? "pass" : "fail"}" ${r.ok ? "" : "open"}><summary>${r.ok ? "✓" : "✗"} Test ${i + 1}</summary><pre>${esc(r.call)}</pre><div class="kv"><span>Beklenen</span><code>${esc(r.expected)}</code>${r.error ? `<span>Hata</span><pre class="err">${esc(r.error)}</pre>` : `<span>Senin çıktın</span><code class="${r.ok ? "" : "bad"}">${esc(r.got)}</code>`}</div></details>`).join("")}
        ${res.logs && res.logs.length ? `<h4>Konsol</h4><pre class="log">${esc(res.logs.join("\n"))}</pre>` : ""}`;
    };
    const ed = UI.makeEditor($("#ed"), initial, lang, v => { clearTimeout(t); t = setTimeout(() => { try { localStorage.setItem(draftKey, v); } catch {} }, 300); }, { run });
    $("#run").onclick = run;
    $("#rc").onclick = () => { if (confirm("Kodun başlangıç hâline dönecek. Emin misin?")) ed.set(cd.starter || ""); };
    $("#sub").onclick = () => {
      if (!confirm("Kodun gizli testlerle birlikte değerlendirilip öğretmenine gönderilecek. Teslim edilsin mi?")) return;
      $("#sub").disabled = true; $("#sub").innerHTML = `<span class="spin"></span> Değerlendiriliyor…`;
      done(() => API.submitAssignment(it.id, { code: ed.get() })).finally(() => { const b = $("#sub"); if (b) { b.disabled = false; b.textContent = verb; } });
    };
  }

  // ---------- Sınav ----------
  async function renderExam(stage, it, row, head, ctx) {
    const subs = await API.mySubmissions(it.id);
    const last = subs[subs.length - 1];
    const info = `<p class="pill-row"><span class="pill">${it.questions.length} soru</span><span class="pill">Geçme notu: ${it.passPct}</span><span class="pill">Deneme hakkı: ${it.maxAttempts}</span></p>`;
    if (last && subs.length >= it.maxAttempts) {
      stage.innerHTML = `${head}${info}${statusCard(it, last)}<div class="row end">${ctx.nextBtn()}</div>`;
      return ctx.bindNext();
    }
    stage.innerHTML = `${head}${info}${last ? statusCard(it, last) : ""}
      <div class="exam-intro"><p>Hazır olduğunda sınava başla. Cevaplarını teslim ettikten sonra değiştiremezsin; sonucun öğretmenin onayından sonra görünür.</p><button id="start">Sınava başla</button></div>`;
    $("#start").onclick = () => {
      stage.innerHTML = `${head}<form id="ef">${questionsHtml(it.questions, "e")}<div class="row end"><span class="cnt mut small"></span><button type="submit">Sınavı teslim et</button></div></form>`;
      const f = $("#ef");
      bindProgressCount(f, it.questions.length, "e", $('button[type="submit"]', f));
      f.onsubmit = async e => {
        e.preventDefault();
        if (!confirm("Sınavı teslim etmek istediğine emin misin? Teslimden sonra cevapların değiştirilemez.")) return;
        try { await API.submitExam(it.id, collect(f, it.questions.length, "e")); }
        catch (err) { return UI.toast(err.message, "bad"); }
        UI.celebrate(); UI.toast("Sınavın teslim edildi ✔", "good");
        App.reload();
      };
    };
  }

  // ---------- Notlarım ----------
  async function gradesView(cid) {
    const [c, g] = await Promise.all([API.getCourse(cid), API.myGrades(cid)]);
    const main = App.main();
    document.title = `Notlarım · ${c.title}`;
    const just = (() => { try { return localStorage.getItem(celebratedKey(cid)) === "1"; } catch { return false; } })();
    main.innerHTML = `
      <div class="crumbs"><a href="#/c/${cid}">← ${esc(c.title)}</a></div>
      ${c.progress.complete ? `<section class="panel finish"><div class="big">🎓</div><h1>Tebrikler, dersi tamamladın!</h1>
        ${g.finalLevel ? `<p>Ders sonu başarı seviyen: <b class="lvl">${esc(g.finalLevel.label)}</b> <span class="mut">(sınav notu ${g.finalLevel.score})</span></p>` : `<p class="mut">Genel sınav sonucun öğretmenin onayından sonra burada görünecek.</p>`}</section>` : ""}
      <section class="panel">
        <h2>Notlarım</h2>
        <div class="tablewrap"><table class="tbl">
          <thead><tr><th>Etkinlik</th><th>Tür</th><th>Durum</th><th class="num">Not</th></tr></thead>
          <tbody>${g.rows.map(r => `<tr>
            <td><b>${esc(r.item.title)}</b>${r.feedback ? `<div class="fb small">💬 ${nl2br(r.feedback)}</div>` : ""}</td>
            <td>${TYPE[r.item.type][0]} ${TYPE[r.item.type][1]}</td>
            <td>${r.state === "none" ? `<span class="mut">Yapılmadı</span>` : r.state === "pending" ? `<span class="tag wait">⏳ Değerlendirme bekliyor</span>` : `<span class="tag ${r.pass ? "ok" : "bad"}">${r.pass ? "Geçti" : "Geçemedi"}</span>${r.attempts > 1 ? ` <small class="mut">${r.attempts} deneme</small>` : ""}`}</td>
            <td class="num">${r.state === "graded" ? `<b>${r.score}</b>` : "–"}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="mut small">Quiz notları anında görünür. Ödev ve sınav notları öğretmenin onayladıktan sonra görünür.</p>
      </section>`;
    if (c.progress.complete && just) { UI.celebrate(); try { localStorage.setItem(celebratedKey(cid), "2"); } catch {} }
  }
})();
