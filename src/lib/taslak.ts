// Aşama 344: form taslakları (yarım kalan ödev, etüt, duyuru, mesaj).
// Taslak yalnız bu sekmede (sessionStorage) ve en çok 24 saat tutulur; hesap kimliğiyle ayrılır (aynı sekmede başka hesap
// başkasının taslağını göremez). Boşta kalınca kapanan oturumdan sonra aynı hesapla girilince taslak geri gelir.
// Elle çıkışta bütün taslaklar silinir (dataService.logout). Anahtarlar edu_sys_ ile başlamaz; çıkıştaki genel temizlik
// (clearSessionAppData) bu yüzden onlara dokunmaz.

const ONEK = 'bilir_taslak_';
const OMUR_MS = 24 * 60 * 60 * 1000;

export interface Taslak<T> {
  deger: T;
  zaman: number;
}

const depo = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const taslakAnahtari = (uid: string | null | undefined, ad: string | null | undefined): string | null =>
  uid && ad ? `${ONEK}${uid}_${ad}` : null;

export function taslakOku<T>(anahtar: string | null): Taslak<T> | null {
  const s = depo();
  if (!s || !anahtar) return null;
  try {
    const ham = s.getItem(anahtar);
    if (!ham) return null;
    const t = JSON.parse(ham) as Taslak<T>;
    if (!t || typeof t.zaman !== 'number' || Date.now() - t.zaman > OMUR_MS) {
      s.removeItem(anahtar);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function taslakYaz<T>(anahtar: string | null, deger: T): void {
  const s = depo();
  if (!s || !anahtar) return;
  try {
    s.setItem(anahtar, JSON.stringify({ deger, zaman: Date.now() } satisfies Taslak<T>));
  } catch {
    /* yer yoksa taslak tutulmaz; form çalışmaya devam eder */
  }
}

export function taslakSil(anahtar: string | null): void {
  const s = depo();
  if (!s || !anahtar) return;
  try {
    s.removeItem(anahtar);
  } catch {}
}

/** Elle çıkışta: bu sekmedeki bütün taslaklar silinir. */
export function taslaklariSil(): void {
  const s = depo();
  if (!s) return;
  try {
    const sil: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(ONEK)) sil.push(k);
    }
    sil.forEach((k) => s.removeItem(k));
  } catch {}
}

/** "bugün 14:32", "dün 09:10", "20 Kas 16:05" */
export function taslakZamani(zaman: number): string {
  const d = new Date(zaman);
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const gun = new Date(d);
  gun.setHours(0, 0, 0, 0);
  const fark = Math.round((bugun.getTime() - gun.getTime()) / 86400000);
  if (fark === 0) return `bugün ${saat}`;
  if (fark === 1) return `dün ${saat}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${saat}`;
}
