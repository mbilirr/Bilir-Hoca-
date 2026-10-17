import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { cx } from '../ui/kit';
import { questionsFromKeyString, type ExamQuestion, type ExamQuestions, type ExamSubject } from '../../lib/deneme/lgs';
import { readKeyExcel, type ExcelKeyResult } from '../../lib/deneme/anahtarExcel';

// ============================================================================
// Cevap anahtarı ve kazanım düzenleyici (Aşama 47)
// Yayınevinin Excel şablonu yüklenince cevaplar, B kitapçığı karşılıkları ve kazanımlar dolar.
// Excel yoksa A cevapları elle yazılır; B kitapçığı "A'nın tersi" ya da "A ile aynı" seçilir.
// ============================================================================

const keyString = (qs: ExamQuestion[]) => qs.map((q) => q.answer || ' ').join('').replace(/\s+$/, '');

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
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);

  const setSubject = (key: string, list: ExamQuestion[]) => onChange({ ...questions, [key]: list });

  const onExcel = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await readKeyExcel(file);
      if (!r.found.length) {
        setMsg({ tone: 'danger', text: r.warnings.join(' ') });
        return;
      }
      const next: ExamQuestions = { ...questions };
      for (const k of r.found) next[k] = r.questions[k];
      onChange(next);
      onExcelMeta?.(r);
      const names = subjects.filter((s) => r.found.includes(s.key)).map((s) => s.name);
      const missing = subjects.filter((s) => !r.found.includes(s.key)).map((s) => s.name);
      setMsg({
        tone: missing.length || r.warnings.length ? 'warning' : 'success',
        text:
          `Excel'den okundu: ${names.join(', ')}.` +
          (missing.length ? ` Bulunamayan dersler: ${missing.join(', ')} (elle girebilirsiniz).` : '') +
          (r.warnings.length ? ' ' + r.warnings.join(' ') : ''),
      });
    } catch {
      setMsg({ tone: 'danger', text: 'Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin olun.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" id="deneme-key-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet /> {busy ? 'Okunuyor…' : 'Cevap anahtarı / kazanım Excel\'i yükle'}
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
        <span className="text-[11px] text-muted">Yayınevinin "LGS sınav oluşturma şablonu" biçimindeki Excel dosyası.</span>
      </div>
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
          const withKazanim = list.filter((q) => q.kazanim || q.kazanimCode).length;
          const isOpen = open === s.key;
          return (
            <div key={s.key} className="border border-line rounded-xl bg-surface" data-key-subject={s.key}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-sm font-semibold text-fg min-w-40">{s.name}</span>
                <span className={cx('ui-chip', filledCount === s.count ? 'ui-chip-success' : 'ui-chip-warning')}>
                  {filledCount}/{s.count} cevap
                </span>
                <span className={cx('ui-chip', withKazanim ? 'ui-chip-info' : 'ui-chip-neutral')}>{withKazanim} kazanım</span>
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
                        <th className="px-3 py-2 font-semibold">Kazanım</th>
                        <th className="px-3 py-2 font-semibold w-44">Konu</th>
                        <th className="px-3 py-2 font-semibold w-44">Alt kazanım</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {list.map((q, i) => {
                        const set = (p: Partial<ExamQuestion>) => setSubject(s.key, list.map((x, j) => (j === i ? { ...x, ...p } : x)));
                        return (
                          <tr key={q.no}>
                            <td className="px-3 py-1.5 font-bold text-fg tabular-nums">{q.no}</td>
                            <td className="px-3 py-1.5">
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
                            <td className="px-3 py-1.5 tabular-nums text-muted">{q.bNo || '-'}</td>
                            <td className="px-3 py-1.5 text-fg-2">
                              {q.kazanimCode && <span className="ui-chip ui-chip-neutral mr-1">{q.kazanimCode}</span>}
                              <span className="line-clamp-2">{q.kazanim || <span className="text-subtle">—</span>}</span>
                            </td>
                            <td className="px-3 py-1.5">
                              <input className="ui-input py-0.5 text-xs" value={q.konu || ''} maxLength={120} onChange={(e) => set({ konu: e.target.value || undefined })} aria-label={`${q.no}. soru konusu`} />
                            </td>
                            <td className="px-3 py-1.5">
                              <input className="ui-input py-0.5 text-xs" value={q.alt || ''} maxLength={160} onChange={(e) => set({ alt: e.target.value || undefined })} aria-label={`${q.no}. soru alt kazanımı`} />
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
        Excel yoksa kazanım, konu ve alt kazanımlar taranmış kitapçıktan yapay zekâ ile çıkarılacak (MEB kazanım bankası bir kez yüklenir). O bölüm
        eklenene kadar isterseniz konu ve alt kazanımı elle yazabilirsiniz. "İptal" seçilen soru herkes için doğru sayılır.
      </p>
    </div>
  );
};
