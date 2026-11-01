// ============================================================================
// DENEME ANALİZİ (Aşama 129) — YILLIK PLAN SÜZGECİ
// Yalnız Fen Bilimleri, Matematik ve T.C. İnkılap Tarihi (Türkçe, Din, İngilizce süzülmez).
// Yıllık plan Excel'inden (AY, HAFTA, ÜNİTE, KONU, KAZANIM sütunları) her kazanımın ilk işlendiği
// haftanın başlangıç günü çıkarılır. Deneme tarihine (+1 hafta pay) kadar işlenmemiş kazanımlar:
//   * yapay zekâya (kitapçıktan kazanım, Excel'de kalan sorular) aday olarak gönderilmez,
//   * ad / metin benzerliğiyle eşleştirmede aday olmaz.
// Yayınevi açıkça kod yazmışsa (ya da öğretmen elle seçmişse) koda uyulur, yalnız
// "planda henüz işlenmedi" uyarısı gösterilir; karar öğretmenindir.
// Plan kişisel bilgi içermez.
// ============================================================================
import { foldTr } from './optik';
import { digitsKey } from './kazanimBank';

/** Planla süzülen dersler (LGS_SUBJECTS anahtarları) */
export const PLAN_SUBJECTS = ['fen', 'mat', 'sos'] as const;
export type PlanSubject = (typeof PLAN_SUBJECTS)[number];
export const isPlanSubject = (k: string): k is PlanSubject => (PLAN_SUBJECTS as readonly string[]).includes(k);

export interface PlanItem {
  code: string; // rakam anahtarı: 8.1.1.1 (kazanım) ya da 8.1.1 (Fen/Mat konu)
  start: string; // YYYY-MM-DD (ilk işlendiği haftanın ilk günü)
}

export interface PlanParseResult {
  items: PlanItem[];
  year: number | null; // eğitim yılının ilk yılı (2026-2027 → 2026)
  weeks: number;
  warnings: string[];
}

/** Ders → (rakam anahtarı → ilk hafta) */
export type PlanMap = Record<string, Map<string, string>>;

export type PlanStatus = 'ok' | 'later' | 'unknown';

const MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "1. Hafta: 14-18 Eylül" / "28 Eylül-02 Ekim" → haftanın ilk günü (ay + gün) */
export function weekStart(cell: string): { m: number; d: number } | null {
  const t = foldTr(cell || '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*\d{1,2}\s*\.?\s*hafta\s*:?/, ' ');
  const r = /(\d{1,2})\s*([a-z]+)?\s*[-–]\s*(\d{1,2})\s*([a-z]+)/.exec(t);
  if (r) {
    const m = MONTHS[(r[2] && MONTHS[r[2]] ? r[2] : r[4]) || ''];
    const d = Number(r[1]);
    if (m && d >= 1 && d <= 31) return { m, d };
  }
  const one = /(\d{1,2})\s*([a-z]+)/.exec(t);
  if (one && MONTHS[one[2]]) return { m: MONTHS[one[2]], d: Number(one[1]) };
  return null;
}

/** Hücredeki 8. sınıf kodları (rakam anahtarı, en az üç basamak: 8.1.1) */
export function codesIn(cell: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[^\d.,])((?:[A-Za-zÇĞİÖŞÜçğıöşü]{1,3}\s*\.\s*)?8(?:\s*\.\s*\d{1,2}){2,3})(?![\d,])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell || ''))) {
    const k = digitsKey(m[1]);
    if (k.startsWith('8.') && k.split('.').length >= 3) out.push(k);
  }
  return out;
}

