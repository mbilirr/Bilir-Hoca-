import React, { useDeferredValue, useMemo, useState } from 'react';
import { Check, Copy, Mail, MessageSquare, Send } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { appCopyFallback } from '../../lib/appDialog';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import { mergeCredentialSummary } from '../../lib/credentialSend';
import { describeTeacherCredentialResult, sendTeacherCredentials } from '../../lib/teacherCredentialSend';

// ============================================================================
// Aşama 144: ÖĞRETMENLERE GİRİŞ BİLGİSİ GÖNDER (öğretmen listesinden, sonradan)
// Sunucu kayıtlı ilk şifreyi kullanır; şifresini değiştirmiş öğretmen atlanır.
// "Şifresini değiştirenlere yeni ilk şifre ver" işaretliyse onlara yeni şifre verilip gönderilir
// (düzenleme penceresindeki şifre verme yolu; Aşama 145 kuralına uyan generatePassword).
// Küçük pencere; düğmeler h-8, eşit genişlikte.
// ============================================================================

export interface TeacherSendRow {
  id: string;
  name: string;
  branch?: string;
  username?: string;
  phone: string;
  email: string;
}

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const TOGGLE = 'ui-btn ui-btn-sm h-8 w-full justify-center';

const TeacherCredentialSendContent: React.FC<{ onClose: () => void; teachers: TeacherSendRow[] }> = ({ onClose, teachers }) => {
  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(false);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ReturnType<typeof describeTeacherCredentialResult> | null>(null);
  const [newCreds, setNewCreds] = useState<Array<{ name: string; username: string; password: string }>>([]);
  const [copied, setCopied] = useState(false);

  const shown = useMemo(
    () => (dq.trim() ? teachers.filter((t) => matchTurkishSearch(t.name, dq) || matchTurkishSearch(t.branch || '', dq)) : teachers),
    [teachers, dq]
  );
  const allShownPicked = shown.length > 0 && shown.every((t) => picked.has(t.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shown.forEach((t) => next.delete(t.id));
      else shown.forEach((t) => next.add(t.id));
      return next;
    });

  const canSend = !busy && !result && (sms || email) && picked.size > 0;

  const run = async () => {
    if (!canSend) return;
    setBusy(true);
    const ch = { sms, email };
    const ids = teachers.filter((t) => picked.has(t.id)).map((t) => t.id);
    try {
      setProgress(`Gönderiliyor (0/${ids.length})…`);
      const r = await sendTeacherCredentials(ids.map((id) => ({ id })), ch, (d, t) => setProgress(`Gönderiliyor (${d}/${t})…`));
      let newPasswords = 0;
      let resetFailed = 0;
      if (reset && r.ok && r.noPassword.length) {
        const need = [...r.noPassword];
        const given: Array<{ id: string; name: string; username: string; password: string }> = [];
        for (let i = 0; i < need.length; i++) {
          setProgress(`Yeni ilk şifre veriliyor (${i + 1}/${need.length})…`);
          const t = teachers.find((x) => x.id === need[i]);
          const password = dataService.generatePassword();
          try {
            await dataService.adminUpdateUserProfile(need[i], { newPassword: password });
            given.push({ id: need[i], name: t?.name || '', username: t?.username || '', password });
          } catch {
            resetFailed += 1;
          }
        }
        newPasswords = given.length;
        if (given.length) {
          setNewCreds(given.map(({ name, username, password }) => ({ name, username, password })));
          r.noPassword = need.filter((id) => !given.some((g) => g.id === id));
          const second = await sendTeacherCredentials(
            given.map((g) => ({ id: g.id, password: g.password })),
            ch,
            (d, t) => setProgress(`Yeni şifreler gönderiliyor (${d}/${t})…`)
          );
          mergeCredentialSummary(r, second);
          if (!second.ok) {
            r.ok = false;
            r.error = second.error;
          }
        }
      }
      setResult(describeTeacherCredentialResult(r, { newPasswords, resetFailed }));
    } catch (e: any) {
      setResult([{ tone: 'danger', text: e?.message || 'Gönderim tamamlanamadı.' }]);
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const copyNew = async () => {
    const text = newCreds.map((c) => `${c.name}\nKullanıcı adı: ${c.username}\nŞifre: ${c.password}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await appCopyFallback('Yeni şifreler', text);
    }
    setCopied(true);
  };

  const footer = (
    <>
      <button type="button" className={`${BTN} ui-btn-secondary`} onClick={onClose} disabled={busy}>
        {result ? 'Kapat' : 'Vazgeç'}
      </button>
      {!result && (
        <button type="button" id="ogretmen-giris-gonder" className={`${BTN} ui-btn-primary`} disabled={!canSend} onClick={() => void run()}>
          <Send className="w-3.5 h-3.5" />
          <span>Gönder</span>
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      closeOnBackdrop={false}
      icon={Send}
      size="md"
      title="Giriş Bilgisi Gönder"
      description="Öğretmenlere kullanıcı adı ve ilk şifre SMS / e-postayla gönderilir."
      footer={footer}
      id="ogretmen-giris-pencere"
    >
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={sms} disabled={busy || !!result} onClick={() => setSms((v) => !v)} className={cx(TOGGLE, sms ? 'ui-btn-primary' : 'ui-btn-secondary')}>
            <MessageSquare className="w-3.5 h-3.5" />
            <span>SMS</span>
          </button>
          <button type="button" aria-pressed={email} disabled={busy || !!result} onClick={() => setEmail((v) => !v)} className={cx(TOGGLE, email ? 'ui-btn-primary' : 'ui-btn-secondary')}>
            <Mail className="w-3.5 h-3.5" />
            <span>E-posta</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Öğretmen ara"
            className="h-8 flex-1 px-2.5 bg-canvas border border-line rounded-lg text-fg text-xs focus:outline-none focus:border-indigo-500"
            disabled={busy || !!result}
          />
          <button type="button" className={`${BTN} ui-btn-secondary`} onClick={toggleAll} disabled={busy || !!result || !shown.length}>
            {allShownPicked ? 'Seçimi Kaldır' : 'Tümünü Seç'}
          </button>
        </div>

        <div className="border border-line rounded-xl max-h-[40vh] overflow-y-auto divide-y divide-line" role="group" aria-label="Öğretmenler">
          {shown.length === 0 && <div className="p-3 text-muted">Öğretmen bulunamadı.</div>}
          {shown.map((t) => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-2">
              <input type="checkbox" className="w-3.5 h-3.5" checked={picked.has(t.id)} onChange={() => toggle(t.id)} disabled={busy || !!result} />
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-fg">{t.name}</span>
                {t.branch ? <span className="text-muted"> · {t.branch}</span> : null}
              </span>
              <span className={cx('text-[11px]', sms && !t.phone ? 'text-warning-fg' : 'text-muted')}>{t.phone || 'telefon yok'}</span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-fg-2 select-none">
          <input type="checkbox" className="w-3.5 h-3.5" checked={reset} onChange={(e) => setReset(e.target.checked)} disabled={busy || !!result} />
          <span>Şifresini değiştirmiş olanlara yeni ilk şifre ver ve gönder</span>
        </label>

        <div className="text-muted">{picked.size} öğretmen seçili</div>
        {progress && <div className="text-muted" aria-live="polite">{progress}</div>}
        {result && (
          <ul className="space-y-1" aria-live="polite">
            {result.map((l, i) => (
              <li key={i} className={cx('p-2 rounded-lg', l.tone === 'success' ? 'bg-success-soft text-success-fg' : l.tone === 'warning' ? 'bg-warning-soft text-warning-fg' : 'bg-danger-soft text-danger-fg')}>
                {l.text}
              </li>
            ))}
          </ul>
        )}
        {newCreds.length > 0 && (
          <div className="p-2.5 rounded-lg bg-surface-2 space-y-1.5">
            <div className="font-bold text-fg">Yeni verilen şifreler (bir daha gösterilmez)</div>
            {newCreds.map((c, i) => (
              <div key={i} className="flex justify-between gap-2 font-mono">
                <span className="truncate">{c.name} · {c.username}</span>
                <span className="font-bold text-amber-700 dark:text-amber-300">{c.password}</span>
              </div>
            ))}
            <button type="button" className={`${BTN} ui-btn-secondary`} onClick={() => void copyNew()}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Kopyala</span>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export const TeacherCredentialSendModal: React.FC<{ open: boolean; onClose: () => void; teachers: TeacherSendRow[] }> = ({ open, ...rest }) =>
  open ? <TeacherCredentialSendContent {...rest} /> : null;
