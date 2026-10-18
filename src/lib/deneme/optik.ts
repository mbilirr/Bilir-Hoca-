// ============================================================================
// DENEME ANALİZİ (Aşama 47) — OPTİK OKUMA
// FMT (optik okuyucu format dosyası) → alan listesi; TXT (optik sonuç dosyası) → öğrenci satırları.
//
// FMT satırı:  satır1=satır2=sütun1=sütun2=K|S=D|Y=geçerli karakterler=X2=ETİKET=
//   D = bilgi alanı (numara, ad, sınıf…): genişliği sütun sayısı kadardır.
//   Y = cevap alanı: her satır bir sorudur, genişliği satır sayısı kadardır.
// TXT'de alanlar FMT'deki sırayla yan yana dizilir (1. karakterden başlayarak).
// FMT tarzı değişirse alanlar ekranda elle düzenlenebilir (manuel giriş).
// TC kimlik numarası OKUNMAZ ve saklanmaz.
// ============================================================================

export type FieldRole = 'number' | 'name' | 'surname' | 'fullname' | 'grade' | 'section' | 'booklet' | 'answers' | 'tc' | 'ignore';

export interface OptikField {
  id: string;
  label: string;
  role: FieldRole;
  subject?: string; // role === 'answers' ise ders anahtarı (tr, mat, fen…)
  start: number; // TXT'de başlangıç karakteri (1'den başlar)
  width: number; // karakter sayısı
}

export interface OptikRow {
  file: string;
  line: number;
  number: string; // optikteki öğrenci numarası (olduğu gibi)
  name: string;
  grade: string;
  section: string;
  booklet: string; // 'A' | 'B' | ''
  answers: Record<string, string>; // ders → cevap dizisi (kitapçık sırasıyla; boş = ' ')
}

export interface TxtParseResult {
  rows: OptikRow[];
  errors: string[]; // kaydı engelleyen sorunlar
  warnings: string[];
  expectedLength: number;
}

export const ROLE_LABELS: Record<FieldRole, string> = {
  number: 'Öğrenci no',
  name: 'Ad',
  surname: 'Soyad',
  fullname: 'Ad soyad',
  grade: 'Sınıf',
  section: 'Şube',
  booklet: 'Kitapçık türü',
  answers: 'Cevaplar',
  tc: 'TC (okunmaz)',
  ignore: 'Kullanılmaz',
};

// Türkçe karakterleri sadeleştirir, küçük harfe çevirir (karşılaştırma için)
export function foldTr(v: string): string {
  return (v || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
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
}

// Optik dosyaları çoğunlukla Windows-1254 (Türkçe) kodludur; UTF-8 ise o şekilde okunur
export function decodeOptikFile(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      text = new TextDecoder('windows-1254').decode(buf);
    } catch {
      text = new TextDecoder('iso-8859-9').decode(buf);
    }
  }
  return text.replace(/^﻿/, '');
}

/** Ders adından ders anahtarı (LGS dersleri) */
export function guessSubjectKey(label: string): string | null {
  const l = foldTr(label).replace(/�/g, '');
  if (/inkilap|sosyal|tarih|ataturk/.test(l)) return 'sos';
  if (/din\b|din kul|ahlak|^dn\b/.test(l)) return 'din';
  if (/ingiliz|ngl.?z|yabanci|^dil\b|^ing\b|almanca|arapca/.test(l)) return 'ing';
  if (/mat/.test(l)) return 'mat';
  if (/fen/.test(l)) return 'fen';
  if (/turk|tur?kce/.test(l)) return 'tr';
  return null;
}

