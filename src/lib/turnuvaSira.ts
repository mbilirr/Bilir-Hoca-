// Aşama 389: turnuva sıralamasının saf hesapları (sınıf sırası, kısa ad). Öğrenci sırası veritabanından gelir
// (oyun_turnuva_sira); sınıf sırası o satırlardan burada türetilir. Testi: tests/turnuva.test.ts
export interface TurnuvaSatiri {
  studentId: string;
  ad: string;
  classId: string;
  classAd: string;
  puan: number;
  dogru: number;
  toplam: number;
  oyunSayisi: number;
  sira: number;
}
export interface SinifSatiri {
  classId: string;
  classAd: string;
  oynayan: number;
  ortalama: number;
  toplamPuan: number;
  sira: number;
}

/** Sınıf sırası: sınıftaki oynayan öğrencilerin ORTALAMA turnuva puanı (kalabalık sınıf öne geçmesin); eşitlikte çok oynayan önde */
export function sinifSirasi(satirlar: TurnuvaSatiri[]): SinifSatiri[] {
  const m = new Map<string, { classId: string; classAd: string; oynayan: number; toplamPuan: number }>();
  for (const s of satirlar) {
    const k = s.classId || s.classAd;
    const x = m.get(k) || { classId: s.classId, classAd: s.classAd, oynayan: 0, toplamPuan: 0 };
    x.oynayan += 1;
    x.toplamPuan += s.puan;
    m.set(k, x);
  }
  const l = [...m.values()]
    .map((x) => ({ ...x, ortalama: x.oynayan ? Math.round(x.toplamPuan / x.oynayan) : 0, sira: 0 }))
    .sort((a, b) => b.ortalama - a.ortalama || b.oynayan - a.oynayan || a.classAd.localeCompare(b.classAd, 'tr'));
  l.forEach((x, i) => {
    const onceki = l[i - 1];
    x.sira = onceki && onceki.ortalama === x.ortalama && onceki.oynayan === x.oynayan ? onceki.sira : i + 1;
  });
  return l;
}

/** Tahtada gösterim için kısa ad: "Ayşe Nur Yılmaz" → "Ayşe Nur Y." */
export function kisaAd(ad: string): string {
  const p = ad.trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || '';
  const son = p[p.length - 1];
  return /\.$/.test(son) ? p.join(' ') : `${p.slice(0, -1).join(' ')} ${son.charAt(0).toLocaleUpperCase('tr-TR')}.`;
}
