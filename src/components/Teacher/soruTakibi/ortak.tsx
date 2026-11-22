// Soru Takibi: sayfanın ortak yardımcıları (Aşama 354b, QuestionTrackingView.tsx bölündü)
import { Student, ClassGroup, StudentQuestionLog } from '../../../types';

export const NO_LOGS: StudentQuestionLog[] = [];

export interface QuestionTrackingViewProps {
  classes: ClassGroup[];
  students: Student[];
}
