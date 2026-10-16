# 💜 Kodla & Keşfet · Kod Arenası

Lise ve üniversitenin başlangıç seviyesindeki öğrenciler için tarayıcıda çalışan bir programlama alıştırma platformu. Öğrenci **JavaScript** veya **Python** ile problem çözüyor, kodu örnek testlere ve gizli testlere karşı anında değerlendiriliyor.

Sunucu, hesap ya da kurulum gerektirmiyor. Kod tamamen kullanıcının tarayıcısında çalışıyor.

## Özellikler

- **25 problem.** Kolay, orta ve zor seviyelerde; temeller, koşullar, döngüler, diziler, metinler, sözlükler, yığın, arama, graf ve dinamik programlama konularını kapsıyor.
- **Otomatik değerlendirme.**
  - *Çalıştır* yalnızca örnek testleri koşturuyor.
  - *Gönder* gizli testleri de çalıştırıyor. Gizli testlerin girdisi gösterilmiyor ve bu testler sırasında üretilen konsol çıktısı da bastırılıyor.
- **İki dil.**
  - JavaScript doğrudan çalışıyor.
  - Python, [Pyodide](https://pyodide.org) ile ilk kullanımda yükleniyor.
  - Fonksiyon adları her iki dilde de kendi kuralına göre (`ciftMi` / `cift_mi`) otomatik üretiliyor.
- **Güvenli çalıştırma.** Kullanıcı kodu ayrı bir Web Worker içinde çalışıyor. Sonsuz döngüye giren kod zaman aşımında sonlandırılıyor (JS için 4 sn, Python için 6 sn).
- **Oyunlaştırma.**
  - XP: kolay 10, orta 20, zor 40. Alınan her ipucu ödülü %25 azaltıyor.
  - Seviyeler, günlük seri ve 10 rozet var.
- **Kalıcılık.** İlerleme ve yazılan kod `localStorage`'da saklanıyor. JSON olarak dışa ve içe aktarılabiliyor.
- **Arayüz.** Açık/koyu tema ve mobil uyumlu düzen var. Kısayollar: `Ctrl+Enter` çalıştırır, `Ctrl+Shift+Enter` gönderir.

## Çalıştırma

Statik bir site olduğu için derleme adımı yok:

```bash
python3 -m http.server 8000
# http://localhost:8000 adresini aç
```

`index.html` dosyası doğrudan da açılabilir (`file://`). GitHub Pages, Netlify ve benzeri statik barındırma servisleriyle olduğu gibi yayınlanabilir.

Kod editörü (CodeMirror) ve Python (Pyodide) CDN'den yükleniyor. CDN'e erişilemezse editör düz bir metin alanına geri dönüyor ve JavaScript yine çalışıyor.

## Dosya yapısı

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa iskeleti |
| `css/style.css` | Stiller ve tema token'ları |
| `js/problems.js` | Problem bankası |
| `js/runner.js` | Web Worker tabanlı kod çalıştırıcı ve test karşılaştırma |
| `js/app.js` | Arayüz, yönlendirme (`#/p/<id>`), XP, rozetler, kayıt |
| `tests/verify-problems.mjs` | Beklenen çıktıları referans çözümlerle doğrulayan betik |

## Yeni problem eklemek

1. `js/problems.js` içindeki diziye bir nesne ekle:

   ```js
   {
     id: "kare", title: "Karesi", diff: "kolay", topic: "Temeller",
     fn: "kare", params: ["n"],
     desc: `<p><code>n</code> sayısının karesini döndür.</p>`,
     hints: ["n * n"],
     tests: [
       { in: [3], out: 9 },          // örnek (görünür) test
       { in: [-4], out: 16, h: true } // gizli test
     ],
   }
   ```

2. `tests/verify-problems.mjs` dosyasına bir referans çözüm ekle.
3. Doğrulamayı çalıştır: `node tests/verify-problems.mjs`.

Sonuçlar JSON'a uygun değerler olarak karşılaştırılıyor. Sayılarda `1e-6` tolerans var. Python'daki tuple, liste olarak kabul ediliyor.

> Not: Bu, sunucusuz bir alıştırma aracı. Gizli testler istemci tarafındaki kaynak kodda bulunduğu için resmî sınav ya da notlandırma amacıyla kullanılmamalı. Sunucu tarafında güvenilir değerlendirme gerekiyorsa Teaching.Codes gibi bir arka uca bağlanabilir.
