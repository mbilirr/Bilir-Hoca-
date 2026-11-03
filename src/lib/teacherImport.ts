// ============================================================================
// Aşama 144: ÖĞRETMENLERİ EXCEL İLE TOPLU EKLEME — dosya okuma ve doğrulama
// Kurumun kendi Excel'i (ADI SOYADI, TC, BRANŞ, DOĞUM TARİHİ, TELEFON NO, MAİL ADRESİ) okunur.
// Başlıklar büyük/küçük harf ve Türkçe karaktere duyarsız, sütun sırası serbest.
// TC sütunu hiç okunmaz (TC kimlik no saklanmaz).
// Bu dosya saf işlevlerdir: ekran ve veritabanı bilgisi yok, kolay sınanır.
// ============================================================================
import { emailIssue, matrixToRows, resolveColumns, normalizeTurkishPhone, PHONE_ERROR, trFold, trNormalizeHeader, type ColumnSpec } from './importNormalize';

export type TeacherField = 'fullName' | 'firstName' | 'lastName' | 'branch' | 'birthDate' | 'phone' | 'email';

export const TEACHER_COLUMNS: Record<TeacherField, ColumnSpec> = {
  fullName: { exact: ['ADI SOYADI', 'Ad Soyad', 'Adı Soyadı', 'Ad Soyadı', 'Öğretmen', 'Öğretmen Adı Soyadı', 'İsim Soyisim', 'Ad-Soyad'], partial: ['adisoyadi', 'adsoyad', 'isimsoyisim'] },
  firstName: { exact: ['Ad', 'Adı', 'İsim'] },
  lastName: { exact: ['Soyad', 'Soyadı', 'Soyisim'] },
  branch: { exact: ['BRANŞ', 'Branşı', 'Ders', 'Alan', 'Bölüm'], partial: ['brans'] },
  birthDate: { exact: ['DOĞUM TARİHİ', 'Doğum Tarihi', 'D. Tarihi', 'Doğum'], partial: ['dogum'] },
  phone: { exact: ['TELEFON NO', 'Telefon', 'Telefon Numarası', 'Cep Telefonu', 'Cep', 'GSM', 'Tel'], partial: ['telefon', 'gsm'] },
  email: { exact: ['MAİL ADRESİ', 'E-Posta', 'E-posta Adresi', 'Mail', 'E-Mail', 'Eposta'], partial: ['mail', 'eposta'] },
};

/** Şablon başlıkları: kurumun kendi Excel'iyle aynı sıra (TC sütunu boş bırakılabilir, okunmaz) */
export const TEACHER_TEMPLATE_HEADERS = ['ADI SOYADI', 'TC', 'BRANŞ', 'DOĞUM TARİHİ', 'TELEFON NO', 'MAİL ADRESİ'];

