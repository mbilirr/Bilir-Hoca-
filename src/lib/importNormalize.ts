// ============================================================================
// Excel / CSV içe aktarma yardımcıları (öğrenci ve sınıf yükleyicileri ortak kullanır)
// Türkçe büyük/küçük harf ve noktalı İ/ı farkı, sınıf adı yazım biçimleri,
// e-posta ve telefon doğrulaması tek yerde tutulur.
// ============================================================================

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

// Türkçe duyarlı küçük harfe çevirir ve Türkçe harfleri ASCII karşılığına indirger ("ÖĞRENCİ No" -> "ogrenci no")
export function trFold(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/̇/g, '') // "İ".toLowerCase() sonrası kalan birleşik nokta
    .normalize('NFC')
    .replace(/[çğıöşüâîû]/g, (ch) => TR_FOLD[ch] || ch);
}

// Sütun başlığı karşılaştırma anahtarı: "Öğrenci Adı" -> "ogrenciadi", "E-POSTA" -> "eposta"
export function trNormalizeHeader(value: unknown): string {
  return trFold(value).replace(/[^a-z0-9]/g, '');
}

// ----------------------------------------------------------------------------- Sütun eşleme
export interface ColumnSpec {
  // Başlığın normalize hâli bunlardan birine tam eşitse (önce bunlar denenir)
  exact: string[];
  // Tam eşleşme yoksa başlık bunlardan birini içeriyorsa
  partial?: string[];
}

