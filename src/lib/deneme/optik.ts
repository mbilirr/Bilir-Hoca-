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
// Aşama 49c: "TUR", "TRK", "SOS", "ING1", "ydil25", "[Y.Dil]", "Din-Ahlak", "Türkçe12" gibi yazımlar da tanınır.
export function guessSubjectKey(label: string): string | null {
  const l = foldTr(label)
    .replace(/�/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!l || /^bos\b|bos alan|bosluk/.test(l)) return null;
  if (/inkilap|sosyal|\bsos\b|tarih|ataturk/.test(l)) return 'sos';
  if (/\bdin\b|din kul|ahlak|^dn\b/.test(l)) return 'din';
  if (/ingiliz|\bing\b|ngl.?z|yabanci|\by ?dil\b|\bydil|^dil\b|almanca|arapca/.test(l)) return 'ing';
  if (/mat/.test(l)) return 'mat';
  if (/\bfen/.test(l)) return 'fen';
  if (/turk|tur?kce|\btur\b|\btrk\b|\btr\b/.test(l)) return 'tr';
  return null;
}

type FmtKind = 'D' | 'Y' | 'K';

// Aşama 49c: alan türü tahmini. Sabit (tek karakterli) ve boşluk alanları, ayraçlar, oturum, cinsiyet,
// sınav/test no, telefon gibi alanlar kullanılmaz; kitapçık türü hem D hem Y alanında tanınır.
function guessRole(label: string, kind: FmtKind, width: number, chars = ''): { role: FieldRole; subject?: string } {
  const l = foldTr(label).replace(/�/g, '').replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
  const opts = chars.replace(/[\s~]/g, '');
  if (!opts) return { role: 'ignore' }; // yalnızca boşluk: dolgu alanı
  if (kind !== 'Y' && opts.length === 1) return { role: 'ignore' }; // sabit karakter / ayraç
  if (/^bos\b|bos alan|bosluk|ayrac/.test(l)) return { role: 'ignore' };
  if (/kitap|^kt\b|k\.? ?t\.? ?tur/.test(l)) return { role: 'booklet' };
  if (/oturum|^otrm|seans|cinsiyet|test no|sinav|optik ?no|optikno|^kod\b|kod \d|grup|kurum|tel\b|telefon|gsm|cep|veli|okul kod|okul no|yanlis/.test(l)) {
    return { role: 'ignore' };
  }
  if (kind === 'Y') {
    const subject = guessSubjectKey(label);
    if (subject && width > 1) return { role: 'answers', subject };
    if (width === 1) {
      if (/sinif|snf/.test(l)) return { role: 'grade' };
      if (/sube|ube$/.test(l)) return { role: 'section' };
      return /^[A-E]{2,5}$/.test(opts) ? { role: 'booklet' } : { role: 'ignore' };
    }
    return { role: 'answers', subject: subject || undefined };
  }
  if (/^tc\b|^tcno|kimlik/.test(l)) return { role: 'tc' };
  if (/numara|(^|\s)no$|\bno\b|ogrno|ogrenci ?no|^ogr\b|^ogr no|^og$/.test(l)) return { role: 'number' };
  if (/sinif|snf/.test(l)) return { role: 'grade' };
  if (/sube|ube$|derslik/.test(l)) return /[A-Za-z]/.test(opts) ? { role: 'section' } : { role: 'ignore' };
  const hasSurname = /soyad/.test(l);
  const hasName = /(^|\s)ad(i)?(\s|$)|isim/.test(l.replace(/soyad\S*/g, ' '));
  if (hasSurname && hasName) return { role: 'fullname' };
  if (hasSurname) return { role: 'surname' };
  if (hasName) return { role: 'name' };
  // Aşama 49b: etiketi okunamayan ("��") yalnızca rakamlı kısa alan = öğrenci numarası
  if (!l.replace(/[^a-z]/g, '') && /^[0-9]+$/.test(opts) && width <= 12) return { role: 'number' };
  return { role: 'ignore' };
}

