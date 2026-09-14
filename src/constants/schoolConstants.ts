export type SchoolLevelType = 'Ortaokul' | 'Lise';

export const SCHOOL_LEVELS: { id: SchoolLevelType; label: string }[] = [
  { id: 'Ortaokul', label: 'Ortaokul' },
  { id: 'Lise', label: 'Lise' },
];

export const MIDDLE_SCHOOL_GRADES = [
  '5. Sınıf',
  '6. Sınıf',
  '7. Sınıf',
  '8. Sınıf',
];

export const HIGH_SCHOOL_GRADES = [
  '9. Sınıf',
  '10. Sınıf',
  '11. Sınıf',
  '12. Sınıf',
];

export const ALL_GRADES = [
  ...MIDDLE_SCHOOL_GRADES,
  ...HIGH_SCHOOL_GRADES,
];

export const MIDDLE_SCHOOL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilgisi',
  'Sosyal Bilgiler',
  'İngilizce',
];

export const HIGH_SCHOOL_SUBJECTS = [
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Coğrafya',
  'Tarih',
  'Edebiyat',
];

export const ALL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilgisi',
  'Sosyal Bilgiler',
  'İngilizce',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Coğrafya',
  'Tarih',
  'Edebiyat',
];

export function getSubjectsForSchoolLevel(schoolLevel: string): string[] {
  if (schoolLevel === 'Ortaokul') {
    return MIDDLE_SCHOOL_SUBJECTS;
  }
  if (schoolLevel === 'Lise') {
    return HIGH_SCHOOL_SUBJECTS;
  }
  return ALL_SUBJECTS;
}

export const BRANCH_OPTIONS = [
  { id: 'A', label: 'Şube A' },
  { id: 'B', label: 'Şube B' },
  { id: 'C', label: 'Şube C' },
  { id: 'D', label: 'Şube D' },
  { id: 'E', label: 'Şube E' },
  { id: 'F', label: 'Şube F' },
];

export function getGradesForSchoolLevel(schoolLevel: string): string[] {
  if (schoolLevel === 'Ortaokul') {
    return MIDDLE_SCHOOL_GRADES;
  }
  if (schoolLevel === 'Lise') {
    return HIGH_SCHOOL_GRADES;
  }
  return ALL_GRADES;
}

export function detectSchoolLevelFromGrade(grade: string): SchoolLevelType | undefined {
  if (MIDDLE_SCHOOL_GRADES.includes(grade) || /^[5678]/.test(grade)) {
    return 'Ortaokul';
  }
  if (HIGH_SCHOOL_GRADES.includes(grade) || /^(9|10|11|12)/.test(grade)) {
    return 'Lise';
  }
  return undefined;
}
