import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Info } from 'lucide-react';
import { Segmented, cx } from '../ui/kit';
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, levelOf } from '../../lib/deneme/analiz';
import { discLabel, fmtDisc, itemAnalysis, itemWatchList, type ItemStat, type KazTone } from '../../lib/deneme/kazanimKarne';
import { itemAnalysisBlocks } from '../../lib/deneme/karneModel';
import { downloadKarnePdf } from '../../lib/deneme/karnePdf';

// ============================================================================
// Aşama 54: Soru (madde) analizi ve çeldirici analizi
//  * Her soru: doğru / yanlış / boş oranı, şık şık işaretlenme, en çok seçilen yanlış şık (çeldirici)
//  * Sınıf seçilince: kurumun doğru oranıyla fark ("kurum %70, sınıf %30" soruları işaretlenir)
//  * Ayırt edicilik (üst %27 − alt %27): soru başarılıyı başarısızdan ayırıyor mu? Eksi ise anahtar kontrol edilmeli.
// ============================================================================

const BAR: Record<string, string> = { iyi: 'bg-success', tekrar: 'bg-info', etut: 'bg-warning', kritik: 'bg-danger' };
const chipTone = (t: KazTone) => `ui-chip ui-chip-${t === 'muted' ? 'neutral' : t}`;