let seq = 0;
export const newFieldId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** FMT metnini alan listesine çevirir. Hiç alan bulunamazsa boş liste döner. */
export function parseFmt(text: string): OptikField[] {
  const fields: OptikField[] = [];
  const meta: Array<{ options: number; labelHit: boolean }> = [];
  let pos = 1;
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const p = line.split('=');
    // Başlık satırı (form boyutu) ya da bozuk satır atlanır. 5. değer K, S, H… olabilir; hepsi TXT'ye yazılır.
    if (p.length < 9) continue;
    const r1 = parseInt(p[0], 10);
    const r2 = parseInt(p[1], 10);
    const c1 = parseInt(p[2], 10);
    const c2 = parseInt(p[3], 10);
    if (![r1, r2, c1, c2].every((n) => Number.isFinite(n) && n > 0)) continue;
    const k = p[5].trim().toUpperCase();
    const kind: FmtKind = k === 'Y' ? 'Y' : k === 'K' ? 'K' : 'D';
    const chars = p[6] || '';
    // Y: her satır bir soru; D: her sütun bir karakter; K: kutucuk matrisi tek değer (ör. "01~02~…" ise 2 karakter)
    const tokens = chars.split('~').filter(Boolean);
    const width =
      kind === 'Y' ? Math.abs(r2 - r1) + 1 : kind === 'K' ? (chars.includes('~') ? Math.max(1, ...tokens.map((t) => t.length)) : 1) : Math.abs(c2 - c1) + 1;
    // Etiket normalde 9. değerdir; bazı dosyalarda "X2" yazılmadığı için 8. değerde kalır
    const l8 = (p[8] || '').trim();
    const l7 = (p[7] || '').trim();
    const rawLabel = l8 || (/^[A-Z]\d?$/i.test(l7) ? '' : l7);
    const label = rawLabel.replace(/^\[|\]$/g, '').trim() || (kind === 'Y' ? 'Cevaplar' : 'Alan');
    const g = guessRole(label, kind, width, chars);
    fields.push({ id: newFieldId(), label: label.slice(0, 40), role: g.role, subject: g.subject, start: pos, width });
    meta.push({ options: (chars.match(/[A-E]/g) || []).length, labelHit: /kitap/i.test(foldTr(label)) });
    pos += width;
  }
  return dedupeRoles(fields, meta);
}

