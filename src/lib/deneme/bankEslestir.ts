// ============================================================================
// DENEME ANALİZİ (Aşama 48d) — CEVAP ANAHTARINI KAZANIM BANKASIYLA EŞLEŞTİRME
// Sistem yalnızca kazanım bankasındaki (MEB) kazanımları kullanır. Yayınevi Excel'indeki kazanım
// kodu/metni yalnızca "hangi MEB kazanımı?" sorusunun ipucudur:
//   1) kod aynıysa doğrudan,  2) metin yeterince benziyorsa,  3) kalanlar yapay zekâ ile (yalnızca metin).
// Eşleşen sorunun kazanımı, kazanım metni ve KONUSU bankadan gelir.
// ============================================================================
import type { ExamQuestion, ExamQuestions, ExamSubject } from './lgs';
import { bankSubjectKey, buildSubjectIndex, codeKey, konuCodeOf, matchQuestion, srcKeyOf, type BankOption, type KonuOption, type SubjectIndex } from './kazanimBank';
import type { BankRow } from '../../services/denemeService';
import { AI_CONCURRENCY, aiCall, aiMatchKazanim, newAiState, runPool, type AiProvider } from '../aiApi';
import { planFilterFor, type PlanMap } from './yillikPlan';

export interface MatchStat {
  total: number; // kaynağı (Excel bilgisi) olan soru sayısı
  kod: number;
  metin: number;
  ai: number;
  hafiza: number; // Aşama 128: eşleme hafızasından
  konu: number; // Aşama 128: kazanım yok, yalnız konu atandı (yukarıdaki sayıların içinde)
  plan: number; // Aşama 129: koda uyuldu ama yıllık plana göre henüz işlenmemiş (uyarı)
  planOn: boolean; // Aşama 129: bu derste yıllık plan süzgeci kullanıldı
  none: number;
  noBank: boolean;
}

export function bankOptionsBySubject(bank: BankRow[]): Record<string, BankOption[]> {
  const m: Record<string, BankOption[]> = {};
  for (const r of bank) {
    const k = bankSubjectKey(r.subject);
    if (!k) continue;
    (m[k] = m[k] || []).push({ code: r.code, text: r.text, konu: r.konu, alt: r.alt || [] });
  }
  return m;
}

/** Aşama 128: ders başına konu dizini (bir kez kurulur) */
export function bankIndexBySubject(options: Record<string, BankOption[]>): Record<string, SubjectIndex> {
  const m: Record<string, SubjectIndex> = {};
  for (const k of Object.keys(options)) m[k] = buildSubjectIndex(options[k]);
  return m;
}

/** Sorunun eşleştirmede kullanılacak kaynağı: Excel bilgisi; eski denemelerde mevcut kazanım/konu */
export function sourceOf(q: ExamQuestion): { code: string; text: string } {
  if (q.srcCode || q.srcText) return { code: q.srcCode || '', text: q.srcText || '' };
  return { code: q.kazanimCode || '', text: [q.kazanim, q.konu].filter(Boolean).join(' ') };
}

/** Bankadaki kazanımı soruya yazar (kazanım, metin ve konu bankadan) */
export function applyBank(q: ExamQuestion, b: BankOption | undefined, ai?: string): ExamQuestion {
  const src = sourceOf(q);
  const base: ExamQuestion = {
    ...q,
    srcCode: q.srcCode || (src.code ? src.code.slice(0, 60) : undefined),
    srcText: q.srcText || (src.text ? src.text.slice(0, 600) : undefined),
  };
  if (!b) return { ...base, kazanimCode: undefined, kazanim: undefined, konu: undefined, konuCode: undefined, alt: undefined, kazanimCode2: undefined, kazanim2: undefined, ai: undefined };
  // Aşama 48g: alt kazanım = bankadaki açıklama maddelerinden biri (aynı kazanımda kalınırsa seçim korunur)
  const alt = q.kazanimCode === b.code && q.alt && (b.alt || []).includes(q.alt) ? q.alt : undefined;
  return { ...base, kazanimCode: b.code, kazanim: b.text, konu: b.konu || undefined, konuCode: konuCodeOf(b.code), alt, kazanimCode2: undefined, kazanim2: undefined, ai };
}

