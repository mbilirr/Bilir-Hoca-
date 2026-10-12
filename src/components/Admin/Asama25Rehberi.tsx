import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Check, ChevronDown, Copy, ListChecks, X } from 'lucide-react';

// ============================================================================
// AŞAMA 25 REHBERİ — yapılacaklar, tane tane (yalnızca genel yönetici görür)
// Yönetim sayfasındaki "Aşama 25 Rehberi" düğmesiyle açılır.
// Her adımın yanındaki kutuyu işaretleyerek ilerlemenizi takip edebilirsiniz
// (işaretler yalnızca bu tarayıcıda saklanır). Komutlar tek tıkla kopyalanır.
// ============================================================================

const STORAGE_KEY = 'bh_asama25_rehber_done';

interface Cmd {
  label?: string;
  text: string;
}

interface Step {
  id: string;
  title: string;
  /** Adımın ne yaptığını anlatan kısa açıklama */
  why: string;
  /** Sırayla yapılacaklar */
  todo: React.ReactNode[];
  /** Kopyalanabilir komutlar / SQL dosya adları */
  cmds?: Cmd[];
  /** Beklenen sonuç */
  expect?: string;
  /** Dikkat edilecek not */
  warn?: string;
}

interface Section {
  id: string;
  title: string;
  intro?: string;
  steps: Step[];
}

