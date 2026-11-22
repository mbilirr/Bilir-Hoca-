// Ödevler: sayfanın ortak yardımcıları (Aşama 361, HomeworkManagement.tsx bölündü)
import { Homework, HomeworkSubmission, Student, ClassGroup } from '../../../types';

// Aşama 113: ana sayfa ve Etütler ile ortak "Benim / Tümü" kaydı
export const HOME_SCOPE_KEY = 'edu_home_scope_v1';

export const MINE = '__mine__';

export interface HomeworkManagementProps {
  homeworks: Homework[];
  submissions?: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
  onNavigateToEtut?: (subject: string, outcome: string) => void;
}
