// ============================================================================
// DENEME ANALİZİ (Aşama 115) — ETÜT YÖNLENDİRME LİSTESİ EXCEL
// Seçilen denemelerde konu / kazanım başarısı ölçütün altında kalan öğrenciler, ders ders (her ders ayrı sayfa),
// sınıf sınıf ya da toplu. Ekrandaki listeyle aynı kural (studentTopicRows + eşik + en az soru) kullanılır.
// Yetki: yönetici, Müdür / Müdür Yrd., Rehberlik, Ölçme Değ. tüm dersler; Öğretmen / Zümre Başkanı yalnız branşı.
// Hız: yalnız "Excel indir"e basınca hesaplanır; xlsx kütüphanesi o anda iner.
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import type { ExamSubject } from './lgs';
import { LEVEL_INFO, levelOf, studentTopicRows, type StudentTopicRow } from './analiz';
import { dataService } from '../../services/dataService';
import { subjectsForBranch, zumreOf } from '../subjects';

export type EtutLevel = 'baslik' | 'konu' | 'alt';
export const LEVEL_TITLE: Record<EtutLevel, string> = { baslik: 'Konu', konu: 'Kazanım', alt: 'Alt kazanım' };

// Deneme dersi → öğretmen branşındaki karşılıkları
const KEY_BRANCHES: Record<string, string[]> = {
  tr: ['Türkçe', 'Türk Dili ve Edebiyatı'],
  mat: ['Matematik', 'Geometri'],
  fen: ['Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji'],
  sos: ['T.C. İnkılap Tarihi', 'Sosyal Bilgiler', 'Tarih'],
  din: ['Din Kültürü'],
  ing: ['İngilizce'],
};

/**
 * Öğretmenin (Öğretmen / Zümre Başkanı) görebileceği deneme dersleri. Zümre başkanında zümresinin dersleri de
 * sayılır. Branş kayıtlı değilse boş küme (hiçbir ders).
 */
export function myBranchSubjectKeys(): Set<string> {
  const t = dataService.getCurrentTeacher();
  const names = new Set(subjectsForBranch(t?.branch));
  if (dataService.hasRole('zumre_baskani')) for (const n of Array.from(names)) zumreOf(n).subjects.forEach((x) => names.add(x));
  const out = new Set<string>();
  for (const [key, list] of Object.entries(KEY_BRANCHES)) if (list.some((n) => names.has(n))) out.add(key);
  return out;
}

export interface ListeOpts {
  level: EtutLevel;
  threshold: number;
  minQ: number;
  topicKey: string; // yalnız tek ders indirilirken uygulanır ('' = tümü)
  duzen: 'sinif' | 'toplu';
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
const labelOf = (r: StudentTopicRow, level: EtutLevel) => (level === 'alt' && r.alt ? r.alt : r.konu);
const noteOf = (r: StudentTopicRow): string => {
  if (r.total < 3) return 'Az soru: sonuç kesin değil';
  if (r.d === 0 && r.y === 0) return 'Hiç cevaplamamış: konu eksik';
  if (r.b >= r.y && r.b > r.d) return 'Çoğunu boş bırakmış: konu bilgisi eksik';
  if (r.y > r.d) return 'Yanlışı çok: kavram yanılgısı olabilir';
  return 'Soru çözümüyle pekiştirilmeli';
};

/** Bir dersin ölçüt altındaki satırları (ekrandaki liste ile aynı süzgeç) */
export function belowRows(exams: DenemeExam[], results: DenemeResult[], subjectKey: string, o: Pick<ListeOpts, 'level' | 'threshold' | 'minQ' | 'topicKey'>): StudentTopicRow[] {
  const rows = studentTopicRows(exams, results, subjectKey, o.level).filter((r) => r.total >= o.minQ && r.rate < o.threshold);
  return o.topicKey ? rows.filter((r) => labelOf(r, o.level).toLocaleLowerCase('tr-TR') === o.topicKey) : rows;
}

const sheetNameOf = (raw: string, used: Set<string>) => {
  const base = (raw || 'Liste').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 28) || 'Liste';
  let name = base;
  let i = 2;
  while (used.has(name.toLocaleLowerCase('tr-TR'))) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
};

/** Her ders ayrı sayfa. Sınıf sınıf: sınıf başlığı → konu → öğrenci. Toplu: konu → öğrenci (sınıf sütunuyla). */
export async function downloadEtutListeExcel(
  exams: DenemeExam[],
  results: DenemeResult[],
  subjects: ExamSubject[],
  o: ListeOpts,
  meta: Array<[string, string]>,
  fileBase: string
): Promise<number> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const title = LEVEL_TITLE[o.level];
  const head = ['Sıra', 'Sınıf', 'Öğrenci', title, ...(o.level === 'alt' ? ['Konu / kazanım'] : []), 'Soru', 'D', 'Y', 'B', 'Başarı %', 'Durum', 'Not'];
  let total = 0;
  for (const sub of subjects) {
    const rows = belowRows(exams, results, sub.key, o);
    if (!rows.length) continue;
    total += rows.length;
    const line = (r: StudentTopicRow, i: number): Array<string | number> => [
      i,
      r.className || 'Sınıfsız',
      r.studentName,
      labelOf(r, o.level),
      ...(o.level === 'alt' ? [r.konu] : []),
      r.total,
      r.d,
      r.y,
      r.b,
      r.rate,
      LEVEL_INFO[levelOf(r.rate)].label,
      noteOf(r),
    ];
    const byTopicRate = (a: StudentTopicRow, b: StudentTopicRow) =>
      collator.compare(labelOf(a, o.level), labelOf(b, o.level)) || a.rate - b.rate || collator.compare(a.studentName, b.studentName);
    const aoa: Array<Array<string | number>> = [[`${sub.name.toLocaleUpperCase('tr-TR')} — ETÜT YÖNLENDİRME LİSTESİ`], ...meta.map(([k, v]) => [k, v]), ['Satır', rows.length], []];
    if (o.duzen === 'toplu') {
      aoa.push(head);
      rows.slice().sort(byTopicRate).forEach((r, i) => aoa.push(line(r, i + 1)));
    } else {
      const byClass = new Map<string, StudentTopicRow[]>();
      for (const r of rows) {
        const k = r.className || 'Sınıfsız';
        let l = byClass.get(k);
        if (!l) byClass.set(k, (l = []));
        l.push(r);
      }
      Array.from(byClass.keys())
        .sort(collator.compare)
        .forEach((cls, ci) => {
          if (ci) aoa.push([]);
          aoa.push([`Sınıf: ${cls}`]);
          aoa.push(head);
          byClass.get(cls)!.sort(byTopicRate).forEach((r, i) => aoa.push(line(r, i + 1)));
        });
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = head.map((h, i) => ({ wch: i === 2 ? 24 : h === title ? 50 : h === 'Konu / kazanım' ? 40 : h === 'Not' ? 34 : Math.max(7, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetNameOf(sub.name, used));
  }
  if (!total) return 0;
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
  return total;
}