const SECTIONS: Section[] = [
  {
    id: 'hazirlik',
    title: '1. Hazırlık',
    intro: 'Başlamadan önce yedek alın ve güncelleme paketini hazır edin.',
    steps: [
      {
        id: 'h1',
        title: 'Projenin yedeğini alın',
        why: 'Bir şey ters giderse eski haline dönebilmek için.',
        todo: [
          'Proje klasörünün tamamını başka bir yere kopyalayın (veya git kullanıyorsanız commit yapın).',
          <>
            Bu sayfadaki <b>Veri Yedeği</b> bölümünden (Yönetim sayfası, üstte) bir yedek indirin.
          </>,
        ],
        expect: 'Klasör kopyası ve .xlsx / .json yedek dosyaları hazır.',
      },
      {
        id: 'h2',
        title: 'Güncelleme paketini açın',
        why: 'Değişen dosyaların hepsi paketin içindeki degisen-dosyalar klasöründe, projenizle aynı klasör yapısında durur.',
        todo: [
          'asama25-guncelleme-paketi.zip dosyasını bir klasöre çıkarın.',
          'degisen-dosyalar klasörünün içindeki src ve supabase klasörlerini görün.',
        ],
        expect: 'degisen-dosyalar/src ve degisen-dosyalar/supabase klasörleri görünür.',
      },
    ],
  },
  {
    id: 'sql',
    title: '2. Supabase SQL dosyaları',
    intro: 'Dört SQL dosyası var. Sırayla çalıştırın: önce 09d, sonra 09c, sonra 09a, sonra (rapor doğruysa) 09b. Dosyalar supabase/migrations klasöründedir.',
    steps: [
      {
        id: 's0',
        title: 'Yinelenen kurum oluşmasını durdurun (09d)',
        why: 'Çift kurumun nedeni: uygulama öğretmen kayıtlarını "upsert" ile yazarken veritabanındaki teacher_admin_kurum tetikleyicisi, satır zaten olsa bile yeni bir kurum açıyordu. 09d bunu düzeltir; hiçbir veriyi silmez veya değiştirmez.',
        todo: [
          <>
            Supabase paneli → <b>SQL Editor</b> → <b>New query</b>.
          </>,
          <>
            <b>09d_kurum_cift_olusma_duzeltme.sql</b> dosyasının tamamını yapıştırıp <b>RUN</b> yapın.
          </>,
        ],
        expect: 'Sonuçta "fonksiyon güncel mi → true" ve teachers tablosuna bağlı en az 1 tetikleyici satırı.',
        warn: 'Bunu 09b\'den ÖNCE çalıştırın; yoksa temizlediğiniz kurumlar yeniden oluşabilir.',
      },
      {
        id: 's1',
        title: 'İlk şifre tablosunu kurun (09c)',
        why: 'Yöneticinin verdiği ilk giriş şifrelerinin Excel listesi için saklanacağı tabloyu ve güvenlik kurallarını oluşturur. Mevcut veriyi silmez.',
        todo: [
          <>
            Supabase paneli → projeniz → sol menüde <b>SQL Editor</b> → <b>New query</b>.
          </>,
          <>
            <b>09c_ilk_giris_sifreleri.sql</b> dosyasını bir metin düzenleyiciyle açın, tamamını kopyalayıp editöre yapıştırın.
          </>,
          <>
            Sağ alttaki <b>RUN</b> düğmesine basın.
          </>,
        ],
        cmds: [{ label: 'Terminalden yapmak isterseniz (macOS)', text: 'psql "$DB_URL" -P pager=off -f supabase/migrations/09c_ilk_giris_sifreleri.sql' }],
        expect: 'Altta 4 satırlık sonuç: 1 tablo (initial_credentials), 2 kural, 1 fonksiyon.',
      },
      {
        id: 's2',
        title: 'Kurum raporunu alın (09a)',
        why: 'Aynı kişiye ait yinelenen kurumları gösterir. Sadece okur, hiçbir şeyi değiştirmez.',
        todo: [
          <>
            Yeni bir query açın, <b>09a_kurum_rapor.sql</b> dosyasının tamamını yapıştırıp <b>RUN</b> yapın.
          </>,
          <>
            Sonuç tablosunda <b>grup_no</b> aynı olan satırlar aynı kişiye ait kurumlardır.
          </>,
          <>
            <b>islem</b> sütununu okuyun: KALACAK olan kurum tutulur; "BİRLEŞTİRİLECEK" yazanlar kalan kuruma taşınıp silinir.
          </>,
        ],
        expect: 'Her yinelenen grup için bir KALACAK ve en az bir BİRLEŞTİRİLECEK satırı.',
        warn: 'Aynı gruba iki FARKLI kişinin kurumu düşmüşse 09b\'yi çalıştırmayın; rapor çıktısını bana gönderin.',
      },
      {
        id: 's3',
        title: 'Yinelenen kurumları birleştirin (09b)',
        why: 'Yinelenen kurumdaki öğretmen, sınıf, öğrenci ve izinli sınıfları kalan kuruma taşır, açık bölümleri birleştirir, boşalan kurumu siler. Hiçbir öğrenci, öğretmen, ödev veya etüt silinmez.',
        todo: [
          'Yalnızca bir önceki adımdaki rapor doğruysa devam edin.',
          <>
            Yeni bir query açın, <b>09b_kurum_birlestir.sql</b> dosyasının tamamını yapıştırıp <b>RUN</b> yapın.
          </>,
        ],
        expect: 'Her birleştirme için "birleştirildi ve silindi" yazan bir satır (yinelenen yoksa boş sonuç).',
        warn: '"taşındı ama … bağlantı kaldı, kurum silinmedi" görürseniz kurum güvenle korunmuştur; bana bildirin.',
      },
      {
        id: 's4',
        title: 'Sonucu doğrulayın',
        why: 'Birleştirmenin başarılı olduğunu görmek için.',
        todo: ['09a_kurum_rapor.sql dosyasını bir kez daha çalıştırın.', 'Tüm satırların "tekil - dokunulmaz" olduğunu kontrol edin.'],
        expect: 'Hiç BİRLEŞTİRİLECEK satırı kalmaz.',
      },
    ],
  },
  {
    id: 'fonksiyon',
    title: '3. create-user sunucu fonksiyonu',
    intro: 'Bu adım, yeni verilen şifrelerin Excel listesine yazılmasını sağlar. Yapılmazsa uygulama yine çalışır, yalnızca yeni şifreler listeye yazılmaz.',
    steps: [
      {
        id: 'f1',
        title: 'Fonksiyonu panelden güncelleyin (komutsuz yol)',
        why: 'Terminal kullanmadan en kolay yol.',
        todo: [
          <>
            Supabase paneli → <b>Edge Functions</b> → <b>create-user</b> → <b>Code</b> sekmesi.
          </>,
          'Editördeki kodun tamamını silin.',
          <>
            Paketteki <b>supabase/functions/create-user/index.ts</b> dosyasının tamamını yapıştırın.
          </>,
          <>
            <b>Deploy</b> düğmesine basın.
          </>,
        ],
        expect: 'Fonksiyonun "son güncelleme" zamanı değişir.',
      },
      {
        id: 'f2',
        title: 'Veya terminalden yayınlayın (Supabase CLI)',
        why: 'Terminali tercih ediyorsanız aynı işi komutla yapabilirsiniz.',
        todo: [
          'Proje klasöründe terminal açın.',
          'Sırayla aşağıdaki üç komutu çalıştırın (PROJEREF yerine Project Settings → General → Reference ID).',
        ],
        cmds: [
          { text: 'npx supabase login' },
          { text: 'npx supabase link --project-ref PROJEREF' },
          { text: 'npx supabase functions deploy create-user' },
        ],
        expect: 'Terminalde create-user için "Deployed" benzeri bir satır.',
        warn: 'Docker uyarısı alırsanız komutun sonuna --use-api ekleyin.',
      },
    ],
  },
  {
    id: 'kod',
    title: '4. Uygulama dosyaları',
    steps: [
      {
        id: 'k1',
        title: 'Dosyaları projeye kopyalayın',
        why: 'Ekrandaki değişiklikler bu dosyalarda.',
        todo: [
          'degisen-dosyalar/src içindeki dosyaları projenizde aynı yollara kopyalayın; "değiştirilsin mi?" sorusuna Evet deyin.',
          <>
            <b>Yeni dosyalar</b> (eklenecek): src/components/Admin/UserCredentialsExport.tsx ve src/components/Admin/Asama25Rehberi.tsx.
          </>,
          <>
            <b>Değişen dosyalar</b> (üzerine yazılacak): src/App.tsx, src/services/dataService.ts, src/components/Admin/KurumManagement.tsx,
            src/components/Admin/UnattendedEtutBanner.tsx, src/components/Student/StudentHeroBanner.tsx, src/components/Student/StudentPortal.tsx.
          </>,
          'supabase klasöründeki dosyaları da aynı yollara kopyalayın (kayıt için).',
        ],
        expect: '8 dosya src altında güncellenmiş / eklenmiş olur.',
        warn: 'Projenizde bu dosyaları paketten sonra kendiniz değiştirdiyseniz, üzerine yazmadan önce DEGISIKLIKLER.diff dosyasından farkları elle uygulayın.',
      },
    ],
  },
  {
    id: 'deneme',
    title: '5. Bilgisayarınızda deneyin',
    steps: [
      {
        id: 'd1',
        title: 'Kontrol ve çalıştırma',
        why: 'Hata olup olmadığını ve ekranları görmek için.',
        todo: ['Proje klasöründe terminal açın.', 'Aşağıdaki komutları sırayla çalıştırın.', 'Tarayıcıda terminalde yazan adresi (genellikle http://localhost:3000) açın.'],
        cmds: [{ text: 'npm install' }, { text: 'npm run lint' }, { text: 'npm run dev' }],
        expect: 'lint hata vermez; uygulama açılır. Durdurmak için terminalde Ctrl + C.',
      },
      {
        id: 'd2',
        title: 'Kurumlar panelini kontrol edin',
        why: 'İlk düzeltme.',
        todo: [<>Genel yönetici ile giriş yapın → <b>Yönetim → Kurumlar</b>.</>, 'Aynı kişiye ait kurumun artık bir kez göründüğünü doğrulayın.'],
        expect: 'Yinelenen kurum yok; sarı uyarı kutusu yok (SQL uygulandıysa).',
      },
      {
        id: 'd3',
        title: 'Excel listesini deneyin',
        why: 'İkinci düzeltme.',
        todo: [
          <>
            <b>Yönetim → Kullanıcı Listesi (Excel)</b> panelini açın.
          </>,
          'Öğrenci ve/veya öğretmen kutusunu seçin, istersen sınıf seçin.',
          <>
            <b>Excel listesini indir</b> düğmesine basın.
          </>,
          'Eski hesaplarda "Şifre kayıtlı değil" görürseniz: "Şifresi kayıtlı olmayan hesaplara yeni ilk şifre oluştur" kutusunu işaretleyip düğmeye iki kez basın.',
        ],
        expect: 'kullanici-listesi-TARIH.xlsx inmiş olur; Öğrenciler, Öğretmenler ve Bilgi sayfaları vardır.',
        warn: 'Yeni ilk şifre oluşturma, o hesapların mevcut şifresini değiştirir. Dosya şifre içerir; güvenli saklayın.',
      },
      {
        id: 'd4',
        title: 'Yeni hesabın ilk şifresini deneyin',
        why: 'Şifrenin tabloya yazıldığını ve kullanıcı değiştirince silindiğini görmek için.',
        todo: [
          'Yeni bir deneme öğrencisi ekleyin ve ona şifre verin.',
          'Excel listesini tekrar indirin: öğrencinin ilk şifresi görünür.',
          'Öğrenciyle giriş yapıp şifresini değiştirin.',
          'Listeyi tekrar indirin: şifre sütunu boş, durumda "Kullanıcı şifresini değiştirdi" yazar.',
        ],
        expect: 'Şifre kaydı, kullanıcı değiştirince kalkar.',
      },
      {
        id: 'd5',
        title: 'Etüt bildirimini deneyin',
        why: 'Üçüncü düzeltme.',
        todo: [
          'İki farklı kurum yöneticisiyle bir etüt hazırlayın ve saati geçsin; yoklamayı almayın (veya geçmiş tarihli etüt kaydedin).',
          'Etüdü hazırlayan yöneticinin ana sayfasında "etüt bitti ancak yoklaması alınmadı" uyarısını görün.',
          'Diğer yöneticinin ana sayfasında bu uyarının görünmediğini doğrulayın.',
        ],
        expect: 'Uyarı yalnızca etüdü hazırlayan yöneticide görünür.',
      },
      {
        id: 'd6',
        title: 'Öğrenci Duyurular duvarını deneyin',
        why: 'Dördüncü düzeltme.',
        todo: [
          'Bir öğrenci hesabıyla giriş yapın, ana sayfaya bakın.',
          'Eski büyük duvarın yerinde küçük "Duyurular" kutusu olduğunu görün.',
          'Bugün için etüt, bugün/yarın teslimli ödev, soru hedefi veya yeni not tanımlıysa kutuda göründüğünü doğrulayın; birine tıklayıp ilgili sekmenin açıldığını görün.',
        ],
        expect: 'Duvar yaklaşık yarı yükseklikte; duyurular görünür.',
      },
    ],
  },
  {
    id: 'yayin',
    title: '6. Yayına alın',
    steps: [
      {
        id: 'y1',
        title: 'Canlı siteye gönderin',
        why: 'Her şey bilgisayarınızda çalıştıysa son adım.',
        todo: [
          'Her zamanki yönteminizle yayınlayın (GitHub\'a gönderip Vercel\'in otomatik yayınlaması veya kullandığınız komut).',
          'Canlı sitede 5. bölümdeki kontrolleri kısaca tekrarlayın.',
        ],
        expect: 'Canlı sitede de Kurumlar, Excel listesi, etüt bildirimi ve Duyurular çalışır.',
      },
    ],
  },
];

