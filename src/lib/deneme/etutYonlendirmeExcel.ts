// ============================================================================
// DENEME ANALİZİ (Aşama 115) — ETÜT YÖNLENDİRME LİSTESİ EXCEL
// Seçilen denemelerde konu / kazanım başarısı ölçütün altında kalan öğrenciler, ders ders (her ders ayrı sayfa),
// sınıf sınıf ya da toplu. Ekrandaki listeyle aynı kural (studentTopicRows + eşik + en az soru) kullanılır.
// Yetki: yönetici, Müdür / Müdür Yrd., Rehberlik, Ölçme Değ. tüm dersler; Öğretmen / Zümre Başkanı yalnız branşı.
// Hız: yalnız "Excel indir"e basınca hesaplanır; küçük renkli yazıcı (fflate) o anda iner (Aşama 120).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import type { ExamSubject } from './lgs';
import { LEVEL_INFO, levelOf, studentTopicRows, type StudentTopicRow } from './analiz';
import { dataService } from '../../services/dataService';
import { subjectsForBranch, zumreOf } from '../subjects';
import { downloadStyledXlsx, groupStyle, safeSheetName, type Cell, type CellStyle, type StyledSheet } from '../xlsxStyled';

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

/**
 * Her ders ayrı sayfa. Sınıf sınıf: sınıf başlığı → konu → öğrenci. Toplu: konu → öğrenci (sınıf sütunuyla).
 * Aşama 120: her konu / kazanım kendi açık renginde (aynı kazanım sayfanın her sınıf bloğunda aynı renk);
 * tablo başlığı kalın ve gri zeminli. Ağır xlsx kütüphanesi yerine küçük renkli yazıcı kullanılır.
 */
export async function downloadEtutListeExcel(
  exams: DenemeExam[],
  results: DenemeResult[],
  subjects: ExamSubject[],
  o: ListeOpts,
  meta: Array<[string, string]>,
  fileBase: string
): Promise<number> {
  const used = new Set<string>();
  const sheets: StyledSheet[] = [];
  const title = LEVEL_TITLE[o.level];
  const head = ['Sıra', 'Sınıf', 'Öğrenci', title, ...(o.level === 'alt' ? ['Konu / kazanım'] : []), 'Soru', 'D', 'Y', 'B', 'Başarı %', 'Durum', 'Not'];
  const headRow: Cell[] = head.map((h) => ({ v: h, s: 'head' }));
  const cols = head.map((h, i) => (i === 2 ? 24 : h === title ? 50 : h === 'Konu / kazanım' ? 40 : h === 'Not' ? 34 : Math.max(7, h.length + 2)));
  let total = 0;
  for (const sub of subjects) {
    const rows = belowRows(exams, results, sub.key, o);
    if (!rows.length) continue;
    total += rows.length;
    // Konu / kazanım → renk: sayfada ilk görüldüğü sırayla (sıralı listede komşu gruplar farklı renk olur)
    const colorOf = new Map<string, CellStyle>();
    const styleOf = (r: StudentTopicRow): CellStyle => {
      const k = labelOf(r, o.level);
      let s = colorOf.get(k);
      if (!s) colorOf.set(k, (s = groupStyle(colorOf.size)));
      return s;
    };
    const line = (r: StudentTopicRow, i: number): Cell[] => {
      const s = styleOf(r);
      const vals: Array<string | number> = [
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
      return vals.map((v) => ({ v, s }));
    };
    const byTopicRate = (a: StudentTopicRow, b: StudentTopicRow) =>
      collator.compare(labelOf(a, o.level), labelOf(b, o.level)) || a.rate - b.rate || collator.compare(a.studentName, b.studentName);
    const out: Cell[][] = [
      [{ v: `${sub.name.toLocaleUpperCase('tr-TR')} — ETÜT YÖNLENDİRME LİSTESİ`, s: 'title' }],
      ...meta.map(([k, v]): Cell[] => [{ v: k, s: 'bold' }, v]),
      [{ v: 'Satır', s: 'bold' }, rows.length],
      [],
    ];
    if (o.duzen === 'toplu') {
      out.push(headRow);
      rows.slice().sort(byTopicRate).forEach((r, i) => out.push(line(r, i + 1)));
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
          if (ci) out.push([]);
          out.push([{ v: `Sınıf: ${cls}`, s: 'bold' }]);
          out.push(headRow);
          byClass.get(cls)!.sort(byTopicRate).forEach((r, i) => out.push(line(r, i + 1)));
        });
    }
    sheets.push({ name: safeSheetName(sub.name, used), rows: out, cols });
  }
  if (!total) return 0;
  await downloadStyledXlsx(`${fileBase}.xlsx`, sheets);
  return total;
}