// Aynı anlamı alan birden fazla alan varsa en uygun olanı seçilir; diğerleri "kullanılmaz" ya da
// (cevaplarda) dersi boş bırakılır ki kullanıcı karar versin.
function dedupeRoles(fields: OptikField[], meta: Array<{ options: number; labelHit: boolean }>): OptikField[] {
  const out = fields.map((f) => ({ ...f }));
  const keepOne = (role: FieldRole, better: (a: number, b: number) => boolean) => {
    const idx = out.map((f, i) => (f.role === role ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return;
    let best = idx[0];
    for (const i of idx.slice(1)) if (better(i, best)) best = i;
    for (const i of idx) if (i !== best) out[i] = { ...out[i], role: 'ignore', subject: undefined };
  };
  keepOne('number', (a, b) => out[a].width > out[b].width);
  keepOne('fullname', (a, b) => out[a].width > out[b].width);
  keepOne('name', () => false);
  keepOne('surname', () => false);
  keepOne('grade', () => false);
  // şube birden fazla sütuna bölünmüş olabilir (ör. "şube 1" A-Z'nin yarısı, "şube 2" diğer yarısı): hepsi okunur
  keepOne('booklet', (a, b) => meta[a].labelHit && !meta[b].labelHit);
  const bySubject = new Map<string, number[]>();
  out.forEach((f, i) => {
    if (f.role === 'answers' && f.subject) bySubject.set(f.subject, [...(bySubject.get(f.subject) || []), i]);
  });
  for (const idx of bySubject.values()) {
    if (idx.length < 2) continue;
    let best = idx[0];
    for (const i of idx.slice(1)) {
      // önce şık sayısı (ABCD > ABC), sonra soru sayısı
      const a = meta[i].options;
      const c = meta[best].options;
      if (a > c || (a === c && out[i].width > out[best].width)) best = i;
    }
    for (const i of idx) {
      if (i === best) continue;
      // Kazananın ÖNÜNDE ve daha az şıklı blok (ör. 2-4. sınıf ABC bölümü) başka sınıf düzeyine aittir: kullanılmaz.
      // Arkasındaki blok (ör. "Türkçe 13-17") devam olabilir: dersi boş bırakılır, kullanıcı karar verir.
      if (i < best && meta[i].options < meta[best].options) out[i] = { ...out[i], role: 'ignore', subject: undefined };
      else out[i] = { ...out[i], subject: undefined };
    }
  }
  // Dersi tanınmayan cevap bloğu, dersi tanınan bütün bloklardan ÖNCE ve daha az şıklıysa (ör. "Hayat Bilgisi" ABC)
  // alt sınıflara aittir: kullanılmaz.
  const assigned = out.map((f, i) => (f.role === 'answers' && f.subject ? i : -1)).filter((i) => i >= 0);
  if (assigned.length) {
    const first = Math.min(...assigned);
    const maxOpt = Math.max(...assigned.map((i) => meta[i].options));
    out.forEach((f, i) => {
      if (f.role === 'answers' && !f.subject && i < first && meta[i].options < maxOpt) out[i] = { ...f, role: 'ignore' };
    });
  }
  return out;
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
  // Aşama 49c: aynı derse birden fazla alan seçilebilir (ör. "Türkçe 1-12" + "Türkçe 13-17");
  // cevaplar FMT sırasıyla uç uca eklenir. Bu durum ekranda ayrıca bildirilir (joinedSubjects).
  for (const f of ans) {
    if (!f.subject) errs.push(`"${f.label}" cevap alanının dersi seçilmeli (kullanılmıyorsa "Kullanılmaz" seçin).`);
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
      answers[f.subject] = (answers[f.subject] || '') + out; // aynı dersin birden fazla alanı uç uca
    }
    const bk = get(line, one('booklet')).trim().toLocaleUpperCase('tr-TR').replace(/[^AB]/g, '').slice(0, 1);
    rows.push({
      file: fileName,
      line: i + 1,
      number: num.replace(/\s/g, ''),
      name: name.replace(/\s+/g, ' '),
      grade: get(line, one('grade')).trim(),
      section: fields
        .filter((f) => f.role === 'section')
        .map((f) => get(line, f))
        .join('')
        .replace(/\s+/g, '')
        .toLocaleUpperCase('tr-TR'),
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

/** Aşama 49c: birden fazla alandan birleştirilen dersler (ekranda bilgi olarak gösterilir) */
export function joinedSubjects(fields: OptikField[]): Array<{ subject: string; widths: number[] }> {
  const m = new Map<string, number[]>();
  for (const f of fields) if (f.role === 'answers' && f.subject) m.set(f.subject, [...(m.get(f.subject) || []), f.width]);
  return Array.from(m.entries())
    .filter(([, w]) => w.length > 1)
    .map(([subject, widths]) => ({ subject, widths }));
}

// ----------------------------------------------------------------------------- Aşama 49c: TXT ↔ format uyumu
// TXT satırlarına bakarak formatın dosyaya uyup uymadığı ölçülür. Uymuyorsa alanların topluca kaç karakter
// kaydırılınca uyduğu aranır. Sonuç yalnızca ÖNERİ olarak gösterilir; kullanıcı onaylamadan uygulanmaz.
export interface TxtFit {
  clean: boolean;
  answerChars: number;
  badRatio: number;
  longRatio: number;
}

function evalFit(lines: string[], fields: OptikField[], shift: number, fixedLen: number | null): TxtFit {
  const ans = fields.filter((f) => f.role === 'answers' && f.subject);
  const num = fields.find((f) => f.role === 'number');
  const nameF = fields.find((f) => f.role === 'fullname') || fields.find((f) => f.role === 'name');
  const expected = fieldsLength(fields) + shift;
  let answerChars = 0;
  let bad = 0;
  let long = 0;
  let badNum = 0;
  let hasNum = 0;
  let badName = 0;
  let hasName = 0;
  let nameLetters = 0;
  let nameOtherLetters = 0; // A-E dışındaki harfler (cevap alanında yalnızca A-E olur)
  for (const line of lines) {
    if (line.replace(/\s+$/, '').length > expected) long++;
    for (const f of ans) {
      const seg = line.substr(f.start - 1 + shift, f.width).toLocaleUpperCase('tr-TR');
      for (const ch of seg) {
        if (ch === ' ') continue;
        answerChars++;
        if (!ANSWER_OK.test(ch)) bad++;
      }
    }
    if (num) {
      const n = line.substr(num.start - 1 + shift, num.width).replace(/\s/g, '');
      if (n) {
        hasNum++;
        if (!/^\d+$/.test(n)) badNum++;
      }
    }
    if (nameF) {
      const n = line.substr(nameF.start - 1 + shift, nameF.width).trim();
      if (n) {
        hasName++;
        // ad alanında rakam olmamalı (bozuk Türkçe harf "�", "*", "." olabilir)
        if (/\d/.test(n)) badName++;
        const letters = n.toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ]/g, '');
        nameLetters += letters.length;
        nameOtherLetters += letters.replace(/[A-E]/g, '').length;
      }
    }
  }
  const n = Math.max(1, lines.length);
  const badRatio = answerChars ? bad / answerChars : 1;
  const longRatio = long / n;
  // Satır uzunluğu: dosyadaki satırlar sabit uzunluktaysa format en fazla o kadar olmalı ve satırı boşa düşürmemeli
  const lengthOk = longRatio <= 0.05 && (fixedLen === null || (expected <= fixedLen && expected >= fixedLen - 2));
  const idOk = (!num || (hasNum >= n * 0.5 && badNum <= hasNum * 0.1)) && (!nameF || hasName === 0 || (badName <= hasName * 0.1 && nameOtherLetters >= nameLetters * 0.3));
  return {
    clean: lengthOk && idOk && answerChars >= n && badRatio <= 0.01,
    answerChars,
    badRatio,
    longRatio,
  };
}

const txtLines = (text: string) => (text || '').split(/\r?\n/).filter((l) => l.trim());

/** Satırların çoğu (%80) aynı uzunluktaysa o uzunluk; değilse null */
function fixedLength(lines: string[]): number | null {
  const c = new Map<number, number>();
  for (const l of lines) c.set(l.length, (c.get(l.length) || 0) + 1);
  let best = 0;
  let len = 0;
  for (const [k, v] of c) if (v > best) [best, len] = [v, k];
  return lines.length && best / lines.length >= 0.8 ? len : null;
}

/** Format bu TXT ile temiz biçimde uyuşuyor mu? (kayıtlı formatlar arasında uygun olanı önermek için) */
export function formatFitsTxt(text: string, fields: OptikField[]): boolean {
  if (!fields.length || checkFields(fields).length) return false;
  const lines = txtLines(text).slice(0, 300);
  return evalFit(lines, fields, 0, fixedLength(lines)).clean;
}

/**
 * Format uymuyorsa alanların topluca kaç karakter kaydırılınca uyduğunu bulur.
 * Satırlar sabit uzunluktaysa tek aday (dosya uzunluğu − format uzunluğu) denenir; değilse en küçük kayma aranır.
 * Uyuyorsa ya da hiçbir kayma uymuyorsa null döner.
 */
export function suggestShift(text: string, fields: OptikField[], maxShift = 80): number | null {
  if (!fields.length || checkFields(fields).length) return null;
  const lines = txtLines(text).slice(0, 300);
  if (!lines.length) return null;
  const fixed = fixedLength(lines);
  if (evalFit(lines, fields, 0, fixed).clean) return null;
  const minStart = Math.min(...fields.map((f) => f.start));
  const ok = (s: number) => s !== 0 && minStart + s >= 1 && evalFit(lines, fields, s, fixed).clean;
  if (fixed !== null) {
    const d = fixed - fieldsLength(fields);
    for (const s of [d, d - 1, d - 2]) if (Math.abs(s) <= maxShift && ok(s)) return s;
    return null;
  }
  for (let d = 1; d <= maxShift; d++) for (const s of [d, -d]) if (ok(s)) return s;
  return null;
}

/** Bütün alanları birlikte kaydırır */
export function shiftFields(fields: OptikField[], shift: number): OptikField[] {
  return fields.map((f) => ({ ...f, start: Math.max(1, f.start + shift) }));
}
