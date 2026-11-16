// Aşama 295: "Bu cihazda açık kal" (30 gün).
// Varsayılan DEĞİŞMEDİ: kutu işaretlenmezse oturum yalnız o sekmede durur (sekme kapanınca biter, boşta kalınca düşer).
// Kutu işaretlenirse giriş oturumu bu cihazda saklanır: tarayıcı kapatılıp açılınca yeniden şifre sorulmaz, boşta kalma
// süresi uygulanmaz; 30 gün sonra ya da "Çıkış"a basılınca biter. Sistem sahibi hesabında KULLANILMAZ (294: iki adımlı giriş).
// Cihazda yalnız giriş anahtarı durur; öğrenci / not / mesaj verisi yine yalnız açık sekmede tutulur.
// Hesap değiştirme (bağlı hesaba geçiş) kalıcı oturumu sona erdirir: geçiş anahtarları yalnız sekmede yaşar (eski kural aynen).
const ISARET = 'bilir_acik_kal_v1'; // localStorage: { son: bitiş zamanı (ms) }
const SURE_MS = 30 * 24 * 60 * 60 * 1000;
const OTURUM_ANAHTARI = /^sb-.*-auth-token/;

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

/** Kalıcı oturumu bu SEKMEYE indirir ve cihazdan siler (sistem sahibi hesabı, hesap geçişi, başarısız giriş). Oturum kapanmaz;
 *  sekme eskisi gibi (yalnız sekmede yaşayan oturumla) sürer. Cihazdaki öbür kalıcı sekmeler giriş ekranına döner. */
export function acikKalVazgec(): void {
  if (!kalici) return;
  try {
    const l = ls();
    const s = ss();
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

/** Çıkışta: bu sekme kalıcı oturumdaysa cihazdaki oturum da silinir (öbür sekmeler `acikKalDinle` ile kapanır). */
export function acikKalCikis(): void {
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
