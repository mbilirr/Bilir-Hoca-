import React, { useMemo, useState } from 'react';
import { BookOpenCheck, StickyNote, Search, CalendarDays, User, CheckCheck } from 'lucide-react';
import type { Etut, EtutStudentAttendance } from '../../types';
import { dataService } from '../../services/dataService';
import { useDataVersion } from '../../lib/useDataVersion';
import { useSeenIds } from '../../lib/useSeenIds';
import { etutTeacherNames } from '../../lib/etutStatus';
import { cx } from '../ui/kit';

// ============================================================================
// ETÜT NOTLARI (Aşama 32) — Mesajlar bölümünde ayrı sekme
// Etüt yoklaması alınırken bir öğrenciye etüt konusundan FARKLI bir konu anlatıldıysa ya da öğrenci hakkında
// NOT yazıldıysa burada mesaj gibi listelenir. Veriler etütlerin yoklama kayıtlarından okunur; ayrıca bir
// mesaj kaydı oluşturulmaz (veritabanı değişikliği yok). Öğretmen hangi etütleri görebiliyorsa onların notlarını görür.
// Görülen notlar bu tarayıcıda hatırlanır; yeni (görülmemiş) notlar kalın ve renkli görünür.
// ============================================================================

/** Kaç gün öncesine kadarki notlar listelensin */
export const ETUT_NOTE_DAYS = 30;

export interface EtutNoteItem {
  id: string;
  etut: Etut;
  studentId: string;
  studentName: string;
  className: string;
  status: EtutStudentAttendance['status'];
  topic: string; // etüt konusundan farklı anlatılan konu ('' = yok)
  note: string; // öğrenci hakkında not ('' = yok)
  at: string; // ISO ya da YYYY-MM-DD
}

const STATUS_TEXT: Record<string, string> = { present: 'Geldi', absent: 'Gelmedi', late: 'Geç kaldı', excused: 'İzinli' };

const clean = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();