/** Aşama 128: yalnız konu atanır (kazanım boş kalır; konu adı bankadan) */
export function applyKonu(q: ExamQuestion, k: KonuOption): ExamQuestion {
  const src = sourceOf(q);
  return {
    ...q,
    srcCode: q.srcCode || (src.code ? src.code.slice(0, 60) : undefined),
    srcText: q.srcText || (src.text ? src.text.slice(0, 600) : undefined),
    kazanimCode: undefined,
    kazanim: undefined,
    konu: k.konu,
    konuCode: k.code,
    alt: undefined,
    kazanimCode2: undefined,
    kazanim2: undefined,
    ai: undefined,
  };
}

/** Aşama 128: eşleme hafızasının anahtarı (yalnız yayınevi bilgisi olan sorularda) */
export function memoryKeyOf(q: ExamQuestion): string {
  return q.srcCode || q.srcText ? srcKeyOf({ code: q.srcCode, text: q.srcText }) : '';
}

/**
 * Bütün dersleri bankayla eşleştirir.
 * `clearUnmatched`: Excel yeni yüklendiğinde eşleşmeyen soruların Excel kazanımı kullanılmaz (boş kalır).
 * Var olan denemede yeniden eşleştirmede eşleşmeyen sorulara dokunulmaz.
 */
export async function matchQuestionsWithBank(
  subjects: ExamSubject[],
  qs: ExamQuestions,
  bank: BankRow[],
  opts: {
    clearUnmatched: boolean;
    ai: { provider: AiProvider; keys: { gemini: boolean; mistral: boolean } | null } | null;
    onProgress?: (text: string) => void;
    memory?: Map<string, Map<string, string>>; // Aşama 128: ders → (yayınevi ifadesi → kod)
    plans?: PlanMap | null; // Aşama 129: yıllık plan (Fen, Mat, İnkılap)
    examDate?: string; // Aşama 129: deneme tarihi (+1 hafta pay)
  }
): Promise<{ questions: ExamQuestions; stats: Record<string, MatchStat>; notes: string[] }> {
  const options = bankOptionsBySubject(bank);
  const index = bankIndexBySubject(options);
  const byCode = new Map(bank.map((r) => [codeKey(r.code), { code: r.code, text: r.text, konu: r.konu, alt: r.alt || [] } as BankOption]));
  const out: ExamQuestions = { ...qs };
  const stats: Record<string, MatchStat> = {};
  const notes: string[] = [];
  const pending: Array<{ s: ExamSubject; items: Array<{ no: number; text: string }> }> = [];
  // Aşama 129: yıllık plana göre işlenmiş kazanımlar (ad benzerliği ve yapay zekâ adayları)
  const taught: Record<string, (code: string) => boolean> = {};
  for (const s of subjects) {
    const f = planFilterFor(opts.plans, s.key, opts.examDate);
    if (f) taught[s.key] = f;
  }

  for (const s of subjects) {
    const list = qs[s.key] || [];
    const opt = options[s.key] || [];
    const isTaught = taught[s.key];
    const st: MatchStat = { total: 0, kod: 0, metin: 0, ai: 0, hafiza: 0, konu: 0, plan: 0, planOn: !!isTaught, none: 0, noBank: opt.length === 0 };
    const left: Array<{ no: number; text: string }> = [];
    const idx = index[s.key];
    const nameIdx = idx && isTaught ? buildSubjectIndex(opt.filter((o) => isTaught(o.code))) : idx;
    const mem = opts.memory?.get(s.key);
    out[s.key] = list.map((q) => {
      const src = sourceOf(q);
      if (!src.code && !src.text) return q;
      st.total++;
      const m = idx ? matchQuestion(src, idx, mem, nameIdx) : null;
      if (m) {
        if (isTaught && !isTaught(m.kind === 'konu' ? m.konu.code : m.code)) st.plan++;
        if (m.by === 'kod') st.kod++;
        else if (m.by === 'hafiza') st.hafiza++;
        else st.metin++;
        if (m.kind === 'konu') {
          st.konu++;
          return applyKonu(q, m.konu);
        }
        return applyBank(q, byCode.get(codeKey(m.code)));
      }
      left.push({ no: q.no, text: [src.code, src.text].filter(Boolean).join(' — ').slice(0, 400) });
      return opts.clearUnmatched ? applyBank(q, undefined) : q;
    });
    if (left.length && (isTaught ? opt.some((o) => isTaught(o.code)) : opt.length)) pending.push({ s, items: left });
    stats[s.key] = st;
  }

  // Kalanlar: yapay zekâ ile (yalnızca Excel'deki ifade ve MEB listesi gider; öğrenci bilgisi yok)
  if (opts.ai && pending.length && opts.ai.keys && (opts.ai.keys.gemini || opts.ai.keys.mistral)) {
    const state = newAiState(opts.ai.provider, true, opts.ai.keys);
    let i = 0;
    let stop = false;
    opts.onProgress?.('Kalan kazanımlar yapay zekâ ile eşleştiriliyor…');
    await runPool(
      AI_CONCURRENCY,
      () => {
        if (stop || i >= pending.length) return null;
        const job = pending[i++];
        return async () => {
          const f = taught[job.s.key];
          const kaz = (options[job.s.key] || [])
            .filter((k) => !f || f(k.code))
            .slice(0, 400)
            .map((k) => ({ code: k.code, konu: k.konu, text: k.text }));
          const r = await aiCall(state, (p, avoid) => aiMatchKazanim({ provider: p, subject: { name: job.s.name }, items: job.items, kazanimlar: kaz, avoid }), {
            stop: () => stop,
            onWait: (w) => w && opts.onProgress?.(w),
          });
          if (!r.ok) {
            notes.push(`${job.s.name}: yapay zekâ ile eşleştirilemedi (${r.error || 'hata'}).`);
            if (r.code === 'quota-day' || r.code === 'no-key') stop = true;
            return;
          }
          const got = new Map<number, string>();
          for (const it of (r.items || []) as Array<{ no: number; kod: string; guven: number }>) if (it.guven >= 50) got.set(it.no, it.kod);
          const st = stats[job.s.key];
          out[job.s.key] = (out[job.s.key] || []).map((q) => {
            const code = got.get(q.no);
            if (!code || !job.items.some((x) => x.no === q.no)) return q;
            const b = byCode.get(codeKey(code));
            if (!b) return q;
            st.ai++;
            return applyBank(q, b, r.provider || 'gemini');
          });
        };
      },
      () => false
    );
  }
  for (const k of Object.keys(stats)) {
    const st = stats[k];
    st.none = Math.max(0, st.total - st.kod - st.metin - st.ai - st.hafiza);
  }
  return { questions: out, stats, notes };
}

