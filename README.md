# 💜 Kodla & Keşfet

Kız öğrencilere yapay zeka ve yazılım öğretmek için tasarlanmış bir video eğitim platformu.

Ders akışı kısa videolardan, quizlerden, ödevlerden ve ders sonu sınavından oluşuyor. Akış kilitli ilerliyor: öğrenci bir adımı tamamlamadan sonrakine geçemiyor. Ek olarak, serbest pratik için tarayıcıda çalışan bir **Kod Arenası** (`arena.html`) da var.

> **Demo sürüm.** Bütün veriler tarayıcıda (localStorage ve IndexedDB) tutuluyor. Bu yüzden her tarayıcı kendi verisini görüyor: öğrencinin teslimini öğretmenin görebilmesi için ikisinin de aynı tarayıcıdan giriş yapması gerekiyor. Gerçek kullanım için veri katmanının bir sunucuya taşınması gerekiyor (bkz. [Gerçek kullanıma geçiş](#gerçek-kullanıma-geçiş)).

## Demo hesapları

| Rol | Kullanıcı adı | Şifre |
|---|---|---|
| Yönetici | `admin` | `admin123` |
| Öğretmen | `ogretmen` | `ogretmen123` |
| Öğrenci | `ayse`, `zeynep`, `elif` | `ogrenci123` |

Giriş ekranındaki demo hesap düğmeleri tek tıkla giriş yapıyor. Bütün öğrenciler **ilk kez giriş yapmış** gibi başlıyor: izlenmiş video ya da çözülmüş quiz yok, ders Bölüm 1'in videosundan başlıyor.

Yönetici panelindeki **Demo verilerini sıfırla** düğmesi her şeyi bu başlangıç hâline döndürüyor.

### İlerlemenin saklanması

| Anahtar | İçerik |
|---|---|
| `kk-lms.v1` (localStorage) | Hesaplar, dersler ve içerikler. İlerleme kısmı: izlenen videolar (`progress`), quiz/ödev/sınav teslimleri (`submissions`), yüklenen dosyaların bilgisi (`files`) |
| `kk-lms-files` (IndexedDB) | Yüklenen dosyaların içeriği |
| `kk-lms.draft.<öğrenci>.<içerik>` | Kod ödevi taslakları |
| `kk-lms.done.<öğrenci>.<ders>` | "Dersi tamamladın" kutlamasının gösterildiği bilgisi |
| `kodla-kesfet.v1.<öğrenci>` | Kod Arenası ilerlemesi |
| `kk-lms.dataVersion` | İlerleme verisinin sürümü |

Kilit durumları ayrıca saklanmıyor; her açılışta izlenen videolar ve teslimlerden hesaplanıyor.

**Veri sürümü:** `js/storage-version.js` içindeki `DATA_VERSION`, tarayıcıda kayıtlı sürümle eşleşmezse bütün öğrenci ilerlemesi bir kereliğine siliniyor. Hesaplar, şifreler, dersler ve tema tercihi korunuyor. Eski test verilerini temizlemek gerektiğinde bu sayıyı artırmak yeterli.

**Hesabı sıfırla:** Öğrenci menüsündeki bu seçenek yalnızca o öğrencinin ilerlemesini siliyor: videolar, quiz/ödev/sınav sonuçları, yüklediği dosyalar, kod taslakları ve arena verisi. Hesap ve şifre korunuyor; diğer öğrencilerin verisine dokunulmuyor.

## Örnek ders: Python ile Programlamaya Giriş

Akış sırasıyla şöyle:

1. 🎬 Bölüm 1 → 📝 Quiz 1 (4 soru, baraj %75)
2. 🎬 Bölüm 2 → 📝 Quiz 2 (4 soru, baraj %60)
3. 📎 Ödev 1 (kod, **zorunlu**: geçer not alınmadan devam edilemez)
4. 🎬 Bölüm 3 → 📝 Quiz 3 (4 soru, baraj %75)
5. 📎 Ödev 2 (açık uçlu, ilerlemeyi kilitlemez)
6. 🏁 Genel Değerlendirme Sınavı (8 soru)

## Roller ve yetkiler

**Yönetici**
- Kullanıcı hesabı açar, kapatır, şifre sıfırlar.
- Ders tanımlar, iptal eder, yeniden açar.
- Derslere öğretmen ve öğrenci atar.
- Not defterini görür.

**Öğretmen** (yalnızca atandığı derslerde)
- Video, quiz, ödev ve sınav ekler, düzenler, siler, sıralar.
- Quiz ve sınavlarda doğru cevabı işaretler; bunlar otomatik notlandırılır.
- Ödev türleri: **test**, **açık uçlu**, **dosya yükleme** ve **kod** (otomatik testli, Python/JS).
- Bir ödevi "geçer not almadan ilerlenemez" olarak işaretleyebilir.
- Ödev ve sınavları onaylar; gerekirse notu değiştirir ve geri bildirim yazar.
- Not defterini görür ve CSV olarak dışa aktarır.

**Öğrenci**
- Videoları sırayla izler.
- Quizler anında notlandırılır; baraj geçilince sonraki adım açılır.
- Ödev ve sınav notlarını öğretmen onayladıktan sonra görür.
- Ders sonunda bir başarı seviyesi alır: Çok iyi, İyi, Orta ya da Geliştirilmeli.

## Videolar hakkında önemli not

YouTube'daki **Özel (Private)** videolar başka sitelere gömülemez. Yalnızca davet edilmiş ve oturum açmış hesaplarda oynar; sitede "Video kullanılamıyor" hatası verir.

Bu yüzden videoları **Liste dışı (Unlisted)** olarak yükleyin. Liste dışı videolar aramada ve kanal sayfasında çıkmaz.

Uygulama videoları `youtube-nocookie.com` üzerinden, ilgili video önerileri kapalı şekilde gömüyor ve bağlantıyı arayüzde hiçbir yerde göstermiyor.

Bağlantıyı tamamen gizlemek teknik olarak mümkün değil: oynatıcıdaki YouTube logosu ve tarayıcının geliştirici araçları video kimliğini gösterebilir. Bunun önüne geçmek gerekirse videolar Vimeo (alan adı kısıtlamalı) ya da Cloudflare Stream gibi bir servise taşınabilir.

## Sürüm bilgisi

Her sayfanın alt bilgisinde sürüm numarası ve son güncelleme zamanı görünüyor (ör. "Sürüm 2.2.0 · Son güncelleme: 16 Ekim 2026 13:56"). Bu bilgi `js/version.js` içindeki `APP_VERSION` ve `UPDATED_AT` değerlerinden geliyor.

Her güncellemede şunlar yapılmalı:

1. `APP_VERSION` yükseltilir: hata düzeltmesinde son sayı, yeni özellikte ortadaki sayı, büyük değişiklikte ilk sayı.
2. `UPDATED_AT` güncellenir.
3. `index.html` ve `arena.html` içindeki `?v=` önbellek parametresi artırılır.

`node tests/version.test.mjs` bu değerlerin geçerli olduğunu ve her sayfada gösterildiğini kontrol ediyor.

## Çalıştırma

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Derleme adımı yok. GitHub Pages'te olduğu gibi çalışıyor.

## Dosya yapısı

| Dosya | Açıklama |
|---|---|
| `index.html`, `css/lms.css` | Eğitim platformu |
| `js/api.js` | Veri katmanı: kimlik doğrulama, yetki kontrolü, ilerleme kilitleri, notlandırma |
| `js/seed.js` | Demo hesapları ve örnek ders (hazır ilerleme içermez) |
| `js/version.js` | Sürüm numarası ve son güncelleme zamanı (alt bilgide gösterilir) |
| `js/storage-version.js` | Veri sürümü kontrolü ve eski ilerlemenin temizlenmesi |
| `js/app.js` | Yönlendirme, üst menü, giriş ekranı |
| `js/views-student.js`, `js/views-teacher.js`, `js/views-admin.js` | Rol bazlı ekranlar |
| `js/ui.js` | Ortak yardımcılar (modal, bildirim, konfeti, kod editörü, YouTube) |
| `js/runner.js` | Kodu Web Worker içinde, zaman aşımıyla çalıştıran test çalıştırıcı (Python için Pyodide) |
| `arena.html`, `js/arena.js`, `js/problems.js`, `css/style.css` | Kod Arenası |
| `tests/api.test.mjs` | İş kuralı testleri (sürüm geçişi ve hesap sıfırlama dahil): `node tests/api.test.mjs` |
| `tests/verify-problems.mjs` | Arena problemlerinin doğrulaması |

## Gerçek kullanıma geçiş

Arayüz verilere yalnızca `js/api.js` içindeki asenkron fonksiyonlar üzerinden erişiyor. Yetki kontrolleri de, cevap anahtarlarının öğrenciden gizlenmesi de, notların onaya kadar saklanması da bu katmanda yapılıyor.

Çok kullanıcılı gerçek kullanım için bu fonksiyonların aynı imzalarla bir sunucuya taşınması gerekiyor. Örneğin:

- **Supabase:** Postgres, kimlik doğrulama, Row Level Security ve dosya deposu.
- **Firebase:** Firestore ve kimlik doğrulama.
- Kendi Node.js sunucunuz.

Mevcut demoda istemci tarafındaki kontroller tarayıcının geliştirici araçlarıyla atlatılabilir. Bu nedenle demo, notu önemli sınavlar için kullanılmamalı.
