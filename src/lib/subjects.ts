// Branş / ders listeleri (Plan & Zümre Arşivi ve belge yükleme için ortak)
export const ORTAOKUL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
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
  'Türk Dili ve Edebiyatı',
  'Geometri',
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
    'fen bilgisi': 'Fen Bilimleri',
    fen: 'Fen Bilimleri',
    edebiyat: 'Türk Dili ve Edebiyatı',
    'türk dili ve edebiyati': 'Türk Dili ve Edebiyatı',
    'din kültürü ve ahlak bilgisi': 'Din Kültürü',
    'inkılap tarihi': 'T.C. İnkılap Tarihi',
    'beden eğitimi ve spor': 'Beden Eğitimi',
    'rehber öğretmen': 'Rehberlik',
    'psikolojik danışman': 'Rehberlik',
  };
  if (aliases[lc]) return aliases[lc];
  const partial = ALL_SUBJECTS.find((s) => lc.includes(trLower(s)) || trLower(s).includes(lc));
  return partial || cleaned;
}

// ============================================================================
// Aşama 9: ödev ve etüt formları için ortak ders kuralları
// ============================================================================

// Eski kayıtlardaki ders adlarını güncel adlara çevirir
export function normalizeSubject(subject?: string | null): string {
  const s = (subject || '').trim();
  const map: Record<string, string> = {
    'Fen Bilgisi': 'Fen Bilimleri',
    Edebiyat: 'Türk Dili ve Edebiyatı',
  };
  return map[s] || s;
}

const fold = (v: string) =>
  (v || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u');

// Öğretmenin branş yazısından ders adlarını çıkarır ("Fen Bilgisi Öğretmeni" -> ["Fen Bilimleri"]).
// Veritabanındaki public.branch_subjects() ile aynı kurallar. Tanınmayan branş kendisi ders sayılır.
export function subjectsForBranch(branch?: string | null): string[] {
  const b = fold(branch || '');
  if (!b.trim()) return [];
  const r: string[] = [];
  const add = (x: string) => {
    if (!r.includes(x)) r.push(x);
  };
  if (b.includes('inkilap')) add('T.C. İnkılap Tarihi');
  if (/(^|[^a-z])fen([^a-z]|$)/.test(b) || b.includes('fen bil')) add('Fen Bilimleri');
  if (b.includes('matematik')) add('Matematik');
  if (b.includes('geometri')) add('Geometri');
  if (b.includes('turkce')) add('Türkçe');
  if (b.includes('edebiyat')) add('Türk Dili ve Edebiyatı');
  if (b.includes('sosyal')) add('Sosyal Bilgiler');
  if (b.includes('din kultur') || b.includes('ahlak') || b.includes('dkab')) add('Din Kültürü');
  if (b.includes('ingilizce') || b.includes('yabanci dil')) add('İngilizce');
  if (b.includes('tarih') && !b.includes('inkilap')) add('Tarih');
  if (b.includes('cografya')) add('Coğrafya');
  if (b.includes('fizik')) add('Fizik');
  if (b.includes('kimya')) add('Kimya');
  if (b.includes('biyoloji')) add('Biyoloji');
  if (b.includes('felsefe')) add('Felsefe');
  if (r.length === 0) {
    const raw = (branch || '').trim().replace(/\s+(öğretmeni|ogretmeni|öğretmen|ogretmen)$/i, '').trim();
    if (raw) r.push(raw);
  }
  return r;
}

// Kademeye göre ödev/etüt ders listesi
export function subjectsForLevel(level?: 'Ortaokul' | 'Lise' | null): string[] {
  if (level === 'Lise') return LISE_SUBJECTS;
  if (level === 'Ortaokul') return ORTAOKUL_SUBJECTS;
  return Array.from(new Set([...ORTAOKUL_SUBJECTS, ...LISE_SUBJECTS]));
}
