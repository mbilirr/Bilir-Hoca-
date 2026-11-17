// Aşama 295: "Bu cihazda açık kal" (30 gün).
// Varsayılan DEĞİŞMEDİ: kutu işaretlenmezse oturum yalnız o sekmede durur (sekme kapanınca biter, boşta kalınca düşer).
// Kutu işaretlenirse giriş oturumu bu cihazda saklanır: tarayıcı kapatılıp açılınca yeniden şifre sorulmaz, boşta kalma
// süresi uygulanmaz; 30 gün sonra ya da "Çıkış"a basılınca biter.
// Aşama 326: sistem sahibi hesabında da kullanılır (eskiden 294 nedeniyle dışlanmıştı). İki adımlı giriş kodu yine ilk
// girişte sorulur; doğrulanmış (aal2) oturum cihazda 30 gün durur, yenilemede doğrulama düzeyi korunur.
// Cihazda yalnız giriş anahtarı durur; öğrenci / not / mesaj verisi yine yalnız açık sekmede tutulur.
// Hesap / kurum geçişi sırasında cihazdaki kopya silinir (yenileme anahtarı iki yerde olursa biri geçersiz kalır ve oturum
// kapanır); geçişten KENDİ hesabına dönüldüğünde kalıcı oturum yeniden cihaza yazılır (acikKalGeriAl, Aşama 326).
const ISARET = 'bilir_acik_kal_v1'; // localStorage: { son: bitiş zamanı (ms) }
const SURE_MS = 30 * 24 * 60 * 60 * 1000;
const OTURUM_ANAHTARI = /^sb-.*-auth-token/;
const GERI = 'bilir_acik_kal_geri'; // sessionStorage: geçişe çıkmadan önce kalıcı oturumdaydık (değer: bitiş zamanı ms)

const ls = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
const ss = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};
const anahtarlar = (s: Storage | null): string[] => {
  try {
    return s ? Object.keys(s).filter((k) => OTURUM_ANAHTARI.test(k)) : [];
  } catch {
    return [];
  }
};

function isaretSon(): number {
  try {
    const v = JSON.parse(ls()?.getItem(ISARET) || 'null');
    return v && typeof v.son === 'number' ? v.son : 0;
  } catch {
    return 0;
  }
}
/** Cihazdaki kalıcı oturum işareti geçerli mi (süresi dolmadıysa) */
export function acikKalGecerli(): boolean {
  return isaretSon() > Date.now();
}
function cihaziTemizle(): void {
  try {
    const l = ls();
    l?.removeItem(ISARET);
    anahtarlar(l).forEach((k) => l!.removeItem(k));
  } catch {
    /* depolama kapalı */
  }
}

// Açılışta: süresi dolmuş ya da işaretsiz kalmış cihaz oturumu silinir (eski sürümlerden kalan kalıcı anahtarlar da)
if (!acikKalGecerli()) cihaziTemizle();

// Bu sekme cihazdaki kalıcı oturumu mu kullanıyor? Sekmenin kendi oturumu varsa (hesap geçişi, kutusuz giriş) o önceliklidir.
let kalici = acikKalGecerli() && anahtarlar(ss()).length === 0;

export const acikKalSekmesi = (): boolean => kalici;

/** Girişten hemen ÖNCE: kutu işaretliyse oturum cihaza, değilse yalnız bu sekmeye yazılır. */
export function acikKalGiris(isaretli: boolean): void {
  try {
    ss()?.removeItem(GERI); // yeni giriş: eski geçişin dönüş işareti geçersiz
  } catch {
    /* depolama kapalı */
  }
  if (!isaretli) {
    kalici = false;
    return;
  }
  try {
    ls()?.setItem(ISARET, JSON.stringify({ son: Date.now() + SURE_MS }));
    kalici = acikKalGecerli(); // depolama kapalıysa sekme oturumu olarak kalır
  } catch {
    kalici = false;
  }
}

/** Kalıcı oturumu bu SEKMEYE indirir ve cihazdan siler (hesap geçişi, başarısız giriş). Oturum kapanmaz;
 *  sekme eskisi gibi (yalnız sekmede yaşayan oturumla) sürer. Cihazdaki öbür kalıcı sekmeler giriş ekranına döner.
 *  donusIcin: hesap geçişi; kişi kendi hesabına dönünce kalıcı oturum geri kurulsun diye bitiş zamanı sekmede tutulur. */
export function acikKalVazgec(donusIcin = false): void {
  if (!kalici) return;
  try {
    const l = ls();
    const s = ss();
    if (donusIcin && s) s.setItem(GERI, String(isaretSon()));
    anahtarlar(l).forEach((k) => {
      const v = l!.getItem(k);
      if (v && s) s.setItem(k, v);
    });
  } catch {
    /* depolama kapalı */
  }
  kalici = false;
  cihaziTemizle();
}

/** Aşama 326: geçişten kendi hesabına dönülürken (sayfa yenilenmeden, yeni oturum yazılmadan HEMEN ÖNCE): geçişe kalıcı
 *  oturumdan çıkılmışsa ve süresi dolmadıysa cihaz işareti yeniden kurulur, sekmedeki geçiş oturumu silinir; sonra yazılan
 *  kendi oturum anahtarı cihaza gider. Dönüş işareti yoksa (kalıcı oturum yoktu) hiçbir şey yapmaz. */
export function acikKalGeriAl(): void {
  try {
    const s = ss();
    const son = Number(s?.getItem(GERI) || 0);
    s?.removeItem(GERI);
    if (!s || !(son > Date.now())) return;
    anahtarlar(s).forEach((k) => s.removeItem(k));
    ls()?.setItem(ISARET, JSON.stringify({ son }));
    kalici = acikKalGecerli();
  } catch {
    kalici = false;
  }
}

/** Çıkışta: bu sekme kalıcı oturumdaysa cihazdaki oturum da silinir (öbür sekmeler `acikKalDinle` ile kapanır). */
export function acikKalCikis(): void {
  try {
    ss()?.removeItem(GERI);
  } catch {
    /* depolama kapalı */
  }
  if (kalici) cihaziTemizle();
  kalici = false;
}

/** Kalıcı oturumun süresi doldu mu (30 gün) → çağıran çıkış yapar */
export function acikKalBitti(): boolean {
  return kalici && !acikKalGecerli();
}

/** Başka sekmede çıkış yapıldıysa (işaret silindi) haber verir; çağıran sayfayı yeniler (oturumsuz sekme giriş ekranına düşer).
 *  Dönen işlev dinlemeyi kaldırır. */
export function acikKalDinle(cikildi: () => void): () => void {
  const h = (e: StorageEvent) => {
    if (kalici && e.key === ISARET && !e.newValue) {
      kalici = false;
      cikildi();
    }
  };
  window.addEventListener('storage', h);
  return () => window.removeEventListener('storage', h);
}

/** Supabase giriş oturumunun saklandığı yer: kalıcı sekmede cihaz (localStorage), değilse yalnız bu sekme (sessionStorage). */
export const oturumDeposu = {
  getItem(key: string): string | null {
    try {
      return (kalici ? ls() : ss())?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      (kalici ? ls() : ss())?.setItem(key, value);
    } catch {
      /* depolama dolu / kapalı */
    }
  },
  removeItem(key: string): void {
    try {
      (kalici ? ls() : ss())?.removeItem(key);
    } catch {
      /* depolama kapalı */
    }
  },
};
