// Yönetici görünümleri: genel bakış, kullanıcılar, dersler ve ders üyelikleri.
(() => {
  const { $, $$, esc, fmtDate, ROLE } = UI;

  App.route("#/", ["admin"], async (_, main) => {
    document.title = "Genel Bakış · Kodla & Keşfet";
    const [users, courses] = await Promise.all([API.listUsers(), API.listCourses()]);
    const by = r => users.filter(u => u.role === r);
    main.innerHTML = `
      <section class="hello"><h1>Yönetim paneli</h1><p class="mut">Hesapları, dersleri ve ders atamalarını buradan yönet.</p></section>
      <div class="statgrid">
        <a class="stat" href="#/admin/users"><b>${by("student").length}</b><span>Öğrenci</span></a>
        <a class="stat" href="#/admin/users"><b>${by("teacher").length}</b><span>Öğretmen</span></a>
        <a class="stat" href="#/admin/courses"><b>${courses.filter(c => c.status === "active").length}</b><span>Aktif ders</span></a>
        <a class="stat" href="#/admin/users"><b>${users.filter(u => !u.active).length}</b><span>Kapalı hesap</span></a>
      </div>
      <section class="panel">
        <div class="ph-row"><h2>Dersler</h2><a class="ghost btnlike sm" href="#/admin/courses">Tümünü yönet →</a></div>
        <div class="list">${courses.map(c => `<a class="item" href="#/admin/course/${c.id}"><span class="fi">📘</span><span class="t"><b>${esc(c.title)}</b><small>${c.teachers.join(", ") || "Öğretmen atanmadı"} · ${c.studentIds.length} öğrenci · ${c.itemCount} içerik</small></span>${c.status === "active" ? `<span class="tag ok">Aktif</span>` : `<span class="tag bad">İptal</span>`}</a>`).join("") || `<p class="empty">Henüz ders yok.</p>`}</div>
      </section>
      <section class="panel data">
        <div><h2>Demo verileri</h2><p class="mut small">Bu sürüm verileri tarayıcıda saklar. Demo hesaplarını ve örnek dersi ilk hâline döndürebilirsin.</p></div>
        <button class="ghost danger" id="reset">Demo verilerini sıfırla</button>
      </section>`;
    $("#reset").onclick = async () => {
      if (!confirm("Tüm kullanıcılar, dersler, teslimler ve yüklenen dosyalar silinip demo verileri yeniden oluşturulacak. Emin misin?")) return;
      await API.resetDemo(); UI.toast("Demo verileri sıfırlandı. Yeniden giriş yap."); App.go("#/login");
    };
  });

  // ---------- Kullanıcılar ----------
  App.route("#/admin/users", ["admin"], async (_, main) => {
    document.title = "Kullanıcılar · Kodla & Keşfet";
    const users = await API.listUsers();
    let filter = "hepsi", q = "";
    main.innerHTML = `
      <section class="panel">
        <div class="ph-row"><h2>Kullanıcılar <small class="mut">(${users.length})</small></h2><button id="newU">＋ Yeni kullanıcı</button></div>
        <div class="filters"><input type="search" id="uq" placeholder="Ad veya kullanıcı adı ara…" aria-label="Ara">
          <div class="seg" id="rf">${[["hepsi", "Tümü"], ["student", "Öğrenciler"], ["teacher", "Öğretmenler"], ["admin", "Yöneticiler"]].map(([k, v]) => `<button data-r="${k}" class="${k === "hepsi" ? "on" : ""}">${v}</button>`).join("")}</div></div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>Ad</th><th>Kullanıcı adı</th><th>Rol</th><th>Durum</th><th>Oluşturulma</th><th></th></tr></thead><tbody id="ub"></tbody></table></div>
      </section>`;
    const draw = () => {
      const k = q.toLocaleLowerCase("tr");
      $("#ub").innerHTML = users.filter(u => (filter === "hepsi" || u.role === filter) && (!k || (u.name + " " + u.username).toLocaleLowerCase("tr").includes(k))).map(u => `
        <tr class="${u.active ? "" : "off"}"><td><span class="avatar ${u.role}">${esc(u.name[0])}</span> <b>${esc(u.name)}</b>${u.id === App.user.id ? ` <small class="mut">(sen)</small>` : ""}</td>
          <td><code>${esc(u.username)}</code></td><td>${ROLE[u.role]}</td>
          <td>${u.active ? `<span class="tag ok">Açık</span>` : `<span class="tag bad">Kapalı</span>`}</td>
          <td class="mut small">${fmtDate(u.createdAt)}</td>
          <td class="acts"><button class="ghost sm" data-ed="${u.id}">Düzenle</button><button class="ghost sm" data-pw="${u.id}">Şifre</button>
            ${u.id === App.user.id ? "" : `<button class="ghost sm ${u.active ? "danger" : ""}" data-tg="${u.id}">${u.active ? "Kapat" : "Aç"}</button>`}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Eşleşen kullanıcı yok.</td></tr>`;
      $$("[data-tg]").forEach(b => b.onclick = async () => {
        const u = users.find(x => x.id === b.dataset.tg);
        if (u.active && !confirm(`${u.name} hesabı kapatılacak; giriş yapamayacak. Verileri silinmez. Devam edilsin mi?`)) return;
        await API.setUserActive(u.id, !u.active); u.active = !u.active; UI.toast(u.active ? "Hesap açıldı" : "Hesap kapatıldı"); draw();
      });
      $$("[data-pw]").forEach(b => b.onclick = () => { const u = users.find(x => x.id === b.dataset.pw); UI.modal({
        title: `Şifre sıfırla: ${u.name}`, submit: "Sıfırla",
        body: `<label>Yeni şifre<input name="p" type="text" minlength="6" required value="${esc(genPw())}"></label><p class="mut small">Yeni şifreyi kullanıcıya ilet.</p>`,
        onSubmit: async f => { await API.resetPassword(u.id, f.p.value); UI.toast("Şifre sıfırlandı ✔", "good"); },
      }); });
      $$("[data-ed]").forEach(b => b.onclick = () => { const u = users.find(x => x.id === b.dataset.ed); UI.modal({
        title: "Kullanıcıyı düzenle",
        body: `<label>Ad soyad<input name="n" required value="${esc(u.name)}"></label><p class="mut small">Kullanıcı adı ve rol değiştirilemez.</p>`,
        onSubmit: async f => { await API.updateUser(u.id, { name: f.n.value }); u.name = f.n.value.trim(); draw(); },
      }); });
    };
    $("#uq").oninput = e => { q = e.target.value; draw(); };
    $$("#rf button").forEach(b => b.onclick = () => { filter = b.dataset.r; $$("#rf button").forEach(x => x.classList.toggle("on", x === b)); draw(); });
    $("#newU").onclick = () => UI.modal({
      title: "Yeni kullanıcı", submit: "Oluştur",
      body: `<label>Ad soyad<input name="n" required></label>
        <label>Kullanıcı adı<input name="u" required pattern="[A-Za-z0-9._\\-]{3,}" autocapitalize="none" spellcheck="false"></label>
        <label>Rol<select name="r"><option value="student">Öğrenci</option><option value="teacher">Öğretmen</option><option value="admin">Yönetici</option></select></label>
        <label>Başlangıç şifresi<input name="p" type="text" minlength="6" required value="${esc(genPw())}"></label>`,
      onSubmit: async f => {
        const u = await API.createUser({ name: f.n.value, username: f.u.value, role: f.r.value, password: f.p.value });
        users.push(u); draw(); UI.toast(`${u.name} oluşturuldu ✔`, "good");
      },
    });
    draw();
  });
  const genPw = () => Math.random().toString(36).slice(2, 6) + Math.floor(1000 + Math.random() * 9000);

  // ---------- Dersler ----------
  App.route("#/admin/courses", ["admin"], async (_, main) => {
    document.title = "Dersler · Kodla & Keşfet";
    const courses = await API.listCourses();
    main.innerHTML = `
      <section class="panel">
        <div class="ph-row"><h2>Dersler</h2><button id="newC">＋ Yeni ders</button></div>
        <div class="list">${courses.map(c => `<a class="item ${c.status === "active" ? "" : "off"}" href="#/admin/course/${c.id}"><span class="fi">📘</span>
          <span class="t"><b>${esc(c.title)}</b><small>${c.teachers.join(", ") || "Öğretmen atanmadı"} · ${c.studentIds.length} öğrenci · ${c.itemCount} içerik</small></span>
          ${c.status === "active" ? `<span class="tag ok">Aktif</span>` : `<span class="tag bad">İptal edildi</span>`}</a>`).join("") || `<p class="empty">Henüz ders yok.</p>`}</div>
      </section>`;
    $("#newC").onclick = () => UI.modal({
      title: "Yeni ders", submit: "Oluştur",
      body: `<label>Ders adı<input name="t" required maxlength="120"></label><label>Açıklama<textarea name="d" rows="3"></textarea></label>`,
      onSubmit: async f => { const c = await API.createCourse({ title: f.t.value, description: f.d.value }); UI.toast("Ders oluşturuldu ✔", "good"); App.go(`#/admin/course/${c.id}`); },
    });
  });

  App.route("#/admin/course/:cid", ["admin"], async ({ cid }, main) => {
    const [c, users, gb] = await Promise.all([API.getCourse(cid), API.listUsers(), API.gradebook(cid)]);
    document.title = `${c.title} · Yönetim`;
    const active = c.status === "active";
    const pick = (role, sel) => users.filter(u => u.role === role).map(u => `
      <label class="pick ${u.active ? "" : "off"}"><input type="checkbox" value="${u.id}" ${sel.includes(u.id) ? "checked" : ""}><span class="avatar ${role}">${esc(u.name[0])}</span><span>${esc(u.name)}<small>${esc(u.username)}${u.active ? "" : " · kapalı"}</small></span></label>`).join("") || `<p class="mut small">Bu rolde kullanıcı yok.</p>`;
    main.innerHTML = `
      <div class="crumbs"><a href="#/admin/courses">← Dersler</a></div>
      <section class="panel">
        <div class="ph-row"><div><h1>${esc(c.title)} ${active ? `<span class="tag ok">Aktif</span>` : `<span class="tag bad">İptal edildi</span>`}</h1><p class="mut">${esc(c.description)}</p></div>
          <div class="row"><button class="ghost sm" id="edC">Düzenle</button><button class="ghost sm ${active ? "danger" : ""}" id="stC">${active ? "Dersi iptal et" : "Dersi yeniden aç"}</button></div></div>
        <p class="mut small">${c.items.length} içerik · içerik ekleme ve notlandırma dersin öğretmeni tarafından yapılır.</p>
      </section>
      <div class="grid2">
        <section class="panel"><h2>Öğretmenler</h2><div class="picks" id="pt">${pick("teacher", c.teacherIds)}</div></section>
        <section class="panel"><h2>Öğrenciler <small class="mut" id="sc"></small></h2><input type="search" id="sq" placeholder="Öğrenci ara…" class="w-full" aria-label="Öğrenci ara"><div class="picks" id="ps">${pick("student", c.studentIds)}</div></section>
      </div>
      <div class="row end sticky-save"><span class="mut small" id="dirty"></span><button id="saveM">Atamaları kaydet</button></div>
      ${window.KK_gradebookHtml(gb, false)}`;
    const count = () => { $("#sc").textContent = `(${$$("#ps input:checked").length} seçili)`; };
    count();
    $$(".picks").forEach(p => p.onchange = () => { count(); $("#dirty").textContent = "Kaydedilmemiş değişiklikler var"; });
    $("#sq").oninput = e => { const k = e.target.value.toLocaleLowerCase("tr"); $$("#ps .pick").forEach(l => l.hidden = !!k && !l.textContent.toLocaleLowerCase("tr").includes(k)); };
    $("#saveM").onclick = async () => {
      await API.setCourseMembers(cid, { teacherIds: $$("#pt input:checked").map(i => i.value), studentIds: $$("#ps input:checked").map(i => i.value) });
      UI.toast("Atamalar kaydedildi ✔", "good"); App.reload();
    };
    $("#csv").onclick = () => window.KK_exportCsv(gb);
    $("#stC").onclick = async () => {
      if (active && !confirm("Ders iptal edilecek: öğrenciler derse erişemeyecek, öğretmen içerik değiştiremeyecek. Veriler silinmez. Devam edilsin mi?")) return;
      await API.updateCourse(cid, { status: active ? "cancelled" : "active" }); UI.toast(active ? "Ders iptal edildi" : "Ders yeniden açıldı"); App.reload();
    };
    $("#edC").onclick = () => UI.modal({
      title: "Dersi düzenle",
      body: `<label>Ders adı<input name="t" required value="${esc(c.title)}"></label><label>Açıklama<textarea name="d" rows="3">${esc(c.description)}</textarea></label>`,
      onSubmit: async f => { await API.updateCourse(cid, { title: f.t.value, description: f.d.value }); App.reload(); },
    });
  });
})();
