import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, XCircle, Clock, AlertCircle, Save, Users, MapPin, BookOpen, Info } from 'lucide-react';
import { cx } from '../ui/kit';

// ============================================================================
// GİRİŞSİZ ETÜT YOKLAMASI (Aşama 16)
// Etüde atanan öğretmen (sistem dışı olanlar dahil) e-postadaki kişisel bağlantıyla bu sayfayı açar,
// öğrencilerin durumunu seçip kaydeder. Bağlantı yalnızca o etüdü açar; sunucu her istekte denetler.
// ============================================================================

type Status = 'present' | 'absent' | 'late';

interface AttendanceData {
  etut: { subject: string; topic: string; date: string; time: string; duration: number; location: string; teacherNames: string };
  teacherName: string;
  students: Array<{ id: string; name: string; className: string }>;
  attendance: Record<string, string>;
  takenBy: { name: string; at: string | null } | null;
  canSave: boolean;
  reason: string;
}

const STATUS: Array<{ value: Status; label: string; icon: React.ComponentType<{ className?: string }>; on: string }> = [
  { value: 'present', label: 'Geldi', icon: CheckCircle2, on: 'bg-success text-white border-success' },
  { value: 'absent', label: 'Gelmedi', icon: XCircle, on: 'bg-danger text-white border-danger' },
  { value: 'late', label: 'Geç kaldı', icon: Clock, on: 'bg-warning text-white border-warning' },
];

async function call(action: 'attendance-get' | 'attendance-save', payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  } catch {
    throw new Error('İnternet bağlantısı yok gibi görünüyor. Bağlantınızı kontrol edip tekrar deneyin.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'Sunucuya ulaşılamadı. Biraz sonra tekrar deneyin.');
  return data;
}

const trDateLong = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return ymd || '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const timeOf = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

export const EtutAttendancePage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Etüt Yoklaması';
    call('attendance-get', { token })
      .then((d: AttendanceData) => {
        setData(d);
        const init: Record<string, Status> = {};
        for (const s of d.students) {
          const st = d.attendance[s.id];
          init[s.id] = st === 'absent' || st === 'late' ? st : 'present';
        }
        setMarks(init);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0 };
    Object.values(marks).forEach((v) => (c[v] += 1));
    return c;
  }, [marks]);

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await call('attendance-save', { token, records: marks });
      setSavedAt(r.at || new Date().toISOString());
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setAll = (st: Status) => {
    if (!data) return;
    setSavedAt(null);
    setMarks(Object.fromEntries(data.students.map((s) => [s.id, st])));
  };

  return (
    <div className="min-h-screen bg-canvas text-fg" id="etut-attendance-page">
      <header className="bg-surface border-b border-line">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-info-soft text-info-fg flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-fg">Etüt Yoklaması</h1>
            <p className="text-xs text-muted truncate">{data ? `Merhaba ${data.teacherName || 'öğretmenim'}` : 'Eğitim Takip'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-32 space-y-4">
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
            <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
            Etüt bilgileri yükleniyor…
          </div>
        )}

        {error && (
          <div role="alert" id="att-error" className="ui-card p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-fg shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-fg">Yoklama açılamadı</p>
              <p className="text-sm text-muted mt-1">{error}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            <section className="ui-card p-4 space-y-2" id="att-etut-info">
              <p className="text-base font-bold text-fg flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-info-fg" />
                {data.etut.subject}
                {data.etut.topic && <span className="font-medium text-muted">· {data.etut.topic}</span>}
              </p>
              <p className="text-sm text-fg-2">
                {trDateLong(data.etut.date)}
                {data.etut.time ? ` · ${data.etut.time} (${data.etut.duration} dk)` : ''}
              </p>
              {data.etut.location && (
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {data.etut.location}
                </p>
              )}
              {data.etut.teacherNames && <p className="text-xs text-muted">Etüt öğretmeni: {data.etut.teacherNames}</p>}
              {data.takenBy && data.takenBy.at && !savedAt && (
                <p className="text-xs text-success-fg font-semibold">
                  Son yoklama: {data.takenBy.name} · {timeOf(data.takenBy.at)}
                </p>
              )}
            </section>

            {!data.canSave && (
              <div className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2.5 text-sm font-semibold" id="att-reason">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                {data.reason}
              </div>
            )}

            <section className="ui-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
                <p className="text-sm font-semibold text-fg flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-muted" />
                  {data.students.length} öğrenci
                </p>
                {data.canSave && (
                  <span className="flex gap-1.5">
                    <button type="button" id="att-all-present" onClick={() => setAll('present')} className="ui-btn ui-btn-secondary ui-btn-sm">
                      Hepsi geldi
                    </button>
                    <button type="button" id="att-all-absent" onClick={() => setAll('absent')} className="ui-btn ui-btn-ghost ui-btn-sm">
                      Hepsi gelmedi
                    </button>
                  </span>
                )}
              </div>
              <ul className="divide-y divide-line" id="att-list">
                {data.students.map((s) => (
                  <li key={s.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2" data-student-id={s.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{s.name}</span>
                      {s.className && <span className="block text-xs text-muted">{s.className}</span>}
                    </span>
                    <span className="grid grid-cols-3 gap-1.5 sm:w-72" role="radiogroup" aria-label={`${s.name} yoklama`}>
                      {STATUS.map((o) => {
                        const on = marks[s.id] === o.value;
                        const Icon = o.icon;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={!data.canSave}
                            data-status={o.value}
                            onClick={() => {
                              setSavedAt(null);
                              setMarks((m) => ({ ...m, [s.id]: o.value }));
                            }}
                            className={cx(
                              'flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-xs font-semibold transition-colors',
                              on ? o.on : 'bg-surface text-fg-2 border-line',
                              data.canSave ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'
                            )}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {o.label}
                          </button>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      {data && data.canSave && (
        <div className="fixed bottom-0 inset-x-0 bg-surface border-t border-line">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {saveError && (
              <p role="alert" id="att-save-error" className="text-xs font-semibold text-danger-fg">
                {saveError}
              </p>
            )}
            {savedAt && (
              <p id="att-saved" className="text-xs font-semibold text-success-fg flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Yoklama kaydedildi ({timeOf(savedAt)}). Değiştirip tekrar kaydedebilirsiniz.
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted flex-1" id="att-counts">
                Geldi {counts.present} · Gelmedi {counts.absent} · Geç {counts.late}
              </span>
              <button type="button" id="att-save" onClick={save} disabled={saving} className="ui-btn ui-btn-primary">
                <Save className="w-4 h-4" />
                {saving ? 'Kaydediliyor…' : 'Yoklamayı Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
