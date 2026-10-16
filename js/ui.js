// Arayüz yardımcıları: DOM kısayolları, bildirimler, konfeti, modal, YouTube ayrıştırma, kod editörü.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl2br = s => esc(s).replace(/\n/g, "<br>");

  const fmtDate = t => t ? new Date(t).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const fmtSize = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const ROLE = { admin: "Yönetici", teacher: "Öğretmen", student: "Öğrenci" };
  const TYPE = { video: ["🎬", "Video"], quiz: ["📝", "Quiz"], assignment: ["📎", "Ödev"], exam: ["🏁", "Sınav"] };
  const KIND = { test: "Test", open: "Açık uçlu", file: "Dosya yükleme", code: "Kod" };

  // YouTube bağlantısından (watch, youtu.be, embed, shorts) ya da çıplak kimlikten video kimliğini çıkarır.
  function parseYouTube(s) {
    s = String(s || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (!/(^|\.)youtube(-nocookie)?\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
      if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12) || null;
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
      return m ? m[2] : null;
    } catch { return null; }
  }
  window.KK_parseYouTube = parseYouTube;

  // Videoyu bağlantısı görünmeyecek şekilde gömer (çerezsiz alan adı, ilgili video önerileri kapalı).
  const ytEmbed = id => `<div class="vidwrap"><iframe class="vid" src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&disablekb=0" title="Ders videosu" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;

  function toast(msg, kind = "") {
    const t = Object.assign(document.createElement("div"), { className: `toast ${kind}`, textContent: msg, role: "status" });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  function celebrate() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div"); box.className = "confetti";
    const colors = ["var(--pr)", "var(--pr2)", "var(--ok)", "#f5b400", "#3aa0ff"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("i");
      s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * .3}s;animation-duration:${1.2 + Math.random()}s;transform:rotate(${Math.random() * 360}deg)`;
      box.appendChild(s);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  }

  // Basit modal: içerik HTML'i ve bir onSubmit(form) fonksiyonu alır. onSubmit hata fırlatırsa mesaj gösterilir.
  function modal({ title, body, submit = "Kaydet", onSubmit, wide = false }) {
    const wrap = document.createElement("div");
    wrap.className = "modal-bg";
    wrap.innerHTML = `<form class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h2>${esc(title)}</h2><button type="button" class="icon x" aria-label="Kapat">✕</button></header>
      <div class="mbody">${body}</div>
      <p class="ferr" hidden></p>
      <footer><button type="button" class="ghost cancel">Vazgeç</button>${onSubmit ? `<button type="submit">${esc(submit)}</button>` : ""}</footer>
    </form>`;
    const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("mousedown", e => { if (e.target === wrap) close(); });
    $(".x", wrap).onclick = close; $(".cancel", wrap).onclick = close;
    const form = $("form", wrap);
    form.onsubmit = async e => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form); btn.disabled = true;
      try { await onSubmit(form); close(); }
      catch (err) { const p = $(".ferr", form); p.textContent = err.message; p.hidden = false; btn.disabled = false; }
    };
    document.body.appendChild(wrap);
    const first = $("input, select, textarea", form); if (first) first.focus();
    return { close, el: wrap };
  }

  // Kod editörü: CodeMirror yüklüyse onu, değilse düz metin alanını kullanır.
  function makeEditor(host, value, lang, onChange = () => {}, keys = {}) {
    if (window.CodeMirror) {
      const cm = CodeMirror(host, {
        value, mode: lang === "py" ? "python" : "javascript", lineNumbers: true,
        indentUnit: lang === "py" ? 4 : 2, tabSize: 4, matchBrackets: true, autoCloseBrackets: true,
        extraKeys: {
          Tab: c => c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection(" ".repeat(c.getOption("indentUnit"))),
          "Shift-Tab": c => c.indentSelection("subtract"),
          ...(keys.run ? { "Ctrl-Enter": keys.run, "Cmd-Enter": keys.run } : {}),
        },
      });
      cm.on("change", () => onChange(cm.getValue()));
      setTimeout(() => cm.refresh(), 0);
      return { get: () => cm.getValue(), set: v => cm.setValue(v), focus: () => cm.focus() };
    }
    const ta = document.createElement("textarea");
    ta.className = "fallback"; ta.value = value; ta.spellcheck = false; ta.setAttribute("aria-label", "Kod editörü");
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); ta.setRangeText(" ".repeat(lang === "py" ? 4 : 2), ta.selectionStart, ta.selectionEnd, "end"); onChange(ta.value); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && keys.run) { e.preventDefault(); keys.run(); }
    });
    ta.oninput = () => onChange(ta.value);
    host.appendChild(ta);
    return { get: () => ta.value, set: v => { ta.value = v; }, focus: () => ta.focus() };
  }

  // Test değerlerini dile uygun gösterir (Python: True/None).
  function showVal(v, lang) {
    const py = lang === "py";
    const rec = x => x === null ? (py ? "None" : "null") : typeof x === "boolean" ? (py ? (x ? "True" : "False") : String(x))
      : Array.isArray(x) ? "[" + x.map(rec).join(", ") + "]" : typeof x === "object" ? "{" + Object.entries(x).map(([k, w]) => JSON.stringify(k) + ": " + rec(w)).join(", ") + "}" : JSON.stringify(x);
    return rec(v);
  }

  function download(blob, name) {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.UI = { $, $$, esc, nl2br, fmtDate, fmtSize, ROLE, TYPE, KIND, parseYouTube, ytEmbed, toast, celebrate, modal, makeEditor, showVal, download };
})();
