import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Info } from 'lucide-react';
import { Modal, Segmented, cx } from '../ui/kit';
import type { Student } from '../../types';
import { dataService } from '../../services/dataService';
import { addDaysYmd, addPlanItem, dateOfDay, loadPlan, planDayName, sendPlan, shortDayLabel, weekRangeLabel, weekStartOf, type StudyPlan } from '../../services/studyPlanService';
import { syncSentPlan } from '../../lib/planToTarget';
import type { StudySuggestion } from '../../lib/deneme/kazanimKarne';

// ============================================================================
// Aşama 54: Çalışma Planı Karnesi → Haftalık plan + gün gün soru hedefi (tek tuş)
//  * Her önerilen kazanım planda bir (ya da birkaç) göreve dönüşür: ders, kazanım adı, soru sayısı.
//  * Soru sayısı seçilen günlere bölünür (ör. 40 soru → Pzt 20, Per 20).
//  * Plan öğrenciye gönderilince (Aşama 53) Soru Kaydet'teki konu kutusu ve gün gün soru hedefi kendiliğinden oluşur.
//  * Aynı gün + ders + kazanım için görev zaten varsa yeniden eklenmez (iki kez basılırsa çift görev olmaz).
// ============================================================================

const BOOK_PREFIX = 'Deneme önerisi';
const MAX_PER_DAY = 20; // bir güne düşen en çok soru (öneri dağıtımı için)

interface Row {
  key: string;
  s: StudySuggestion;
  count: number;
  days: number[];
  allowed: boolean;
}

