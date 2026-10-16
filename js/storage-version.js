// İlerleme verisinin sürümü. Kayıtlı sürüm bundan farklıysa (ör. eski test verisi kalmışsa)
// tarayıcıdaki tüm öğrenci ilerlemesi bir kereliğine silinir. Hesaplar (kullanıcı adı, şifre),
// dersler ve öğretmenin eklediği içerikler korunur.
// İlerleme biçimi değiştiğinde ya da eski verilerin temizlenmesi gerektiğinde bu sayıyı artır.
(function (root) {
  const DATA_VERSION = 2;
  const VERSION_KEY = "kk-lms.dataVersion";
  const DB_KEY = "kk-lms.v1";

  // Bir öğrenciye (ya da userId verilmezse herkese) ait tarayıcı anahtarlarının ilerleme kısmı.
  const isProgressKey = (k, userId) => userId
    ? k === `kodla-kesfet.v1.${userId}` || k.startsWith(`kk-lms.draft.${userId}.`) || k.startsWith(`kk-lms.done.${userId}.`)
    : k === "kodla-kesfet.v1" || k.startsWith("kodla-kesfet.v1.") || k.startsWith("kk-lms.draft.") || k.startsWith("kk-lms.done.");

  function clearProgressKeys(userId) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.filter(k => k && isProgressKey(k, userId)).forEach(k => localStorage.removeItem(k));
  }

  function migrate() {
    try {
      if (localStorage.getItem(VERSION_KEY) === String(DATA_VERSION)) return false;
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const db = JSON.parse(raw);
        if (db && typeof db === "object") {
          db.submissions = []; db.progress = {}; db.files = [];
          localStorage.setItem(DB_KEY, JSON.stringify(db));
        }
      }
      clearProgressKeys(null);
      if (root.indexedDB) try { root.indexedDB.deleteDatabase("kk-lms-files"); } catch {}
      localStorage.setItem(VERSION_KEY, String(DATA_VERSION));
      return true;
    } catch { return false; }
  }

  root.KK_STORAGE = { DATA_VERSION, VERSION_KEY, clearProgressKeys, migrate };
  root.KK_STORAGE.migrated = migrate();
})(typeof window !== "undefined" ? window : globalThis);
