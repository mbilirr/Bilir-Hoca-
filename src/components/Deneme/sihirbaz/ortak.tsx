// Deneme sihirbazı: sayfanın ortak yardımcıları (Aşama 363, DenemeWizard.tsx bölündü)
import { type ClassGroup, type Student } from '../../../types';
import { type OtoOkuma } from '../../../lib/deneme/optikOtomatik';
import { subjectsForGrade, type ExamSubject } from '../../../lib/deneme/lgs';
import { type DenemeExam, type DraftFile } from '../../../services/denemeService';

/** Aşama 271: yeni denemenin dersleri sınıfa göre; kayıtlı deneme / taslakta soru sayısı ve ad kaydedilenden gelir */
export function wizardSubjects(grade: string, saved: ExamSubject[] | undefined): ExamSubject[] {
  const byKey = new Map((saved || []).map((x) => [x.key, x]));
  return subjectsForGrade(grade).map((s) => {
    const k = byKey.get(s.key);
    return k ? { ...s, name: k.name || s.name, short: k.short || s.short, count: k.count || s.count } : s;
  });
}

export const YANLIS_SECENEK = [
  { v: 3, label: '3 yanlış 1 doğruyu götürür' },
  { v: 4, label: '4 yanlış 1 doğruyu götürür' },
  { v: 0, label: 'Yanlış doğruyu götürmez' },
];

// ============================================================================
// Yeni deneme / optik yükleme sihirbazı (Aşama 47)
// 1) Bilgiler + cevap anahtarı/kazanım  2) Optik format + TXT  3) Öğrenci eşleştirme  4) Kontrol ve kayıt
// Var olan bir denemeye sonradan başka oturumun TXT'si yüklenirse, öğrencinin diğer derslerdeki cevapları korunur.
// Aşama 90: her TXT kendi formatıyla okunur (sözel ve sayısal için ayrı FMT); okunan derslerin doğruluğu cevap
// anahtarıyla denetlenir. Yeni deneme her adımda kaydedilebilir (taslak); "Devam" da kaydeder, çıkınca kaldığı
// yerden sürer. Taslakta TC tutulmaz: TC ile bulunan öğrenci yalnızca kimliğiyle saklanır.
// ============================================================================

export type Step = 1 | 2 | 3 | 4;

export const STEPS: Array<{ n: Step; title: string }> = [
  { n: 1, title: 'Bilgiler ve cevap anahtarı' },
  { n: 2, title: 'Optik dosyaları' },
  { n: 3, title: 'Öğrenci eşleştirme' },
  { n: 4, title: 'Kontrol ve kayıt' },
];

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const filled = (s?: string) => !!s && /[A-E*]/.test(s);

/** Aşama 90: yüklenen TXT (text) ya da taslaktan gelen okunmuş satırlar (rows). fmt: '' = yukarıda düzenlenen format */
// Aşama 271: fmt '__oto' = FMT'siz okuma; alanlar dosyanın kendisinden çözülür (oto)
export type TxtSrc = { name: string; text?: string; fmt: string; rows?: DraftFile['rows']; fmtName?: string; oto?: OtoOkuma };

export const OTO = '__oto';

export const OTO_AD = "FMT'siz okuma";

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const SQ_BTN = 'ui-btn ui-btn-sm w-32 justify-center';

// Aşama 63: "Denemelere dön" düğmesi deneme sonuçları ekranındakiyle aynı görünümde
export const BACK_BTN =
  'ui-btn ui-btn-lg border border-brand/40 bg-brand-soft text-brand-fg shadow-sm hover:bg-brand hover:text-white hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40';

export interface DenemeWizardProps {
  students: Student[];
  classes: ClassGroup[];
  existing?: DenemeExam | null; // varsa: optik yükleme bu denemeye yapılır (1. adım düzenleme olarak açılır)
  draft?: DenemeExam | null; // Aşama 90: yarım kalmış yeni deneme (kaldığı adımdan açılır)
  startStep?: Step;
  onCancel: () => void;
  onSaved: (examId: string) => void;
  onDraftChange?: () => void; // taslak kaydedildi / silindi (liste yenilenir)
  grade?: string; // Aşama 271: sayfada seçilen sınıf (yeni deneme); kayıtlı denemede kendi sınıfı kullanılır
}
