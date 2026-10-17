// ============================================================================
// DENEME ANALİZİ (Aşama 48d) — CEVAP ANAHTARINI KAZANIM BANKASIYLA EŞLEŞTİRME
// Sistem yalnızca kazanım bankasındaki (MEB) kazanımları kullanır. Yayınevi Excel'indeki kazanım
// kodu/metni yalnızca "hangi MEB kazanımı?" sorusunun ipucudur:
//   1) kod aynıysa doğrudan,  2) metin yeterince benziyorsa,  3) kalanlar yapay zekâ ile (yalnızca metin).
// Eşleşen sorunun kazanımı, kazanım metni ve KONUSU bankadan gelir.
// ============================================================================
import type { ExamQuestion, ExamQuestions, ExamSubject } from './lgs';
import { bankSubjectKey, codeKey, matchToBank, type BankOption } from './kazanimBank';
import type { BankRow } from '../../services/denemeService';
import { AI_CONCURRENCY, aiCall, aiMatchKazanim, newAiState, runPool, type AiProvider } from '../aiApi';

export interface MatchStat {
  total: number; // kaynağı (Excel bilgisi) olan soru sayısı
  kod: number;
  metin: number;
  ai: number;
  none: number;
  noBank: boolean;
}

export function bankOptionsBySubject(bank: BankRow[]): Record<string, BankOption[]> {
  const m: Record<string, BankOption[]> = {};
  for (const r of bank) {
    const k = bankSubjectKey(r.subject);
    if (!k) continue;
    (m[k] = m[k] || []).push({ code: r.code, text: r.text, konu: r.konu });
  }
  return m;
}

/** Sorunun eşleştirmede kullanılacak kaynağı: Excel bilgisi; eski denemelerde mevcut kazanım/konu */
function sourceOf(q: ExamQuestion): { code: string; text: string } {
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
  if (!b) return { ...base, kazanimCode: undefined, kazanim: undefined, konu: undefined, alt: undefined, kazanimCode2: undefined, kazanim2: undefined, ai: undefined };
  return { ...base, kazanimCode: b.code, kazanim: b.text, konu: b.konu || undefined, alt: undefined, kazanimCode2: undefined, kazanim2: undefined, ai };
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
  }
): Promise<{ questions: ExamQuestions; stats: Record<string, MatchStat>; notes: string[] }> {
  const options = bankOptionsBySubject(bank);
  const byCode = new Map(bank.map((r) => [codeKey(r.code), { code: r.code, text: r.text, konu: r.konu } as BankOption]));
  const out: ExamQuestions = { ...qs };
  const stats: Record<string, MatchStat> = {};
  const notes: string[] = [];
  const pending: Array<{ s: ExamSubject; items: Array<{ no: number; text: string }> }> = [];

  for (const s of subjects) {
    const list = qs[s.key] || [];
    const opt = options[s.key] || [];
    const st: MatchStat = { total: 0, kod: 0, metin: 0, ai: 0, none: 0, noBank: opt.length === 0 };
    const left: Array<{ no: number; text: string }> = [];
    out[s.key] = list.map((q) => {
      const src = sourceOf(q);
      if (!src.code && !src.text) return q;
      st.total++;
      const m = opt.length ? matchToBank(src, opt) : null;
      if (m) {
        if (m.by === 'kod') st.kod++;
        else st.metin++;
        return applyBank(q, byCode.get(codeKey(m.code)));
      }
      left.push({ no: q.no, text: [src.code, src.text].filter(Boolean).join(' — ').slice(0, 400) });
      return opts.clearUnmatched ? applyBank(q, undefined) : q;
    });
    if (left.length && opt.length) pending.push({ s, items: left });
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
          const kaz = (options[job.s.key] || []).slice(0, 400).map((k) => ({ code: k.code, konu: k.konu, text: k.text }));
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
    st.none = Math.max(0, st.total - st.kod - st.metin - st.ai);
  }
  return { questions: out, stats, notes };
}

/** Kısa özet cümlesi */
export function describeMatch(subjects: ExamSubject[], stats: Record<string, MatchStat>): { tone: 'success' | 'warning'; text: string } {
  const parts: string[] = [];
  let none = 0;
  const noBank: string[] = [];
  for (const s of subjects) {
    const st = stats[s.key];
    if (!st || !st.total) continue;
    if (st.noBank) {
      noBank.push(s.name);
      none += st.total;
      continue;
    }
    const ok = st.kod + st.metin + st.ai;
    none += st.none;
    parts.push(`${s.short} ${ok}/${st.total}`);
  }
  const text =
    (parts.length ? `Kazanımlar bankadan eşleştirildi: ${parts.join(', ')}.` : '') +
    (noBank.length ? ` Bankada kazanımı olmayan dersler: ${noBank.join(', ')} (önce Kazanım bankasına yükleyin).` : '') +
    (none ? ` ${none} soru eşleşmedi; tablodaki "Sorular" bölümünden elle seçebilir ya da "Kitapçıktan kazanım bul"u kullanabilirsiniz.` : '');
  return {
    tone: none ? 'warning' : 'success',
    text: text.trim() || 'Dosyada sorulara ait kazanım bilgisi yok; kazanımları "Kitapçıktan kazanım bul" ile ekleyebilir ya da tablodan elle seçebilirsiniz.',
  };
}
