// Branş / ders listeleri (Plan & Zümre Arşivi ve belge yükleme için ortak)
export const ORTAOKUL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilgisi',
  'Sosyal Bilgiler',
  'İngilizce',
  'T.C. İnkılap Tarihi',
  'Din Kültürü',
  'Görsel Sanatlar',
  'Müzik',
  'Beden Eğitimi',
  'Teknoloji ve Tasarım',
  'Bilişim Teknolojileri',
  'Rehberlik',
];

export const LISE_SUBJECTS = [
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'İngilizce',
  'Din Kültürü',
  'Görsel Sanatlar',
  'Müzik',
  'Beden Eğitimi',
  'Bilişim Teknolojileri',
  'Rehberlik',
];

export const ALL_SUBJECTS = Array.from(new Set([...ORTAOKUL_SUBJECTS, ...LISE_SUBJECTS, 'Genel']));

const trLower = (v: string) => v.toLocaleLowerCase('tr-TR').trim();

// Öğretmenin branş yazısını ("Fen Bilgisi Öğretmeni", "matematik" vb.) listedeki ders adına çevirir
export function normalizeBranch(branch?: string | null): string | null {
  if (!branch) return null;
  const cleaned = branch.replace(/\s*öğretmeni\s*$/i, '').replace(/\s*Öğretmeni\s*$/, '').trim();
  if (!cleaned) return null;
  const lc = trLower(cleaned);
  const exact = ALL_SUBJECTS.find((s) => trLower(s) === lc);
  if (exact) return exact;
  const aliases: Record<string, string> = {
    'fen bilimleri': 'Fen Bilgisi',
    fen: 'Fen Bilgisi',
    'türk dili ve edebiyatı': 'Edebiyat',
    'türk dili ve edebiyati': 'Edebiyat',
    'din kültürü ve ahlak bilgisi': 'Din Kültürü',
    'inkılap tarihi': 'T.C. İnkılap Tarihi',
    'beden eğitimi ve spor': 'Beden Eğitimi',
    'rehber öğretmen': 'Rehberlik',
    'psikolojik danışman': 'Rehberlik',
    geometri: 'Matematik',
  };
  if (aliases[lc]) return aliases[lc];
  const partial = ALL_SUBJECTS.find((s) => lc.includes(trLower(s)) || trLower(s).includes(lc));
  return partial || cleaned;
}
