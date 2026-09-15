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
  'Türkçe',
  'Matematik',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'T.C. İnkılap Tarihi',
  'Din Kültürü',
  'İngilizce',
];

export const HIGH_SCHOOL_SUBJECTS = [
  'Türk Dili ve Edebiyatı',
  'Matematik',
  'Geometri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Din Kültürü',
  'İngilizce',
];

export const ALL_SUBJECTS = [
  'Türkçe',
  'Matematik',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'T.C. İnkılap Tarihi',
  'Türk Dili ve Edebiyatı',
  'Geometri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Din Kültürü',
  'İngilizce',
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

export function detectSchoolLevelFromGrade(grade?: string): SchoolLevelType | undefined {
  if (!grade) return undefined;
  const g = grade.trim().toLowerCase();
  if (
    MIDDLE_SCHOOL_GRADES.some((m) => g.includes(m.toLowerCase())) ||
    /^[5678][\.\-\s]/.test(grade.trim()) ||
    /^[5678]$/.test(grade.trim()) ||
    g.includes('ortaokul') ||
    g.includes('lgs')
  ) {
    return 'Ortaokul';
  }
  if (
    HIGH_SCHOOL_GRADES.some((h) => g.includes(h.toLowerCase())) ||
    /^(9|10|11|12)[\.\-\s]/.test(grade.trim()) ||
    /^(9|10|11|12)$/.test(grade.trim()) ||
    g.includes('lise') ||
    g.includes('yks') ||
    g.includes('ayt') ||
    g.includes('tyt') ||
    g.includes('mezun')
  ) {
    return 'Lise';
  }
  return undefined;
}

export function getStudentSchoolLevel(
  student?: { schoolLevel?: SchoolLevelType; gradeLevel?: string; className?: string; classId?: string } | null,
  classes?: { id: string; name: string; schoolLevel?: SchoolLevelType }[]
): SchoolLevelType {
  if (!student) return 'Ortaokul';
  if (student.schoolLevel === 'Ortaokul' || student.schoolLevel === 'Lise') {
    return student.schoolLevel;
  }
  if (student.gradeLevel) {
    const detected = detectSchoolLevelFromGrade(student.gradeLevel);
    if (detected) return detected;
  }
  if (student.className) {
    const detected = detectSchoolLevelFromGrade(student.className);
    if (detected) return detected;
  }
  if (classes && student.classId) {
    const matchedClass = classes.find((c) => c.id === student.classId || c.name === student.className);
    if (matchedClass?.schoolLevel) return matchedClass.schoolLevel;
    if (matchedClass?.name) {
      const detected = detectSchoolLevelFromGrade(matchedClass.name);
      if (detected) return detected;
    }
  }
  return 'Ortaokul';
}

export function getStudentQuestionSubjects(
  student?: { schoolLevel?: SchoolLevelType; gradeLevel?: string; className?: string; classId?: string } | null,
  classes?: { id: string; name: string; schoolLevel?: SchoolLevelType }[]
): string[] {
  const level = getStudentSchoolLevel(student, classes);
  return level === 'Lise' ? HIGH_SCHOOL_SUBJECTS : MIDDLE_SCHOOL_SUBJECTS;
}