/** Bugüne göre eğitim yılının ilk yılı (Ağustostan itibaren yeni yıl) */
export function currentSchoolYear(now = new Date()): number {
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Yıllık plan Excel'ini okur. `yearHint`: başlıkta "2026-2027" yoksa kullanılır. */
export async function readPlanFile(file: File, yearHint: number): Promise<PlanParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const warnings: string[] = [];
  const first = new Map<string, string>();
  let year: number | null = null;
  let weeks = 0;
  for (const name of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: null, blankrows: false });
    let haftaCol = -1;
    let codeCols: number[] = [];
    let cur: string | null = null;
    for (const row of data) {
      const cells = (row || []).map((c) => (c === null || c === undefined ? '' : String(c)));
      if (!cells.some((c) => c.trim())) continue;
      if (year === null) {
        const y = /(20\d\d)\s*[-–/]\s*(20\d\d)/.exec(cells.join(' '));
        if (y && Number(y[2]) === Number(y[1]) + 1) year = Number(y[1]);
      }
      if (haftaCol < 0) {
        const folded = cells.map((c) => foldTr(c).replace(/\s+/g, ' ').trim());
        const h = folded.findIndex((c) => /^hafta/.test(c));
        if (h >= 0) {
          haftaCol = h;
          codeCols = folded.map((c, i) => (/(unite|konu|kazanim)/.test(c) && !/aciklama/.test(c) ? i : -1)).filter((i) => i >= 0);
        }
        continue;
      }
      const ws = weekStart(cells[haftaCol] || '');
      if (ws) {
        const y0 = year ?? yearHint;
        const y = ws.m >= 8 ? y0 : y0 + 1;
        cur = iso(y, ws.m, ws.d);
        weeks++;
      }
      if (!cur) continue;
      for (const ci of codeCols)
        for (const k of codesIn(cells[ci] || '')) {
          const old = first.get(k);
          if (!old || cur < old) first.set(k, cur);
        }
    }
  }
  if (!weeks) warnings.push('Dosyada "HAFTA" sütunu ya da hafta tarihleri (ör. "14-18 Eylül") bulunamadı.');
  else if (!first.size) warnings.push('Dosyada kazanım kodu (ör. F.8.1.1.1) bulunamadı.');
  if (year === null && weeks) warnings.push(`Dosyada eğitim yılı yazmıyor; ${yearHint}-${yearHint + 1} kabul edildi.`);
  const items = Array.from(first.entries())
    .map(([code, start]) => ({ code, start }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code, 'tr', { numeric: true }));
  return { items, year: year ?? (weeks ? yearHint : null), weeks, warnings };
}

/** Deneme tarihi + 7 gün (bir hafta pay) */
export function planCutoff(examDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(examDate || '')) return null;
  const d = new Date(`${examDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Plan bu deneme için kullanılabilir mi? (deneme, planın eğitim yılı içinde olmalı) */
export function planUsable(plan: Map<string, string> | undefined, cutoff: string | null): boolean {
  if (!plan || !plan.size || !cutoff) return false;
  let min = '9999';
  for (const v of plan.values()) if (v < min) min = v;
  // planın ilk haftasından 2 ay önce ya da 11 aydan sonraki deneme başka eğitim yılına aittir
  const start = new Date(`${min}T12:00:00Z`);
  const lo = new Date(start);
  lo.setUTCDate(lo.getUTCDate() - 60);
  const hi = new Date(start);
  hi.setUTCDate(hi.getUTCDate() + 335);
  return cutoff >= lo.toISOString().slice(0, 10) && cutoff <= hi.toISOString().slice(0, 10);
}

/** Kazanım ya da konu kodunun plandaki ilk haftası (yoksa null) */
export function planStartOf(plan: Map<string, string> | undefined, code: string): string | null {
  if (!plan || !code) return null;
  const dk = digitsKey(code);
  if (!dk) return null;
  const exact = plan.get(dk);
  if (exact) return exact;
  // konu kodu: altındaki kazanımlardan en erken işleneni
  let min: string | null = null;
  for (const [k, v] of plan) if (k.startsWith(`${dk}.`) && (!min || v < min)) min = v;
  if (min) return min;
  // planda yazmayan kazanım: konusunun ilk haftası
  const parts = dk.split('.');
  for (let n = parts.length - 1; n >= 3; n--) {
    const p = plan.get(parts.slice(0, n).join('.'));
    if (p) return p;
  }
  return null;
}

/** Kazanım ya da konu kodunun deneme tarihine kadar işlenip işlenmediği */
export function planStatus(plan: Map<string, string> | undefined, code: string, cutoff: string | null): PlanStatus {
  if (!cutoff) return 'unknown';
  const start = planStartOf(plan, code);
  if (!start) return 'unknown';
  return start <= cutoff ? 'ok' : 'later';
}

/** Süzgeç: bu ders ve tarih için "henüz işlenmedi" sayılan kodu eler (bilinmeyenler kalır) */
export function planFilterFor(plans: PlanMap | null | undefined, subjectKey: string, examDate: string | undefined): ((code: string) => boolean) | null {
  if (!plans || !isPlanSubject(subjectKey)) return null;
  const plan = plans[subjectKey];
  const cutoff = planCutoff(examDate || '');
  if (!planUsable(plan, cutoff)) return null;
  return (code: string) => planStatus(plan, code, cutoff) !== 'later';
}

/** "2026-11-09" → "9 Kasım 2026" */
export function planDateTr(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return s || '';
  const names = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(m[3])} ${names[Number(m[2]) - 1]} ${m[1]}`;
}