function guessRole(label: string, kind: 'D' | 'Y', width: number, chars = ''): { role: FieldRole; subject?: string } {
  const l = foldTr(label).replace(/�/g, '').replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (kind === 'Y') {
    const subject = guessSubjectKey(label);
    if (subject && width > 1) return { role: 'answers', subject };
    // Aşama 49b: oturum (1/2) alanı kitapçık türü sanılmasın
    if (/oturum|seans/.test(l)) return { role: 'ignore' };
    if (width === 1 || /kitap|k\.? ?t/.test(l)) return { role: 'booklet' };
    return { role: 'answers', subject: subject || undefined };
  }
  if (/^tc\b|kimlik/.test(l)) return { role: 'tc' };
  if (/grup|kurum|tel|veli|okul kod/.test(l)) return { role: 'ignore' };
  if (/numara|(^|\s)no$|\bno\b/.test(l)) return { role: 'number' };
  if (/sinif|snf/.test(l)) return { role: 'grade' };
  if (/sube|ube$/.test(l)) return { role: 'section' };
  const hasSurname = /soyad/.test(l);
  const hasName = /(^|\s)ad(i)?(\s|$)|isim/.test(l.replace(/soyad\S*/g, ' '));
  if (hasSurname && hasName) return { role: 'fullname' };
  if (hasSurname) return { role: 'surname' };
  if (hasName) return { role: 'name' };
  // Aşama 49b: etiketi okunamayan ("��") yalnızca rakamlı kısa alan = öğrenci numarası
  if (!l.replace(/[^a-z]/g, '') && /^[0-9]+$/.test(chars.replace(/\s/g, '')) && width <= 12) return { role: 'number' };
  return { role: 'ignore' };
}

let seq = 0;
export const newFieldId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** FMT metnini alan listesine çevirir. Hiç alan bulunamazsa boş liste döner. */
export function parseFmt(text: string): OptikField[] {
  const fields: OptikField[] = [];
  let pos = 1;
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const p = line.split('=');
    // Başlık satırı (form boyutu) ya da bozuk satır atlanır. Aşama 49b: 5. değer "K" ya da "S" olabilir;
    // ikisi de TXT'ye yazılır (ör. kurum, TC, sınıf "S"). Atlanırsa sonraki alanların yeri kayar.
    if (p.length < 9) continue;
    const r1 = parseInt(p[0], 10);
    const r2 = parseInt(p[1], 10);
    const c1 = parseInt(p[2], 10);
    const c2 = parseInt(p[3], 10);
    const kind = p[5].trim().toUpperCase() === 'Y' ? 'Y' : 'D';
    if (![r1, r2, c1, c2].every((n) => Number.isFinite(n) && n > 0)) continue;
    const width = kind === 'Y' ? Math.abs(r2 - r1) + 1 : Math.abs(c2 - c1) + 1;
    const label = (p[8] || '').trim() || (kind === 'Y' ? 'Cevaplar' : 'Alan');
    const g = guessRole(label, kind, width, p[6] || '');
    fields.push({ id: newFieldId(), label, role: g.role, subject: g.subject, start: pos, width });
    pos += width;
  }
  return fields;
}

/** Alanların kapsadığı toplam satır uzunluğu */
export function fieldsLength(fields: OptikField[]): number {
  return fields.reduce((m, f) => Math.max(m, f.start + f.width - 1), 0);
}

/** Alanları sırayla yeniden diz (genişlik değişince başlangıçlar kayar) */
export function relayoutFields(fields: OptikField[]): OptikField[] {
  let pos = 1;
  return fields.map((f) => {
    const n = { ...f, start: pos };
    pos += Math.max(1, f.width);
    return n;
  });
}

/** Alan listesinde eksik/hatalı ayar var mı? (kayıttan önce ekranda gösterilir) */
export function checkFields(fields: OptikField[]): string[] {
  const errs: string[] = [];
  if (!fields.some((f) => f.role === 'number') && !fields.some((f) => ['name', 'surname', 'fullname'].includes(f.role))) {
    errs.push('Öğrenci numarası ya da ad soyad alanı seçilmeli.');
  }
  const ans = fields.filter((f) => f.role === 'answers');
  if (!ans.length) errs.push('En az bir cevap alanı (ders) seçilmeli.');
  const seen = new Set<string>();
  for (const f of ans) {
    if (!f.subject) errs.push(`"${f.label}" cevap alanının dersi seçilmeli.`);
    else if (seen.has(f.subject)) errs.push(`Aynı ders iki cevap alanına seçilmiş (${f.label}).`);
    else seen.add(f.subject);
  }
  for (const f of fields) {
    if (!(f.start >= 1) || !(f.width >= 1)) errs.push(`"${f.label}" alanının başlangıç ve genişliği 1 veya daha büyük olmalı.`);
  }
  return errs;
}

