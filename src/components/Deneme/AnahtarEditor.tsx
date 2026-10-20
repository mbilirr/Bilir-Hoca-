import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileSpreadsheet, Sparkles } from 'lucide-react';
import { cx } from '../ui/kit';
import { questionsFromKeyString, type ExamQuestion, type ExamQuestions, type ExamSubject } from '../../lib/deneme/lgs';
import { hasSourceKazanim, readKeyExcel, splitKazanim, type ExcelKeyResult } from '../../lib/deneme/anahtarExcel';
import { listKazanimlar, type BankRow } from '../../services/denemeService';
import { codeKey } from '../../lib/deneme/kazanimBank';
import { applyBank, bankOptionsBySubject, describeMatch, matchQuestionsWithBank } from '../../lib/deneme/bankEslestir';
import { aiCall, aiReadKey, aiStatus, newAiState, type AiProvider } from '../../lib/aiApi';
import { KazanimAI } from './KazanimAI';
import { badBNos, bMapProblems, checkWithBKey, cleanKey, parseBOrder } from '../../lib/deneme/bKitapcik';

// ============================================================================
// Cevap anahtarı ve kazanım düzenleyici (Aşama 47, 48d)
// Yayınevinin Excel şablonu yüklenince cevaplar ve B kitapçığı karşılıkları dolar.
// Aşama 48d: sistem YALNIZCA kazanım bankasındaki (MEB) kazanımları kullanır. Excel'deki kazanım
// yalnızca bankadaki karşılığını bulmak için kullanılır; kazanım metni ve konu bankadan gelir.
// Excel yoksa A cevapları elle yazılır; B kitapçığı "A'nın tersi" ya da "A ile aynı" seçilir.
// ============================================================================

const keyString = (qs: ExamQuestion[]) => qs.map((q) => q.answer || ' ').join('').replace(/\s+$/, '');
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function bRuleOf(qs: ExamQuestion[], count: number): 'reverse' | 'same' | 'custom' {
  if (!qs.length) return 'reverse';
  if (qs.length && qs.every((q) => q.bNo === count + 1 - q.no)) return 'reverse';
  if (qs.length && qs.every((q) => !q.bNo || q.bNo === q.no)) return 'same';
  return 'custom';
}

