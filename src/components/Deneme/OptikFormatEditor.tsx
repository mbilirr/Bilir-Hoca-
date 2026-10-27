import React, { useRef } from 'react';
import { ArrowDown, ArrowUp, FileUp, Plus, Trash2 } from 'lucide-react';
import { cx } from '../ui/kit';
import {
  ROLE_LABELS,
  checkFields,
  decodeOptikFile,
  fieldsLength,
  joinedSubjects,
  newFieldId,
  parseFmt,
  relayoutFields,
  type FieldRole,
  type OptikField,
} from '../../lib/deneme/optik';
import { LGS_SUBJECTS } from '../../lib/deneme/lgs';

// ============================================================================
// Optik format düzenleyici (Aşama 47)
// FMT dosyası yüklenince alanlar otomatik dolar; her alan elle de düzenlenebilir (manuel FMT girişi).
// "Sırayla diz" açıkken alanlar uç uca dizilir (FMT kuralı); kapalıyken başlangıç elle yazılır.
// ============================================================================

const ROLE_ORDER: FieldRole[] = ['number', 'fullname', 'name', 'surname', 'grade', 'section', 'booklet', 'answers', 'tc', 'ignore'];

export const OptikFormatEditor: React.FC<{
  fields: OptikField[];
  onChange: (fields: OptikField[], fmtText?: string, fileName?: string) => void;
  sequential: boolean;
  onSequentialChange: (v: boolean) => void;
  sampleLine?: string; // TXT'nin ilk satırı: alanların neyi okuduğu önizlenir
}> = ({ fields, onChange, sequential, onSequentialChange, sampleLine }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const errs = checkFields(fields);
  const joined = joinedSubjects(fields); // Aşama 49c: aynı derse ait birden fazla cevap alanı

  const update = (next: OptikField[]) => onChange(sequential ? relayoutFields(next) : next);
  const patch = (id: string, p: Partial<OptikField>) => update(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  const onFmt = async (file?: File | null) => {
    if (!file) return;
    const text = decodeOptikFile(await file.arrayBuffer());
    const parsed = parseFmt(text);
    onSequentialChange(true);
    onChange(parsed, text, file.name);
  };

  const preview = (f: OptikField) => {
    if (!sampleLine || f.role === 'tc') return f.role === 'tc' ? '•••' : '';
    return sampleLine.substr(f.start - 1, f.width);
  };

  return (
    <div className="space-y-3" id="deneme-format-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => fileRef.current?.click()}>
          <FileUp /> FMT dosyası yükle
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".fmt,.FMT,.txt"
          className="hidden"
          onChange={(e) => {
            void onFmt(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm"
          onClick={() => update([...fields, { id: newFieldId(), label: 'Yeni alan', role: 'ignore', start: fieldsLength(fields) + 1, width: 1 }])}
        >
          <Plus /> Alan ekle
        </button>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2 cursor-pointer">
          <input type="checkbox" checked={sequential} onChange={(e) => {
            onSequentialChange(e.target.checked);
            if (e.target.checked) onChange(relayoutFields(fields));
          }} />
          Alanları sırayla diz (FMT kuralı)
        </label>
        <span className="ui-chip ui-chip-neutral ml-auto">Satır uzunluğu: {fieldsLength(fields)} karakter</span>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted">
          FMT dosyasını yükleyin ya da "Alan ekle" ile alanları elle girin. Her alanın TXT'deki başlangıç karakterini ve genişliğini yazmanız yeterli.
        </p>
      ) : (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-fg-2">
              <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Etiket</th>
                  <th className="px-3 py-2.5 font-semibold">Anlamı</th>
                  <th className="px-3 py-2.5 font-semibold">Ders</th>
                  <th className="px-3 py-2.5 font-semibold w-20">Başlangıç</th>
                  <th className="px-3 py-2.5 font-semibold w-20">Genişlik</th>
                  {sampleLine !== undefined && <th className="px-3 py-2.5 font-semibold">İlk satırda okunan</th>}
                  <th className="px-3 py-2.5 font-semibold text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {fields.map((f, i) => (
                  <tr key={f.id} className="hover:bg-surface-2/30">
                    <td className="px-3 py-1.5">
                      <input className="ui-input py-1 text-xs min-w-28" value={f.label} maxLength={40} onChange={(e) => patch(f.id, { label: e.target.value })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="ui-input py-1 text-xs" value={f.role} onChange={(e) => patch(f.id, { role: e.target.value as FieldRole })}>
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {f.role === 'answers' ? (
                        <select className="ui-input py-1 text-xs" value={f.subject || ''} onChange={(e) => patch(f.id, { subject: e.target.value || undefined })}>
                          <option value="">Seçin</option>
                          {LGS_SUBJECTS.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="ui-input py-1 text-xs tabular-nums"
                        inputMode="numeric"
                        value={f.start}
                        disabled={sequential}
                        onChange={(e) => patch(f.id, { start: Math.max(1, parseInt(e.target.value.replace(/\D/g, '') || '1', 10)) })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="ui-input py-1 text-xs tabular-nums"
                        inputMode="numeric"
                        value={f.width}
                        onChange={(e) => patch(f.id, { width: Math.max(1, Math.min(200, parseInt(e.target.value.replace(/\D/g, '') || '1', 10))) })}
                      />
                    </td>
                    {sampleLine !== undefined && (
                      <td className="px-3 py-1.5">
                        <code className="font-mono text-[11px] whitespace-pre bg-surface-2 rounded px-1.5 py-0.5 text-fg">{preview(f) || ' '}</code>
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Yukarı taşı" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Aşağı taşı" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg" aria-label="Alanı sil" onClick={() => update(fields.filter((x) => x.id !== f.id))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fields.length > 0 && errs.length > 0 && (
        <ul className={cx('text-xs font-semibold text-warning-fg bg-warning-soft rounded-xl px-3 py-2 space-y-0.5')}>
          {errs.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
      {joined.length > 0 && (
        <ul className="text-xs text-info-fg bg-info-soft rounded-xl px-3 py-2 space-y-0.5">
          {joined.map((j) => (
            <li key={j.subject}>
              • {LGS_SUBJECTS.find((s) => s.key === j.subject)?.name || j.subject}: {j.widths.length} cevap alanı sırayla birleştirilir ({j.widths.join(' + ')} ={' '}
              {j.widths.reduce((a, b) => a + b, 0)} soru). Alanlardan biri başka sınıf düzeyine aitse "Kullanılmaz" seçin.
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">TC kimlik numarası alanı okunmaz ve hiçbir yere kaydedilmez.</p>
    </div>
  );
};
