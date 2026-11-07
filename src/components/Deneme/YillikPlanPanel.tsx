import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact'; // Aşama 189
import { dataService } from '../../services/dataService';
import { deleteYillikPlan, listYillikPlan, saveYillikPlan, type YillikPlanInfo } from '../../services/denemeService';
import { LGS_SUBJECTS } from '../../lib/deneme/lgs';
import { PLAN_SUBJECTS, currentSchoolYear, planDateTr, readPlanFile, type PlanParseResult } from '../../lib/deneme/yillikPlan';

// ============================================================================
// Aşama 129: Yıllık plan yükleme (Fen Bilimleri, Matematik, T.C. İnkılap Tarihi)
// Planın her kazanımı için ilk işlendiği hafta kaydedilir. Kitapçıktan kazanım bulmada ve cevap anahtarı
// eşleştirmesinde deneme tarihine (+1 hafta) kadar işlenmemiş kazanımlar önerilmez.
// Kurumsuz hesap (genel yönetici) ORTAK planı yükler; kurum kendi planını yüklerse kendi planı kullanılır.
// ============================================================================

type Msg = { tone: 'success' | 'warning' | 'danger'; text: string } | null;

export const YillikPlanPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<YillikPlanInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; r: PlanParseResult } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [year, setYear] = useState(currentSchoolYear());
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickFor = useRef<string>('');
  const kurumsuz = dataService.isHeadAdmin() || !dataService.getMyKurumId();

  const load = async () => {
    const r = await listYillikPlan();
    setInfo(r.info);
  };
  useEffect(() => {
    if (open && !info) void load();
  }, [open]);

  const onFile = async (file?: File | null) => {
    const subject = pickFor.current;
    if (!file || !subject) return;
    setBusy(subject);
    setMsg(null);
    setPreview(null);
    try {
      const r = await readPlanFile(file, year);
      if (!r.items.length) setMsg({ tone: 'danger', text: r.warnings.join(' ') || 'Planda kazanım bulunamadı.' });
      else setPreview({ subject, r });
    } catch {
      setMsg({ tone: 'danger', text: 'Dosya okunamadı. Yıllık planın Excel (.xlsx) hâlini seçin.' });
    } finally {
      setBusy(null);
    }
  };

  const doSave = async () => {
    if (!preview) return;
    setBusy(preview.subject);
    try {
      const n = await saveYillikPlan(preview.subject, preview.r.items, preview.r.year);
      setMsg({ tone: 'success', text: `${nameOf(preview.subject)} yıllık planı kaydedildi (${n} kod).` });
      setPreview(null);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (subject: string) => {
    setBusy(subject);
    setMsg(null);
    try {
      await deleteYillikPlan(subject);
      setMsg({ tone: 'success', text: `${nameOf(subject)} yıllık planı silindi.` });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message || 'Silinemedi.' });
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (k: string) => LGS_SUBJECTS.find((s) => s.key === k)?.name || k;

  return (
    <Panel
      icon={CalendarDays}
      title="Yıllık planlar (Fen, Matematik, İnkılap)"
      description={
        <span className="inline-flex items-center gap-1">
          Henüz işlenmemiş kazanımlar önerilmez.
          <InfoTip text="Plan yüklüyse kitapçıktan kazanım bulmada ve cevap anahtarı eşleştirmesinde deneme tarihine (+1 hafta) kadar işlenmemiş kazanımlar önerilmez. Türkçe, Din ve İngilizce süzülmez." />
        </span>
      }
      actions={
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} id="kb-plan-toggle">
          {open ? <ChevronUp /> : <ChevronDown />} {open ? 'Gizle' : 'Aç'}
        </button>
      }
    >
      {open && (
        <div className="space-y-3" id="kb-yillik-plan">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
            <label htmlFor="kb-plan-year">Eğitim yılı (dosyada yazmıyorsa):</label>
            <select id="kb-plan-year" className="ui-input py-1 text-xs w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, -1].map((d) => {
                const y = currentSchoolYear() + d;
                return (
                  <option key={y} value={y}>
                    {y}-{y + 1}
                  </option>
                );
              })}
            </select>
            <span className="text-[11px] text-muted">
              {kurumsuz ? 'Yüklediğiniz plan bütün kurumlarda ortak plan olarak kullanılır (kendi planını yükleyen kurum hariç).' : 'Yüklediğiniz plan yalnız kurumunuzda kullanılır.'}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="space-y-2">
            {PLAN_SUBJECTS.map((k) => {
              const p = info?.find((x) => x.subject === k);
              return (
                <div key={k} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="text-sm font-semibold text-fg min-w-48">{nameOf(k)}</span>
                  {info === null ? (
                    <span className="text-xs text-muted">Yükleniyor…</span>
                  ) : p ? (
                    <>
                      <span className="ui-chip ui-chip-success">{p.count} kod</span>
                      <span className="ui-chip ui-chip-neutral">
                        {planDateTr(p.first)} – {planDateTr(p.last)}
                      </span>
                      {p.year && <span className="ui-chip ui-chip-neutral">{p.year}</span>}
                      <span className="ui-chip ui-chip-info">{p.own ? 'kurum planı' : 'ortak plan'}</span>
                    </>
                  ) : (
                    <span className="ui-chip ui-chip-warning">plan yok (süzgeç kapalı)</span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    disabled={!!busy}
                    onClick={() => {
                      pickFor.current = k;
                      fileRef.current?.click();
                    }}
                  >
                    <FileSpreadsheet /> {busy === k ? 'Okunuyor…' : p ? 'Yeniden yükle' : 'Plan yükle'}
                  </button>
                  {p && (kurumsuz ? !p.own : p.own) && (
                    <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm text-danger-fg" disabled={!!busy} onClick={() => void doDelete(k)} aria-label={`${nameOf(k)} planını sil`}>
                      <Trash2 /> Sil
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {preview && (
            <div className="rounded-xl border border-line overflow-hidden" id="kb-plan-preview">
              <div className="px-3 py-2 bg-surface-2/60 border-b border-line flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-fg">{nameOf(preview.subject)} planı</span>
                <span className="ui-chip ui-chip-info">{preview.r.items.length} kod</span>
                <span className="ui-chip ui-chip-neutral">{preview.r.weeks} hafta</span>
                {preview.r.year && (
                  <span className="ui-chip ui-chip-neutral">
                    {preview.r.year}-{preview.r.year + 1}
                  </span>
                )}
                <span className="flex-1" />
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!!busy} onClick={() => setPreview(null)}>
                  Vazgeç
                </button>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!!busy} onClick={() => void doSave()} id="kb-plan-save">
                  {busy ? 'Kaydediliyor…' : 'Planı kaydet'}
                </button>
              </div>
              {preview.r.warnings.length > 0 && <p className="px-3 py-2 text-[11px] text-warning-fg bg-warning-soft">{preview.r.warnings.join(' ')}</p>}
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-fg-2">
                  <tbody className="divide-y divide-line">
                    {preview.r.items.map((it) => (
                      <tr key={it.code}>
                        <td className="px-3 py-1 tabular-nums whitespace-nowrap">
                          <span className={cx('ui-chip', it.code.split('.').length >= 4 || preview.subject === 'sos' ? 'ui-chip-neutral' : 'ui-chip-info')}>{it.code}</span>
                        </td>
                        <td className="px-3 py-1">{planDateTr(it.start)} haftasından itibaren</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
          <p className="text-[11px] text-muted flex items-center gap-1">
            Planın Excel hâlini seçin.
            <InfoTip text={'AY, HAFTA, ÜNİTE, KONU, KAZANIM sütunları olmalı; açıklama sütunları olsa da olur. Haftalar "1. Hafta: 14-18 Eylül" gibi yazılmalı. Deneme tarihi girilmemişse ya da deneme başka bir eğitim yılına aitse süzgeç kullanılmaz.'} />
          </p>
        </div>
      )}
    </Panel>
  );
};
