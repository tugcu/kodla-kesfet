// Demo verisi: 1 yönetici, 1 öğretmen, 3 öğrenci ve örnek bir Python dersi.
// Öğrencilerin ilerlemeleri farklı aşamalarda olacak şekilde birkaç teslim de eklenir;
// böylece öğretmen paneli ilk açılışta boş görünmez.
(function (root) {
  root.KK_DEMO_ACCOUNTS = [
    { username: "admin", password: "admin123", role: "admin", name: "Sistem Yöneticisi" },
    { username: "ogretmen", password: "ogretmen123", role: "teacher", name: "Selin Öztürk" },
    { username: "ayse", password: "ogrenci123", role: "student", name: "Ayşe Yılmaz" },
    { username: "zeynep", password: "ogrenci123", role: "student", name: "Zeynep Kaya" },
    { username: "elif", password: "ogrenci123", role: "student", name: "Elif Demir" },
  ];

  root.KK_SEED = async function (db, { uid, hash, now }) {
    const day = 864e5, t0 = now() - 6 * day;
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

    const v1 = add({ type: "video", title: "Bölüm 1: Python'a Merhaba", youtubeId: "gxKumK5RghY", minutes: 8,
      description: "Programlama nedir, Python neden bu kadar sevilir? İlk programımızı yazıyoruz: print()." });
    const q1 = add({ type: "quiz", title: "Quiz 1: İlk Adımlar", passPct: 75, maxAttempts: 0, showAnswers: false, questions: [
      q("Python'da ekrana yazı yazdırmak için hangi fonksiyon kullanılır?", ["input()", "print()", "len()", "write()"], 1),
      q('print("2" + "3") komutunun çıktısı nedir?', ["5", "23", "2 3", "Hata verir"], 1),
      q("Python'da tek satırlık bir yorum hangi karakterle başlar?", ["//", "#", "--", "/*"], 1),
      q("x = 5 ifadesinde x nedir?", ["Bir fonksiyon", "Bir değişken", "Bir döngü", "Bir modül"], 1),
    ] });
    const v2 = add({ type: "video", title: "Bölüm 2: Değişkenler ve Veri Tipleri", youtubeId: "Hqv-Vaod5Z4", minutes: 8,
      description: "Sayılar, metinler ve mantıksal değerler. Tipler arasında dönüşüm: int(), float(), str()." });
    const q2 = add({ type: "quiz", title: "Quiz 2: Değişkenler", passPct: 60, maxAttempts: 0, showAnswers: true, questions: [
      q("type(3.14) sonucu hangisidir?", ["int", "float", "str", "bool"], 1),
      q('int("7") + 2 işleminin sonucu nedir?', ["72", "9", "Hata verir", "7.2"], 1),
      q("Hangisi geçerli bir değişken adıdır?", ["2sayi", "ogrenci_adi", "ad soyad", "class"], 1),
      q("10 // 3 işleminin sonucu nedir?", ["3.33", "3", "1", "4"], 1),
    ] });
    const o1 = add({ type: "assignment", kind: "code", title: "Ödev 1: Not Ortalaması", blocking: true, passPct: 60,
      description: "Bir not listesinin ortalamasını döndüren ortalama(notlar) fonksiyonunu yaz. Liste boşsa 0 döndür. Bu ödevden geçer not almadan 3. bölüme geçemezsin.",
      code: { lang: "py", fn: "ortalama", starter: "def ortalama(notlar):\n    # Kodunu buraya yaz\n    pass\n", tests: [
        { in: [[70, 80, 90]], out: 80 }, { in: [[100]], out: 100 },
        { in: [[]], out: 0, h: true }, { in: [[50, 51]], out: 50.5, h: true }, { in: [[0, 0, 100]], out: 33.333333333333336, h: true },
      ] } });
    const v3 = add({ type: "video", title: "Bölüm 3: Koşullar ve Döngüler", youtubeId: "1CeYHoxWawA", minutes: 8,
      description: "if / elif / else ile karar vermek, for ve while ile tekrar etmek." });
    const q3 = add({ type: "quiz", title: "Quiz 3: Koşullar ve Döngüler", passPct: 75, maxAttempts: 0, showAnswers: false, questions: [
      q("for i in range(3): print(i) kodu alt alta hangi sayıları yazdırır?", ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "Yalnızca 3"], 1),
      q("x = 10 iken if x > 10: bloğu için ne olur?", ["Blok çalışır", "Blok çalışmaz", "Hata verir", "Sonsuz döngüye girer"], 1),
      q("Bir döngüyü erken bitirmek için hangi komut kullanılır?", ["stop", "exit", "break", "continue"], 2),
      q("İçinde break olmayan bir while True: döngüsü için ne olur?", ["Bir kez çalışır", "Hiç çalışmaz", "Sonsuz döngü olur", "Hata verir"], 2),
    ] });
    const o2 = add({ type: "assignment", kind: "open", title: "Ödev 2: Günlük Hayatta Algoritmalar", blocking: false, passPct: 50,
      description: "Kısa cevaplar yeterli. Bu ödev sonraki adımı kilitlemez.",
      questions: [
        { text: "Sabah okula hazırlanma rutinini adım adım bir algoritma olarak yaz. Hangi adımlarda bir koşul (if) var?" },
        { text: "Günlük hayatta tekrar eden (döngü olarak düşünülebilecek) bir işi anlat. Döngü ne zaman biter?" },
      ] });
    const ex = add({ type: "exam", title: "Genel Değerlendirme Sınavı", passPct: 60, maxAttempts: 1,
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

    // ----- Örnek ilerleme -----
    const watch = (u, ...vs) => { db.progress[`${u.id}:${c.id}`] = { watched: Object.fromEntries(vs.map((v, i) => [v.id, t0 + (i + 1) * day])) }; };
    const sub = (u, it, x, d) => db.submissions.push({ id: uid(), courseId: c.id, itemId: it.id, studentId: u.id, submittedAt: t0 + d * day, ...x });
    const quiz = (u, it, answers, d) => {
      const detail = it.questions.map((qq, i) => ({ ok: answers[i] === qq.correct, correct: qq.correct, given: answers[i] }));
      const score = Math.round(detail.filter(z => z.ok).length / it.questions.length * 100);
      sub(u, it, { answers, detail, score, autoScore: score, passed: score >= it.passPct, status: "graded" }, d);
    };
    const codeDetail = n => o1.code.tests.map((t, i) => ({ ok: i < n, hidden: !!t.h, error: null }));

    // Ayşe: 1. ödevini teslim etti, öğretmen onayını bekliyor (3. bölüm kilitli).
    watch(U.ayse, v1, v2);
    quiz(U.ayse, q1, [1, 1, 1, 1], 1);
    quiz(U.ayse, q2, [1, 1, 1, 0], 2);
    sub(U.ayse, o1, { status: "pending", code: "def ortalama(notlar):\n    if not notlar:\n        return 0\n    return sum(notlar) / len(notlar)\n", detail: codeDetail(5), autoScore: 100, error: null }, 3);

    // Zeynep: ilk videoyu izledi, ilk quizden bir kez kaldı.
    watch(U.zeynep, v1);
    quiz(U.zeynep, q1, [1, 0, 1, 2], 2);

    // Elif: dersi bitirdi; sınavı öğretmen onayını bekliyor.
    watch(U.elif, v1, v2, v3);
    quiz(U.elif, q1, [0, 1, 1, 1], 1);
    quiz(U.elif, q1, [1, 1, 1, 1], 1.1);
    quiz(U.elif, q2, [1, 1, 1, 1], 2);
    sub(U.elif, o1, { status: "approved", code: "def ortalama(notlar):\n    toplam = 0\n    for n in notlar:\n        toplam += n\n    return toplam / len(notlar) if notlar else 0\n", detail: codeDetail(5), autoScore: 100, score: 100, feedback: "Çok güzel! Boş liste durumunu da düşünmüşsün. 👏", approvedAt: t0 + 3.5 * day, gradedBy: U.ogretmen.id }, 3);
    quiz(U.elif, q3, [1, 1, 2, 2], 4);
    sub(U.elif, o2, { status: "approved", answers: ["Uyanırım, yüzümü yıkarım. Hava yağmurluysa şemsiye alırım (koşul). Kahvaltı yapar, çantamı kontrol ederim.", "Merdiven çıkmak: her adımda bir basamak çıkarım, en üst kata gelince döngü biter."], score: 90, feedback: "Koşul örneğin çok yerinde. Döngünün bitiş koşulunu da net yazmışsın.", approvedAt: t0 + 5 * day, gradedBy: U.ogretmen.id }, 4.5);
    const exAns = [1, 2, 1, 0, 1, 1, 0, 2];
    const exDetail = ex.questions.map((qq, i) => ({ ok: exAns[i] === qq.correct, correct: qq.correct, given: exAns[i] }));
    sub(U.elif, ex, { status: "pending", answers: exAns, detail: exDetail, autoScore: Math.round(exDetail.filter(z => z.ok).length / exDetail.length * 100) }, 5);
  };
})(typeof window !== "undefined" ? window : globalThis);
