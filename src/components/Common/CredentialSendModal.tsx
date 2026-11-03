import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Mail, MessageSquare, Send } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import type { Student, StudentCredential } from '../../types';
import { ParentChecklist, RelationChips, parentRelations, reachableIndexes } from './ParentPicker';
import {
  describeCredentialResult,
  mergeCredentialSummary,
  sendCredentials,
  type CredentialSendSummary,
  type CredentialTarget,
} from '../../lib/credentialSend';

// ============================================================================
// Aşama 142: GİRİŞ BİLGİSİ GÖNDER (SMS / e-posta; öğrenci ve/veya veli)
// • Giriş bilgileri penceresinden: şifreler elde olduğu için istekle gider.
// • Öğrenciler listesinden: sunucu kayıtlı ilk şifreyi kullanır; şifresini değiştirmiş öğrenci atlanır.
//   "Şifresini değiştirenlere yeni ilk şifre ver" işaretliyse onlara mevcut şifre verme yolu
//   (dataService.setStudentPassword → create-user, Aşama 145 kuralına uyan generatePassword) ile yeni şifre verilip gönderilir.
// Küçük pencere; tüm düğmeler h-8, eşit genişlikte.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const TOGGLE = 'ui-btn ui-btn-sm h-8 w-full justify-center';