/** Etütlerin yoklama kayıtlarından not / farklı konu içeren satırları çıkarır (en yeni üstte) */
export function collectEtutNotes(etuts: Etut[], studentInfo: Map<string, { name: string; className: string }>): EtutNoteItem[] {
  const cutoff = new Date(Date.now() - ETUT_NOTE_DAYS * 86400000);
  const cutoffYmd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const out: EtutNoteItem[] = [];
  for (const e of etuts) {
    if ((e.date || '').slice(0, 10) < cutoffYmd) continue;
    const att = e.studentAttendance || {};
    for (const [sid, rec] of Object.entries(att)) {
      if (!rec) continue;
      const note = clean(rec.note);
      const rawTopic = clean(rec.topic);
      // Etüdün kendi konusuyla aynıysa "farklı konu" sayılmaz
      const topic = rawTopic && rawTopic.toLocaleLowerCase('tr-TR') !== clean(e.topic).toLocaleLowerCase('tr-TR') ? rawTopic : '';
      if (!note && !topic) continue;
      const info = studentInfo.get(sid);
      if (!info) continue; // öğretmenin göremediği öğrenci
      const at = rec.updatedAt || rec.markedAt || e.date || '';
      out.push({
        // Not / konu değişirse yeni bilgi sayılır (yeniden "yeni" görünür)
        id: `${e.id}:${sid}:${note}|${topic}`,
        etut: e,
        studentId: sid,
        studentName: info.name || rec.studentName || 'Öğrenci',
        className: info.className,
        status: rec.status,
        topic,
        note,
        at,
      });
    }
  }
  return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

const whenText = (iso: string) => {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Mesajlar sekmesindeki sayaç için: görülmemiş etüt notu sayısı */
export function useEtutNotes() {
  const version = useDataVersion();
  const me = dataService.getCurrentTeacher();
  const [seen, markSeen] = useSeenIds(`tchr_etutnote_seen_${me?.id || 'x'}`);
  const items = useMemo(() => {
    const info = new Map(dataService.getStudents().map((s) => [s.id, { name: s.name, className: s.className || '' }] as const));
    return collectEtutNotes(dataService.getEtuts(), info);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const unseen = items.filter((x) => !seen.has(x.id)).length;
  return { items, seen, markSeen, unseen };
}

export const EtutNotesInbox: React.FC<{ notes: ReturnType<typeof useEtutNotes> }> = ({ notes }) => {
  const { items, seen, markSeen, unseen } = notes;
  const [q, setQ] = useState('');
  const term = q.toLocaleLowerCase('tr-TR').trim();
  const list = term
    ? items.filter((x) =>
        [x.studentName, x.className, x.etut.subject, x.etut.topic, x.topic, x.note].some((v) => (v || '').toLocaleLowerCase('tr-TR').includes(term))
      )
    : items;

  return (
    <section className="ui-card overflow-hidden" id="etut-notes-inbox">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">Etüt notları</h2>
          <p className="text-xs text-muted">
            Yoklamada öğrenciye anlatılan farklı konu ve öğrenci hakkında yazılan notlar · son {ETUT_NOTE_DAYS} gün
            {unseen > 0 ? ` · ${unseen} yeni` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Öğrenci, ders, not ara…"
              className="w-48 sm:w-60 bg-surface-2 border border-line rounded-xl pl-8 pr-3 py-1.5 text-xs text-fg placeholder:text-subtle focus:outline-none focus:border-brand"
            />
          </div>
          {unseen > 0 && (
            <button type="button" id="etut-notes-mark-all" onClick={() => markSeen(items.map((x) => x.id))} className="ui-btn ui-btn-secondary ui-btn-sm">
              <CheckCheck className="w-3.5 h-3.5" /> Tümünü okundu yap
            </button>
          )}
        </div>
      </header>

      {list.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {items.length === 0
            ? 'Henüz etüt notu yok. Etüt yoklamasında bir öğrenciye farklı konu ya da not yazıldığında burada görünür.'
            : 'Aramanıza uygun not yok.'}
        </p>
      ) : (
        <ul className="divide-y divide-line max-h-[600px] overflow-y-auto">
          {list.map((x) => {
            const isNew = !seen.has(x.id);
            const teachers = etutTeacherNames(x.etut);
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => markSeen([x.id])}
                  data-etut-note={x.studentId}
                  className={cx('w-full text-left px-4 sm:px-5 py-2 flex items-start gap-3 transition-colors cursor-pointer', isNew ? 'bg-brand-soft/50 hover:bg-brand-soft' : 'hover:bg-surface-2')}
                >
                  <span className={cx('mt-1.5 w-2.5 h-2.5 rounded-full shrink-0', isNew ? 'bg-brand' : 'bg-transparent')} aria-hidden />
                  <span className="flex-1 min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cx('text-sm text-fg', isNew ? 'font-bold' : 'font-semibold')}>{x.studentName}</span>
                      {x.className && <span className="text-xs text-muted">{x.className}</span>}
                      <span className="ui-chip ui-chip-neutral">{STATUS_TEXT[x.status] || x.status}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> {x.etut.subject}
                        {x.etut.topic ? ` – ${x.etut.topic}` : ''} · {whenText(x.etut.date)}
                        {x.etut.time ? ` ${x.etut.time}` : ''}
                      </span>
                      {teachers.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {teachers.join(', ')}
                        </span>
                      )}
                    </span>
                    {x.topic && (
                      <span className="flex items-start gap-1.5 text-xs text-fg">
                        <BookOpenCheck className="w-3.5 h-3.5 mt-px shrink-0 text-info-fg" />
                        <span>
                          <strong className="font-semibold text-info-fg">Anlatılan konu:</strong> {x.topic}
                        </span>
                      </span>
                    )}
                    {x.note && (
                      <span className="flex items-start gap-1.5 text-xs text-fg">
                        <StickyNote className="w-3.5 h-3.5 mt-px shrink-0 text-warning-fg" />
                        <span className="whitespace-pre-wrap break-words">
                          <strong className="font-semibold text-warning-fg">Not:</strong> {x.note}
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-subtle shrink-0 whitespace-nowrap">{whenText(x.at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
