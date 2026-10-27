// ============================================================================
// DENEME ANALİZİ (Aşama 90) — SÖZEL / SAYISAL AYRI OPTİK FORMATLARI
//  1) Ders düzeltmesi: optik formlar çoğu zaman genel formdur; FMT'deki blok adı formun basılı yazısından gelir
//     (ör. Özdebir sözel FMT'de "TURKCE, FEN, INGILIZCE, DIN KULT", sayısalda "MATEMATIK, SOSYAL"). Bir FMT'de
//     iki oturumun dersleri karışıksa adlara güvenilmez: cevap blokları formdaki yerine (sütun) göre soldan sağa
//     LGS sırasıyla verilir (sözel: Türkçe, İnkılap, Din, Yabancı Dil; sayısal: Matematik, Fen). Gerçek optik
//     verisiyle doğrulandı: Özdebir sözelde "FEN" bloğu Din, "INGILIZCE" bloğu İnkılap, "DIN KULT" bloğu
//     İngilizce çıkıyor. Blok sayısı oturumun ders sayısına uymazsa yalnızca diğer oturuma ait blok eksik derse
//     çevrilir. Bütün dersleri içeren tek (birleşik) FMT'lere ve adları tutarlı FMT'lere dokunulmaz.
//  2) Anahtarla doğrulama: her TXT'de bir ders olarak okunan cevaplar bütün derslerin anahtarıyla karşılaştırılır.
//     Başka bir dersin anahtarıyla çok daha iyi uyuşuyorsa uyarı ve tek tıkla düzeltme önerilir.
// ============================================================================
import type { OptikField, OptikRow } from './optik';
import { markOf, toAOrder, type ExamQuestions, type ExamSubject } from './lgs';

export interface SubjectChange {
  label: string;
  from: string;
  to: string;
}

/**
 * FMT satırlarının form üzerindeki yeri (satır, sütun). parseFmt ile aynı satırları aynı sırayla alır;
 * dönen dizinin i. elemanı alanların i. elemanına karşılık gelir.
 */
export function fmtPositions(text: string): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const p = raw.trim().split('=');
    if (p.length < 9) continue;
    const n = [p[0], p[1], p[2], p[3]].map((x) => parseInt(x, 10));
    if (!n.every((x) => Number.isFinite(x) && x > 0)) continue;
    out.push({ r: Math.min(n[0], n[1]), c: Math.min(n[2], n[3]) });
  }
  return out;
}

/** FMT'deki oturumu karışık cevap bloklarını düzeltir (yukarıdaki açıklama) */
export function fixSessionSubjects(fields: OptikField[], subjects: ExamSubject[], fmtText?: string): { fields: OptikField[]; changes: SubjectChange[] } {
  const byKey = new Map(subjects.map((s) => [s.key, s]));
  const ans = fields.filter((f) => f.role === 'answers' && f.subject && byKey.has(f.subject));
  const weight: Record<string, number> = {};
  for (const f of ans) {
    const s = byKey.get(f.subject!)!;
    weight[s.session] = (weight[s.session] || 0) + s.count;
  }
  const sessions = Object.keys(weight);
  if (sessions.length < 2) return { fields, changes: [] };
  const main = sessions.sort((a, b) => weight[b] - weight[a])[0];
  if (weight[sessions[0]] === weight[sessions[1]]) return { fields, changes: [] };
  // Form üzerindeki yerine göre: blok sayısı oturumun ders sayısına eşitse soldan sağa LGS sırası
  const mainSubjects = subjects.filter((s) => s.session === main);
  const pos = fmtText ? fmtPositions(fmtText) : [];
  if (pos.length === fields.length && ans.length === mainSubjects.length) {
    const idx = new Map(fields.map((f, i) => [f.id, i]));
    const ordered = ans.slice().sort((a, b) => {
      const pa = pos[idx.get(a.id)!];
      const pb = pos[idx.get(b.id)!];
      return pa.c - pb.c || pa.r - pb.r;
    });
    const map = new Map(ordered.map((f, i) => [f.id, mainSubjects[i].key]));
    const changes: SubjectChange[] = ordered.filter((f) => f.subject !== map.get(f.id)).map((f) => ({ label: f.label, from: f.subject!, to: map.get(f.id)! }));
    return { fields: fields.map((f) => (map.has(f.id) ? { ...f, subject: map.get(f.id) } : f)), changes };
  }
  const used = new Set(ans.map((f) => f.subject!));
  const missing = subjects.filter((s) => s.session === main && !used.has(s.key));
  const outliers = ans.filter((f) => byKey.get(f.subject!)!.session !== main);
  if (!missing.length || outliers.length > missing.length) return { fields, changes: [] };
  const map = new Map<string, string>();
  outliers.forEach((f, i) => map.set(f.id, missing[i].key));
  const changes: SubjectChange[] = outliers.map((f) => ({ label: f.label, from: f.subject!, to: map.get(f.id)! }));
  return { fields: fields.map((f) => (map.has(f.id) ? { ...f, subject: map.get(f.id) } : f)), changes };
}