const readDone = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
};

const writeDone = (ids: Set<string>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* tarayıcı depolaması kullanılamıyorsa işaretler yalnızca bu oturumda kalır */
  }
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* kopyalama izni yoksa kullanıcı metni elle seçebilir */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-[11px] font-bold text-fg-2 cursor-pointer"
      aria-label="Komutu kopyala"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Kopyalandı' : 'Kopyala'}
    </button>
  );
};

const StepCard: React.FC<{ step: Step; index: number; done: boolean; onToggle: () => void }> = ({ step, index, done, onToggle }) => {
  const [open, setOpen] = useState(!done);
  return (
    <div className={`rounded-2xl border ${done ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line bg-surface'}`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="w-4 h-4 shrink-0 cursor-pointer"
          aria-label={`${step.title} tamamlandı`}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <span className={`text-sm font-bold ${done ? 'text-muted line-through' : 'text-fg'}`}>
            <span className="text-indigo-600 dark:text-indigo-400 mr-1.5">{index}.</span>
            {step.title}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-fg-2">
          <p className="text-muted">{step.why}</p>

          <ol className="list-decimal pl-5 space-y-1.5">
            {step.todo.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>

          {step.cmds && (
            <div className="space-y-1.5">
              {step.cmds.map((c, i) => (
                <div key={i}>
                  {c.label && <p className="text-[11px] text-muted mb-0.5">{c.label}</p>}
                  <div className="flex items-start justify-between gap-2 p-2 rounded-xl bg-canvas border border-line">
                    <pre className="font-mono text-[11px] text-fg whitespace-pre-wrap break-all flex-1 min-w-0">{c.text}</pre>
                    <CopyButton text={c.text} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {step.expect && (
            <p className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
              <b>Beklenen sonuç:</b> {step.expect}
            </p>
          )}
          {step.warn && (
            <p className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
              <b>Dikkat:</b> {step.warn}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const Asama25Rehberi: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [done, setDone] = useState<Set<string>>(readDone);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const total = useMemo(() => SECTIONS.reduce((n, s) => n + s.steps.length, 0), []);
  const doneCount = useMemo(() => SECTIONS.reduce((n, s) => n + s.steps.filter((st) => done.has(st.id)).length, 0), [done]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeDone(next);
      return next;
    });
  };

  let counter = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Aşama 25 rehberi">
      <div className="relative w-full max-w-3xl bg-surface border border-line rounded-3xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-fg">Aşama 25 – Yapılacaklar</h3>
              <p className="text-xs text-muted">Adım adım rehber · yaptığınız adımı işaretleyin</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-muted hover:text-fg rounded-lg cursor-pointer" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5 p-3 rounded-2xl bg-canvas/60 border border-line">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-bold text-fg">
              <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              İlerleme
            </span>
            <span className="font-bold tabular-nums text-fg-2">
              {doneCount}/{total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.round((doneCount / total) * 100)}%` }} />
          </div>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((sec) => (
            <section key={sec.id} aria-labelledby={`a25-${sec.id}`}>
              <h4 id={`a25-${sec.id}`} className="text-sm font-black text-fg mb-1">
                {sec.title}
              </h4>
              {sec.intro && <p className="text-xs text-muted mb-2.5">{sec.intro}</p>}
              <div className="space-y-2.5">
                {sec.steps.map((st) => {
                  counter += 1;
                  return <StepCard key={st.id} step={st} index={counter} done={done.has(st.id)} onToggle={() => toggle(st.id)} />;
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between pt-5 mt-5 border-t border-line">
          <button
            type="button"
            onClick={() => {
              const empty = new Set<string>();
              writeDone(empty);
              setDone(empty);
            }}
            className="text-xs font-semibold text-muted hover:text-fg cursor-pointer"
          >
            İşaretleri temizle
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 bg-surface-2 hover:bg-surface-3 text-fg rounded-xl text-xs font-bold cursor-pointer">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