export interface ParsedTeacherRow {
  key: string;
  rowNumber: number;
  name: string;
  branch: string;
  /** YYYY-AA-GG ya da boş */
  birthDate: string;
  phone: string;
  email: string;
  username: string;
  /** Satır atlanır (kırmızı) */
  error?: string;
  /** Satır açılır ama dikkat (sarı): ör. telefon yok → SMS gidemez */
  warning?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hücreyi metne çevirir; Excel tarihi YYYY-AA-GG olur (saat dilimi kaymasına karşı öğlene yuvarlanır) */
export function cellToText(cell: unknown): string {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const d = new Date(cell.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) return String(cell);
  return String(cell ?? '').trim();
}

/** "15.03.1985", "15/3/1985", "1985-03-15", "15.03.85", Excel seri numarası → YYYY-AA-GG; okunamazsa null */
export function parseBirthDate(raw: string, now: Date = new Date()): string | null {
  const s = String(raw || '').trim();
  if (!s) return '';
  let y: number, m: number, d: number;
  let mm = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
  if (mm) {
    y = +mm[1]; m = +mm[2]; d = +mm[3];
  } else if ((mm = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2}|\d{4})$/.exec(s))) {
    d = +mm[1]; m = +mm[2]; y = +mm[3];
    if (mm[3].length === 2) y += y > (now.getFullYear() % 100) ? 1900 : 2000;
  } else if (/^\d{4,5}$/.test(s)) {
    // Excel seri günü (1 = 1 Ocak 1900; Excel'in 1900 artık yıl hatası nedeniyle 25569 = 1 Ocak 1970)
    const t = new Date(Date.UTC(1970, 0, 1) + (Number(s) - 25569) * 86400000);
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  // Makul aralık: 1930 ile 16 yıl önce arası
  if (y < 1930 || y > now.getFullYear() - 16) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** YYYY-AA-GG → GG.AA.YYYY (ekranda) */
export const birthDateLabel = (iso?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

/** Ad soyaddan kullanıcı adı tabanı: "Ayşe Nur YILMAZ" → "ayse_nur_yilmaz" (3-30 karakter; nokta kullanılamaz) */
export function usernameBase(name: string): string {
  const words = trFold(name).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  let base = words.join('_');
  if (base.length > 26) base = words.length > 1 ? `${words[0]}_${words[words.length - 1]}` : words[0];
  base = base.slice(0, 26).replace(/_+$/g, '');
  return base.length >= 3 ? base : `${base}_ogr`.slice(0, 26);
}

/** Alınmış adlar kümesinde boşta olan ilk ad: ayse_yilmaz, ayse_yilmaz2, ayse_yilmaz3 ... */
export function uniqueUsername(base: string, taken: Set<string>, startAt = 1): string {
  for (let i = startAt; i < 1000; i++) {
    const u = i === 1 ? base : `${base}${i}`;
    if (!taken.has(u)) return u;
  }
  return `${base}${Date.now() % 100000}`;
}

/** Ad soyad karşılaştırma anahtarı (büyük/küçük harf, Türkçe karakter, boşluk farkı yok sayılır) */
export const nameKey = (name: string) => trFold(name).replace(/[^a-z0-9]+/g, ' ').trim();

const titleCaseTr = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ');

/** Tamamı BÜYÜK harf yazılmış adı düzeltir ("AYŞE YILMAZ" → "Ayşe Yılmaz"); karışık yazım olduğu gibi kalır */
export function tidyName(raw: string): string {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const letters = s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  return letters && letters === letters.toLocaleUpperCase('tr-TR') ? titleCaseTr(s) : s;
}

export interface ExistingTeacherInfo {
  name: string;
  username?: string;
  email?: string;
}

/** Hücre matrisini (sheet_to_json header:1, raw) öğretmen satırlarına çevirir ve doğrular */
export function parseTeacherMatrix(
  matrix: unknown[][],
  existing: ExistingTeacherInfo[],
  now: Date = new Date()
): { rows: ParsedTeacherRow[]; missingName: boolean } {
  const textMatrix = matrix.map((r) => (Array.isArray(r) ? r.map(cellToText) : []));
  const { headers, rows } = matrixToRows(textMatrix, TEACHER_COLUMNS as unknown as Record<string, ColumnSpec>);
  // TC başlığı hiçbir alana eşlenmesin diye önce ayıklanır
  const isTc = (h: string) => /^(tc|tckn|tckimlik|tckimlikno|kimlikno|tcno)$/.test(trNormalizeHeader(h));
  const usable = headers.filter((h) => !isTc(h));
  const map = resolveColumns(usable, TEACHER_COLUMNS);
  const missingName = !map.fullName && !map.firstName;

  const takenUsernames = new Set(existing.map((t) => (t.username || '').toLowerCase()).filter(Boolean));
  const existingNames = new Set(existing.map((t) => nameKey(t.name)));
  const existingEmails = new Set(existing.map((t) => (t.email || '').trim().toLowerCase()).filter(Boolean));
  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();

  const out: ParsedTeacherRow[] = rows.map((r, i) => {
    const v = (f: TeacherField) => (map[f] ? r.values[map[f] as string] || '' : '');
    const name = tidyName(map.fullName ? v('fullName') : `${v('firstName')} ${v('lastName')}`);
    const branch = tidyName(v('branch')).slice(0, 60);
    const phoneN = normalizeTurkishPhone(v('phone'));
    const email = v('email').trim().toLowerCase();
    const birth = parseBirthDate(v('birthDate'), now);
    const row: ParsedTeacherRow = {
      key: `r${r.rowNumber}-${i}`,
      rowNumber: r.rowNumber,
      name,
      branch,
      birthDate: birth || '',
      phone: phoneN.valid ? phoneN.value : v('phone'),
      email,
      username: '',
    };
    const nk = nameKey(name);
    const words = nk.split(' ').filter(Boolean);
    if (!name) row.error = 'Ad soyad boş';
    else if (words.length < 2 || name.length < 3) row.error = 'Ad ve soyad birlikte yazılmalı';
    else if (existingNames.has(nk)) row.error = 'Bu kurumda aynı adla öğretmen zaten kayıtlı';
    else if (seenNames.has(nk)) row.error = 'Dosyada aynı ad iki kez var';
    else if (!phoneN.valid) row.error = PHONE_ERROR;
    else if (emailIssue(email)) row.error = (emailIssue(email) || '').replace('öğrencinin', 'öğretmenin');
    else if (email && existingEmails.has(email)) row.error = 'Bu e-posta başka bir öğretmende kayıtlı';
    else if (email && seenEmails.has(email)) row.error = 'Dosyada aynı e-posta iki kez var';
    else if (birth === null) row.error = 'Doğum tarihi okunamadı (örn. 15.03.1985)';

    if (!row.error) {
      seenNames.add(nk);
      if (email) seenEmails.add(email);
      row.username = uniqueUsername(usernameBase(name), takenUsernames);
      takenUsernames.add(row.username);
      if (!row.phone) row.warning = 'Telefon yok: SMS gönderilemez';
      else if (!row.email) row.warning = 'E-posta yok: bilgiler e-postayla gitmez';
    }
    return row;
  });
  return { rows: out, missingName };
}