export interface KeySuggestion {
  from: string; // dosyada okunduğu ders
  to: string; // anahtarla daha iyi uyuşan ders
  rateFrom: number; // %
  rateTo: number; // %
}

/**
 * Bir TXT'nin satırlarında her dersin cevaplarını bütün derslerin anahtarıyla karşılaştırır.
 * Yalnızca anahtarı tam olan dersler kullanılır; yeterli işaretleme yoksa öneri yapılmaz.
 */
export function checkBlocksWithKey(rows: OptikRow[], subjects: ExamSubject[], qs: ExamQuestions, complete: (k: string) => boolean): KeySuggestion[] {
  const keyed = subjects.filter((s) => complete(s.key));
  if (keyed.length < 2 || !rows.length) return [];
  const present = subjects.filter((s) => rows.some((r) => /[A-E]/.test(r.answers[s.key] || '')));
  const rate = (from: string, to: ExamSubject) => {
    const list = qs[to.key] || [];
    let marked = 0;
    let right = 0;
    for (const r of rows.slice(0, 400)) {
      const raw = (r.answers[from] || '').slice(0, to.count);
      if (!/[A-E]/.test(raw)) continue;
      const a = toAOrder(raw, list, r.booklet === 'B' ? 'B' : 'A');
      list.forEach((q, i) => {
        const ch = a[i];
        if (!ch || ch === ' ' || ch === '*' || q.answer === 'X') return;
        marked++;
        if (markOf(ch, q) === 'D') right++;
      });
    }
    return marked >= 20 ? Math.round((right / marked) * 100) : -1;
  };
  const out: KeySuggestion[] = [];
  for (const s of present) {
    const own = complete(s.key) ? rate(s.key, s) : -1;
    let best: { k: string; r: number } | null = null;
    for (const t of keyed) {
      if (t.key === s.key) continue;
      const r = rate(s.key, t);
      if (r >= 0 && (!best || r > best.r)) best = { k: t.key, r };
    }
    if (!best || best.r < 40) continue;
    // Kendi anahtarı yoksa ya da başkasıyla açıkça daha iyi uyuşuyorsa
    if (own < 0 ? best.r >= 45 : best.r - own >= 20) out.push({ from: s.key, to: best.k, rateFrom: own, rateTo: best.r });
  }
  return out;
}

/** Önerileri bir eşleme olarak uygular: bir ders başka derse taşınırken o dersin cevapları da yer değiştirir */
export function suggestionMap(list: KeySuggestion[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of list) m.set(s.from, s.to);
  // Hedef ders dosyada başka bir ders olarak okunuyorsa ve ona öneri yoksa, ikisi yer değiştirir
  for (const s of list) if (!m.has(s.to) && !Array.from(m.values()).filter((v) => v === s.from).length) m.set(s.to, s.from);
  return m;
}

/** Satırlardaki ders cevaplarını eşlemeye göre taşır */
export function remapRows(rows: OptikRow[], map: Map<string, string>): OptikRow[] {
  return rows.map((r) => {
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.answers)) answers[map.get(k) || k] = v;
    return { ...r, answers };
  });
}

/** Format alanlarının derslerini eşlemeye göre değiştirir */
export function remapFields(fields: OptikField[], map: Map<string, string>): OptikField[] {
  return fields.map((f) => (f.role === 'answers' && f.subject && map.has(f.subject) ? { ...f, subject: map.get(f.subject) } : f));
}