/** Kısa özet cümlesi */
export function describeMatch(subjects: ExamSubject[], stats: Record<string, MatchStat>): { tone: 'success' | 'warning'; text: string } {
  const parts: string[] = [];
  let none = 0;
  const noBank: string[] = [];
  const planWarn: string[] = [];
  const planOn: string[] = [];
  for (const s of subjects) {
    const st = stats[s.key];
    if (!st || !st.total) continue;
    if (st.noBank) {
      noBank.push(s.name);
      none += st.total;
      continue;
    }
    const ok = st.kod + st.metin + st.ai + st.hafiza;
    none += st.none;
    parts.push(`${s.short} ${ok}/${st.total}${st.konu ? ` (${st.konu} yalnız konu)` : ''}`);
    if (st.planOn) planOn.push(s.short);
    if (st.plan) planWarn.push(`${s.short} ${st.plan}`);
  }
  const text =
    (parts.length ? `Kazanımlar bankadan eşleştirildi: ${parts.join(', ')}.` : '') +
    (noBank.length ? ` Bankada kazanımı olmayan dersler: ${noBank.join(', ')} (önce Kazanım bankasına yükleyin).` : '') +
    (none ? ` ${none} soru eşleşmedi; tablodaki "Sorular" bölümünden elle seçebilir ya da "Kitapçıktan kazanım bul"u kullanabilirsiniz.` : '') +
    (planOn.length ? ` Yıllık plan süzgeci: ${planOn.join(', ')} (ad benzerliğinde ve yapay zekâda yalnız deneme tarihine kadar işlenen kazanımlar).` : '') +
    (planWarn.length ? ` Planda henüz işlenmemiş kazanıma yazılan sorular (yayınevi kodu açık): ${planWarn.join(', ')}; "Sorular" bölümünde turuncu işaretli, kontrol edin.` : '');
  return {
    tone: none || planWarn.length ? 'warning' : 'success',
    text: text.trim() || 'Dosyada sorulara ait kazanım bilgisi yok; kazanımları "Kitapçıktan kazanım bul" ile ekleyebilir ya da tablodan elle seçebilirsiniz.',
  };
}
