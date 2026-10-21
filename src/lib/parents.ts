import type { StudentParent, ParentRelation } from '../types';
import { emailIssue, normalizeTurkishPhone, trFold } from './importNormalize';

// ============================================================================
// Aşama 69: VELİ İLETİŞİM BİLGİLERİ (en çok 3 veli — K12 listesindeki Veli (1), Veli (2), Veli (3) ile aynı)
// Her velinin yakınlığı (Anne / Baba / Diğer, isteğe bağlı), adı soyadı, cep telefonu ve e-postası tutulur.
// ============================================================================

export const MAX_PARENTS = 3;
/** Yakınlık kutusundaki öneriler (başka bir yakınlık da yazılabilir) */
export const PARENT_RELATIONS: ParentRelation[] = ['Anne', 'Baba', 'Vasi', 'Bakıcı', 'Dede', 'Nine', 'Abla', 'Ağabey', 'Teyze', 'Hala', 'Amca', 'Dayı'];

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Yakınlık yazısı: "BABA" → "Baba", "bakıcı" → "Bakıcı" (en çok 30 harf) */
export function cleanRelation(v: unknown): ParentRelation {
  const t = clean(v).slice(0, 30);
  if (!t) return '';
  return t
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w))
    .join(' ');
}

/** Velide hiç bilgi var mı (yakınlık tek başına bilgi sayılmaz) */
export const hasParentInfo = (p?: StudentParent | null) => !!p && !!(clean(p.name) || clean(p.phone) || clean(p.email));

/** Kayıt için temiz liste: boş veliler atılır, en çok 3 veli, telefon 05XXXXXXXXX biçiminde */
export function cleanParents(list?: StudentParent[] | null): StudentParent[] {
  const out: StudentParent[] = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!hasParentInfo(p)) continue;
    const ph = normalizeTurkishPhone(clean(p.phone));
    const rel = cleanRelation(p.relation);
    out.push({
      relation: rel,
      name: clean(p.name).slice(0, 80),
      phone: (ph.valid ? ph.value : clean(p.phone)).slice(0, 20),
      email: clean(p.email).toLowerCase().slice(0, 254),
    });
    if (out.length >= MAX_PARENTS) break;
  }
  return out;
}

export const parentsKey = (list?: StudentParent[] | null) => JSON.stringify(cleanParents(list));

/** Ekranda velinin adı: "Anne", "Baba" ya da "1. veli" */
export const parentTitle = (p: StudentParent | undefined, index: number) => (p?.relation ? p.relation : `${index + 1}. veli`);

/** Kısa özet: "Anne: Ayşe Yılmaz · 05551234567" */
export function parentsSummary(list?: StudentParent[] | null): string {
  const ps = cleanParents(list);
  if (!ps.length) return '—';
  return ps
    .map((p, i) => `${parentTitle(p, i)}: ${[p.name, p.phone, p.email].filter(Boolean).join(' · ')}`)
    .join(' | ');
}

/** Velinin hatası (telefon / e-posta biçimi); yoksa null */
export function parentIssue(p: StudentParent): string | null {
  const ph = normalizeTurkishPhone(clean(p.phone));
  if (!ph.valid) return 'Geçersiz telefon (örn. 0532 123 45 67)';
  const em = emailIssue(clean(p.email));
  if (em) return em;
  return null;
}

/**
 * Excel'den gelen velileri kayıtlı velilerle birleştirir. Excel'de boş olan hücre kayıtlı bilgiyi SİLMEZ.
 * Aynı sıradaki veli (1. ile 1., 2. ile 2.) güncellenir. Geçersiz telefon / e-posta yazılmaz, notes'a eklenir.
 */
export function mergeParents(existing: StudentParent[] | undefined, incoming: StudentParent[], notes: string[]): StudentParent[] {
  const base = cleanParents(existing);
  const out: StudentParent[] = [];
  for (let i = 0; i < MAX_PARENTS; i++) {
    const cur = base[i] || {};
    const inc = incoming[i] || {};
    let phone = clean(inc.phone);
    if (phone) {
      const ph = normalizeTurkishPhone(phone);
      if (!ph.valid) {
        notes.push(`${parentTitle(inc.relation ? inc : cur, i)} telefonu "${phone}" geçersiz; yazılmadı`);
        phone = '';
      } else phone = ph.value;
    }
    let email = clean(inc.email);
    if (email && emailIssue(email)) {
      notes.push(`${parentTitle(inc.relation ? inc : cur, i)} e-postası "${email}" geçersiz; yazılmadı`);
      email = '';
    }
    out.push({
      relation: cleanRelation(inc.relation) || cleanRelation(cur.relation),
      name: clean(inc.name) || clean(cur.name),
      phone: phone || clean(cur.phone),
      email: email || clean(cur.email),
    });
  }
  return cleanParents(out);
}

