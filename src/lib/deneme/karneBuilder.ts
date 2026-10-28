// ============================================================================
// Aşama 101: ÖĞRENCİ KARNESİ ÜRETİCİSİ (tek yer)
// Tek karne PDF'i, öğrenciye e-posta, sınıfa toplu indirme / e-posta / SMS aynı işlevle üretilir;
// böylece her yolda aynı karne çıkar. Yalnızca o öğrencinin sonuçları verilir.
// ============================================================================
import type { KarneTur } from '../../components/Deneme/KarneIleri';
import type { BankRow, DenemeExam, DenemeResult } from '../../services/denemeService';
import type { StudySuggestion } from './kazanimKarne';
import type { PdfBlock } from './karnePdf';
import { priorityKarne, veliKarneData } from './veliKurumKarne';
import { kazanimKarneBlocks, oncelikKarneBlocks, studentKarneBlocks, studyPlanKarneBlocks, usedSubjects, veliKarneBlocks } from './karneModel';

export type PdfOrientation = 'portrait' | 'landscape';

export const TUR_TITLE: Record<KarneTur, string> = {
  genel: 'Deneme karnen',
  kazanim: 'Kazanım takip karnen',
  plan: 'Çalışma planı karnen',
  oncelik: 'Öncelikli konu karnen',
  veli: 'Veli bilgilendirme karnesi',
};
export const TUR_NAME: Record<KarneTur, string> = {
  genel: 'deneme karnesi',
  kazanim: 'kazanım takip karnesi',
  plan: 'çalışma planı karnesi',
  oncelik: 'öncelikli konu karnesi',
  veli: 'veli bilgilendirme karnesi',
};

export type BuiltKarne = { blocks: PdfBlock[]; footer: string; file: string; title: string; orientation: PdfOrientation };
export type KarneContext = { tur: KarneTur; exams: DenemeExam[]; scopeLabel: string; bank?: BankRow[] | null; teacherName?: string };
export type KarneStudent = { id: string; name: string; className: string };
export type KarneExtra = { target: number | null; detailExamId?: string; veliNote?: string; planPicks?: StudySuggestion[] };

/** Öğrencinin seçili türdeki karnesi; sonucu yoksa null */
export function buildStudentKarne(ctx: KarneContext, s: KarneStudent, studentResults: DenemeResult[], extra: KarneExtra): BuiltKarne | null {
  const results = studentResults.filter((r) => r.studentId === s.id);
  if (!results.length) return null;
  const { tur, exams, scopeLabel } = ctx;
  const base = { studentName: s.name, className: s.className || '' };
  const out = (blocks: PdfBlock[] | null, footer: string, file: string): BuiltKarne | null =>
    blocks && blocks.length ? { blocks, footer: `${s.name} ${footer}`, file: `${file}-${s.name}`, title: TUR_TITLE[tur], orientation: 'portrait' } : null;
  if (tur === 'kazanim') {
    return out(kazanimKarneBlocks({ ...base, exams, results, scopeLabel, bank: ctx.bank }), 'kazanım takip karnesi', 'Kazanim-Takip-Karnesi');
  }
  if (tur === 'veli') {
    const d = veliKarneData(exams, results, extra.target, usedSubjects(exams));
    return out(d ? veliKarneBlocks(d, { ...base, note: extra.veliNote || '', teacherName: ctx.teacherName || '' }) : null, 'veli bilgilendirme karnesi', 'Veli-Karnesi');
  }
  if (tur === 'oncelik') {
    const pk = priorityKarne(exams, results, usedSubjects(exams));
    const used = exams.filter((e) => results.some((r) => r.examId === e.id));
    return out(oncelikKarneBlocks(pk, { ...base, scopeLabel, exams: used }), 'öncelikli konu karnesi', 'Oncelikli-Konular');
  }
  if (tur === 'plan') {
    return out(studyPlanKarneBlocks({ ...base, exams, results, scopeLabel, suggestions: extra.planPicks }), 'çalışma planı karnesi', 'Calisma-Plani-Karnesi');
  }
  return out(studentKarneBlocks({ ...base, exams, results, target: extra.target, scopeLabel, detailExamId: extra.detailExamId }), 'deneme karnesi', 'Deneme-Karnesi');
}