export const CredentialSendModal: React.FC<{
  open: boolean;
  onClose: () => void;
  students: Student[];
  /** öğrenci id → şifre (giriş bilgileri penceresi). Yoksa sunucu kayıtlı ilk şifreyi kullanır. */
  passwords?: Map<string, string>;
  defaultChannel?: 'sms' | 'email';
  /** Öğrenciler listesinden açıldı: "yeni ilk şifre ver" seçeneği görünür */
  allowReset?: boolean;
  /** Yeni şifre verilen öğrenciler (pencere kapanınca giriş bilgileri penceresinde gösterilsin diye) */
  onNewCredentials?: (creds: StudentCredential[]) => void;
}> = ({ open, onClose, students, passwords, defaultChannel = 'sms', allowReset = false, onNewCredentials }) => {
  const [sms, setSms] = useState(defaultChannel === 'sms');
  const [email, setEmail] = useState(defaultChannel === 'email');
  const [toStudent, setToStudent] = useState(true);
  const [toVeli, setToVeli] = useState(true);
  const [rels, setRels] = useState<string[]>([]);
  const [veliSira, setVeliSira] = useState<number[]>([]);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ReturnType<typeof describeCredentialResult> | null>(null);
  const [newCreds, setNewCreds] = useState<StudentCredential[]>([]);

  const single = students.length === 1 ? students[0] : null;
  const relations = useMemo(() => (single ? [] : parentRelations(students)), [students, single]);
  const channels = useMemo(() => [...(sms ? (['sms'] as const) : []), ...(email ? (['mail'] as const) : [])], [sms, email]);

  useEffect(() => {
    if (!open) return;
    setSms(defaultChannel === 'sms');
    setEmail(defaultChannel === 'email');
    setToStudent(true);
    setToVeli(true);
    setRels([]);
    setReset(false);
    setBusy(false);
    setProgress('');
    setResult(null);
    setNewCreds([]);
  }, [open, defaultChannel]);

  // Tek öğrencide ulaşılabilen veliler işaretli gelir (kanal değişince yeniden)
  useEffect(() => {
    if (open && single) setVeliSira(reachableIndexes(single.parents, channels.length ? [...channels] : ['sms']));
  }, [open, single, channels]);

  const close = () => {
    if (busy) return;
    if (newCreds.length) onNewCredentials?.(newCreds);
    onClose();
  };

  // Sonuç geldikten sonra aynı pencereden ikinci kez gönderilmez (yanlışlıkla çift SMS önlenir)
  const canSend = !busy && !result && (sms || email) && (toStudent || (toVeli && (!single || veliSira.length > 0))) && students.length > 0;

  const run = async () => {
    if (!canSend) return;
    setBusy(true);
    setResult(null);
    const ch = { sms, email };
    const audience = {
      ogrenci: toStudent,
      veli: toVeli,
      ...(toVeli && single ? { veliSira } : {}),
      ...(toVeli && !single && rels.length ? { veliYakinlik: rels } : {}),
    };
    const targets: CredentialTarget[] = students.map((s) => {
      const pw = passwords?.get(s.id);
      return pw ? { type: 'student', id: s.id, password: pw } : { type: 'student', id: s.id };
    });
    try {
      setProgress(`Gönderiliyor (0/${targets.length})…`);
      const r: CredentialSendSummary = await sendCredentials(targets, ch, audience, (d, t) => setProgress(`Gönderiliyor (${d}/${t})…`));
      let newPasswords = 0;
      let resetFailed = 0;
      if (allowReset && reset && r.ok && r.noPassword.length) {
        // Şifresi kayıtlı olmayanlara yeni ilk şifre (sırayla; her biri create-user çağrısı)
        const ids = [...r.noPassword];
        const created: StudentCredential[] = [];
        for (let i = 0; i < ids.length; i++) {
          setProgress(`Yeni ilk şifre veriliyor (${i + 1}/${ids.length})…`);
          try {
            created.push(await dataService.setStudentPassword(ids[i]));
          } catch {
            resetFailed += 1;
          }
        }
        newPasswords = created.length;
        if (created.length) {
          setNewCreds((prev) => [...prev, ...created]);
          r.noPassword = ids.filter((id) => !created.some((c) => c.student.id === id));
          const second = await sendCredentials(
            created.map((c) => ({ type: 'student', id: c.student.id, password: c.password })),
            ch,
            audience,
            (d, t) => setProgress(`Yeni şifreler gönderiliyor (${d}/${t})…`)
          );
          mergeCredentialSummary(r, second);
          if (!second.ok) {
            r.ok = false;
            r.error = second.error;
          }
        }
      }
      setResult(describeCredentialResult(r, { newPasswords, resetFailed }));
    } catch (e: any) {
      setResult([{ tone: 'danger', text: e?.message || 'Gönderim tamamlanamadı.' }]);
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const title = single ? `Giriş bilgisi gönder: ${single.name}` : `Giriş bilgisi gönder (${students.length} öğrenci)`;
  return (
    <Modal
      open={open}
      onClose={close}
      icon={KeyRound}
      title={title}
      size="sm"
      id="giris-bilgisi-gonder"
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={close} disabled={busy}>
            {result ? 'Kapat' : 'Vazgeç'}
          </button>
          <button type="button" id="giris-bilgisi-gonder-btn" className={cx(BTN, 'ui-btn-primary')} disabled={!canSend} onClick={run}>
            <Send className="w-3.5 h-3.5" /> {busy ? 'Gönderiliyor' : 'Gönder'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-fg-2">
        <div className="space-y-1.5">
          <p className="font-semibold text-fg">Gönderim yolu</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Gönderim yolu">
            <button type="button" id="gb-kanal-sms" className={cx(TOGGLE, sms ? 'ui-btn-primary' : 'ui-btn-secondary')} aria-pressed={sms} onClick={() => setSms((v) => !v)} disabled={busy}>
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </button>
            <button type="button" id="gb-kanal-eposta" className={cx(TOGGLE, email ? 'ui-btn-primary' : 'ui-btn-secondary')} aria-pressed={email} onClick={() => setEmail((v) => !v)} disabled={busy}>
              <Mail className="w-3.5 h-3.5" /> E-posta
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="font-semibold text-fg">Alıcı</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Alıcı">
            <button type="button" id="gb-alici-ogrenci" className={cx(TOGGLE, toStudent ? 'ui-btn-primary' : 'ui-btn-secondary')} aria-pressed={toStudent} onClick={() => setToStudent((v) => !v)} disabled={busy}>
              Öğrenci
            </button>
            <button type="button" id="gb-alici-veli" className={cx(TOGGLE, toVeli ? 'ui-btn-primary' : 'ui-btn-secondary')} aria-pressed={toVeli} onClick={() => setToVeli((v) => !v)} disabled={busy}>
              Veli
            </button>
          </div>
        </div>

        {toVeli && single && (single.parents?.length || 0) > 0 && (
          <div className="space-y-1.5">
            <p className="font-semibold text-fg">Hangi veliler?</p>
            <ParentChecklist parents={single.parents || []} channels={channels.length ? [...channels] : ['sms']} value={veliSira} onChange={setVeliSira} idPrefix="gb-veli-sec" />
          </div>
        )}
        {toVeli && single && !(single.parents?.length) && <p className="text-warning-fg">Bu öğrencinin kayıtlı velisi yok.</p>}
        {toVeli && !single && relations.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-semibold text-fg">Hangi veliler?</p>
            <RelationChips relations={relations} value={rels} onChange={setRels} idPrefix="gb-veli-yakinlik" />
          </div>
        )}

        {allowReset && (
          <label className="flex items-start gap-2 cursor-pointer" htmlFor="gb-yeni-sifre">
            <input id="gb-yeni-sifre" type="checkbox" className="mt-0.5 accent-indigo-600" checked={reset} onChange={(e) => setReset(e.target.checked)} disabled={busy} />
            <span>
              <strong className="text-fg">Şifresini değiştirenlere yeni ilk şifre ver.</strong> Bu öğrencilerin mevcut şifresi değişir; yeni şifre
              gönderilir ve ilk girişte değiştirmeleri istenir.
            </span>
          </label>
        )}
        {allowReset && !reset && (
          <p className="leading-relaxed text-muted">İlk şifresi kayıtlı olmayan (şifresini değiştirmiş) öğrencilere gönderilmez, sonuçta sayılır.</p>
        )}

        {progress && (
          <p className="text-muted" role="status">
            {progress}
          </p>
        )}
        {result && (
          <ul className="space-y-1" id="giris-bilgisi-sonuc" role="status">
            {result.map((l, i) => (
              <li
                key={i}
                className={cx(
                  'rounded-lg px-2.5 py-1.5 leading-relaxed',
                  l.tone === 'success' ? 'bg-success-soft text-success-fg' : l.tone === 'danger' ? 'bg-danger-soft text-danger-fg' : 'bg-warning-soft text-warning-fg'
                )}
              >
                {l.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default CredentialSendModal;
