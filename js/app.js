// Uygulama kabuğu: yönlendirme, üst menü, giriş ekranı, tema.
(() => {
  const { $, esc, ROLE } = UI;
  const routes = [];
  const App = {
    user: null,
    // pattern: "#/t/:cid" biçiminde; roles: izin verilen roller (boşsa hepsi)
    route(pattern, roles, handler) {
      const keys = [];
      const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
      routes.push({ re, keys, roles, handler });
    },
    go(h) { if (location.hash === h) render(); else location.hash = h; },
    reload: () => render(),
    main: () => $("#app"),
  };
  window.App = App;

  // ---------- Tema ----------
  const THEME = "kk-lms.theme";
  const getTheme = () => { try { return localStorage.getItem(THEME); } catch { return null; } };
  const isDark = () => { const t = getTheme(); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  function applyTheme() {
    const t = getTheme();
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const b = $("#themeBtn"); if (b) { b.textContent = isDark() ? "☀️" : "🌙"; b.title = isDark() ? "Açık tema" : "Koyu tema"; }
  }
  function toggleTheme() { try { localStorage.setItem(THEME, isDark() ? "light" : "dark"); } catch {} applyTheme(); }

  // ---------- Üst menü ----------
  function header(user, pending) {
    const links = !user ? [] : user.role === "admin"
      ? [["#/", "Genel Bakış"], ["#/admin/users", "Kullanıcılar"], ["#/admin/courses", "Dersler"]]
      : user.role === "teacher"
        ? [["#/", "Derslerim"], ["#/t/inbox", `Değerlendirme${pending ? ` <b class="count">${pending}</b>` : ""}`]]
        : [["#/", "Derslerim"], ["arena.html", "Kod Arenası"]];
    const here = location.hash || "#/";
    $("#top").innerHTML = `
      <a class="brand" href="#/"><span>💜</span> Kodla &amp; Keşfet</a>
      ${user ? `<nav class="mainnav">${links.map(([h, t]) => `<a href="${h}" class="${(h === "#/" ? here === "#/" : here.startsWith(h)) ? "on" : ""}">${t}</a>`).join("")}</nav>` : "<span></span>"}
      <div class="right">
        ${user ? `<div class="who"><span class="avatar">${esc(user.name[0])}</span><span class="wn"><b>${esc(user.name)}</b><small>${ROLE[user.role]}</small></span>
          <div class="menu"><button id="pwBtn" class="ghost sm">Şifre değiştir</button><button id="outBtn" class="ghost sm">Çıkış yap</button></div></div>` : ""}
        <button id="themeBtn" class="icon" aria-label="Temayı değiştir"></button>
      </div>`;
    $("#themeBtn").onclick = toggleTheme;
    applyTheme();
    if (!user) return;
    $(".who").onclick = e => { if (!e.target.closest(".menu")) $(".who").classList.toggle("open"); };
    document.addEventListener("click", e => { const w = $(".who"); if (w && !w.contains(e.target)) w.classList.remove("open"); }, { once: true, capture: true });
    $("#outBtn").onclick = async () => { await API.logout(); App.go("#/login"); };
    $("#pwBtn").onclick = () => UI.modal({
      title: "Şifre değiştir", submit: "Değiştir",
      body: `<label>Mevcut şifre<input type="password" name="o" required autocomplete="current-password"></label>
             <label>Yeni şifre<input type="password" name="n" required minlength="6" autocomplete="new-password"></label>`,
      onSubmit: async f => { await API.changePassword(f.o.value, f.n.value); UI.toast("Şifren değiştirildi ✔", "good"); },
    });
  }

  // ---------- Giriş ----------
  function loginView() {
    document.title = "Giriş · Kodla & Keşfet";
    const demo = window.KK_DEMO_ACCOUNTS;
    App.main().innerHTML = `
    <div class="login">
      <section class="pitch">
        <h1>Yapay zeka ve yazılım dünyasına <span>ilk adım</span> 💜</h1>
        <p>Kısa videolar izle, quizlerle kendini sına, ödevlerini teslim et. Her adımı tamamladıkça bir sonraki bölümün kilidi açılır.</p>
        <ul class="feat">
          <li><b>🎬</b> En fazla 8 dakikalık videolar</li>
          <li><b>📝</b> Anında sonuç veren quizler</li>
          <li><b>🐍</b> Tarayıcıda çalışan kod ödevleri</li>
          <li><b>🏁</b> Ders sonu değerlendirme</li>
        </ul>
      </section>
      <section class="panel loginbox">
        <h2>Giriş yap</h2>
        <form id="lf">
          <label>Kullanıcı adı<input name="u" autocomplete="username" required autocapitalize="none"></label>
          <label>Şifre<input name="p" type="password" autocomplete="current-password" required></label>
          <p class="ferr" hidden></p>
          <button type="submit" class="block">Giriş yap</button>
        </form>
        <div class="demo">
          <p class="mut small"><b>Demo hesapları</b>: tıklayınca giriş yapılır.</p>
          <div class="demolist">${demo.map(a => `<button class="ghost demo-acc" data-u="${esc(a.username)}" data-p="${esc(a.password)}"><span class="avatar ${a.role}">${esc(a.name[0])}</span><span><b>${esc(a.name)}</b><small>${ROLE[a.role]} · ${esc(a.username)} / ${esc(a.password)}</small></span></button>`).join("")}</div>
        </div>
      </section>
    </div>`;
    const doLogin = async (u, p) => {
      const err = $(".ferr");
      try { await API.login(u, p); App.go("#/"); }
      catch (e) { err.textContent = e.message; err.hidden = false; }
    };
    $("#lf").onsubmit = e => { e.preventDefault(); doLogin(e.target.u.value, e.target.p.value); };
    document.querySelectorAll(".demo-acc").forEach(b => b.onclick = () => doLogin(b.dataset.u, b.dataset.p));
  }

  // ---------- Yönlendirme ----------
  let rendering = 0;
  async function render() {
    const my = ++rendering;
    let user;
    try { user = await API.init(); } catch (e) { App.main().innerHTML = `<div class="panel err">${esc(e.message)}</div>`; return; }
    if (my !== rendering) return;
    App.user = user;
    const hash = location.hash || "#/";
    if (!user) { header(null); if (hash !== "#/login") { location.replace("#/login"); return render(); } return loginView(); }
    if (hash === "#/login") { location.replace("#/"); return render(); }
    let pending = 0;
    if (user.role === "teacher") { try { pending = (await API.listSubmissions({ status: "pending" })).length; } catch {} }
    header(user, pending);
    const main = App.main();
    for (const r of routes) {
      const m = hash.split("?")[0].match(r.re);
      if (!m || (r.roles.length && !r.roles.includes(user.role))) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      main.innerHTML = `<p class="mut loading"><span class="spin"></span> Yükleniyor…</p>`;
      try { await r.handler(params, main); }
      catch (e) {
        if (!(e instanceof API.ApiError)) console.error(e);
        if (/Oturum/.test(e.message)) { await API.logout(); return App.go("#/login"); }
        main.innerHTML = `<div class="panel empty-state"><div class="big">🙈</div><h2>Bir sorun oluştu</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Ana sayfaya dön</a></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
    location.replace("#/"); render();
  }

  window.addEventListener("hashchange", render);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  // Görünümler (views-*.js) yüklendikten sonra başlat.
  window.addEventListener("DOMContentLoaded", render);
})();
