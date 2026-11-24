// Aşama 395: soru denetim kuralları (saf; ekran, Excel ve test ortak kullanır). oyunService buradan yeniden dışa aktarır.
import type { OyunSoruGirdi } from '../services/oyunService';

/** Sunucuyla aynı kural: büyük harfe çevrilir; yalnız harf, 2-15 karakter. Hata metni ya da null */
export function kelimeHatasi(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Cevap kelimesini yazın.';
  const b = t.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR');
  if (!/^[A-ZÇĞİÖŞÜ]{2,15}$/.test(b)) return 'Cevap 2 ile 15 harfli tek bir kelime olmalı (boşluk, rakam ve işaret olmaz).';
  return null;
}

/** Soruyu kaydetmeden önce ekranda denetler (sunucu yine denetler). Hata metni ya da null */
export function soruHatasi(g: OyunSoruGirdi): string | null {
  if (!g.ders.trim()) return 'Dersi seçin.';
  if (g.metin.trim().length < 3) return g.tur === 'kelime' ? 'İpucunu yazın.' : 'Soru metnini yazın.';
  if (g.metin.trim().length > 600) return 'Soru metni en çok 600 karakter olabilir.';
  if (g.tur === 'coktan') {
    const s = g.siklar.map((x) => x.trim());
    if (s.length !== 4 || s.some((x) => !x)) return 'Dört şıkkın hepsini yazın.';
    if (new Set(s.map((x) => x.toLocaleLowerCase('tr-TR'))).size !== 4) return 'Şıklar birbirinden farklı olmalı.';
    if (g.dogru === null || g.dogru < 0 || g.dogru > 3) return 'Doğru şıkkı seçin.';
  } else {
    return kelimeHatasi(g.cevap);
  }
  return null;
}
