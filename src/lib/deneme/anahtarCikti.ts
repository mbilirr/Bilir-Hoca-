// ============================================================================
// DENEME ANALİZİ (Aşama 91) — CEVAP ANAHTARINI GÖSTERME VE İNDİRME (A / B KİTAPÇIĞI)
// Sistemde anahtar A sırasıyla tutulur; B kitapçığının anahtarı her A sorusunun "B karşılığı"ndan kurulur.
// İndirilen Excel yayınevi düzenindedir (A ve B alt alta, dersler yan yana); sisteme yeniden yüklenebilir.
// ============================================================================
import type { ExamQuestions, ExamSubject } from './lgs';
import { safeFileName } from './karnePdf';

export type Booklet = 'A' | 'B';

// Excel başlığında kısa ders adları (sütuna sığar; sisteme yeniden yüklenince tanınır)
const HEAD: Record<string, string> = { tr: 'TÜRKÇE', sos: 'T.C. İNKILAP', din: 'DİN KÜLTÜRÜ', ing: 'YABANCI DİL', mat: 'MATEMATİK', fen: 'FEN BİLİMLERİ' };
const headOf = (s: ExamSubject) => HEAD[s.key] || s.name.toLocaleUpperCase('tr-TR');

/** Ekranda ve dosyada gösterilecek harf: iptal soru "İ" (yayınevi yazımı) */
export const showLetter = (a: string | undefined) => (a === 'X' ? 'İ' : a || '-');

/** Dersin seçilen kitapçıktaki anahtarı (dizinin i. elemanı o kitapçığın i+1. sorusu) */
export function bookletKey(subject: ExamSubject, qs: ExamQuestions, booklet: Booklet): string[] {
  const list = qs[subject.key] || [];
  const out: string[] = Array.from({ length: subject.count }, () => '');
  for (const q of list) {
    const n = booklet === 'B' ? q.bNo || q.no : q.no;
    if (n >= 1 && n <= subject.count && !out[n - 1]) out[n - 1] = (q.answer || '').toUpperCase();
  }
  return out;
}

/** Hiçbir derste B karşılığı girilmemişse B, A ile aynı sırada sayılır */
export const hasBMapping = (subjects: ExamSubject[], qs: ExamQuestions) =>
  subjects.some((s) => (qs[s.key] || []).some((q) => q.bNo && q.bNo !== q.no));

/**
 * Yayınevi düzeni (Özdebir vb.): "<ad> (A GRUBU)" başlığı, ders adları satırı, her ders için "no | cevap"
 * sütun çifti; B kitapçığı altında aynı düzenle. Bu düzen sisteme yeniden yüklenebilir.
 */
export function keyGrid(examName: string, subjects: ExamSubject[], qs: ExamQuestions): Array<Array<string | number>> {
  const max = Math.max(0, ...subjects.map((s) => s.count));
  const rows: Array<Array<string | number>> = [];
  (['A', 'B'] as Booklet[]).forEach((b, bi) => {
    if (bi) rows.push([], []);
    rows.push([`${examName.toLocaleUpperCase('tr-TR')} (${b} GRUBU)`]);
    rows.push(subjects.flatMap((s) => [headOf(s), '']));
    const keys = subjects.map((s) => bookletKey(s, qs, b));
    for (let i = 0; i < max; i++) rows.push(subjects.flatMap((s, j) => (i < s.count ? [i + 1, showLetter(keys[j][i])] : ['', ''])));
  });
  return rows;
}

/** Soru eşleşmesi: her A sorusunun B'deki numarası (soru bazlı analiz için) */
export function keyPairs(subjects: ExamSubject[], qs: ExamQuestions): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [['Ders', 'A soru no', 'Cevap', 'B soru no']];
  for (const s of subjects) for (const q of qs[s.key] || []) rows.push([s.name, q.no, showLetter((q.answer || '').toUpperCase()), q.bNo || q.no]);
  return rows;
}

/** Excel dosyası (xlsx yalnızca indirirken yüklenir) */
export async function downloadKeyExcel(examName: string, subjects: ExamSubject[], qs: ExamQuestions, fileName: string): Promise<void> {
  const mod: any = await import('xlsx');
  const XLSX = mod.utils ? mod : mod.default;
  const wb = XLSX.utils.book_new();
  const aoa = keyGrid(examName, subjects, qs);
  const grid = XLSX.utils.aoa_to_sheet(aoa);
  grid['!cols'] = subjects.flatMap(() => [{ wch: 5 }, { wch: 10 }]);
  // Başlıklar birleştirilmiş hücrede: sınav adı bütün satırda, ders adı kendi iki sütununda
  const merges: any[] = [];
  aoa.forEach((r, i) => {
    if (r.length === 1) merges.push({ s: { r: i, c: 0 }, e: { r: i, c: subjects.length * 2 - 1 } });
    else if (r.length && i > 0 && aoa[i - 1].length === 1) subjects.forEach((_, j) => merges.push({ s: { r: i, c: j * 2 }, e: { r: i, c: j * 2 + 1 } }));
  });
  grid['!merges'] = merges;
  XLSX.utils.book_append_sheet(wb, grid, 'Cevap Anahtarı');
  const pairs = XLSX.utils.aoa_to_sheet(keyPairs(subjects, qs));
  pairs['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, pairs, 'Soru Eşleşmesi');
  XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
}
