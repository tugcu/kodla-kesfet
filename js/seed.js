// Demo verisi: 1 yönetici, 1 öğretmen, 3 öğrenci ve örnek bir Python dersi.
// Öğrenci ilerlemesi içermez; tüm öğrenciler dersin başından başlar.
(function (root) {
  root.KK_DEMO_ACCOUNTS = [
    { username: "admin", password: "admin123", role: "admin", name: "Sistem Yöneticisi" },
    { username: "ogretmen", password: "ogretmen123", role: "teacher", name: "Selin Öztürk" },
    { username: "ayse", password: "ogrenci123", role: "student", name: "Ayşe Yılmaz" },
    { username: "zeynep", password: "ogrenci123", role: "student", name: "Zeynep Kaya" },
    { username: "elif", password: "ogrenci123", role: "student", name: "Elif Demir" },
  ];

  root.KK_SEED = async function (db, { uid, hash, now }) {
    const t0 = now();
    const U = {};
    for (const a of root.KK_DEMO_ACCOUNTS) {
      const u = { id: uid(), name: a.name, username: a.username, role: a.role, active: true, createdAt: t0, passwordHash: await hash(a.username, a.password) };
      db.users.push(u); U[a.username] = u;
    }

    const c = {
      id: uid(), title: "Python ile Programlamaya Giriş", status: "active", createdAt: t0,
      description: "Hiç kod yazmamış olanlar için Python'a sıfırdan başlangıç: ekrana yazı yazdırmaktan değişkenlere, koşullardan döngülere.",
      teacherIds: [U.ogretmen.id], studentIds: [U.ayse.id, U.zeynep.id, U.elif.id],
    };
    db.courses.push(c);

    let order = 0;
    const add = x => { const it = { id: uid(), courseId: c.id, order: ++order, createdAt: t0, description: "", ...x }; db.items.push(it); return it; };
    const q = (text, options, correct) => ({ text, options, correct });

    add({ type: "video", title: "Bölüm 1: Python'a Merhaba", youtubeId: "gxKumK5RghY", minutes: 8,
      description: "Programlama nedir, Python neden bu kadar sevilir? İlk programımızı yazıyoruz: print()." });
    add({ type: "quiz", title: "Quiz 1: İlk Adımlar", passPct: 75, maxAttempts: 0, showAnswers: false, questions: [
      q("Python'da ekrana yazı yazdırmak için hangi fonksiyon kullanılır?", ["input()", "print()", "len()", "write()"], 1),
      q('print("2" + "3") komutunun çıktısı nedir?', ["5", "23", "2 3", "Hata verir"], 1),
      q("Python'da tek satırlık bir yorum hangi karakterle başlar?", ["//", "#", "--", "/*"], 1),
      q("x = 5 ifadesinde x nedir?", ["Bir fonksiyon", "Bir değişken", "Bir döngü", "Bir modül"], 1),
    ] });
    add({ type: "video", title: "Bölüm 2: Değişkenler ve Veri Tipleri", youtubeId: "Hqv-Vaod5Z4", minutes: 8,
      description: "Sayılar, metinler ve mantıksal değerler. Tipler arasında dönüşüm: int(), float(), str()." });
    add({ type: "quiz", title: "Quiz 2: Değişkenler", passPct: 60, maxAttempts: 0, showAnswers: true, questions: [
      q("type(3.14) sonucu hangisidir?", ["int", "float", "str", "bool"], 1),
      q('int("7") + 2 işleminin sonucu nedir?', ["72", "9", "Hata verir", "7.2"], 1),
      q("Hangisi geçerli bir değişken adıdır?", ["2sayi", "ogrenci_adi", "ad soyad", "class"], 1),
      q("10 // 3 işleminin sonucu nedir?", ["3.33", "3", "1", "4"], 1),
    ] });
    add({ type: "assignment", kind: "code", title: "Ödev 1: Not Ortalaması", blocking: true, passPct: 60,
      description: "Bir not listesinin ortalamasını döndüren ortalama(notlar) fonksiyonunu yaz. Liste boşsa 0 döndür. Bu ödevden geçer not almadan 3. bölüme geçemezsin.",
      code: { lang: "py", fn: "ortalama", starter: "def ortalama(notlar):\n    # Kodunu buraya yaz\n    pass\n", tests: [
        { in: [[70, 80, 90]], out: 80 }, { in: [[100]], out: 100 },
        { in: [[]], out: 0, h: true }, { in: [[50, 51]], out: 50.5, h: true }, { in: [[0, 0, 100]], out: 33.333333333333336, h: true },
      ] } });
    add({ type: "video", title: "Bölüm 3: Koşullar ve Döngüler", youtubeId: "1CeYHoxWawA", minutes: 8,
      description: "if / elif / else ile karar vermek, for ve while ile tekrar etmek." });
    add({ type: "quiz", title: "Quiz 3: Koşullar ve Döngüler", passPct: 75, maxAttempts: 0, showAnswers: false, questions: [
      q("for i in range(3): print(i) kodu alt alta hangi sayıları yazdırır?", ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "Yalnızca 3"], 1),
      q("x = 10 iken if x > 10: bloğu için ne olur?", ["Blok çalışır", "Blok çalışmaz", "Hata verir", "Sonsuz döngüye girer"], 1),
      q("Bir döngüyü erken bitirmek için hangi komut kullanılır?", ["stop", "exit", "break", "continue"], 2),
      q("İçinde break olmayan bir while True: döngüsü için ne olur?", ["Bir kez çalışır", "Hiç çalışmaz", "Sonsuz döngü olur", "Hata verir"], 2),
    ] });
    add({ type: "assignment", kind: "open", title: "Ödev 2: Günlük Hayatta Algoritmalar", blocking: false, passPct: 50,
      description: "Kısa cevaplar yeterli. Bu ödev sonraki adımı kilitlemez.",
      questions: [
        { text: "Sabah okula hazırlanma rutinini adım adım bir algoritma olarak yaz. Hangi adımlarda bir koşul (if) var?" },
        { text: "Günlük hayatta tekrar eden (döngü olarak düşünülebilecek) bir işi anlat. Döngü ne zaman biter?" },
      ] });
    add({ type: "exam", title: "Genel Değerlendirme Sınavı", passPct: 60, maxAttempts: 1,
      description: "Dersin tamamını kapsayan 8 soruluk son sınav. Tek deneme hakkın var; sonucun öğretmenin onayından sonra görünür.",
      questions: [
        q('print("Merhaba", "Dünya") çıktısı nedir?', ["MerhabaDünya", "Merhaba Dünya", "Merhaba,Dünya", "Hata verir"], 1),
        q("Hangisi bir metin (str) değeridir?", ["42", "3.0", '"42"', "True"], 2),
        q("len(\"python\") sonucu kaçtır?", ["5", "6", "7", "Hata verir"], 1),
        q("Kullanıcıdan girdi almak için hangi fonksiyon kullanılır?", ["input()", "get()", "read()", "scan()"], 0),
        q("5 % 2 işleminin sonucu nedir?", ["2.5", "2", "1", "0"], 2),
        q("Hangisi bir karşılaştırma operatörüdür?", ["=", "==", "+=", "//"], 1),
        q("range(2, 6) hangi sayıları üretir?", ["2, 3, 4, 5", "2, 3, 4, 5, 6", "3, 4, 5, 6", "2, 6"], 0),
        q("Bir fonksiyon tanımlamak için hangi anahtar kelime kullanılır?", ["func", "function", "def", "lambda"], 2),
      ] });
    // Bilinçli olarak hazır ilerleme eklenmez: her öğrenci ilk kez giriş yapmış gibi
    // Bölüm 1'in videosundan başlar.
  };
})(typeof window !== "undefined" ? window : globalThis);