const ANSWER_OK = /^[A-E* ]$/;

/** TXT metnini alanlara göre okur ve dosyanın formatla uyuşup uyuşmadığını denetler */
export function parseTxt(text: string, fields: OptikField[], fileName: string): TxtParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: OptikRow[] = [];
  const expectedLength = fieldsLength(fields);
  const lines = (text || '').split(/\r?\n/);
  let answerChars = 0;
  let badAnswerChars = 0;
  let longLines = 0;
  let badNumbers = 0;
  const get = (line: string, f?: OptikField) => (f ? line.substr(f.start - 1, f.width) : '');
  const one = (role: FieldRole) => fields.find((f) => f.role === role);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (line.replace(/\s+$/, '').length > expectedLength) longLines++;
    const num = get(line, one('number')).trim();
    if (num && !/^\d+$/.test(num.replace(/\s/g, ''))) badNumbers++;
    let name = get(line, one('fullname')).trim();
    if (!name) name = [get(line, one('name')).trim(), get(line, one('surname')).trim()].filter(Boolean).join(' ');
    const answers: Record<string, string> = {};
    for (const f of fields) {
      if (f.role !== 'answers' || !f.subject) continue;
      const raw = get(line, f).padEnd(f.width, ' ').toLocaleUpperCase('tr-TR');
      let out = '';
      for (const ch of raw) {
        if (ch !== ' ') answerChars++;
        if (ANSWER_OK.test(ch)) out += ch;
        else {
          badAnswerChars++;
          out += ' ';
        }
      }
      answers[f.subject] = out;
    }
    const bk = get(line, one('booklet')).trim().toLocaleUpperCase('tr-TR').replace(/[^AB]/g, '').slice(0, 1);
    rows.push({
      file: fileName,
      line: i + 1,
      number: num.replace(/\s/g, ''),
      name: name.replace(/\s+/g, ' '),
      grade: get(line, one('grade')).trim(),
      section: get(line, one('section')).trim().toLocaleUpperCase('tr-TR'),
      booklet: bk,
      answers,
    });
  });
  if (!rows.length) errors.push(`${fileName}: dosyada öğrenci satırı bulunamadı.`);
  if (answerChars > 0 && badAnswerChars / (answerChars + badAnswerChars) > 0.05) {
    errors.push(`${fileName}: cevap alanlarında harf dışı karakterler var. Bu TXT seçili formatla uyuşmuyor; alanların başlangıç ve genişliklerini kontrol edin.`);
  } else if (badAnswerChars > 0) {
    warnings.push(`${fileName}: ${badAnswerChars} cevap kutusunda okunamayan işaret var (boş sayıldı).`);
  }
  if (rows.length && longLines / rows.length > 0.2) {
    errors.push(`${fileName}: satırlar formatın tarif ettiğinden (${expectedLength} karakter) uzun. Bu TXT seçili formatla uyuşmuyor.`);
  }
  if (rows.length && badNumbers / rows.length > 0.2) {
    warnings.push(`${fileName}: öğrenci numarası alanında rakam dışı karakterler var; numara alanını kontrol edin.`);
  }
  if (/�/.test(text)) {
    warnings.push(`${fileName}: bazı Türkçe harfler okunamadı (dosya bozulmuş olabilir). Eşleştirmede numara kullanılacağı için sorun olmaz.`);
  }
  return { rows, errors, warnings, expectedLength };
}
