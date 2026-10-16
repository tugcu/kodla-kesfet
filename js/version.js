// Uygulama sürümü ve son güncelleme zamanı. Sayfaların alt bilgisinde gösterilir.
// Her güncellemede ikisini de değiştir:
//   - Hata düzeltmesi: son sayı (2.2.0 → 2.2.1)
//   - Yeni özellik: ortadaki sayı (2.2.1 → 2.3.0)
//   - Büyük değişiklik: ilk sayı (2.3.0 → 3.0.0)
(function (root) {
  const APP_VERSION = "2.2.0";
  const UPDATED_AT = "2026-10-16T13:57:39+03:00";

  const label = () => {
    let when = UPDATED_AT;
    try {
      when = new Date(UPDATED_AT).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {}
    return `Sürüm ${APP_VERSION} · Son güncelleme: ${when}`;
  };
  const fill = () => document.querySelectorAll("[data-app-version]").forEach(el => { el.textContent = label(); });

  root.KK_VERSION = { APP_VERSION, UPDATED_AT, label };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
  }
})(typeof window !== "undefined" ? window : globalThis);
