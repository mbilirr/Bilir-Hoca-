// Aşama 349c: DENEME ANLIK SİNYALİ
//  Deneme kaydı ya da sonucu değişince (sonuç yüklendi, yayımlandı, yayımı kalktı, düzeltildi) veritabanı içeriksiz bir
//  sinyal yazar (sql/349c; kurumun kanalına, yayımlı denemede sonucu olan öğrencinin kendi kanalına). Ekranlar bu sayıyı
//  okuma etkilerine bağımlılık olarak ekler: sinyal gelince (kısa beklemeyle tek sefer) yeniden okurlar.
//  SQL kurulu değilse sayı hiç artmaz; ekranların 5 dakikalık ve sekmeye dönüşteki okuması aynen sürer.
//  Aşama 386: dinleme ortak kancaya (lib/tabloSurumu) taşındı; davranış aynı.
import { useTabloSurumu } from './tabloSurumu';

const TABLOLAR = ['deneme_exams', 'deneme_results'] as const;
const BEKLE_MS = 1500; // toplu sonuç yüklemesinde art arda gelen sinyaller tek okumaya iner

export function useDenemeSurumu(aktif = true): number {
  return useTabloSurumu(TABLOLAR, aktif, BEKLE_MS);
}
