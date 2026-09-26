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
  { id: 'A', label: 'A' },
  { id: 'B', label: 'B' },
  { id: 'C', label: 'C' },
  { id: 'D', label: 'D' },
  { id: 'E', label: 'E' },
  { id: 'F', label: 'F' },
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

/**
 * Format class and branch into clean standard school format:
 * '8. Sınıf - Şube A', '8.sınıf-Şube A', '8-A', '8/A' -> '8/A'
 * '11. Sınıf - Şube B' -> '11/B'
 * '6. Sınıf - Şube C' -> '6/C'
 */
export function formatClassDisplayName(
  className?: string,
  branch?: string,
  gradeLevel?: string
): string {
  if (!className && !branch && !gradeLevel) return '-';

  // 1. Extract grade number (5..12) if available from gradeLevel or className
  let gradeNum = '';
  if (gradeLevel) {
    const m = gradeLevel.match(/\b(1[0-2]|[1-9])\b/);
    if (m) gradeNum = m[1];
  }

  let branchLetter = '';
  if (branch) {
    const cleanBranch = branch.replace(/şube/gi, '').trim();
    const bm = cleanBranch.match(/([A-Za-zÇĞİÖŞÜçğiöşü])/);
    if (bm) branchLetter = bm[1].toUpperCase();
  }

  // If both grade number and branch letter are already identified
  if (gradeNum && branchLetter) {
    return `${gradeNum}/${branchLetter}`;
  }

  // 2. Parse from className string
  if (className) {
    const trimmed = className.trim();

    // Already in standard format like "8/A" or "11/B"
    const slashMatch = trimmed.match(/\b(1[0-2]|[1-9])\s*\/\s*([A-Za-zÇĞİÖŞÜçğiöşü])\b/);
    if (slashMatch) {
      return `${slashMatch[1]}/${slashMatch[2].toUpperCase()}`;
    }

    // Patterns like "8.sınıf-Şube A", "8. Sınıf - Şube A", "8. Sınıf - A", "8 - A", "8-A", "8 - Şube A"
    const hyphenMatch = trimmed.match(/\b(1[0-2]|[1-9])\s*(?:\.|\.sınıf|\. sınıf|\s*sınıf)?\s*[-–—]\s*(?:şube\s*)?([A-Za-zÇĞİÖŞÜçğiöşü])\b/i);
    if (hyphenMatch) {
      return `${hyphenMatch[1]}/${hyphenMatch[2].toUpperCase()}`;
    }

    // Pattern like "8A", "11B"
    const compactMatch = trimmed.match(/\b(1[0-2]|[1-9])\s*([A-Za-zÇĞİÖŞÜçğiöşü])\b/);
    if (compactMatch) {
      return `${compactMatch[1]}/${compactMatch[2].toUpperCase()}`;
    }

    // If className has the grade number and branch was given separately
    const numOnly = trimmed.match(/\b(1[0-2]|[1-9])\b/);
    if (numOnly && branchLetter) {
      return `${numOnly[1]}/${branchLetter}`;
    }

    // If gradeNum was found from gradeLevel and className has branch letter
    if (gradeNum) {
      const bFromClass = trimmed.match(/(?:şube\s*)?([A-Za-zÇĞİÖŞÜçğiöşü])\b/i);
      if (bFromClass) {
        return `${gradeNum}/${bFromClass[1].toUpperCase()}`;
      }
      return `${gradeNum}. Sınıf`;
    }

    return trimmed;
  }

  if (gradeNum) return `${gradeNum}. Sınıf`;
  return branch || '-';
}

/**
 * Returns a canonical normalized string key for a class (e.g. '8/a', '11/b')
 * Used across Windows, iOS, and Android to completely eliminate duplicate classes
 * regardless of how they were typed ('8/A', '8-A', '8. Sınıf - Şube A').
 */
export function getCanonicalClassKey(
  className?: string,
  branch?: string,
  gradeLevel?: string
): string {
  const display = formatClassDisplayName(className, branch, gradeLevel);
  if (!display || display === '-' || ['atanmadı', 'tanımsız', 'sınıfsız', 'sınıf', 'noclass'].includes(display.toLowerCase().trim())) {
    return '';
  }
  return display.toLowerCase().trim();
}


