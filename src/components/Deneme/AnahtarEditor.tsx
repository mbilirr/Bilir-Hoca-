import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileSpreadsheet, Sparkles } from 'lucide-react';
import { cx } from '../ui/kit';
import { questionsFromKeyString, type ExamQuestion, type ExamQuestions, type ExamSubject } from '../../lib/deneme/lgs';
import { readKeyExcel, type ExcelKeyResult } from '../../lib/deneme/anahtarExcel';
import { listKazanimlar, type BankRow } from '../../services/denemeService';
import { codeKey } from '../../lib/deneme/kazanimBank';
import { applyBank, bankOptionsBySubject, describeMatch, matchQuestionsWithBank } from '../../lib/deneme/bankEslestir';
import { aiCall, aiReadKey, aiStatus, newAiState, type AiProvider } from '../../lib/aiApi';
import { KazanimAI } from './KazanimAI';

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

  const onExcel = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await readKeyExcel(file, subjects);
      // Biçim tanınmadıysa: dosyanın hücre metni yapay zekâyla okunur (öğrenci bilgisi yoktur)
      if (!r.found.length && r.rawText && ai && (ai.keys.gemini || ai.keys.mistral)) {
        setBusyText('Dosya biçimi tanınmadı; cevap anahtarı yapay zekâ ile okunuyor…');
        const res = await aiCall(
          newAiState(ai.provider, true, ai.keys),
          (p, avoid) => aiReadKey({ provider: p, text: r.rawText || '', subjects: subjects.map((s) => ({ key: s.key, name: s.name, count: s.count })), avoid }),
          { stop: () => false, onWait: (w) => w && setBusyText(w) }
        );
        if (res.ok) {
          for (const d of (res.items || []) as Array<{ ders: string; sorular: Array<{ no: number; cevap: string; b: number; kazanim: string }> }>) {
            if (!subjects.some((s) => s.key === d.ders)) continue;
            r.questions[d.ders] = d.sorular.map((x) => {
              const q: ExamQuestion = { no: x.no, answer: x.cevap };
              if (x.b) q.bNo = x.b;
              if (x.kazanim) q.srcText = x.kazanim.slice(0, 600);
              return q;
            });
          }
          r.found = Object.keys(r.questions).filter((k) => r.questions[k].length);
          r.method = 'yz';
          r.warnings = r.found.length
            ? ['Dosyanın biçimi tanınmadığı için cevap anahtarı yapay zekâ ile okundu. Lütfen cevapları dosyayla karşılaştırıp kontrol edin.']
            : ['Yapay zekâ da dosyada cevap anahtarı bulamadı.'];
        } else {
          r.warnings.push(`Yapay zekâ ile okunamadı: ${res.error || 'hata'}`);
        }
      }
      if (!r.found.length) {
        setMsg({ tone: 'danger', text: `${r.warnings.join(' ')} Cevapları elle yazabilirsiniz.` });
        return;
      }
      const next: ExamQuestions = { ...questions };
      for (const k of r.found) next[k] = r.questions[k];
      onExcelMeta?.(r);
      const names = subjects.filter((s) => r.found.includes(s.key)).map((s) => s.name);
      const missing = subjects.filter((s) => !r.found.includes(s.key)).map((s) => s.name);
      const prefix =
        `Excel'den okundu: ${names.join(', ')}.` +
        (missing.length ? ` Bulunamayan dersler: ${missing.join(', ')} (elle girebilirsiniz).` : '') +
        (r.warnings.length ? ' ' + r.warnings.join(' ') : '') +
        ' ';
      await runMatch(next, true, prefix);
    } catch {
      setMsg({ tone: 'danger', text: 'Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin olun.' });
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

      <div className="space-y-2">
        {subjects.map((s) => {
          const list = questions[s.key] || [];
          const ks = keyString(list);
          const filledCount = list.filter((q) => q.answer).length;
          const rule = bRuleOf(list, s.count);
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
                    if (v === 'reverse' || v === 'same') setSubject(s.key, questionsFromKeyString(ks, s.count, v, list));
                  }}
                >
                  <option value="reverse">B kitapçığı: A'nın tersi</option>
                  <option value="same">B kitapçığı: A ile aynı sıra</option>
                  <option value="custom" disabled={rule !== 'custom'}>
                    B kitapçığı: Excel'deki karşılıklar
                  </option>
                </select>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronUp /> : <ChevronDown />} Sorular
                </button>
              </div>
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
                            <td className="px-3 py-1.5 tabular-nums text-muted align-top">{q.bNo || '-'}</td>
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
