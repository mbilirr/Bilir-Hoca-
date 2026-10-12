// Öğrenci portalında sayfa içi geçişleri tarayıcı geçmişine yazar.
// Böylece telefonda / tarayıcıda "Geri" denince bir önceki bölüme dönülür.
//
// Adres biçimi:
//   #/student                      → Ana sayfa
//   #/student/homework             → Ödevlerim
//   #/student/questions            → Soru Sayısı (varsayılan alt sekme)
//   #/student/questions/entry      → Soru Sayısı › + Soru Kaydet

export type StudentRouteTab = 'home' | 'homework' | 'etuts' | 'grades' | 'messages' | 'questions';
export type QuestionSubTab = 'entry' | 'weekly' | 'monthly' | 'history';

const STUDENT_TABS: StudentRouteTab[] = ['home', 'homework', 'etuts', 'grades', 'messages', 'questions'];
const QUESTION_SUB_TABS: QuestionSubTab[] = ['entry', 'weekly', 'monthly', 'history'];

const hashParts = (): string[] => window.location.hash.replace(/^#\/?/, '').split('/');

/** Adresteki öğrenci sekmesi (yoksa 'home') */
export function readStudentTab(): StudentRouteTab {
  const p = hashParts();
  if (p[0] !== 'student') return 'home';
  return (STUDENT_TABS as string[]).includes(p[1]) ? (p[1] as StudentRouteTab) : 'home';
}

/** Adresteki soru modülü alt sekmesi (yoksa null) */
export function readQuestionSubTab(): QuestionSubTab | null {
  const p = hashParts();
  if (p[0] !== 'student' || p[1] !== 'questions') return null;
  return (QUESTION_SUB_TABS as string[]).includes(p[2]) ? (p[2] as QuestionSubTab) : null;
}

export const studentTabHash = (tab: StudentRouteTab) => (tab === 'home' ? '#/student' : `#/student/${tab}`);

/** Öğrenci sekmesi değişince geçmişe yeni kayıt ekler (aynı sekmedeyse eklemez) */
export function pushStudentTab(tab: StudentRouteTab): void {
  if (readStudentTab() === tab && hashParts()[0] === 'student') return;
  window.history.pushState(null, '', studentTabHash(tab));
}

/** Soru modülünde alt sekme değişince geçmişe yeni kayıt ekler */
export function pushQuestionSubTab(sub: QuestionSubTab): void {
  const p = hashParts();
  if (p[0] !== 'student' || p[1] !== 'questions') return; // modül başka yerde kullanılıyorsa adrese dokunma
  const target = `#/student/questions/${sub}`;
  if (window.location.hash === target) return;
  window.history.pushState(null, '', target);
}
