import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Search, Users, CheckCircle2, AlertCircle, School, Mail, MessageSquare, AlertTriangle } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { callMail } from '../../lib/mailApi';
import type { MailResult } from '../../lib/mailApi';
import { useAutoDismiss } from '../../lib/useAutoDismiss';

// ============================================================================
// VELİ DUYURUSU (Aşama 73)
// Öğretmen, seçtiği sınıf ya da öğrencilerin velilerine e-posta ve/veya SMS ile duyuru gönderir.
// Veli bilgileri öğrenci kaydındaki "Veliler" bölümünden alınır. Alıcıları sunucu bulur ve yetkiyi denetler.
// ============================================================================

const SUBJECT_MAX = 100;
const TEXT_MAX = 1500;
const SMS_MAX = 270;

type Target = 'class' | 'student';

const newSendId = () => {
  try {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === 'function') return String(c.randomUUID());
  } catch {
    /* eski tarayıcı: aşağıdaki yedek kullanılır */
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// Cep telefonu mu (05XXXXXXXXX)? SMS yalnızca cep numaralarına gider.
const mobileKey = (raw?: string) => {
  let d = String(raw || '').replace(/\D+/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? d : '';
};
const mailKey = (raw?: string) => {
  const e = String(raw || '').trim().toLowerCase();
  return /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : '';
};

export const ParentAnnouncements: React.FC = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);

  const students = useMemo(() => dataService.getStudents(), [tick]);
  const classes = useMemo(() => dataService.getClasses(), [tick]);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [useMail, setUseMail] = useState(true);
  const [useSms, setUseSms] = useState(false);
  const [target, setTarget] = useState<Target>('class');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning' | 'danger'; lines: string[] } | null>(null);
  useAutoDismiss(feedback, () => setFeedback(null), 60_000);

  const classSize = useMemo(() => {
    const m = new Map<string, number>();
    students.forEach((s) => m.set(s.classId, (m.get(s.classId) || 0) + 1));
    return m;
  }, [students]);
  const usableClasses = useMemo(
    () => classes.filter((c) => (classSize.get(c.id) || 0) > 0).sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
    [classes, classSize]
  );

  const recipients = useMemo(() => {
    if (target === 'class') return students.filter((s) => classIds.includes(s.classId));
    const set = new Set(studentIds);
    return students.filter((s) => set.has(s.id));
  }, [target, students, classIds, studentIds]);

  // Önizleme: kaç veliye gidecek, hangi öğrencilerin uygun veli bilgisi yok
  const preview = useMemo(() => {
    const mails = new Set<string>();
    const phones = new Set<string>();
    const noContact: string[] = [];
    for (const s of recipients) {
      let any = false;
      for (const p of s.parents || []) {
        const em = mailKey(p.email);
        const ph = mobileKey(p.phone);
        if (useMail && em) {
          mails.add(em);
          any = true;
        }
        if (useSms && ph) {
          phones.add(ph);
          any = true;
        }
      }
      if (!any) noContact.push(`${s.name}${s.className ? ` (${s.className})` : ''}`);
    }
    return { mails: mails.size, phones: phones.size, noContact };
  }, [recipients, useMail, useSms]);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return students
      .filter((s) => (studentClassFilter === 'all' ? true : s.classId === studentClassFilter))
      .filter((s) => !q || s.name.toLocaleLowerCase('tr-TR').includes(q) || String(s.studentNumber || '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [students, search, studentClassFilter]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // Gönderim kimliği: form değişmediği sürece aynı kalır (çift tıklamada aynı kişiye iki kez gitmez).
  // Metin, başlık, alıcı ya da yol değişirse yeni bir duyuru sayılır.
  const sendIdRef = useRef<string>(newSendId());
  const formKey = `${subject}|${message}|${useMail}|${useSms}|${recipients.map((s) => s.id).join(',')}`;
  const lastKeyRef = useRef(formKey);
  if (lastKeyRef.current !== formKey) {
    lastKeyRef.current = formKey;
    sendIdRef.current = newSendId();
  }

  const smsTooLong = useSms && message.length > SMS_MAX;
  const nobodyToSend = (useMail ? preview.mails : 0) + (useSms ? preview.phones : 0) === 0;
  const canAsk =
    !sending &&
    (useMail || useSms) &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !smsTooLong &&
    recipients.length > 0 &&
    !nobodyToSend;

  const buildResult = (r: MailResult) => {
    const lines: string[] = [];
    let tone: 'success' | 'warning' | 'danger' = 'success';
    if (!r.ok) {
      return { tone: 'danger' as const, lines: [`Gönderilemedi: ${r.error || 'bilinmeyen hata'}`] };
    }
    if (useMail) {
      if (r.notConfigured) {
        lines.push('E-posta gönderilmedi: e-posta hesabı ayarlanmamış (profil menüsünden "E-posta Ayarları").');
        tone = 'danger';
      } else if (r.authError) {
        lines.push(`E-posta gönderilemedi: ${(r.errors && r.errors[0]) || 'Gmail girişi reddedildi.'}`);
        tone = 'danger';
      } else {
        const parts: string[] = [];
        if (r.sent) parts.push(`${r.sent} veliye e-posta gönderildi`);
        if (r.skipped) parts.push(`${r.skipped} veliye bu duyuru zaten gönderilmişti`);
        if (r.failed) {
          parts.push(`${r.failed} e-posta gönderilemedi${r.errors && r.errors[0] ? ` (${r.errors[0]})` : ''}`);
          tone = 'danger';
        }
        if (r.remaining) {
          parts.push(`${r.remaining} e-posta sırada kaldı; aynı duyuruyu tekrar gönderin, gidenlere ikinci kez gitmez`);
          tone = 'danger';
        }
        if (parts.length) lines.push(parts.join(' · ') + '.');
        else if (r.announce && r.announce.mailRecipients === 0) lines.push('E-posta adresi kayıtlı veli bulunamadı.');
      }
    }
    if (useSms) {
      const s = r.sms as any;
      if (!s) lines.push('SMS durumu alınamadı.');
      else if (!s.available) {
        lines.push(`SMS gönderilmedi: ${s.error || 'SMS ayarlı değil'}`);
        if (tone === 'success') tone = 'warning';
      } else {
        const parts: string[] = [];
        if (s.sent) parts.push(`${s.sent} veliye SMS gönderildi`);
        if (s.dry) {
          parts.push(`${s.dry} SMS DENEME MODUNDA kaydedildi (gerçekte gitmedi)`);
          if (tone === 'success') tone = 'warning';
        }
        if (s.skipped) parts.push(`${s.skipped} numaraya bu duyuru zaten gönderilmişti`);
        if (s.limited) {
          parts.push(`günlük SMS sınırı nedeniyle ${s.limited} SMS gönderilmedi`);
          tone = 'danger';
        }
        if (s.failed) {
          parts.push(`${s.failed} SMS gönderilemedi${s.errors && s.errors[0] ? ` (${s.errors[0]})` : ''}`);
          tone = 'danger';
        }
        if (!parts.length) parts.push('SMS gönderilecek cep numarası bulunamadı');
        lines.push(parts.join(' · ') + '.');
      }
    }
    if (r.announce && r.announce.noContact) {
      lines.push(
        `${r.announce.noContact} öğrencinin seçtiğiniz yola uygun veli bilgisi yok${
          r.announce.noContactNames && r.announce.noContactNames.length ? `: ${r.announce.noContactNames.slice(0, 8).join(', ')}${r.announce.noContact > 8 ? '…' : ''}` : ''
        }.`
      );
      if (tone === 'success') tone = 'warning';
    }
    if (r.announce && r.announce.notVisible) lines.push(`${r.announce.notVisible} öğrenciye erişiminiz olmadığı için atlandı.`);
    return { tone, lines };
  };

  const handleSend = async () => {
    if (!canAsk) return;
    setConfirming(false);
    setSending(true);
    setFeedback(null);
    try {
      const r = await callMail('parent-announce', {
        sendId: sendIdRef.current,
        studentIds: recipients.map((s) => s.id),
        subject: subject.trim(),
        message: message.trim(),
        channels: { email: useMail, sms: useSms },
      });
      const res = buildResult(r);
      setFeedback(res);
      // Tamamı gittiyse formu temizle (yeni duyuru için yeni kimlik); yarım kaldıysa aynı kimlikle tekrar denenebilir
      if (res.tone !== 'danger' && r.ok && !r.remaining) {
        setSubject('');
        setMessage('');
        setClassIds([]);
        setStudentIds([]);
      }
    } catch (err: any) {
      setFeedback({ tone: 'danger', lines: [String(err?.message || 'Gönderilemedi.')] });
    } finally {
      setSending(false);
    }
  };

  const limit = useSms ? SMS_MAX : TEXT_MAX;
  const toneBox = (tone: string) =>
    tone === 'success'
      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
      : tone === 'warning'
        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500/30 text-amber-800 dark:text-amber-300'
        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/30 text-rose-800 dark:text-rose-300';

  return (
    <div className="max-w-3xl" id="parent-announcements">
      <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-card space-y-5">
        <div>
          <h3 className="text-base font-bold text-fg">Velilere duyuru gönder</h3>
          <p className="text-xs text-muted mt-0.5">
            Mesaj, seçtiğiniz öğrencilerin velilerine (öğrenci kaydındaki Veliler bölümü) e-posta ve/veya SMS ile gider. Veli bilgisi olmayan öğrenciler atlanır.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-fg-2">Hangi yoldan gitsin?</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${useMail ? 'border-indigo-500 bg-indigo-500/10' : 'border-line bg-surface-2/50 hover:bg-surface-2'}`}
            >
              <input type="checkbox" checked={useMail} onChange={(e) => setUseMail(e.target.checked)} className="accent-indigo-600" id="pa-use-mail" />
              <Mail className="w-5 h-5 shrink-0 text-fg-2" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-fg">E-posta</span>
                <span className="block text-[11px] text-muted">Uzun metin yazılabilir ({TEXT_MAX} karakter)</span>
              </span>
            </label>
            <label
              className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${useSms ? 'border-indigo-500 bg-indigo-500/10' : 'border-line bg-surface-2/50 hover:bg-surface-2'}`}
            >
              <input type="checkbox" checked={useSms} onChange={(e) => setUseSms(e.target.checked)} className="accent-indigo-600" id="pa-use-sms" />
              <MessageSquare className="w-5 h-5 shrink-0 text-fg-2" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-fg">SMS</span>
                <span className="block text-[11px] text-muted">Kısa metin ({SMS_MAX} karakter), yalnızca cep numaralarına</span>
              </span>
            </label>
          </div>
          {useSms && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>SMS’e öğrencinin notu, puanı, devamsızlığı gibi kişisel bilgi yazmayın. Mesajın başına okulun adı otomatik eklenir.</span>
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="pa-subject" className="block text-xs font-semibold text-fg-2 mb-1">
              Başlık (e-postanın konusu)
            </label>
            <input
              id="pa-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Örn. Veli toplantısı hakkında"
              className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="pa-text" className="block text-xs font-semibold text-fg-2">
                Mesaj
              </label>
              <span className={`text-[10px] tabular-nums ${smsTooLong ? 'text-rose-600 font-bold' : 'text-muted'}`}>
                {message.length}/{limit}
              </span>
            </div>
            <textarea
              id="pa-text"
              value={message}
              maxLength={TEXT_MAX}
              rows={5}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Velilerin okuyacağı metni yazın…"
              className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
            {smsTooLong && <p className="text-[11px] text-rose-600 mt-1">SMS için mesaj en çok {SMS_MAX} karakter olabilir. Mesajı kısaltın ya da SMS’i kapatın.</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-fg-2">Hangi öğrencilerin velilerine?</span>
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
                  id={`pa-target-${o.v}`}
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

        <div className="rounded-xl border border-line bg-surface-2/50 p-3 text-xs space-y-1.5" id="pa-preview">
          <div className="font-semibold text-fg">Önizleme</div>
          {recipients.length === 0 ? (
            <p className="text-muted">Henüz öğrenci seçilmedi.</p>
          ) : (
            <>
              <p className="text-fg-2">
                <strong className="text-fg">{recipients.length}</strong> öğrenci seçildi.
                {useMail && (
                  <>
                    {' '}
                    <strong className="text-fg">{preview.mails}</strong> veliye e-posta
                  </>
                )}
                {useMail && useSms && ','}
                {useSms && (
                  <>
                    {' '}
                    <strong className="text-fg">{preview.phones}</strong> veliye SMS
                  </>
                )}{' '}
                gidecek.
              </p>
              {preview.noContact.length > 0 && (
                <details className="text-amber-800 dark:text-amber-300">
                  <summary className="cursor-pointer font-semibold">
                    {preview.noContact.length} öğrencinin seçtiğiniz yola uygun veli bilgisi yok (gönderilmeyecek)
                  </summary>
                  <p className="mt-1 text-[11px] leading-relaxed">{preview.noContact.join(', ')}</p>
                </details>
              )}
            </>
          )}
        </div>

        {feedback && (
          <div role="status" className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${toneBox(feedback.tone)}`}>
            {feedback.tone === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <div className="space-y-1 min-w-0">
              {feedback.lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}

        {confirming ? (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
            <span className="text-xs text-fg">
              {useMail && <strong>{preview.mails} veliye e-posta</strong>}
              {useMail && useSms && ' ve '}
              {useSms && <strong>{preview.phones} veliye SMS</strong>} gönderilecek. Onaylıyor musunuz?
            </span>
            <span className="flex items-center gap-2">
              <button type="button" className="ui-btn" onClick={() => setConfirming(false)} id="pa-cancel">
                Vazgeç
              </button>
              <button type="button" className="ui-btn ui-btn-primary" onClick={handleSend} id="pa-confirm">
                <Send className="w-4 h-4" />
                <span>Evet, gönder</span>
              </button>
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <button
              type="button"
              id="pa-send"
              disabled={!canAsk}
              onClick={() => setConfirming(true)}
              className="ui-btn ui-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Gönderiliyor…' : 'Velilere Gönder'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
