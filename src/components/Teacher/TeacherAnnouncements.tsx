import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, StickyNote, Send, Search, Trash2, Users, CheckCircle2, AlertCircle, School } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { AnnouncementGroup } from '../../types';
import { useAutoDismiss } from '../../lib/useAutoDismiss';

// ============================================================================
// DUYURU / NOT GÖNDER (Aşama 28)
// Öğretmen, seçtiği sınıf ya da öğrencilere duyuru veya kısa not yazar.
// Öğrenci bunu ana sayfasındaki "Duyurular" bölümünde görür.
// ============================================================================

const TITLE_MAX = 80;
const TEXT_MAX = 1500;

type Target = 'class' | 'student';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const TeacherAnnouncements: React.FC = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);

  const students = useMemo(() => dataService.getStudents(), [tick]);
  const classes = useMemo(() => dataService.getClasses(), [tick]);
  const sent: AnnouncementGroup[] = useMemo(() => dataService.getSentAnnouncements(), [tick]);

  const [kind, setKind] = useState<'announcement' | 'note'>('announcement');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [target, setTarget] = useState<Target>('class');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useAutoDismiss(feedback, () => setFeedback(null)); // Aşama 32: 15 sn sonra kaybolur
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const classSize = useMemo(() => {
    const m = new Map<string, number>();
    students.forEach((s) => m.set(s.classId, (m.get(s.classId) || 0) + 1));
    return m;
  }, [students]);
  // Öğrencisi olan sınıflar
  const usableClasses = useMemo(
    () => classes.filter((c) => (classSize.get(c.id) || 0) > 0).sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
    [classes, classSize]
  );

  const recipients = useMemo(() => {
    if (target === 'class') return students.filter((s) => classIds.includes(s.classId)).map((s) => s.id);
    return studentIds.filter((id) => students.some((s) => s.id === id));
  }, [target, students, classIds, studentIds]);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return students
      .filter((s) => (studentClassFilter === 'all' ? true : s.classId === studentClassFilter))
      .filter((s) => !q || s.name.toLocaleLowerCase('tr-TR').includes(q) || String(s.studentNumber || '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [students, search, studentClassFilter]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const canSend = !sending && title.trim().length > 0 && text.trim().length > 0 && recipients.length > 0;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setFeedback(null);
    try {
      const g = await dataService.sendAnnouncement({ kind, title, text, studentIds: recipients });
      setFeedback({
        tone: 'success',
        text: `${kind === 'announcement' ? 'Duyuru' : 'Not'} ${g.studentIds.length} öğrenciye gönderildi. Öğrenciler ana sayfalarındaki Duyurular bölümünde görecek.`,
      });
      setTitle('');
      setText('');
      setClassIds([]);
      setStudentIds([]);
    } catch (err: any) {
      const raw = String(err?.message || 'Gönderilemedi.');
      const schemaProblem = /column|schema|kind|group_id|sender/i.test(raw);
      setFeedback({
        tone: 'danger',
        text: schemaProblem
          ? `${raw} — Supabase'de "09_duyuru_ve_not.sql" dosyasını bir kez çalıştırdığınızdan emin olun.`
          : raw,
      });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    setConfirmDeleteId(null);
    try {
      await dataService.deleteAnnouncementGroup(groupId);
    } catch {
      /* hata uyarısı dataService tarafından gösterilir */
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start" id="teacher-announcements">
      {/* ===== Gönderme formu ===== */}
      <form onSubmit={handleSend} className="lg:col-span-7 bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-card space-y-4">
        <div>
          <h3 className="text-base font-bold text-fg">Öğrencilere duyuru veya not gönder</h3>
          <p className="text-xs text-muted mt-0.5">Gönderdiğiniz mesaj öğrencinin ana sayfasındaki “Duyurular” bölümünde görünür.</p>
        </div>

        {/* Tür */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mesaj türü">
          {(
            [
              { v: 'announcement', label: 'Duyuru', hint: 'Sınıfa / gruba genel haber', icon: Megaphone, on: 'border-orange-500 bg-orange-500/10' },
              { v: 'note', label: 'Not', hint: 'Öğrenciye kısa kişisel mesaj', icon: StickyNote, on: 'border-purple-500 bg-purple-500/10' },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={kind === o.v}
              id={`ann-kind-${o.v}`}
              onClick={() => setKind(o.v)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left cursor-pointer transition-colors ${kind === o.v ? o.on : 'border-line bg-surface-2/50 hover:bg-surface-2'}`}
            >
              <o.icon className="w-5 h-5 shrink-0 text-fg-2" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-fg">{o.label}</span>
                <span className="block text-[11px] text-muted truncate">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Başlık + metin */}
        <div className="space-y-3">
          <div>
            <label htmlFor="ann-title" className="block text-xs font-semibold text-fg-2 mb-1">
              Başlık
            </label>
            <input
              id="ann-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'announcement' ? 'Örn. Cumartesi deneme sınavı' : 'Örn. Matematik ödevin hakkında'}
              className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ann-text" className="block text-xs font-semibold text-fg-2">
                Mesaj
              </label>
              <span className="text-[10px] text-muted tabular-nums">
                {text.length}/{TEXT_MAX}
              </span>
            </div>
            <textarea
              id="ann-text"
              value={text}
              maxLength={TEXT_MAX}
              rows={5}
              onChange={(e) => setText(e.target.value)}
              placeholder="Öğrencilerin okuyacağı metni yazın…"
              className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>
        </div>

        {/* Alıcılar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-fg-2">Kime gidecek?</span>
            <div className="inline-flex p-1 rounded-xl bg-surface-2 border border-line" role="tablist">
              {(
                [
                  { v: 'class', label: 'Sınıf seç', icon: School },
                  { v: 'student', label: 'Öğrenci seç', icon: Users },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="tab"
                  aria-selected={target === o.v}
                  id={`ann-target-${o.v}`}
                  onClick={() => setTarget(o.v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${target === o.v ? 'bg-indigo-600 text-white' : 'text-fg-2 hover:bg-surface-3'}`}
                >
                  <o.icon className="w-3.5 h-3.5" /> {o.label}
                </button>
              ))}
            </div>
          </div>

          {target === 'class' ? (
            usableClasses.length === 0 ? (
              <p className="text-xs text-muted">Öğrencisi olan sınıfınız bulunmuyor.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {usableClasses.map((c) => {
                    const on = classIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setClassIds(toggle(classIds, c.id))}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-surface text-fg-2 border-line hover:bg-surface-2'}`}
                      >
                        {c.name} <span className={on ? 'text-white/80' : 'text-muted'}>({classSize.get(c.id)})</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
                  onClick={() => setClassIds(classIds.length === usableClasses.length ? [] : usableClasses.map((c) => c.id))}
                >
                  {classIds.length === usableClasses.length ? 'Seçimi temizle' : 'Tüm sınıflarımı seç'}
                </button>
              </>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Öğrenci adı veya numarası ara…"
                    className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="bg-surface border border-line rounded-xl px-3 py-2 text-xs text-fg"
                  aria-label="Sınıfa göre süz"
                >
                  <option value="all">Tüm sınıflar</option>
                  {usableClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  className="font-semibold text-brand-fg hover:underline cursor-pointer"
                  onClick={() => setStudentIds(Array.from(new Set([...studentIds, ...visibleStudents.map((s) => s.id)])))}
                >
                  Listedekilerin hepsini seç
                </button>
                {studentIds.length > 0 && (
                  <button type="button" className="font-semibold text-muted hover:underline cursor-pointer" onClick={() => setStudentIds([])}>
                    Seçimi temizle
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line">
                {visibleStudents.length === 0 ? (
                  <p className="p-4 text-xs text-muted text-center">Öğrenci bulunamadı.</p>
                ) : (
                  visibleStudents.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-surface-2/60">
                      <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds(toggle(studentIds, s.id))} className="accent-indigo-600" />
                      <span className="flex-1 min-w-0 truncate text-fg font-medium">{s.name}</span>
                      <span className="text-muted shrink-0">{s.className}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
              feedback.tone === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/30 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.tone === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <span className="text-xs text-muted">
            {recipients.length > 0 ? (
              <>
                <strong className="text-fg">{recipients.length}</strong> öğrenciye gidecek
              </>
            ) : (
              'Alıcı seçilmedi'
            )}
          </span>
          <button type="submit" id="ann-send" disabled={!canSend} className="ui-btn ui-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-4 h-4" />
            <span>{sending ? 'Gönderiliyor…' : kind === 'announcement' ? 'Duyuruyu Gönder' : 'Notu Gönder'}</span>
          </button>
        </div>
      </form>

      {/* ===== Gönderilenler ===== */}
      <div className="lg:col-span-5 bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-card space-y-3">
        <h3 className="text-base font-bold text-fg">Gönderdiklerim</h3>
        {sent.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">Henüz duyuru veya not göndermediniz.</p>
        ) : (
          <ul className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
            {sent.map((g) => (
              <li key={g.groupId} className="p-3 rounded-xl border border-line bg-surface-2/50 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      g.kind === 'announcement' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                    }`}
                  >
                    {g.kind === 'announcement' ? 'Duyuru' : 'Not'}
                  </span>
                  <span className="text-[10px] text-muted font-mono">{fmtDate(g.createdAt)}</span>
                </div>
                <p className="text-sm font-bold text-fg leading-snug">{g.title}</p>
                <p className="text-xs text-fg-2 line-clamp-3 whitespace-pre-wrap">{g.text}</p>
                <p className="text-[11px] text-muted">
                  {g.studentIds.length === 1 ? g.studentNames[0] : `${g.studentIds.length} öğrenci`}
                  {g.classNames.length > 0 && g.classNames.length <= 3 ? ` · ${g.classNames.join(', ')}` : g.classNames.length > 3 ? ` · ${g.classNames.length} sınıf` : ''}
                </p>
                <div className="pt-1">
                  {confirmDeleteId === g.groupId ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-rose-700 dark:text-rose-300 font-semibold">Öğrencilerden de kaldırılsın mı?</span>
                      <button type="button" onClick={() => handleDelete(g.groupId)} className="font-bold text-rose-600 hover:underline cursor-pointer">
                        Evet, sil
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="font-semibold text-muted hover:underline cursor-pointer">
                        Vazgeç
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(g.groupId)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Sil
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
