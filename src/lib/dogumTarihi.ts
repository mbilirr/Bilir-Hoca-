// =============================================================================
// Aşama 324: öğrencinin doğum tarihi — Excel'den okuma, doğrulama ve gösterme.
// Saklanan biçim 'YYYY-MM-DD' (veritabanında date). Saat dilimi yok: gün, ay, yıl doğrudan kurulur.
// =============================================================================

const pad = (n: number) => String(n).padStart(2, '0');

function bugunIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Takvimde gerçekten olan, 1900 ile bugün arasındaki tarih → 'YYYY-MM-DD'; değilse null */
function kur(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return iso < '1900-01-01' || iso > bugunIso() ? null : iso;
}

/** 'YYYY-MM-DD' geçerli bir doğum tarihi mi? Geçerliyse aynı yazıyı, değilse null döner. */
export function gecerliDogumTarihi(v?: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  return m ? kur(+m[1], +m[2], +m[3]) : null;
}

const AYLAR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];

/**
 * Excel hücresindeki doğum tarihi → 'YYYY-MM-DD'. Boş hücre geçerli sayılır (value '').
 * Tanınanlar: 04.03.2012, 4/3/2012, 04-03-12 (Türkiye sırası: gün.ay.yıl), 2012-03-04, 4 Mart 2012, 04032012,
 * ve Excel'in biçimsiz tarih sayısı (K12 "Öğrenci Doğum Tarihi" sütunu böyle verir: 5 haneli gün sayısı).
 */
export function excelDogumTarihi(raw: unknown): { value: string; valid: boolean } {
  const t = String(raw ?? '').trim().toLocaleLowerCase('tr');
  if (!t) return { value: '', valid: true };
  let iso: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ t].*)?$/.exec(t))) {
    iso = kur(+m[1], +m[2], +m[3]);
  } else if ((m = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{4}|\d{2})$/.exec(t))) {
    let y = +m[3];
    if (m[3].length === 2) y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
    iso = kur(y, +m[2], +m[1]);
  } else if ((m = /^(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})$/.exec(t))) {
    const ay = AYLAR.indexOf(m[2]) + 1;
    iso = ay ? kur(+m[3], ay, +m[1]) : null;
  } else if ((m = /^(\d{5})(?:[.,]0+)?$/.exec(t))) {
    // Excel gün sayısı (1899-12-30 + gün). 5 hane: 1927 ve sonrası; "2012" gibi tek yıl yanlışlıkla tarih sayılmaz.
    const d = new Date(Date.UTC(1899, 11, 30) + +m[1] * 86400000);
    iso = kur(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  } else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) {
    iso = kur(+m[3], +m[2], +m[1]);
  }
  return iso ? { value: iso, valid: true } : { value: '', valid: false };
}

/** 'YYYY-MM-DD' → '04.03.2012' (boşsa '') */
export function dogumTarihiYaz(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Bugünkü yaş (tam yıl); tarih yoksa null */
export function yasHesapla(iso?: string | null, bugun: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const y = +m[1];
  const ay = +m[2];
  const g = +m[3];
  let yas = bugun.getFullYear() - y;
  if (bugun.getMonth() + 1 < ay || (bugun.getMonth() + 1 === ay && bugun.getDate() < g)) yas--;
  return yas >= 0 ? yas : null;
}

/** Bugünün tarihi 'YYYY-MM-DD' (tarih kutusunun en büyük değeri) */
export const bugunTarih = bugunIso;