export const AnahtarEditor: React.FC<{
  subjects: ExamSubject[];
  questions: ExamQuestions;
  onChange: (qs: ExamQuestions) => void;
  onExcelMeta?: (r: ExcelKeyResult) => void;
}> = ({ subjects, questions, onChange, onExcelMeta }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [bank, setBank] = useState<BankRow[] | null>(null);
  const [ai, setAi] = useState<{ provider: AiProvider; keys: { gemini: boolean; mistral: boolean } } | null>(null);
  // Aşama 50: son okunan Excel (yapay zekâ seçeneği için) ve sunulan seçenek
  const [lastExcel, setLastExcel] = useState<ExcelKeyResult | null>(null);
  const [offer, setOffer] = useState<{ kind: 'kazanim' | 'all'; subjects: string[] } | null>(null);
  // Aşama 62: B kitapçığı soru soru (karışık sıra) — ders başına araçlar
  const [customB, setCustomB] = useState<Set<string>>(new Set());
  const [bTools, setBTools] = useState<Record<string, { order: string; dir: 'a2b' | 'b2a'; bKey: string; msg?: { tone: 'success' | 'warning' | 'danger'; text: string } }>>({});
  const toolOf = (k: string) => bTools[k] || { order: '', dir: 'a2b' as const, bKey: '' };
  const setTool = (k: string, p: Partial<{ order: string; dir: 'a2b' | 'b2a'; bKey: string; msg?: { tone: 'success' | 'warning' | 'danger'; text: string } }>) =>
    setBTools((m) => ({ ...m, [k]: { ...toolOf(k), ...p } }));

  // Kazanım bankası ve yapay zekâ durumu (bir kez)
  useEffect(() => {
    let alive = true;
    listKazanimlar()
      .then((b) => alive && setBank(b))
      .catch(() => alive && setBank([]));
    void aiStatus().then((r) => {
      if (alive && r.ok) setAi({ provider: !r.gemini && r.mistral ? 'mistral' : 'gemini', keys: { gemini: !!r.gemini, mistral: !!r.mistral } });
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => bankOptionsBySubject(bank || []), [bank]);
  const byCode = useMemo(() => new Map((bank || []).map((r) => [codeKey(r.code), { code: r.code, text: r.text, konu: r.konu, alt: r.alt || [] }])), [bank]);

  const setSubject = (key: string, list: ExamQuestion[]) => onChange({ ...questions, [key]: list });

  const ensureBank = async (): Promise<BankRow[]> => {
    if (bank) return bank;
    try {
      const b = await listKazanimlar();
      setBank(b);
      return b;
    } catch {
      return [];
    }
  };

  // Excel'deki kazanım bilgilerini bankayla eşleştirir (kod → metin → yapay zekâ)
  const runMatch = async (qs: ExamQuestions, clearUnmatched: boolean, prefix: string) => {
    const b = await ensureBank();
    if (!b.length) {
      onChange(qs);
      setMsg({ tone: 'warning', text: `${prefix}Kazanım bankası boş olduğu için kazanımlar eşleştirilemedi. Önce "Kazanım bankası" sekmesinden MEB kazanımlarını yükleyin.` });
      return;
    }
    setBusyText('Kazanımlar bankayla eşleştiriliyor…');
    const r = await matchQuestionsWithBank(subjects, qs, b, { clearUnmatched, ai, onProgress: setBusyText });
    onChange(r.questions);
    const d = describeMatch(subjects, r.stats);
    setMsg({ tone: d.tone === 'success' && !r.notes.length ? 'success' : 'warning', text: `${prefix}${d.text}${r.notes.length ? ' ' + r.notes.join(' ') : ''}` });
  };

  // ----------------------------------------------------------------------------- Aşama 50: Excel + yapay zekâ
  // Önce yazılım okur. Biçim tanınmazsa yapay zekâ kendiliğinden devreye girer. Cevaplar okunup kazanımlar
  // okunamadıysa (ya da okunanın yanlış olduğunu düşünüyorsanız) "Yapay zekâ ile oku" seçeneği sunulur.
  // Yapay zekâya yalnızca cevap anahtarı dosyasının hücreleri gider; öğrenci bilgisi yoktur.
  const aiReady = !!ai && (ai.keys.gemini || ai.keys.mistral);

  /** Dosya metnini yapay zekâyla okur: { ders → sorular } */
  const aiRead = async (rawText: string) => {
    if (!ai) return { ok: false as const, error: 'Yapay zekâ ayarlı değil.' };
    const res = await aiCall(
      newAiState(ai.provider, true, ai.keys),
      (p, avoid) => aiReadKey({ provider: p, text: rawText, subjects: subjects.map((s) => ({ key: s.key, name: s.name, count: s.count })), avoid }),
      { stop: () => false, onWait: (w) => w && setBusyText(w) }
    );
    if (!res.ok) return { ok: false as const, error: res.error || 'hata' };
    const out: ExamQuestions = {};
    for (const d of (res.items || []) as Array<{ ders: string; sorular: Array<{ no: number; cevap: string; b: number; kazanim: string }> }>) {
      if (!subjects.some((s) => s.key === d.ders)) continue;
      out[d.ders] = d.sorular.map((x) => {
        const q: ExamQuestion = { no: x.no, answer: x.cevap };
        if (x.b) q.bNo = x.b;
        if (x.kazanim) {
          const kz = splitKazanim(x.kazanim, '', '');
          if (kz.code) q.srcCode = kz.code;
          if (kz.text) q.srcText = kz.text;
        }
        return q;
      });
    }
    return { ok: true as const, questions: out };
  };

  const applyExcel = async (r: ExcelKeyResult, base: ExamQuestions) => {
    const next: ExamQuestions = { ...base };
    for (const k of r.found) next[k] = r.questions[k];
    onExcelMeta?.(r);
    const names = subjects.filter((s) => r.found.includes(s.key)).map((s) => s.name);
    const missing = subjects.filter((s) => !r.found.includes(s.key)).map((s) => s.name);
    const prefix =
      `${r.method === 'yz' ? 'Yapay zekâ ile okundu' : "Excel'den okundu"}: ${names.join(', ')}.` +
      (missing.length ? ` Bulunamayan dersler: ${missing.join(', ')} (elle girebilirsiniz).` : '') +
      (r.warnings.length ? ' ' + r.warnings.join(' ') : '') +
      ' ';
    await runMatch(next, true, prefix);
    // Cevaplar var ama kazanım okunamadıysa: yapay zekâ seçeneği
    const noKaz = r.found.filter((k) => !hasSourceKazanim(r.questions[k]));
    if (r.method !== 'yz' && noKaz.length && (r.textCells || 0) >= 8) {
      setOffer({ kind: 'kazanim', subjects: noKaz });
    } else if (r.method !== 'yz') setOffer({ kind: 'all', subjects: [] });
    else setOffer(null);
  };

  const onExcel = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setOffer(null);
    try {
      const r = await readKeyExcel(file, subjects);
      setLastExcel(r);
      // Biçim tanınmadıysa: dosyanın hücre metni yapay zekâyla okunur
      if (!r.found.length && r.rawText && aiReady) {
        setBusyText('Dosya biçimi tanınmadı; cevap anahtarı yapay zekâ ile okunuyor…');
        const res = await aiRead(r.rawText);
        if (res.ok) {
          r.questions = res.questions;
          r.found = Object.keys(res.questions).filter((k) => res.questions[k].length);
          r.method = 'yz';
          r.warnings = r.found.length
            ? ['Dosyanın biçimi tanınmadığı için cevap anahtarı yapay zekâ ile okundu. Lütfen cevapları dosyayla karşılaştırıp kontrol edin.']
            : ['Yapay zekâ da dosyada cevap anahtarı bulamadı.'];
        } else {
          r.warnings.push(`Yapay zekâ ile okunamadı: ${res.error}`);
        }
      }
      if (!r.found.length) {
        // Aşama 50: yapay zekâ denenip olmadıysa (ör. kota) tekrar denemek için seçenek kalır
        if (r.rawText && aiReady) setOffer({ kind: 'all', subjects: [] });
        setMsg({
          tone: 'danger',
          text: `${r.warnings.join(' ')} ${aiReady ? '' : 'Yapay zekâ ayarlı olmadığı için dosya yapay zekâyla da okunamadı. '}Cevapları elle yazabilirsiniz.`,
        });
        return;
      }
      await applyExcel(r, questions);
    } catch {
      setMsg({ tone: 'danger', text: 'Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin olun.' });
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  /** Kullanıcının seçimiyle: yapay zekâ ile baştan okuma ya da yalnızca kazanımları tamamlama */
  const onAiChoice = async (kind: 'all' | 'kazanim') => {
    if (!lastExcel?.rawText || !aiReady) return;
    setBusy(true);
    setMsg(null);
    setOffer(null);
    try {
      setBusyText(kind === 'all' ? 'Cevap anahtarı yapay zekâ ile okunuyor…' : 'Kazanımlar yapay zekâ ile okunuyor…');
      const res = await aiRead(lastExcel.rawText);
      if (!res.ok) {
        setMsg({ tone: 'danger', text: `Yapay zekâ ile okunamadı: ${res.error}` });
        return;
      }
      if (kind === 'all') {
        const found = Object.keys(res.questions).filter((k) => res.questions[k].length);
        if (!found.length) {
          setMsg({ tone: 'warning', text: 'Yapay zekâ dosyada cevap anahtarı bulamadı; Excel okuması olduğu gibi kaldı.' });
          return;
        }
        await applyExcel(
          { ...lastExcel, questions: res.questions, found, method: 'yz', warnings: ['Cevap anahtarı yapay zekâ ile okundu. Lütfen cevapları dosyayla karşılaştırıp kontrol edin.'] },
          questions
        );
        return;
      }
      // Yalnızca kazanımlar: cevaplara dokunulmaz; soru numarasıyla eşleşen sorulara kazanım bilgisi yazılır
      let n = 0;
      const next: ExamQuestions = { ...questions };
      for (const k of Object.keys(res.questions)) {
        const byNo = new Map(res.questions[k].map((q) => [q.no, q]));
        next[k] = (questions[k] || []).map((q) => {
          const a = byNo.get(q.no);
          if (!a || (!a.srcCode && !a.srcText) || q.srcCode || q.srcText) return q;
          n++;
          return { ...q, srcCode: a.srcCode, srcText: a.srcText };
        });
      }
      if (!n) {
        setMsg({ tone: 'warning', text: 'Yapay zekâ dosyada sorulara ait kazanım bulamadı.' });
        return;
      }
      await runMatch(next, true, `${n} sorunun kazanımı yapay zekâ ile okundu. `);
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  const onRematch = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await runMatch(questions, false, '');
    } catch {
      setMsg({ tone: 'danger', text: 'Eşleştirme yapılamadı. Tekrar deneyin.' });
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  const hasSource = subjects.some((s) => (questions[s.key] || []).some((q) => q.srcCode || q.srcText || q.kazanimCode || q.kazanim || q.konu));

  return (
    <div className="space-y-3" id="deneme-key-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet /> {busy && !busyText ? 'Okunuyor…' : 'Cevap anahtarı Excel\'i yükle'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            void onExcel(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setAiOpen(true)} id="deneme-kazanim-ai">
          <Sparkles /> Kitapçıktan kazanım bul (yapay zekâ)
        </button>
        {hasSource && (
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => void onRematch()} id="deneme-kazanim-rematch">
            <BookOpen /> Kazanımları bankadan eşleştir
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Sistem yalnızca <b>Kazanım bankasındaki</b> MEB kazanımlarını kullanır. Excel'deki kazanımlar bankadaki karşılığını bulmak için kullanılır; kazanım metni ve konu bankadan gelir.
      </p>
      {busy && busyText && <p className="text-xs text-muted">{busyText}</p>}
      {aiOpen && (
        <KazanimAI
          open
          onClose={() => setAiOpen(false)}
          subjects={subjects}
          questions={questions}
          onApply={(qs, summary) => {
            onChange(qs);
            setMsg({ tone: 'success', text: `${summary} Kaydetmeyi unutmayın.` });
          }}
        />
      )}
      {msg && (
        <p
          role="status"
          className={cx(
            'text-xs font-semibold rounded-xl px-3 py-2',
            msg.tone === 'success' && 'bg-success-soft text-success-fg',
            msg.tone === 'warning' && 'bg-warning-soft text-warning-fg',
            msg.tone === 'danger' && 'bg-danger-soft text-danger-fg'
          )}
        >
          {msg.text}
        </p>
      )}
      {offer && lastExcel?.rawText && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/25 bg-brand-soft/50 px-3 py-2 text-xs" id="deneme-key-ai-offer">
          <Sparkles className="w-4 h-4 text-brand-fg shrink-0" />
          {offer.kind === 'kazanim' ? (
            <span className="text-fg-2">
              Cevaplar okundu ama <b>{subjects.filter((s) => offer.subjects.includes(s.key)).map((s) => s.short).join(', ')}</b> için dosyadaki kazanımlar okunamadı.
              {aiReady ? ' Yapay zekâ ile okumayı deneyebilirsiniz.' : ' Yapay zekâ ayarlı değil.'}
            </span>
          ) : (
            <span className="text-fg-2">Excel okuması yanlış görünüyorsa dosyayı yapay zekâ ile baştan okutabilirsiniz.</span>
          )}
          {aiReady && (
            <span className="ml-auto flex flex-wrap gap-1.5">
              {offer.kind === 'kazanim' && (
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void onAiChoice('kazanim')}>
                  <Sparkles /> Kazanımları yapay zekâ ile oku
                </button>
              )}
              <button type="button" className={cx('ui-btn ui-btn-sm', offer.kind === 'all' ? 'ui-btn-secondary' : 'ui-btn-ghost')} disabled={busy} onClick={() => void onAiChoice('all')}>
                <Sparkles /> Yapay zekâ ile baştan oku
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => setOffer(null)}>
                Kapat
              </button>
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {subjects.map((s) => {
          const list = questions[s.key] || [];
          const ks = keyString(list);
          const filledCount = list.filter((q) => q.answer).length;
          const rule0 = bRuleOf(list, s.count);
          const rule = customB.has(s.key) ? 'custom' : rule0;
          const bProblems = bMapProblems(s, list);
          const badB = badBNos(s, list);
          const tool = toolOf(s.key);
          const bCheck = tool.bKey ? checkWithBKey(list, s.count, tool.bKey) : null;
          const applyOrder = () => {
            const r = parseBOrder(tool.order, s.count, tool.dir);
            if ('error' in r) return setTool(s.key, { msg: { tone: 'danger', text: r.error } });
            setSubject(
              s.key,
              Array.from({ length: s.count }, (_, i) => {
                const old = list.find((q) => q.no === i + 1);
                return { ...(old || { no: i + 1, answer: '' }), bNo: r.bNos[i] };
              })
            );
            setCustomB((cur) => new Set(cur).add(s.key));
            setTool(s.key, { msg: { tone: 'success', text: `${s.count} sorunun B numarası yazıldı. Kaydetmeyi unutmayın.` } });
          };
          const withKazanim = list.filter((q) => q.kazanimCode && byCode.has(codeKey(q.kazanimCode))).length;
          const unmatched = list.filter((q) => (q.srcCode || q.srcText) && !q.kazanimCode).length;
          const opts = options[s.key] || [];
          const isOpen = open === s.key;
          return (
            <div key={s.key} className="border border-line rounded-xl bg-surface" data-key-subject={s.key}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-sm font-semibold text-fg min-w-40">{s.name}</span>
                <span className={cx('ui-chip', filledCount === s.count ? 'ui-chip-success' : 'ui-chip-warning')}>
                  {filledCount}/{s.count} cevap
                </span>
                <span className={cx('ui-chip', withKazanim ? 'ui-chip-info' : 'ui-chip-neutral')}>{withKazanim} kazanım</span>
                {unmatched > 0 && <span className="ui-chip ui-chip-warning">{unmatched} eşleşmedi</span>}
                {bProblems.length > 0 && (
                  <span className="ui-chip ui-chip-danger" title={bProblems.join('\n')}>
                    B eşleşmesi hatalı ({bProblems.length})
                  </span>
                )}
                {bCheck && bCheck.mismatches.length > 0 && <span className="ui-chip ui-chip-danger">B anahtarıyla {bCheck.mismatches.length} uyuşmazlık</span>}
                <input
                  className="ui-input py-1 text-xs font-mono tracking-widest flex-1 min-w-48 uppercase"
                  placeholder={`A kitapçığı cevapları (${s.count} harf), örn. CDCDCCAB…`}
                  value={ks}
                  maxLength={s.count + 5}
                  aria-label={`${s.name} A kitapçığı cevap anahtarı`}
                  onChange={(e) => setSubject(s.key, questionsFromKeyString(e.target.value, s.count, rule === 'same' ? 'same' : 'reverse', list).map((q, i) => (rule === 'custom' && list[i]?.bNo ? { ...q, bNo: list[i].bNo } : q)))}
                />
                <select
                  className="ui-input py-1 text-xs w-auto"
                  aria-label={`${s.name} B kitapçığı`}
                  value={rule}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'reverse' || v === 'same') {
                      setCustomB((cur) => {
                        const n = new Set(cur);
                        n.delete(s.key);
                        return n;
                      });
                      setSubject(s.key, questionsFromKeyString(ks, s.count, v, list));
                    } else if (v === 'custom') {
                      // Aşama 62: soru soru B numarası (mevcut numaralar korunur, eksikler A ile aynı doldurulur)
                      setCustomB((cur) => new Set(cur).add(s.key));
                      setSubject(
                        s.key,
                        Array.from({ length: s.count }, (_, i) => {
                          const old = list.find((q) => q.no === i + 1);
                          return { ...(old || { no: i + 1, answer: '' }), bNo: old?.bNo || i + 1 };
                        })
                      );
                      setOpen(s.key);
                    }
                  }}
                >
                  <option value="reverse">B kitapçığı: A'nın tersi</option>
                  <option value="same">B kitapçığı: A ile aynı sıra</option>
                  <option value="custom">B kitapçığı: soru soru (karışık sıra)</option>
                </select>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronUp /> : <ChevronDown />} Sorular
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-line px-3 py-2.5 space-y-2 bg-surface-2/40" id={`b-tools-${s.key}`}>
                  <p className="text-xs font-semibold text-fg">B kitapçığı eşleşmesi</p>
                  <div className="grid gap-2 lg:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-fg-2" htmlFor={`b-order-${s.key}`}>
                        B sırasını yapıştırın
                      </label>
                      <textarea
                        id={`b-order-${s.key}`}
                        className="ui-input py-1 text-xs font-mono min-h-14"
                        placeholder={tool.dir === 'a2b' ? `A'nın 1-${s.count}. sorularının B'deki numaraları, ör. 12 5 18 1 …  ya da her satıra "1 12"` : `B'nin 1-${s.count}. sorularının A'daki numaraları, ör. 4 9 1 …`}
                        value={tool.order}
                        onChange={(e) => setTool(s.key, { order: e.target.value, msg: undefined })}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select className="ui-input py-1 text-xs w-auto" value={tool.dir} onChange={(e) => setTool(s.key, { dir: e.target.value as 'a2b' | 'b2a', msg: undefined })} aria-label="Liste yönü">
                          <option value="a2b">Liste: A sorularının B numaraları</option>
                          <option value="b2a">Liste: B sorularının A numaraları</option>
                        </select>
                        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!tool.order.trim()} onClick={applyOrder}>
                          Uygula
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-fg-2" htmlFor={`b-key-${s.key}`}>
                        B kitapçığının cevap anahtarı (isteğe bağlı, kontrol için)
                      </label>
                      <input
                        id={`b-key-${s.key}`}
                        className="ui-input py-1 text-xs font-mono tracking-widest uppercase"
                        placeholder={`B kitapçığı cevapları B sırasıyla (${s.count} harf)`}
                        value={tool.bKey}
                        maxLength={s.count + 10}
                        onChange={(e) => setTool(s.key, { bKey: e.target.value })}
                      />
                      {tool.bKey && cleanKey(tool.bKey).length < s.count && (
                        <p className="text-[11px] text-muted">
                          {cleanKey(tool.bKey).length}/{s.count} harf
                        </p>
                      )}
                      {bCheck && (
                        <div className="text-[11px] space-y-1">
                          {bCheck.mismatches.length === 0 ? (
                            <p className="font-semibold text-success-fg">✓ {bCheck.checked} sorunun hepsi B anahtarıyla uyuşuyor; eşleşme doğru görünüyor.</p>
                          ) : (
                            <p className="font-semibold text-danger-fg">
                              {bCheck.mismatches.length} soruda uyuşmazlık:{' '}
                              {bCheck.mismatches
                                .slice(0, 12)
                                .map((m) => `${m.no}→B${m.bNo} (A: ${m.a}, B: ${m.b})`)
                                .join(' · ')}
                              {bCheck.mismatches.length > 12 ? ' …' : ''}
                            </p>
                          )}
                          {bCheck.mismatches.length > 0 && (bCheck.fitsReverse || bCheck.fitsSame) && (
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary ui-btn-sm"
                              onClick={() => {
                                setCustomB((cur) => {
                                  const n = new Set(cur);
                                  n.delete(s.key);
                                  return n;
                                });
                                setSubject(s.key, questionsFromKeyString(ks, s.count, bCheck.fitsReverse ? 'reverse' : 'same', list));
                              }}
                            >
                              Harfler "{bCheck.fitsReverse ? "A'nın tersi" : 'A ile aynı sıra'}" kuralına uyuyor: uygula
                            </button>
                          )}
                          {bCheck.mismatches.length > 0 && !bCheck.fitsReverse && !bCheck.fitsSame && (
                            <p className="text-muted">
                              B sırası karışık: eşleşmeyi soldaki kutuya yapıştırın ya da aşağıdaki tabloda "B no" sütununa yazın. Harflerden eşleşme güvenilir şekilde çıkarılamaz.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {tool.msg && (
                    <p className={cx('text-[11px] font-semibold', tool.msg.tone === 'success' ? 'text-success-fg' : tool.msg.tone === 'warning' ? 'text-warning-fg' : 'text-danger-fg')}>{tool.msg.text}</p>
                  )}
                  {bProblems.length > 0 && (
                    <ul className="text-[11px] text-danger-fg list-disc pl-4 space-y-0.5">
                      {bProblems.slice(0, 8).map((p, pi) => (
                        <li key={pi}>{p}</li>
                      ))}
                      {bProblems.length > 8 && <li>… {bProblems.length - 8} sorun daha</li>}
                    </ul>
                  )}
                </div>
              )}
              {isOpen && (
                <div className="border-t border-line overflow-x-auto">
                  <table className="w-full text-left text-xs text-fg-2">
                    <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                      <tr>
                        <th className="px-3 py-2 font-semibold w-12">No</th>
                        <th className="px-3 py-2 font-semibold w-16">Cevap</th>
                        <th className="px-3 py-2 font-semibold w-14">B no</th>
                        <th className="px-3 py-2 font-semibold min-w-72">Kazanım (bankadan)</th>
                        <th className="px-3 py-2 font-semibold w-44">Konu</th>
                        <th className="px-3 py-2 font-semibold w-44">Alt kazanım</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {list.map((q, i) => {
                        const set = (p: Partial<ExamQuestion>) => setSubject(s.key, list.map((x, j) => (j === i ? { ...x, ...p } : x)));
                        const inBank = !!q.kazanimCode && byCode.has(codeKey(q.kazanimCode));
                        return (
                          <tr key={q.no}>
                            <td className="px-3 py-1.5 font-bold text-fg tabular-nums align-top">{q.no}</td>
                            <td className="px-3 py-1.5 align-top">
                              <select className="ui-input py-0.5 text-xs" value={q.answer} onChange={(e) => set({ answer: e.target.value })} aria-label={`${q.no}. soru cevabı`}>
                                <option value="">-</option>
                                {['A', 'B', 'C', 'D'].map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                <option value="X">İptal</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              {/* Aşama 62: B numarası soru soru yazılabilir */}
                              <input
                                className={cx('ui-input py-0.5 px-1 text-xs text-center tabular-nums w-14', badB.has(q.no) && 'border-danger ring-2 ring-danger/30')}
                                inputMode="numeric"
                                value={q.bNo ? String(q.bNo) : ''}
                                placeholder={String(q.no)}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                                  setCustomB((cur) => new Set(cur).add(s.key));
                                  set({ bNo: v ? Number(v) : undefined });
                                }}
                                aria-label={`${q.no}. sorunun B kitapçığındaki numarası`}
                                title={badB.has(q.no) ? 'Bu B numarası geçersiz ya da başka bir soruda da kullanılmış' : undefined}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-fg-2 align-top">
                              <select
                                className="ui-input py-0.5 text-xs"
                                value={inBank ? q.kazanimCode : q.kazanimCode ? '__old' : ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '__old') return;
                                  const b = v ? byCode.get(codeKey(v)) : undefined;
                                  setSubject(s.key, list.map((x, j) => (j === i ? applyBank(x, b) : x)));
                                }}
                                aria-label={`${q.no}. soru kazanımı`}
                              >
                                <option value="">{opts.length ? '— kazanım seçin —' : '— bankada bu dersin kazanımı yok —'}</option>
                                {q.kazanimCode && !inBank && <option value="__old">{q.kazanimCode} (bankada yok)</option>}
                                {opts.map((o) => (
                                  <option key={o.code} value={o.code}>
                                    {o.code} — {short(o.text, 90)}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                {q.ai && (
                                  <span className="ui-chip ui-chip-info" title={`Yapay zekâ önerisi (${q.ai === 'mistral' ? 'Mistral' : 'Gemini'})`}>
                                    YZ
                                  </span>
                                )}
                                {(q.srcCode || q.srcText) && (
                                  <span className={cx('text-[11px]', q.kazanimCode ? 'text-muted' : 'text-warning-fg')}>
                                    Excel: {short([q.srcCode, q.srcText].filter(Boolean).join(' — '), 110)}
                                    {!q.kazanimCode && ' · eşleşmedi'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              <input className="ui-input py-0.5 text-xs" value={q.konu || ''} maxLength={120} onChange={(e) => set({ konu: e.target.value || undefined })} aria-label={`${q.no}. soru konusu`} />
                            </td>
                            <td className="px-3 py-1.5 align-top">
                              {(() => {
                                // Aşama 48g: alt kazanım = seçilen kazanımın açıklama maddelerinden biri
                                const alts = (q.kazanimCode && byCode.get(codeKey(q.kazanimCode))?.alt) || [];
                                if (!alts.length)
                                  return <input className="ui-input py-0.5 text-xs" value={q.alt || ''} maxLength={160} onChange={(e) => set({ alt: e.target.value || undefined })} aria-label={`${q.no}. soru alt kazanımı`} />;
                                const cur = q.alt && !alts.includes(q.alt) ? q.alt : null;
                                return (
                                  <select className="ui-input py-0.5 text-xs" value={q.alt || ''} onChange={(e) => set({ alt: e.target.value || undefined })} aria-label={`${q.no}. soru alt kazanımı`}>
                                    <option value="">— alt kazanım yok —</option>
                                    {cur && <option value={cur}>{short(cur, 90)} (eski)</option>}
                                    {alts.map((a, ai) => (
                                      <option key={ai} value={a}>
                                        {ai + 1}) {short(a, 90)}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Kazanımı listeden seçince konusu bankadan otomatik gelir; alt kazanım, o kazanımın açıklama maddelerinden seçilir. Excel yoksa "Kitapçıktan kazanım bul" ile taranmış
        kitapçıktaki sorular yapay zekâ yardımıyla bankadaki kazanımlarla eşleştirilir. "İptal" seçilen soru herkes için doğru sayılır.
      </p>
    </div>
  );
};