// ----------------------------------------------------------------------------- Excel sütunları
type ParentGroup = 'v1' | 'v2' | 'v3' | 'anne' | 'baba';
type ParentField = 'name' | 'phone' | 'email' | 'relation';

/**
 * Başlık bir veli sütunu mu? K12: "Veli (1) Tam Adı", "Veli (1) Mesaj Gönderi (Cep Tel)", "Veli (1) 1. E-Posta Adresi";
 * e-Okul / diğer: "Anne Cep Telefonu", "Baba Adı Soyadı", "Veli Telefonu", "2. Veli E-posta", "Veli Yakınlık".
 */
export function parentColumnOf(header: string): { group: ParentGroup; field: ParentField; rank: number } | null {
  const h = trFold(header).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!h || /kimlik|\btc\b|meslek|dogum/.test(h)) return null;
  if (/adres/.test(h) && !/posta|mail/.test(h)) return null; // ev / iş adresi
  let group: ParentGroup | null = null;
  const m = /\bveli\s*([123])\b/.exec(h) || /\b([123])\s*(?:nci|inci|uncu|nd|st)?\s*veli\b/.exec(h);
  if (m) group = (`v${m[1]}`) as ParentGroup;
  else if (/\banne(si)?\b/.test(h)) group = 'anne';
  else if (/\bbaba(si)?\b/.test(h)) group = 'baba';
  else if (/\bveli(si|nin)?\b/.test(h)) group = 'v1';
  if (!group) return null;
  let field: ParentField | null = null;
  if (/yakinli|derece|iliski/.test(h)) field = 'relation'; // "Velinin Yakınlığı", "Yakınlık Derecesi"
  else if (/posta|mail/.test(h)) field = 'email';
  else if (/\btel\b|telefon|gsm|\bcep\b|mobil/.test(h)) field = 'phone';
  else if (/\bad\b|\badi\b|soyad|isim|ismi|tam ad/.test(h)) field = 'name';
  if (!field) return null;
  // Birden çok e-posta / telefon sütunu varsa "1." olan ya da ilk gelen kullanılır
  const rank = /\b2\s+e\s*posta|\b2\s+(tel|telefon)|ikinci/.test(h) ? 2 : 1;
  return { group, field, rank };
}

/** Başlıkların içinde en az bir veli sütunu var mı */
export const hasParentColumns = (headers: string[]) => headers.some((h) => !!parentColumnOf(h));


/** Bir Excel satırından velileri çıkarır (sıra: Veli 1, Veli 2, Veli 3, Anne, Baba; en çok 3 dolu veli) */
export function extractParents(headers: string[], values: Record<string, string>): StudentParent[] {
  const groups: Record<ParentGroup, StudentParent & { _rank?: Partial<Record<ParentField, number>> }> = {
    v1: {},
    v2: {},
    v3: {},
    anne: { relation: 'Anne' },
    baba: { relation: 'Baba' },
  };
  for (const h of headers) {
    const c = parentColumnOf(h);
    if (!c) continue;
    const v = clean(values[h]);
    if (!v) continue;
    const g = groups[c.group];
    g._rank = g._rank || {};
    const prev = g._rank[c.field];
    if (prev !== undefined && prev <= c.rank) continue; // daha öncelikli sütun zaten yazıldı
    g._rank[c.field] = c.rank;
    if (c.field === 'relation') g.relation = cleanRelation(v);
    else g[c.field] = v;
  }
  // Boş veliler atlanır (kayıtta da boş veli tutulmaz; sıra dolu velilere göre)
  const order: ParentGroup[] = ['v1', 'v2', 'v3', 'anne', 'baba'];
  const out: StudentParent[] = [];
  for (const k of order) {
    const g = groups[k];
    if (!hasParentInfo(g)) continue;
    out.push({ relation: g.relation || '', name: g.name || '', phone: g.phone || '', email: g.email || '' });
  }
  return out.slice(0, MAX_PARENTS);
}