/** Soru sayısını günlere böler (kalan ilk günlere) */
export function splitCount(total: number, days: number): number[] {
  if (days <= 0) return [];
  const base = Math.floor(total / days);
  const rest = total - base * days;
  return Array.from({ length: days }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Öneri dağıtımı: her kazanım için gereken gün sayısı kadar, o haftanın en boş günleri (son gün tekrar/dinlenme için boş bırakılır) */
function distribute(list: StudySuggestion[], existingLoad: number[]): number[][] {
  const load = existingLoad.slice(0, 6);
  return list.map((s) => {
    const need = Math.max(1, Math.min(3, Math.ceil(s.questions / MAX_PER_DAY)));
    const order = [0, 1, 2, 3, 4, 5].sort((a, b) => load[a] - load[b] || a - b);
    const days = order.slice(0, need).sort((a, b) => a - b);
    const parts = splitCount(s.questions, days.length);
    days.forEach((d, i) => (load[d] += parts[i] || 1));
    return days;
  });
}

// Görev metni öğrencinin Soru Kaydet'indeki konu kutusuna "kitap – açıklama" olarak yazılır: önce kısa kazanım adı gelir
const taskBook = (s: StudySuggestion) => s.row.short.slice(0, 160);
const taskNote = (s: StudySuggestion) => `${BOOK_PREFIX} · son başarı %${s.row.lastRate ?? s.row.rate}. ${s.advice}\n${s.row.label}`.slice(0, 1000);

export const PlanaAktarModal: React.FC<{
  open: boolean;
  onClose: () => void;
  student: Student;
  suggestions: StudySuggestion[];
  onDone?: (text: string) => void;
}> = ({ open, onClose, student, suggestions, onDone }) => {
  const me = dataService.getCurrentTeacher();
  const isAdmin = dataService.isCurrentUserAdmin();
  const mySubjects = dataService.getMySubjects();
  const teacherName = me?.name || 'Öğretmen';
  const canSubject = useCallback((s: string) => isAdmin || !mySubjects || mySubjects.includes(s), [isAdmin, mySubjects]);

  const startDay = dataService.getStudentWeekStartDay(student.id);
  const thisWeek = weekStartOf(new Date(), startDay);
  const [which, setWhich] = useState<'next' | 'this'>('next');
  const weekStart = which === 'next' ? addDaysYmd(thisWeek, 7) : thisWeek;
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Haftanın mevcut planı okunur; öneriler o haftanın boş günlerine dağıtılır
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setDone(null);
    (async () => {
      let p: StudyPlan = { header: null, items: [] };
      try {
        p = await loadPlan(student.id, weekStart);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Haftalık plan okunamadı.');
      }
      if (!alive) return;
      setPlan(p);
      const load = Array.from({ length: 7 }, (_, d) => p.items.filter((i) => i.day === d).reduce((a, i) => a + (i.questionCount || 0) + 5, 0));
      const days = distribute(suggestions, load);
      setRows(suggestions.map((s, i) => ({ key: s.row.key, s, count: s.questions, days: days[i], allowed: canSubject(s.planSubject) })));
      setSend(!p.header?.sentAt);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekStart, student.id, suggestions]);

  const sent = !!plan?.header?.sentAt;
  const usable = rows.filter((r) => r.allowed && r.count > 0 && r.days.length > 0);
  const total = usable.reduce((a, r) => a + r.count, 0);
  const dayTotals = useMemo(() => {
    const t = Array.from({ length: 7 }, () => 0);
    for (const r of usable) splitCount(r.count, r.days.length).forEach((n, i) => (t[r.days[i]] += n));
    return t;
  }, [usable]);

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleDay = (key: string, d: number) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const has = r.days.includes(d);
        return { ...r, days: has ? r.days.filter((x) => x !== d) : [...r.days, d].sort((a, b) => a - b) };
      })
    );

  const run = async () => {
    if (busy || !usable.length) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await loadPlan(student.id, weekStart);
      const items = fresh.items.slice();
      let added = 0;
      let skipped = 0;
      for (const r of usable) {
        const parts = splitCount(r.count, r.days.length);
        for (let i = 0; i < r.days.length; i++) {
          const day = r.days[i];
          const book = taskBook(r.s);
          if (items.some((it) => it.day === day && it.subject === r.s.planSubject && it.book === book)) {
            skipped++;
            continue;
          }
          const position = items.filter((it) => it.day === day).length;
          const created = await addPlanItem(student.id, weekStart, { day, subject: r.s.planSubject, book, note: taskNote(r.s), questionCount: parts[i] }, position, teacherName);
          items.push(created);
          added++;
        }
      }
      let sentNow = false;
      if (send && !fresh.header?.sentAt) {
        await sendPlan(student.id, weekStart, teacherName);
        sentNow = true;
      }
      let qText = '';
      if (sentNow || fresh.header?.sentAt) {
        const tr = await syncSentPlan(student, weekStart, canSubject);
        if (tr?.questionSubjects.length) qText = ` Gün gün soru hedefi: ${tr.questionSubjects.join(', ')}.`;
        if (tr?.manualKept.length) qText += ` (${tr.manualKept.join(', ')} için elle verilmiş hedef korundu; yalnızca konular yazıldı.)`;
      }
      const parts = [`${weekRangeLabel(weekStart)} planına ${added} görev eklendi`];
      if (skipped) parts.push(`${skipped} görev zaten vardı`);
      const text =
        parts.join(', ') +
        '.' +
        (sentNow
          ? ` Plan öğrenciye gönderildi; konular Soru Kaydet'e işlendi.${qText}`
          : fresh.header?.sentAt
            ? ` Plan zaten gönderilmişti; değişiklik Soru Kaydet'e işlendi.${qText}`
            : ' Plan taslak olarak kaydedildi: Ödevler › Haftalık Plan bölümünden gönderebilirsiniz.');
      setDone(text);
      onDone?.(text);
      const again = await loadPlan(student.id, weekStart).catch(() => null);
      if (again) setPlan(again);
    } catch (e: any) {
      setError(e?.message || 'Plana aktarılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = rows.filter((r) => !r.allowed);

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Plana ve soru hedefine aktar"
      description={`${student.name} · önerilen kazanımlar haftalık plana görev olarak eklenir`}
      icon={CalendarPlus}
      size="xl"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={onClose}>
            {done ? 'Kapat' : 'Vazgeç'}
          </button>
          {!done && (
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || loading || !usable.length} onClick={() => void run()}>
              <CalendarPlus /> {busy ? 'Aktarılıyor…' : `${usable.length} kazanımı aktar (${total} soru)`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3" id="plana-aktar-modal">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={which}
            onChange={(v) => setWhich(v)}
            items={[
              { value: 'next', label: 'Gelecek hafta' },
              { value: 'this', label: 'Bu hafta' },
            ]}
          />
          <span className="text-xs font-semibold text-fg">{weekRangeLabel(weekStart)}</span>
          <span className="text-[11px] text-muted">({planDayName(weekStart, 0)} başlangıçlı)</span>
          {plan && (
            <span className={cx('ui-chip ml-auto', sent ? 'ui-chip-success' : plan.items.length ? 'ui-chip-warning' : 'ui-chip-neutral')}>
              {sent ? `Plan gönderilmiş · ${plan.items.length} görev` : plan.items.length ? `Taslak plan · ${plan.items.length} görev` : 'Bu hafta için plan yok'}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted">Plan okunuyor…</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const parts = splitCount(r.count, r.days.length);
              return (
                <div key={r.key} className={cx('rounded-xl border p-2.5 space-y-2', r.allowed ? 'border-line bg-surface' : 'border-line bg-surface-2/60 opacity-70')}>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="ui-chip ui-chip-brand tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">
                        {r.s.planSubject} · {r.s.row.short}
                      </p>
                      <p className="text-[11px] text-muted">{r.allowed ? r.s.advice : 'Bu ders branşınız dışında: aktarılmaz.'}</p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-fg-2">
                      Soru
                      <input
                        type="number"
                        min={0}
                        max={300}
                        step={5}
                        disabled={!r.allowed || busy}
                        className="ui-input w-20 py-1 text-center text-xs"
                        value={r.count}
                        onChange={(e) => setRow(r.key, { count: Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0))) })}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Günler">
                    {Array.from({ length: 7 }, (_, d) => {
                      const on = r.days.includes(d);
                      const idx = r.days.indexOf(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={!r.allowed || busy}
                          aria-pressed={on}
                          onClick={() => toggleDay(r.key, d)}
                          className={cx(
                            'rounded-lg border px-2 py-1 text-[11px] leading-tight cursor-pointer transition-colors disabled:cursor-not-allowed',
                            on ? 'border-brand/40 bg-brand-soft text-brand-fg font-semibold' : 'border-line bg-surface text-muted hover:bg-surface-2'
                          )}
                        >
                          <span className="block">{planDayName(weekStart, d).slice(0, 3)}</span>
                          <span className="block text-[10px] opacity-80">{on ? `${parts[idx]} soru` : shortDayLabel(dateOfDay(weekStart, d))}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && usable.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2">
            <p className="text-[11px] font-semibold text-muted mb-1">Günlere düşen soru (bu aktarım)</p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {dayTotals.map((n, d) => (
                <div key={d} className={cx('rounded-lg px-1 py-1', n ? 'bg-info-soft text-info-fg' : 'bg-surface text-subtle')}>
                  <p className="text-[10px]">{planDayName(weekStart, d).slice(0, 3)}</p>
                  <p className="text-sm font-bold tabular-nums">{n || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {sent ? (
          <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2 text-xs text-success-fg">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Bu haftanın planı öğrenciye gönderilmiş: eklenen görevler Soru Kaydet'e ve gün gün soru hedefine kendiliğinden işlenir.
          </p>
        ) : (
          <label className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer" checked={send} disabled={busy} onChange={(e) => setSend(e.target.checked)} />
            <span>
              <b className="text-fg">Planı öğrenciye gönder</b> — görevler öğrencinin planında görünür; Soru Kaydet'teki konu kutusu ve gün gün soru hedefi oluşur.
              {plan && plan.items.length > 0 && <span className="block text-warning-fg mt-0.5">Bu haftanın taslak planında {plan.items.length} görev daha var; plan gönderilince onlar da gönderilir.</span>}
              {!send && <span className="block text-muted mt-0.5">İşaretlemezseniz plan taslak kalır; Ödevler › Haftalık Plan'dan sonra gönderebilirsiniz.</span>}
            </span>
          </label>
        )}

        {blocked.length > 0 && <p className="text-[11px] text-warning-fg">{blocked.length} kazanım branşınız dışında olduğu için aktarılmaz (yalnızca kendi branşınızdan görev verebilirsiniz).</p>}
        {error && <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}
        {done && <p role="status" className="text-xs font-semibold text-success-fg bg-success-soft rounded-xl px-3 py-2">{done}</p>}
      </div>
    </Modal>
  );
};
