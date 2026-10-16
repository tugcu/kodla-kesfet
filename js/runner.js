// Kullanıcı kodunu ana sayfadan yalıtılmış bir Web Worker içinde çalıştırır.
// Worker kaynak kodu Blob olarak oluşturulur; böylece uygulama file:// ile
// açıldığında da çalışır. Sonsuz döngüye giren worker zaman aşımında sonlandırılır.
window.Runner = (() => {
  const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";

  function workerMain() {
    const MAX_LOG = 200;
    let logs = [], muted = false, mutedHit = false;
    // Gizli testler çalışırken çıktı bastırılır; aksi hâlde girdileri konsoldan okunabilirdi.
    const log = s => { if (muted) { mutedHit = true; return; } if (logs.length < MAX_LOG) logs.push(String(s)); else if (logs.length === MAX_LOG) logs.push("… (çıktı kısaltıldı)"); };

    function show(v, lang) {
      const py = lang === "py";
      const rec = x => {
        if (x === undefined) return py ? "None" : "undefined";
        if (x === null) return py ? "None" : "null";
        if (typeof x === "boolean") return py ? (x ? "True" : "False") : String(x);
        if (typeof x === "string") return JSON.stringify(x);
        if (typeof x === "number" || typeof x === "bigint") return String(x);
        if (typeof x === "function") return "[Function]";
        if (Array.isArray(x)) return "[" + x.map(rec).join(", ") + "]";
        if (x instanceof Set) return (py ? "{" : "Set {") + [...x].map(rec).join(", ") + "}";
        if (x instanceof Map) return "Map {" + [...x].map(([k, w]) => rec(k) + " => " + rec(w)).join(", ") + "}";
        if (typeof x === "object") return "{" + Object.keys(x).map(k => JSON.stringify(k) + ": " + rec(x[k])).join(", ") + "}";
        return String(x);
      };
      try { return rec(v); } catch { return String(v); }
    }

    function eq(a, b) {
      if (typeof a === "number" && typeof b === "number") return a === b || Math.abs(a - b) < 1e-6;
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
      if (Object.getPrototypeOf(a) !== Object.prototype && Object.getPrototypeOf(a) !== null) return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
    }

    const fmtArgs = (args, lang) => args.map(a => show(a, lang)).join(", ");

    function runJs({ code, fn, tests }) {
      const fmt = a => a.map(x => typeof x === "string" ? x : show(x, "js")).join(" ");
      self.console = { log: (...a) => log(fmt(a)), info: (...a) => log(fmt(a)), warn: (...a) => log("⚠ " + fmt(a)), error: (...a) => log("✖ " + fmt(a)), table: (...a) => log(fmt(a)) };
      let f;
      try {
        f = new Function(`"use strict";\n${code}\n;return typeof ${fn} === "function" ? ${fn} : undefined;`)();
      } catch (e) {
        return { error: `${e.name}: ${e.message}` };
      }
      if (typeof f !== "function") return { error: `"${fn}" adında bir fonksiyon bulunamadı. Fonksiyonun adını değiştirmediğinden emin ol.` };
      return {
        results: tests.map(t => {
          muted = !!t.h;
          const t0 = performance.now();
          try {
            const got = f(...structuredClone(t.in));
            return { ok: eq(got, t.out), got: show(got, "js"), ms: performance.now() - t0 };
          } catch (e) {
            return { ok: false, error: `${e && e.name || "Hata"}: ${e && e.message || e}`, ms: performance.now() - t0 };
          }
        }),
      };
    }

    let pyodide = null;
    async function loadPy(url) {
      if (pyodide) return pyodide;
      self.postMessage({ type: "status", msg: "Python ortamı yükleniyor (ilk seferde birkaç saniye sürebilir)…" });
      importScripts(url);
      pyodide = await self.loadPyodide();
      pyodide.setStdout({ batched: s => log(s) });
      pyodide.setStderr({ batched: s => log("✖ " + s) });
      pyodide.runPython(`
import json as __kk_json
def __kk_call(__f, __args):
    __r = __f(*__kk_json.loads(__args))
    if isinstance(__r, (set, frozenset)):
        return __kk_json.dumps({"__kk_set__": repr(__r)})
    return __kk_json.dumps(__r, ensure_ascii=False, default=lambda o: {"__kk_repr__": repr(o)})
`);
      return pyodide;
    }

    const pyErr = e => {
      const lines = String(e && e.message || e).trim().split("\n");
      // Pyodide'ın kendi iç çerçevelerini at, kullanıcının kodundaki satırları bırak.
      const i = lines.findIndex(l => l.includes('File "<exec>"'));
      return (i > 0 ? ["Traceback (most recent call last):", ...lines.slice(i)] : lines).filter(l => !l.includes("in __kk_call")).join("\n");
    };

    async function runPy({ code, fn, tests, pyodideUrl }) {
      const py = await loadPy(pyodideUrl);
      self.postMessage({ type: "started" });
      const ns = py.globals.get("dict")();
      try {
        py.runPython(code, { globals: ns });
      } catch (e) {
        ns.destroy();
        return { error: pyErr(e) };
      }
      const f = ns.get(fn);
      if (!f || typeof f !== "function") {
        ns.destroy();
        return { error: `"${fn}" adında bir fonksiyon bulunamadı. Fonksiyonun adını değiştirmediğinden emin ol.` };
      }
      const call = py.globals.get("__kk_call");
      const results = tests.map(t => {
        muted = !!t.h;
        const t0 = performance.now();
        try {
          const got = JSON.parse(call(f, JSON.stringify(t.in)));
          if (got && typeof got === "object" && !Array.isArray(got) && ("__kk_set__" in got || "__kk_repr__" in got))
            return { ok: false, got: got.__kk_set__ || got.__kk_repr__, ms: performance.now() - t0 };
          return { ok: eq(got, t.out), got: show(got, "py"), ms: performance.now() - t0 };
        } catch (e) {
          return { ok: false, error: pyErr(e), ms: performance.now() - t0 };
        }
      });
      muted = false;
      f.destroy(); call.destroy(); ns.destroy();
      return { results };
    }

    self.onmessage = async e => {
      const job = e.data;
      logs = []; muted = false; mutedHit = false;
      let out;
      try {
        if (job.lang === "py") out = await runPy(job);
        else { self.postMessage({ type: "started" }); out = runJs(job); }
      } catch (err) {
        out = { error: String(err && err.message || err) };
      }
      if (out.results) out.results.forEach((r, i) => {
        r.hidden = !!job.tests[i].h;
        if (!r.hidden) { r.call = `${job.fn}(${fmtArgs(job.tests[i].in, job.lang)})`; r.expected = show(job.tests[i].out, job.lang); }
        else { delete r.got; if (r.error) r.error = r.error.split("\n").pop(); }
      });
      muted = false;
      if (mutedHit) logs.push("(gizli testler sırasında üretilen çıktı gösterilmez)");
      self.postMessage({ type: "done", id: job.id, logs, ...out });
    };
  }

  const src = `(${workerMain.toString()})()`;
  const blobUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const workers = {};
  let seq = 0;

  const getWorker = lang => workers[lang] || (workers[lang] = new Worker(blobUrl));
  const kill = lang => { if (workers[lang]) { workers[lang].terminate(); delete workers[lang]; } };

  // Kullanıcı kodunu testlere karşı çalıştırır.
  // onStatus: Python yüklenirken gösterilecek durum mesajları için geri çağırma.
  function run({ lang, code, fn, tests, timeoutMs = 4000, onStatus = () => {} }) {
    return new Promise(resolve => {
      const w = getWorker(lang), id = ++seq;
      let timer = null;
      // Python ilk yüklemesi uzun sürebilir; yükleme için ayrı, cömert bir süre tanı.
      const loadTimer = setTimeout(() => finish({ error: "Python ortamı yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.", logs: [] }), 90000);
      function finish(res) {
        clearTimeout(timer); clearTimeout(loadTimer);
        w.removeEventListener("message", onMsg);
        w.removeEventListener("error", onErr);
        if (res.timeout || res.fatal) kill(lang);
        resolve(res);
      }
      function onMsg(e) {
        const m = e.data;
        if (m.type === "status") onStatus(m.msg);
        else if (m.type === "started") {
          clearTimeout(loadTimer);
          timer = setTimeout(() => finish({ timeout: true, error: `Zaman aşımı: kodun ${timeoutMs / 1000} saniye içinde bitmedi. Sonsuz döngü ya da çok yavaş bir algoritma olabilir.`, logs: [] }), timeoutMs);
        } else if (m.type === "done" && m.id === id) finish(m);
      }
      function onErr(e) {
        e.preventDefault();
        finish({ fatal: true, error: e.message || "Çalıştırma ortamında beklenmeyen bir hata oluştu.", logs: [] });
      }
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      w.postMessage({ id, lang, code, fn, tests, pyodideUrl: PYODIDE_URL });
    });
  }

  return { run };
})();