// Başlık listesinden alan -> başlık eşlemesi üretir.
// Önce TÜM alanlar için tam eşleşme, sonra kalan alanlar için kısmi eşleşme denenir;
// bir başlık yalnızca bir alana atanır (ör. "Öğrenci Adı" ad sütunu olur, "ad soyad" sanılmaz).
export function resolveColumns<F extends string>(headers: string[], spec: Record<F, ColumnSpec>): Partial<Record<F, string>> {
  const normalized = headers.map((h) => ({ raw: h, norm: trNormalizeHeader(h) }));
  const used = new Set<string>();
  const result: Partial<Record<F, string>> = {};
  const fields = Object.keys(spec) as F[];

  for (const field of fields) {
    const aliases = spec[field].exact.map(trNormalizeHeader);
    const hit = normalized.find((h) => h.norm && !used.has(h.raw) && aliases.includes(h.norm));
    if (hit) {
      result[field] = hit.raw;
      used.add(hit.raw);
    }
  }
  for (const field of fields) {
    if (result[field]) continue;
    const partials = (spec[field].partial || []).map(trNormalizeHeader).filter(Boolean);
    for (const p of partials) {
      const hit = normalized.find((h) => h.norm && !used.has(h.raw) && h.norm.includes(p));
      if (hit) {
        result[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  return result;
}

// Bir satırın kaç hücresi bilinen bir başlığa benziyor (tam eşleşme 1, kısmi eşleşme 0,5 puan)
function headerScore(row: unknown[], spec: Record<string, ColumnSpec>): number {
  const exact = new Set<string>();
  const partial: string[] = [];
  Object.values(spec).forEach((s) => {
    s.exact.forEach((a) => exact.add(trNormalizeHeader(a)));
    (s.partial || []).forEach((p) => {
      const n = trNormalizeHeader(p);
      if (n.length >= 4) partial.push(n);
    });
  });
  let score = 0;
  row.forEach((cell) => {
    const n = trNormalizeHeader(cell);
    if (!n || n.length > 40) return;
    if (exact.has(n)) score += 1;
    else if (!/\d/.test(n) && partial.some((p) => n.includes(p))) score += 0.5;
  });
  return score;
}

// İlk ~10 satır içinde başlık satırını bulur (e-Okul çıktılarında başlığın üstünde okul adı vb. satırlar olur).
// Bulunamazsa -1 döner.
export function findHeaderRow(matrix: unknown[][], spec: Record<string, ColumnSpec>, scanRows = 10, minScore = 2): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(matrix.length, scanRows);
  for (let i = 0; i < limit; i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const score = headerScore(row, spec);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore >= minScore ? best : -1;
}

export interface SheetRow {
  // Excel'deki satır numarası (1'den başlar), hata mesajlarında gösterilir
  rowNumber: number;
  values: Record<string, string>;
}

// Hücre matrisini (sheet_to_json header:1) başlık satırını bularak nesnelere çevirir.
// Boş başlıklar "Sütun N" olarak adlandırılır, tamamen boş satırlar atlanır.
export function matrixToRows(
  matrix: unknown[][],
  spec: Record<string, ColumnSpec>,
  fallbackHeaders?: string[]
): { headers: string[]; rows: SheetRow[]; headerFound: boolean } {
  let headerIdx = findHeaderRow(matrix, spec);
  // Yapıştırılan metinde (varsayılan sütun sırası varken) veri satırını başlık sanmamak için gevşek arama yapılmaz
  if (headerIdx < 0 && !fallbackHeaders) headerIdx = findHeaderRow(matrix, spec, 10, 1);
  if (headerIdx < 0 && !fallbackHeaders && matrix.length > 0) headerIdx = 0;
  let headers: string[];
  let start: number;
  if (headerIdx >= 0) {
    const seen = new Map<string, number>();
    headers = (matrix[headerIdx] || []).map((h, i) => {
      let name = String(h ?? '').trim() || `Sütun ${i + 1}`;
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      if (n > 0) name = `${name} (${n + 1})`;
      return name;
    });
    start = headerIdx + 1;
  } else if (fallbackHeaders) {
    headers = fallbackHeaders;
    start = 0;
  } else {
    return { headers: [], rows: [], headerFound: false };
  }

  const rows: SheetRow[] = [];
  for (let i = start; i < matrix.length; i++) {
    const cells = Array.isArray(matrix[i]) ? matrix[i] : [];
    if (!cells.some((c) => String(c ?? '').trim() !== '')) continue;
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = String(cells[idx] ?? '').trim();
    });
    rows.push({ rowNumber: i + 1, values });
  }
  return { headers, rows, headerFound: headerIdx >= 0 };
}

// Yapıştırılan metni (sekme / noktalı virgül / virgül ayraçlı) hücre matrisine çevirir
export function textToMatrix(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const first = lines[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  return lines.map((line) => line.split(delimiter).map((t) => t.trim().replace(/^["']|["']$/g, '')));
}

// ----------------------------------------------------------------------------- Öğrenci sütunları
export type StudentField = 'fullName' | 'firstName' | 'lastName' | 'studentNumber' | 'className' | 'email' | 'phone' | 'password';

export const STUDENT_COLUMNS: Record<StudentField, ColumnSpec> = {
  fullName: {
    exact: [
      'ad soyad', 'adı soyadı', 'ad soyadı', 'adı soyad', 'ad-soyad', 'öğrenci adı soyadı', 'öğrenci ad soyad',
      'öğrencinin adı soyadı', 'isim soyisim', 'isim soyad', 'tam ad', 'tam adı', 'full name', 'name',
    ],
    partial: ['adısoyadı', 'adsoyad', 'isimsoyisim'],
  },
  firstName: {
    exact: ['ad', 'adı', 'isim', 'ismi', 'öğrenci adı', 'öğrenci ad', 'öğrenci ismi', 'öğrencinin adı', 'first name', 'adınız'],
  },
  lastName: {
    exact: ['soyad', 'soyadı', 'soyisim', 'soyismi', 'öğrenci soyadı', 'öğrenci soyad', 'öğrencinin soyadı', 'last name', 'surname', 'soyadınız'],
    partial: ['soyad', 'soyisim'],
  },
  studentNumber: {
    exact: [
      'öğrenci no', 'öğrenci numarası', 'öğr no', 'okul no', 'okul numarası', 'numara', 'numarası', 'no', 'number',
      'student no', 'student number', 'id',
    ],
    partial: ['öğrencino', 'öğrencinumara', 'okulno', 'okulnumara', 'numara'],
  },
  className: {
    exact: ['sınıf', 'sınıfı', 'şube', 'şubesi', 'sınıf şube', 'sınıf/şube', 'sınıfı şubesi', 'sınıf adı', 'class', 'grade', 'alan'],
    partial: ['sınıf', 'şube'],
  },
  email: {
    exact: ['e-posta', 'eposta', 'e-posta adresi', 'email', 'e-mail', 'mail', 'mail adresi', 'öğrenci e-posta'],
    partial: ['eposta', 'email', 'mail'],
  },
  phone: {
    exact: ['telefon', 'tel', 'telefon no', 'telefon numarası', 'cep', 'cep telefonu', 'gsm', 'phone', 'veli telefonu', 'veli tel'],
    partial: ['telefon', 'gsm', 'tel'],
  },
  password: {
    exact: ['şifre', 'parola', 'password', 'giriş şifresi'],
    partial: ['şifre', 'parola'],
  },
};

export interface ParsedStudentFields {
  rowNumber: number;
  fullName: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  className: string;
  email: string;
  phone: string;
  password: string;
}

// Satırdan öğrenci alanlarını çıkarır. Ad soyad tek sütundaysa o kullanılır;
// ayrı "Ad" ve "Soyad" sütunları varsa birleştirilir. İsim yoksa fullName boş kalır (satır hatası olur).
export function extractStudentRows(headers: string[], rows: SheetRow[]): ParsedStudentFields[] {
  const cols = resolveColumns(headers, STUDENT_COLUMNS);
  const get = (row: SheetRow, field: StudentField) => {
    const key = cols[field];
    return key ? (row.values[key] || '').trim().replace(/\s+/g, ' ') : '';
  };
  return rows.map((row) => {
    const full = get(row, 'fullName');
    let first = get(row, 'firstName');
    let last = get(row, 'lastName');
    let fullName = '';
    if (full) {
      fullName = full;
    } else if (first || last) {
      fullName = `${first} ${last}`.trim();
    }
    if (fullName && !(first && last)) {
      const parts = fullName.split(' ');
      if (parts.length > 1) {
        last = parts.pop() || '';
        first = parts.join(' ');
      } else {
        first = parts[0];
        last = '';
      }
    }
    return {
      rowNumber: row.rowNumber,
      fullName,
      firstName: first,
      lastName: last,
      studentNumber: get(row, 'studentNumber').replace(/\s+/g, ''),
      className: get(row, 'className'),
      email: get(row, 'email'),
      phone: get(row, 'phone'),
      password: get(row, 'password'),
    };
  });
}

// ----------------------------------------------------------------------------- Sınıf sütunları
export type ClassField = 'schoolLevel' | 'grade' | 'branch' | 'name' | 'academicYear' | 'description';

export const CLASS_COLUMNS: Record<ClassField, ColumnSpec> = {
  schoolLevel: { exact: ['okul', 'okul türü', 'kademe', 'okul kademesi', 'tür', 'school'], partial: ['okul', 'kademe'] },
  grade: { exact: ['sınıf', 'sınıf seviyesi', 'seviye', 'düzey', 'grade', 'level'], partial: ['sınıfseviye'] },
  branch: { exact: ['şube', 'şubesi', 'şube adı', 'branch'], partial: ['şube'] },
  name: { exact: ['sınıf adı', 'sınıf ismi', 'ad', 'adı', 'isim', 'name', 'class name'], partial: ['sınıfadı'] },
  academicYear: {
    exact: ['eğitim yılı', 'eğitim öğretim yılı', 'öğretim yılı', 'akademik yıl', 'yıl', 'dönem', 'year', 'academic year'],
    partial: ['yıl', 'dönem', 'akademik'],
  },
  description: { exact: ['açıklama', 'not', 'notlar', 'tanım', 'description'], partial: ['açıklama'] },
};

// ----------------------------------------------------------------------------- Sınıf adı
export interface ParsedClassName {
  grade?: number; // 1..12
  branch?: string; // Büyük harf şube harfi (A, B, Ç ...)
  rest: string; // Şubeden sonra gelen ek (ör. "sayisal")
}

// "8/A", "8-A", "8A", "8 A", "8. Sınıf - A", "8. Sınıf - Şube A", "12-A Sayısal" biçimlerini çözümler
export function parseClassName(raw?: string | null): ParsedClassName {
  const folded = trFold(raw || '')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sinifi|sinif|subesi|sube)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!folded) return { rest: '' };
  const m = folded.match(/^(\d{1,2})(?: ([a-z]))?(?: (.*))?$/);
  if (!m) return { rest: folded };
  const grade = parseInt(m[1], 10);
  if (!(grade >= 1 && grade <= 12)) return { rest: folded };
  // Şube harfini orijinal yazımdan al (Ç, Ş gibi harfler kaybolmasın)
  let branch: string | undefined;
  if (m[2]) {
    const orig = String(raw || '')
      .replace(/şube(si)?|sınıf(ı)?/gi, ' ')
      .match(/\d{1,2}[\s.\-/\\_–—]*([A-Za-zÇĞİÖŞÜçğıöşü])(?![A-Za-zÇĞİÖŞÜçğıöşü])/);
    branch = (orig ? orig[1] : m[2]).toLocaleUpperCase('tr-TR');
  }
  return { grade, branch, rest: (m[3] || '').trim() };
}

// Sınıf karşılaştırma anahtarı: "8/A", "8-A", "8A", "8. Sınıf - A" -> "8a"; "12-A Sayısal" -> "12a sayisal";
// tanınmayan adlar harf/rakam dışı karakterleri atılmış hâliyle döner.
export function normalizeClassKey(raw?: string | null): string {
  const p = parseClassName(raw);
  if (p.grade) {
    const base = `${p.grade}${p.branch ? trFold(p.branch) : ''}`;
    return p.rest ? `${base} ${p.rest.replace(/\s+/g, '')}` : base;
  }
  return trNormalizeHeader(raw);
}

// Şube hücresi: "A", "a", "Şube A", "A Şubesi" -> "A"; tek harf değilse '' döner
export function parseBranch(raw?: string | null): string {
  const s = String(raw ?? '')
    .replace(/şube(si)?|sube(si)?/gi, ' ')
    .replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, ' ')
    .trim();
  return /^[A-Za-zÇĞİÖŞÜçğıöşü]$/.test(s) ? s.toLocaleUpperCase('tr-TR') : '';
}

// Eğitim yılı yazımını "2026-2027" biçimine getirir; geçersizse '' döner
export function normalizeAcademicYear(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/);
  if (!m) return '';
  const a = parseInt(m[1], 10);
  let b = parseInt(m[2], 10);
  if (m[2].length === 2) b = Math.floor(a / 100) * 100 + b;
  return b === a + 1 ? `${a}-${b}` : '';
}

// Bugünün tarihine göre eğitim-öğretim yılı (Eylül ve sonrası yeni yıl)
export function currentAcademicYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  return date.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ----------------------------------------------------------------------------- E-posta
// Sistemin kendi ürettiği, gerçek olmayan giriş adresleri (create-user / register-student fonksiyonları
// "std_<no>@okul.internal.net" / "tch_<ad>@okul.internal.net" üretir; eski sürümler *.school.internal kullanırdı)
const INTERNAL_EMAIL_DOMAINS = ['okul.internal.net', 'school.internal', 'student.school.internal'];
// Belgelerde örnek için ayrılmış alan adları (RFC 2606): bu adreslere posta gitmez
const EXAMPLE_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

export function isInternalLoginEmail(email?: string | null): boolean {
  const d = emailDomain(String(email || ''));
  return !!d && INTERNAL_EMAIL_DOMAINS.includes(d);
}

export function isValidEmail(email?: string | null): boolean {
  const e = String(email || '').trim();
  if (!e || e.length > 254 || e.includes('..')) return false;
  return /^[^\s@"(),:;<>[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(e);
}

// Kullanıcıya gösterilecek e-posta sorunu (boşsa sorun yok)
export function emailIssue(email?: string | null): string | null {
  const e = String(email || '').trim();
  if (!e) return null;
  if (!isValidEmail(e)) return 'Geçersiz e-posta adresi';
  if (isInternalLoginEmail(e)) return 'Bu, sistemin iç giriş adresi; öğrencinin gerçek e-postasını yazın veya boş bırakın';
  if (EXAMPLE_EMAIL_DOMAINS.includes(emailDomain(e))) return 'Örnek adres (example.com); gerçek e-postayı yazın veya boş bırakın';
  return null;
}

// ----------------------------------------------------------------------------- Telefon
// Türkiye numaralarını kabul eder: 05xx xxx xx xx, 5xxxxxxxxx (Excel baştaki 0'ı atar), +90 5xx..., 0090...,
// sabit hat 0212... Sonuç yalnızca rakam ve başında 0 olan 11 hanedir (05321234567).
export function normalizeTurkishPhone(raw?: string | number | null): { value: string; valid: boolean } {
  const s = String(raw ?? '').trim();
  if (!s) return { value: '', valid: true };
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('0090')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('90')) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && /^[2-5]/.test(digits)) digits = `0${digits}`;
  if (digits.length === 11 && /^0[2-5]\d{9}$/.test(digits)) return { value: digits, valid: true };
  return { value: s, valid: false };
}

export const PHONE_ERROR = 'Geçersiz telefon (örn. 0532 123 45 67)';