export const MaddeAnalizi: React.FC<{ exam: DenemeExam; results: DenemeResult[]; classId: string; className: string }> = ({ exam, results, classId, className }) => {
  const group = useMemo(() => (classId ? results.filter((r) => (r.classId || '-') === classId) : results), [results, classId]);
  const isGroup = !!classId;
  const data = useMemo(() => itemAnalysis(exam, group, results), [exam, group, results]);
  const watch = useMemo(() => itemWatchList(data, 12), [data]);
  const [subKey, setSubKey] = useState<string>('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groupName = isGroup ? className : 'Tüm kurum';

  const pdf = async () => {
    setBusy(true);
    setErr(null);
    try {
      const blocks = itemAnalysisBlocks({ exam, data, groupName, isGroup, count: group.length, kurumCount: results.length, watch });
      await downloadKarnePdf(blocks, `${exam.name} soru analizi · ${groupName}`, `Soru-Analizi-${exam.name}-${groupName}`, 'landscape');
    } catch (e: any) {
      setErr(e?.message || 'PDF hazırlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  if (!group.length) return <p className="text-sm text-muted">Bu grupta sonuç yok.</p>;
  const shownSubjects = data.filter((s) => subKey === 'all' || s.subject.key === subKey);

  return (
    <div className="space-y-3" id="madde-analizi">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={subKey}
          onChange={setSubKey}
          items={[{ value: 'all', label: 'Tüm dersler' }, ...data.map((s) => ({ value: s.subject.key, label: s.subject.short }))]}
        />
        <label className="flex items-center gap-1.5 text-xs text-fg-2 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 cursor-pointer" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Yalnızca uyarılı sorular
        </label>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm ml-auto" disabled={busy} onClick={() => void pdf()} id="madde-analizi-pdf">
          <Download /> {busy ? 'Hazırlanıyor…' : `Soru analizi PDF (${groupName})`}
        </button>
      </div>
      {err && <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{err}</p>}

      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[11px] text-info-fg">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <b>{groupName}</b> ({group.length} öğrenci{isGroup ? `; kurum ${results.length} öğrenci` : ''}). Şıklarda <b>yeşil</b> doğru cevap, <b>kırmızı</b> en çok seçilen yanlış şıktır (çeldirici).{' '}
          <b>Ayırt edicilik</b>: derste en başarılı %27 ile en başarısız %27'nin doğru oranı farkı (0,40+ çok iyi · 0,30 iyi · 0,20 orta · altı zayıf; eksi değer cevap anahtarı hatasına işaret edebilir; en az 10 öğrenci gerekir).
          {isGroup ? ' Kurum çizgisi ve "Fark" sütunu sınıfı kurumla karşılaştırır: 25 puan ve üstü geride kalınan sorular işaretlenir.' : ' Sınıfı kurumla karşılaştırmak için yukarıdan sınıf seçin.'}
        </span>
      </div>

      {watch.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg mb-2">
            <AlertTriangle className="w-4 h-4 text-warning-fg" /> Dikkat edilecek sorular
          </p>
          <div className="flex flex-wrap gap-1.5">
            {watch.map(({ subject, item }) => (
              <span key={`${subject.key}-${item.no}`} className={cx(chipTone(item.flags[0]?.tone || 'warning'), 'gap-1')} title={[item.konu, ...item.flags.map((f) => f.text)].filter(Boolean).join(' · ')}>
                <b>
                  {subject.short} {item.no}
                </b>
                <span className="tabular-nums">%{item.rate}</span>
                {isGroup && <span className="opacity-75 tabular-nums">(kurum %{item.kurumRate})</span>}
                <span className="opacity-80">· {item.flags[0]?.text}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shownSubjects.map((s) => {
        const items = s.items.filter((it) => !onlyFlagged || it.flags.length > 0);
        const avg = s.items.length ? Math.round(s.items.reduce((a, it) => a + it.rate, 0) / s.items.length) : 0;
        return (
          <div key={s.subject.key} className="rounded-2xl border border-line bg-surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-surface-2/60">
              <span className="text-sm font-semibold text-fg">{s.subject.name}</span>
              <span className={`ui-chip ui-chip-${LEVEL_INFO[levelOf(avg)].tone}`}>Ortalama doğru %{avg}</span>
              <span className="text-[11px] text-muted">{s.items.filter((it) => it.flags.length).length} uyarılı soru</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-fg-2">
                <thead className="bg-surface-2/40 uppercase tracking-wider text-muted border-b border-line">
                  <tr>
                    <th className="px-3 py-2 font-semibold w-10">Soru</th>
                    <th className="px-2 py-2 font-semibold text-center w-12">Cevap</th>
                    <th className="px-2 py-2 font-semibold w-40">Doğru {isGroup && <span className="normal-case tracking-normal font-normal">(│ kurum)</span>}</th>
                    <th className="px-2 py-2 font-semibold text-center">D / Y / B</th>
                    {s.options.map((o) => (
                      <th key={o} className="px-1 py-2 font-semibold text-center w-11">
                        {o}
                      </th>
                    ))}
                    {isGroup && <th className="px-2 py-2 font-semibold text-center">Fark</th>}
                    <th className="px-2 py-2 font-semibold text-center">Ayırt.</th>
                    <th className="px-3 py-2 font-semibold min-w-56">Konu / uyarı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={s.options.length + 7} className="px-3 py-4 text-center text-subtle">
                        Uyarılı soru yok.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => <ItemRow key={it.no} it={it} options={s.options} isGroup={isGroup} />)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ItemRow: React.FC<{ it: ItemStat; options: string[]; isGroup: boolean }> = ({ it, options, isGroup }) => {
  const lv = levelOf(it.rate);
  const dl = discLabel(it.disc);
  return (
    <tr className={cx('align-top hover:bg-surface-2/30', it.flags.some((f) => f.tone === 'danger') && 'bg-danger-soft/25')}>
      <td className="px-3 py-1.5 font-bold text-fg tabular-nums">{it.no}</td>
      <td className="px-2 py-1.5 text-center font-semibold">{it.cancelled ? 'İptal' : it.answer || '—'}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="relative h-2.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
            <div className={cx('h-full rounded-full', BAR[lv])} style={{ width: `${Math.max(2, it.rate)}%` }} />
            {isGroup && <span className="absolute top-[-2px] h-3.5 w-0.5 rounded bg-fg/70" style={{ left: `calc(${it.kurumRate}% - 1px)` }} title={`Kurum %${it.kurumRate}`} />}
          </div>
          <span className="tabular-nums w-9 text-right font-semibold">%{it.rate}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
        <span className="text-success-fg">{it.d}</span> / <span className="text-danger-fg">{it.y}</span> / <span className="text-muted">{it.b}</span>
      </td>
      {options.map((o) => {
        const pct = it.n ? Math.round((it.options[o] / it.n) * 100) : 0;
        const correct = !it.cancelled && o === it.answer;
        const trap = !correct && it.topWrong?.option === o && it.topWrong.pct >= 15;
        return (
          <td key={o} className="p-0.5 text-center">
            <span
              className={cx('block rounded-md py-1 tabular-nums', correct ? 'bg-success-soft text-success-fg font-bold' : trap ? 'bg-danger-soft text-danger-fg font-bold' : 'text-fg-2')}
              title={`${o} şıkkı: ${it.options[o]} öğrenci${correct ? ' (doğru cevap)' : trap ? ' (en çok seçilen yanlış)' : ''}`}
            >
              %{pct}
            </span>
          </td>
        );
      })}
      {isGroup && (
        <td className={cx('px-2 py-1.5 text-center tabular-nums font-semibold', it.diff <= -25 ? 'text-danger-fg' : it.diff >= 15 ? 'text-success-fg' : 'text-muted')}>
          {it.diff > 0 ? `+${it.diff}` : it.diff}
        </td>
      )}
      <td className="px-2 py-1.5 text-center">
        {it.disc === null ? <span className="text-subtle">—</span> : <span className={chipTone(dl.tone)} title={`Ayırt edicilik ${fmtDisc(it.disc)}: ${dl.label}`}>{fmtDisc(it.disc)}</span>}
      </td>
      <td className="px-3 py-1.5">
        <span className="text-fg">{it.konu || '—'}</span>
        {it.alt && <span className="block text-[11px] text-muted">{it.alt}</span>}
        {it.multi > 0 && <span className="block text-[11px] text-muted">{it.multi} öğrenci birden çok şık işaretlemiş</span>}
        {it.flags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {it.flags.map((f) => (
              <span key={f.key} className={cx(chipTone(f.tone), 'text-[10px]')}>
                {f.text}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
};
