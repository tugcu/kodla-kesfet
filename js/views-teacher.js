// Öğretmen görünümleri: derslerim, içerik yönetimi ve editörü, not defteri, değerlendirme.
(() => {
  const { $, $$, esc, nl2br, fmtDate, fmtSize, TYPE, KIND } = UI;

  const summary = it => it.type === "video" ? `YouTube${it.minutes ? ` · ${it.minutes} dk` : ""}`
    : it.type === "quiz" ? `${it.questions.length} soru · baraj %${it.passPct}${it.maxAttempts ? ` · ${it.maxAttempts} deneme` : ""}`
    : it.type === "exam" ? `${it.questions.length} soru · geçme ${it.passPct} · ${it.maxAttempts} deneme`
    : `${KIND[it.kind]} · geçme ${it.passPct} · ${it.blocking ? "🔐 geçmeden ilerlenemez" : "ilerlemeyi kilitlemez"}`;

  // ---------- Derslerim ----------
  App.route("#/", ["teacher"], async (_, main) => {
    document.title = "Derslerim · Kodla & Keşfet";
    const courses = await API.listCourses();
    main.innerHTML = `
      <section class="hello"><h1>Merhaba ${esc(App.user.name.split(" ")[0])} 👋</h1><p class="mut">Atandığın dersler aşağıda.</p></section>
      <div class="cards">${courses.map(c => `
        <a class="panel ccard" href="#/t/${c.id}">
          <div class="cc-top"><span class="cc-ico">📘</span><div><h2>${esc(c.title)}</h2><p class="mut small">${c.studentIds.length} öğrenci · ${c.itemCount} içerik</p></div></div>
          <p>${esc(c.description)}</p>
          <div class="row">${c.status !== "active" ? `<span class="tag bad">İptal edildi</span>` : ""}${c.pending ? `<span class="tag wait">⏳ ${c.pending} değerlendirme bekliyor</span>` : `<span class="tag ok">Bekleyen değerlendirme yok</span>`}</div>
        </a>`).join("") || `<div class="panel empty-state"><div class="big">📚</div><h2>Henüz bir derse atanmadın</h2><p class="mut">Yönetici seni bir derse atadığında burada görünecek.</p></div>`}</div>`;
  });

  function courseTabs(c, tab) {
    return `<div class="crumbs"><a href="#/">← Derslerim</a></div>
      <section class="course-head"><h1>${esc(c.title)} ${c.status !== "active" ? `<span class="tag bad">İptal edildi</span>` : ""}</h1><p class="mut small">${c.students.length} öğrenci · ${c.items.length} içerik</p></section>
      <div class="tabbar"><a href="#/t/${c.id}" class="${tab === "content" ? "on" : ""}">İçerik</a><a href="#/t/${c.id}/grades" class="${tab === "grades" ? "on" : ""}">Not Defteri</a><a href="#/t/inbox?c=${c.id}" class="">Değerlendirme</a></div>`;
  }

  // ---------- İçerik listesi ----------
  App.route("#/t/:cid", ["teacher"], async ({ cid }, main) => {
    if (cid === "inbox") return inbox(main);
    const c = await API.getCourse(cid);
    document.title = `${c.title} · İçerik`;
    const ro = c.status !== "active";
    main.innerHTML = courseTabs(c, "content") + `
      <section class="panel">
        <div class="ph-row"><h2>Ders akışı</h2>
          ${ro ? "" : `<div class="row">${Object.entries(TYPE).map(([k, [i, n]]) => `<a class="ghost btnlike sm" href="#/t/${cid}/new/${k}">＋ ${i} ${n}</a>`).join("")}</div>`}</div>
        <p class="mut small">Öğrenciler içerikleri bu sırayla görür. Bir adım tamamlanmadan (video izlenmeden, quiz geçilmeden, zorunlu ödevden geçer not alınmadan) sonraki adım açılmaz.</p>
        <ol class="flow">${c.items.map((it, i) => `
          <li class="fitem t-${it.type}">
            <span class="fi">${TYPE[it.type][0]}</span>
            <div class="ft"><b>${esc(it.title)}</b><small>${TYPE[it.type][1]} · ${summary(it)}</small></div>
            ${ro ? "" : `<div class="fa">
              <button class="icon sm" data-mv="-1" data-id="${it.id}" ${i === 0 ? "disabled" : ""} title="Yukarı taşı" aria-label="Yukarı taşı">↑</button>
              <button class="icon sm" data-mv="1" data-id="${it.id}" ${i === c.items.length - 1 ? "disabled" : ""} title="Aşağı taşı" aria-label="Aşağı taşı">↓</button>
              <a class="ghost btnlike sm" href="#/t/${cid}/edit/${it.id}">Düzenle</a>
              <button class="ghost danger sm" data-del="${it.id}">Sil</button></div>`}
          </li>`).join("") || `<li class="empty">Henüz içerik yok. Yukarıdaki düğmelerle video, quiz, ödev veya sınav ekle.</li>`}</ol>
      </section>`;
    $$("[data-mv]").forEach(b => b.onclick = async () => { await API.moveItem(b.dataset.id, Number(b.dataset.mv)); App.reload(); });
    $$("[data-del]").forEach(b => b.onclick = async () => {
      const it = c.items.find(x => x.id === b.dataset.del);
      if (!confirm(`"${it.title}" silinecek. Bu içeriğe ait tüm öğrenci teslimleri de silinir. Emin misin?`)) return;
      await API.deleteItem(it.id); UI.toast("İçerik silindi"); App.reload();
    });
  });

  // ---------- İçerik editörü ----------
  App.route("#/t/:cid/new/:type", ["teacher"], ({ cid, type }) => editor(cid, null, type));
  App.route("#/t/:cid/edit/:iid", ["teacher"], ({ cid, iid }) => editor(cid, iid));

  const blankQ = () => ({ text: "", options: ["", ""], correct: null });
  function defaults(type) {
    if (type === "video") return { type, title: "", description: "", youtubeId: "", minutes: 8 };
    if (type === "quiz") return { type, title: "", description: "", passPct: 70, maxAttempts: 0, showAnswers: false, questions: [blankQ()] };
    if (type === "exam") return { type, title: "Genel Değerlendirme Sınavı", description: "", passPct: 60, maxAttempts: 1, questions: [blankQ()] };
    return { type: "assignment", title: "", description: "", kind: "test", blocking: false, passPct: 60, questions: [blankQ()], maxFileMb: 5,
      code: { lang: "py", fn: "", starter: "", tests: [] } };
  }
  const testsToText = (tests, hidden) => tests.filter(t => !!t.h === hidden).map(t => `${JSON.stringify(t.in)} => ${JSON.stringify(t.out)}`).join("\n");
  function parseTests(text, hidden, label) {
    return text.split("\n").map((l, i) => [l.trim(), i + 1]).filter(([l]) => l).map(([l, n]) => {
      const k = l.indexOf("=>");
      if (k < 0) throw new Error(`${label}, satır ${n}: "girdi => beklenen" biçiminde olmalı.`);
      let a, o;
      try { a = JSON.parse(l.slice(0, k)); o = JSON.parse(l.slice(k + 2)); } catch { throw new Error(`${label}, satır ${n}: değerler JSON biçiminde olmalı (ör. [1, 2] => 3, metinler çift tırnakla).`); }
      if (!Array.isArray(a)) throw new Error(`${label}, satır ${n}: girdi bir dizi olmalı, ör. [5] ya da ["a", 2].`);
      return { in: a, out: o, ...(hidden ? { h: true } : {}) };
    });
  }

  async function editor(cid, iid, newType) {
    const c = await API.getCourse(cid);
    if (c.status !== "active") throw new API.ApiError("Bu ders iptal edilmiş; içerik düzenlenemez.");
    let d;
    if (iid) { const it = c.items.find(x => x.id === iid); if (!it) throw new API.ApiError("İçerik bulunamadı."); d = { ...defaults(it.type), ...JSON.parse(JSON.stringify(it)) }; }
    else { if (!TYPE[newType]) throw new API.ApiError("Bilinmeyen içerik türü."); d = defaults(newType); }
    const main = App.main();
    document.title = `${iid ? "Düzenle" : "Yeni"}: ${TYPE[d.type][1]} · ${c.title}`;
    main.innerHTML = `<div class="crumbs"><a href="#/t/${cid}">← ${esc(c.title)}</a></div>
      <form class="panel editor-form" id="edf" novalidate>
        <h1>${TYPE[d.type][0]} ${iid ? `${{ video: "Videoyu", quiz: "Quizi", assignment: "Ödevi", exam: "Sınavı" }[d.type]} düzenle` : `Yeni ${TYPE[d.type][1].toLocaleLowerCase("tr")}`}</h1>
        <label>Başlık<input name="title" value="${esc(d.title)}" required maxlength="120"></label>
        <label>Açıklama <small class="mut">(isteğe bağlı, öğrenci görür)</small><textarea name="description" rows="2">${esc(d.description)}</textarea></label>
        <div id="specific"></div>
        <p class="ferr" hidden></p>
        <div class="row end"><a class="ghost btnlike" href="#/t/${cid}">Vazgeç</a><button type="submit">Kaydet</button></div>
      </form>`;
    const sp = $("#specific");
    const bind = (name, fn) => { const el = $(`[name="${name}"]`, sp); if (el) el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => fn(el)); };

    function renderSpecific() {
      if (d.type === "video") {
        sp.innerHTML = `<label>YouTube bağlantısı veya video kimliği<input name="yt" value="${esc(d.youtubeId)}" placeholder="https://www.youtube.com/watch?v=..." required></label>
          <p class="mut small">Videoyu YouTube'a <b>Liste dışı (Unlisted)</b> olarak yükle. <b>Özel (Private)</b> videolar başka sitelere gömülemez. Bağlantı öğrencilere gösterilmez.</p>
          <label class="w-sm">Süre (dakika)<input name="minutes" type="number" min="1" max="60" value="${esc(d.minutes ?? "")}"></label>
          <div id="ytprev"></div>`;
        const prev = () => { const id = UI.parseYouTube($('[name="yt"]', sp).value); $("#ytprev").innerHTML = id ? UI.ytEmbed(id) : `<p class="mut small">Önizleme için geçerli bir bağlantı gir.</p>`; };
        bind("yt", el => { d.youtubeId = el.value; prev(); }); bind("minutes", el => d.minutes = el.value); prev();
      } else if (d.type === "quiz" || d.type === "exam") {
        sp.innerHTML = `<div class="grid3">
            <label>${d.type === "quiz" ? "Baraj (%)" : "Geçme notu (0–100)"}<input name="passPct" type="number" min="0" max="100" value="${d.passPct}"></label>
            <label>Deneme hakkı<input name="maxAttempts" type="number" min="${d.type === "exam" ? 1 : 0}" value="${d.maxAttempts}"><small class="mut">${d.type === "quiz" ? "0 = sınırsız" : ""}</small></label>
            ${d.type === "quiz" ? `<label class="chk"><input type="checkbox" name="showAnswers" ${d.showAnswers ? "checked" : ""}> Yanlışlarda doğru cevabı göster</label>` : ""}
          </div>
          <p class="mut small">${d.type === "quiz" ? "Quizler anında notlandırılır; öğrenci barajı geçince sonraki adım açılır." : "Sınav otomatik notlandırılır ama öğrenci notunu sen onayladıktan sonra görür."}</p>
          <div id="qb"></div>`;
        bind("passPct", el => d.passPct = el.value); bind("maxAttempts", el => d.maxAttempts = el.value); bind("showAnswers", el => d.showAnswers = el.checked);
        qBuilder($("#qb"), d.questions, true);
      } else {
        sp.innerHTML = `<div class="grid3">
            <label>Ödev türü<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label>Geçme notu (0–100)<input name="passPct" type="number" min="0" max="100" value="${d.passPct}"></label>
            <label class="chk"><input type="checkbox" name="blocking" ${d.blocking ? "checked" : ""}> Öğrenci bu ödevden geçer not almadan sonraki adıma <b>geçemez</b></label>
          </div>
          <p class="mut small">Ödev notları sen onaylayana kadar öğrenciye gösterilmez. ${d.kind === "test" || d.kind === "code" ? "Bu türde otomatik bir not önerisi hesaplanır; onaylarken değiştirebilirsin." : ""}</p>
          <div id="kind"></div>`;
        bind("kind", el => { d.kind = el.value; if (["test", "open"].includes(d.kind) && !d.questions?.length) d.questions = [blankQ()]; renderSpecific(); });
        bind("passPct", el => d.passPct = el.value); bind("blocking", el => d.blocking = el.checked);
        const k = $("#kind");
        if (d.kind === "test") qBuilder(k, d.questions = d.questions || [blankQ()], true);
        else if (d.kind === "open") qBuilder(k, d.questions = d.questions || [blankQ()], false);
        else if (d.kind === "file") {
          k.innerHTML = `<label class="w-sm">En büyük dosya boyutu (MB)<input name="maxFileMb" type="number" min="1" max="20" value="${d.maxFileMb || 5}"></label><p class="mut small">Ne yüklenmesi gerektiğini açıklama alanına yaz (ör. "Programının ekran görüntüsünü yükle").</p>`;
          bind("maxFileMb", el => d.maxFileMb = el.value);
        } else codeSpec(k);
      }
    }

    function codeSpec(k) {
      const cd = d.code;
      k.innerHTML = `<div class="grid3">
          <label>Dil<select name="lang"><option value="py" ${cd.lang === "py" ? "selected" : ""}>Python</option><option value="js" ${cd.lang === "js" ? "selected" : ""}>JavaScript</option></select></label>
          <label>Fonksiyon adı<input name="fn" value="${esc(cd.fn)}" placeholder="ortalama" spellcheck="false"></label>
        </div>
        <label>Başlangıç kodu<textarea name="starter" rows="5" class="mono" spellcheck="false" placeholder="def ortalama(notlar):&#10;    pass">${esc(cd.starter)}</textarea></label>
        <div class="grid2">
          <label>Örnek testler <small class="mut">(öğrenci görür)</small><textarea name="vis" rows="5" class="mono" spellcheck="false" placeholder="[[70, 80, 90]] => 80">${esc(testsToText(cd.tests, false))}</textarea></label>
          <label>Gizli testler <small class="mut">(yalnızca teslimde çalışır)</small><textarea name="hid" rows="5" class="mono" spellcheck="false" placeholder="[[]] => 0">${esc(testsToText(cd.tests, true))}</textarea></label>
        </div>
        <p class="mut small">Her satıra bir test: <code>[argüman1, argüman2] => beklenen</code>. Değerler JSON biçiminde yazılır: <code>true</code>, <code>null</code>, metinler çift tırnakla. Not önerisi, geçen testlerin yüzdesidir.</p>
        <details class="trysol"><summary>Testleri bir örnek çözümle dene</summary>
          <textarea id="sol" rows="6" class="mono" spellcheck="false" placeholder="Doğru çözümü buraya yaz; kaydedilmez."></textarea>
          <div class="row"><button type="button" class="ghost" id="trybtn">▶ Tüm testleri çalıştır</button><span id="tryout" class="small"></span></div>
        </details>`;
      bind("lang", el => cd.lang = el.value); bind("fn", el => cd.fn = el.value.trim()); bind("starter", el => cd.starter = el.value);
      $("#trybtn").onclick = async () => {
        const out = $("#tryout");
        try {
          const tests = [...parseTests($('[name="vis"]').value, false, "Örnek testler"), ...parseTests($('[name="hid"]').value, true, "Gizli testler")];
          out.innerHTML = `<span class="spin"></span> Çalıştırılıyor…`;
          const r = await Runner.run({ lang: cd.lang, code: $("#sol").value, fn: cd.fn, tests: tests.map(t => ({ ...t, h: false })), onStatus: m => out.textContent = m });
          if (r.error) { out.innerHTML = `<span class="bad">⚠ ${esc(r.error.split("\n").pop())}</span>`; return; }
          const bad = r.results.map((x, i) => x.ok ? null : `Test ${i + 1}: beklenen ${x.expected}, çıktı ${x.error || x.got}`).filter(Boolean);
          out.innerHTML = bad.length ? `<span class="bad">✗ ${bad.length} test başarısız</span><br><small>${esc(bad.join(" · "))}</small>` : `<span class="good">✓ ${r.results.length} testin hepsi geçti</span>`;
        } catch (e) { out.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
      };
    }

    // Soru oluşturucu: withChoices=false ise yalnızca soru metinleri (açık uçlu).
    function qBuilder(host, qs, withChoices) {
      const draw = () => {
        host.innerHTML = `<h3>Sorular <small class="mut">(${qs.length})</small></h3>` + qs.map((q, i) => `
          <div class="qb" data-i="${i}">
            <div class="qb-h"><b>${i + 1}.</b><textarea rows="2" data-f="text" placeholder="Soru metni">${esc(q.text)}</textarea>
              <span class="qb-a"><button type="button" class="icon sm" data-a="up" ${i === 0 ? "disabled" : ""} aria-label="Yukarı">↑</button><button type="button" class="icon sm" data-a="down" ${i === qs.length - 1 ? "disabled" : ""} aria-label="Aşağı">↓</button><button type="button" class="icon sm danger" data-a="delq" ${qs.length === 1 ? "disabled" : ""} aria-label="Soruyu sil">🗑</button></span></div>
            ${withChoices ? `<div class="opts">${q.options.map((o, j) => `
              <div class="optrow ${q.correct === j ? "is-correct" : ""}"><label title="Doğru cevap olarak işaretle"><input type="radio" name="c${i}" data-j="${j}" ${q.correct === j ? "checked" : ""}><span class="sr">Doğru</span></label>
                <input data-o="${j}" value="${esc(o)}" placeholder="Seçenek ${j + 1}">
                <button type="button" class="icon sm" data-a="delo" data-j="${j}" ${q.options.length <= 2 ? "disabled" : ""} aria-label="Seçeneği sil">✕</button></div>`).join("")}
              ${q.options.length < 6 ? `<button type="button" class="ghost sm" data-a="addo">＋ Seçenek</button>` : ""}
              <p class="mut small hint-c">${q.correct === null || q.correct === undefined ? "⚠ Doğru cevabı soldaki daireden işaretle." : "✓ Doğru cevap işaretli."}</p></div>` : ""}
          </div>`).join("") + `<button type="button" class="ghost" data-a="addq">＋ Soru ekle</button>`;
      };
      host.oninput = e => {
        const box = e.target.closest(".qb"); if (!box) return;
        const q = qs[box.dataset.i];
        if (e.target.dataset.f === "text") q.text = e.target.value;
        if (e.target.dataset.o !== undefined) q.options[e.target.dataset.o] = e.target.value;
      };
      host.onchange = e => {
        if (e.target.type !== "radio") return;
        const box = e.target.closest(".qb"); qs[box.dataset.i].correct = Number(e.target.dataset.j); draw();
      };
      host.onclick = e => {
        const b = e.target.closest("button[data-a]"); if (!b) return;
        const box = b.closest(".qb"), i = box ? Number(box.dataset.i) : -1, q = qs[i];
        switch (b.dataset.a) {
          case "addq": qs.push(withChoices ? blankQ() : { text: "" }); break;
          case "delq": qs.splice(i, 1); break;
          case "up": [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; break;
          case "down": [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; break;
          case "addo": q.options.push(""); break;
          case "delo": { const j = Number(b.dataset.j); q.options.splice(j, 1); if (q.correct === j) q.correct = null; else if (q.correct > j) q.correct--; break; }
        }
        draw();
        if (b.dataset.a === "addq") { const tas = $$("textarea[data-f]", host); tas[tas.length - 1].focus(); }
      };
      draw();
    }

    renderSpecific();
    $("#edf").onsubmit = async e => {
      e.preventDefault();
      const err = $(".ferr");
      try {
        const f = e.target;
        const out = { ...d, title: f.title.value, description: f.description.value };
        if (d.type === "video") out.youtubeId = UI.parseYouTube(d.youtubeId) || "";
        if (d.type === "assignment" && d.kind === "code")
          out.code = { ...d.code, tests: [...parseTests($('[name="vis"]').value, false, "Örnek testler"), ...parseTests($('[name="hid"]').value, true, "Gizli testler")] };
        if (out.questions && !(["quiz", "exam"].includes(d.type) || ["test", "open"].includes(d.kind))) delete out.questions;
        await API.saveItem(cid, out);
        UI.toast("Kaydedildi ✔", "good");
        App.go(`#/t/${cid}`);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: "center", behavior: "smooth" }); }
    };
  }

  // ---------- Not defteri ----------
  App.route("#/t/:cid/grades", ["teacher"], async ({ cid }, main) => {
    const [c, gb] = await Promise.all([API.getCourse(cid), API.gradebook(cid)]);
    document.title = `${c.title} · Not Defteri`;
    main.innerHTML = courseTabs(c, "grades") + gradebookHtml(gb, true);
    $("#csv").onclick = () => exportCsv(gb);
  });

  function gradebookHtml(gb, links) {
    const cell = (x, col) => x.state === "none" ? `<span class="mut">–</span>`
      : x.state === "pending" ? (links ? `<a class="tag wait" href="#/t/sub/${x.subId}" title="Otomatik öneri: ${x.auto ?? "yok"}">⏳ Bekliyor</a>` : `<span class="tag wait">⏳</span>`)
      : `${links && x.subId ? `<a href="#/t/sub/${x.subId}" class="score ${x.pass ? "ok" : "bad"}">` : `<span class="score ${x.pass ? "ok" : "bad"}">`}${x.score}${links && x.subId ? "</a>" : "</span>"}${x.attempts > 1 ? `<small class="mut"> (${x.attempts}×)</small>` : ""}`;
    return `<section class="panel">
      <div class="ph-row"><h2>Not Defteri</h2><button class="ghost sm" id="csv">⬇ CSV olarak indir</button></div>
      <div class="tablewrap"><table class="tbl gb">
        <thead><tr><th>Öğrenci</th><th>İlerleme</th>${gb.cols.map(col => `<th title="${esc(col.title)}">${TYPE[col.type][0]} ${esc(col.title)}<small>geçme ${col.passPct}</small></th>`).join("")}</tr></thead>
        <tbody>${gb.rows.map(r => `<tr><td><b>${esc(r.student.name)}</b>${r.student.active ? "" : ` <span class="tag bad">kapalı</span>`}</td>
          <td><div class="pbar sm"><i style="width:${r.progress.pct}%"></i></div><small class="mut">${r.progress.done}/${r.progress.total}</small></td>
          ${r.cells.map((x, i) => `<td class="num">${cell(x, gb.cols[i])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${gb.cols.length + 2}" class="empty">Bu derse kayıtlı öğrenci yok.</td></tr>`}</tbody>
      </table></div>
      <p class="mut small">Quizlerde en yüksek deneme gösterilir. Yeşil: geçti, kırmızı: geçemedi. ⏳ işaretli teslimleri açıp notlandırabilirsin.</p>
    </section>`;
  }
  function exportCsv(gb) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Öğrenci", "Kullanıcı adı", "İlerleme %", ...gb.cols.map(c => c.title)];
    const lines = gb.rows.map(r => [r.student.name, r.student.username, r.progress.pct, ...r.cells.map(x => x.state === "graded" ? x.score : x.state === "pending" ? "bekliyor" : "")]);
    UI.download(new Blob(["﻿" + [head, ...lines].map(l => l.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }), `${gb.course.title} - notlar.csv`);
  }
  window.KK_gradebookHtml = gradebookHtml;
  window.KK_exportCsv = exportCsv;

  // ---------- Değerlendirme kutusu ----------
  async function inbox(main) {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const courseId = params.get("c") || undefined, all = params.get("hepsi") === "1";
    const subs = await API.listSubmissions({ courseId, status: all ? undefined : "pending" });
    document.title = "Değerlendirme · Kodla & Keşfet";
    const qs = x => `#/t/inbox?${new URLSearchParams({ ...(courseId ? { c: courseId } : {}), ...x })}`;
    main.innerHTML = `
      <div class="crumbs"><a href="${courseId ? `#/t/${courseId}` : "#/"}">← ${courseId ? "Ders" : "Derslerim"}</a></div>
      <section class="panel">
        <div class="ph-row"><h2>Ödev ve sınav değerlendirme</h2>
          <div class="seg"><a href="${qs({})}" class="${all ? "" : "on"}">Bekleyenler</a><a href="${qs({ hepsi: "1" })}" class="${all ? "on" : ""}">Tümü</a></div></div>
        <div class="list">${subs.map(s => `
          <a class="item" href="#/t/sub/${s.id}">
            <span class="fi">${TYPE[s.itemType][0]}</span>
            <span class="t"><b>${esc(s.studentName)} · ${esc(s.itemTitle)}</b><small>${esc(s.courseTitle)} · ${fmtDate(s.submittedAt)}</small></span>
            ${s.status === "approved" ? `<span class="tag ok">Not: ${s.score}</span>` : `<span class="tag wait">⏳ Bekliyor${s.autoScore != null ? ` · öneri ${s.autoScore}` : ""}</span>`}
          </a>`).join("") || `<p class="empty">${all ? "Henüz teslim yok." : "🎉 Bekleyen değerlendirme yok."}</p>`}</div>
      </section>`;
  }

  // ---------- Teslim değerlendirme ----------
  App.route("#/t/sub/:sid", ["teacher"], async ({ sid }, main) => {
    const { sub: s, item: it, course: c, student, history } = await API.getSubmission(sid);
    document.title = `${student.name} · ${it.title}`;
    const ro = c.status !== "active";
    let body = "";
    if (it.type === "exam" || it.kind === "test") {
      const n = s.detail.filter(x => x.ok).length;
      body = `<p><b>${it.questions.length} sorudan ${n} doğru</b> · otomatik not: ${s.autoScore}</p>` + it.questions.map((q, i) => `
        <div class="qrev"><p><b>${i + 1}.</b> ${esc(q.text)}</p>${q.options.map((o, j) => `<div class="opt ${j === q.correct ? "right" : s.answers[i] === j ? "wrong" : ""}">${j === s.answers[i] ? "👉 " : ""}${esc(o)}${j === q.correct ? " ✓" : ""}</div>`).join("")}</div>`).join("");
    } else if (it.kind === "open") {
      body = it.questions.map((q, i) => `<div class="qrev"><p><b>${i + 1}. ${esc(q.text)}</b></p><blockquote>${nl2br(s.answers[i])}</blockquote></div>`).join("");
    } else if (it.kind === "file") {
      body = `<p>📄 <a href="#" id="dl">${esc(s.file.name)}</a> <span class="mut">(${fmtSize(s.file.size)})</span></p>${s.note ? `<blockquote>${nl2br(s.note)}</blockquote>` : ""}<div id="prev"></div>`;
    } else if (it.kind === "code") {
      const pass = (s.detail || []).filter(x => x.ok).length;
      body = `<p><b>${s.detail.length} testten ${pass} tanesi geçti</b> · otomatik not: ${s.autoScore}</p>
        ${s.error ? `<pre class="err">${esc(s.error)}</pre>` : `<div class="testdots">${s.detail.map((x, i) => `<span class="${x.ok ? "ok" : "bad"}" title="${x.hidden ? "Gizli test" : "Örnek test"} ${i + 1}${x.error ? ": " + esc(x.error) : ""}">${x.ok ? "✓" : "✗"}${x.hidden ? "🔒" : ""}</span>`).join("")}</div>`}
        <pre class="codeview">${esc(s.code)}</pre>`;
    }
    main.innerHTML = `
      <div class="crumbs"><a href="#/t/inbox?c=${c.id}">← Değerlendirme</a><a href="#/t/${c.id}/grades">Not Defteri</a></div>
      <div class="sub-layout">
        <section class="panel">
          <p class="kicker">${TYPE[it.type][0]} ${TYPE[it.type][1]}${it.kind ? ` · ${KIND[it.kind]}` : ""} · ${esc(c.title)}</p>
          <h1>${esc(it.title)}</h1>
          <p class="mut">${esc(student.name)} · ${fmtDate(s.submittedAt)} tarihinde teslim etti</p>
          ${it.description ? `<p class="desc">${nl2br(it.description)}</p>` : ""}
          <hr>${body}
        </section>
        <aside class="panel grade">
          <h2>Notlandır</h2>
          <form id="gf">
            <label>Not (0–100)<input name="score" type="number" min="0" max="100" step="0.5" required value="${s.score ?? s.autoScore ?? ""}" ${ro ? "disabled" : ""}></label>
            <p class="mut small">Geçme notu: ${it.passPct}${it.blocking ? " · 🔐 bu not, öğrencinin ilerlemesini belirler" : ""}</p>
            <label>Geri bildirim<textarea name="fb" rows="4" placeholder="Öğrenciye kısa bir not…" ${ro ? "disabled" : ""}>${esc(s.feedback || "")}</textarea></label>
            <button type="submit" class="block" ${ro ? "disabled" : ""}>${s.status === "approved" ? "Notu güncelle" : "Onayla ve öğrenciye göster"}</button>
          </form>
          ${s.status === "approved" ? `<p class="tag ok">✓ ${fmtDate(s.approvedAt)} tarihinde onaylandı</p>` : `<p class="mut small">Onaylayana kadar öğrenci bu notu görmez.</p>`}
          ${history.length > 1 ? `<h3>Teslim geçmişi</h3><ul class="hist">${history.map(h => `<li class="${h.id === s.id ? "cur" : ""}"><a href="#/t/sub/${h.id}">${fmtDate(h.submittedAt)}</a> · ${h.status === "approved" ? `not ${h.score}` : "bekliyor"}</li>`).join("")}</ul>` : ""}
        </aside>
      </div>`;
    const dl = $("#dl");
    if (dl) {
      const f = await API.getFile(s.file.id).catch(() => null);
      dl.onclick = e => { e.preventDefault(); if (f) UI.download(f.blob, f.name); else UI.toast("Dosya bu tarayıcıda bulunamadı.", "bad"); };
      if (f && /^image\//.test(f.type)) { const url = URL.createObjectURL(f.blob); $("#prev").innerHTML = `<img class="preview" src="${url}" alt="${esc(f.name)}">`; }
    }
    $("#gf").onsubmit = async e => {
      e.preventDefault();
      try {
        await API.gradeSubmission(sid, { score: e.target.score.value, feedback: e.target.fb.value });
        UI.toast("Not onaylandı; öğrenci artık görebilir ✔", "good");
        const next = (await API.listSubmissions({ status: "pending" }))[0];
        App.go(next ? `#/t/sub/${next.id}` : `#/t/inbox?c=${c.id}`);
      } catch (ex) { UI.toast(ex.message, "bad"); }
    };
  });
})();
