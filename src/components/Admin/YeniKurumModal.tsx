import React, { useRef, useState } from 'react';
import { Building2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { dataService, KURUM_MODULES } from '../../services/dataService';
import type { KurumModule } from '../../types';
import { imageFileToLogo } from '../../lib/kurumSettings';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { MailOptIn } from '../Teacher/FormParts';
import { KURUM_AC_STEPS, openKurum, type KurumAcResult, type KurumAcStep } from '../../lib/kurumAc';

// ============================================================================
// Aşama 95: "Yeni kurum" sihirbazı — tek pencerede kurum adı, kurum yöneticisi, bölümler ve logo.
// Kod yalnızca düğmeye basınca yüklenir (Kurumlar bölümünün ilk açılışı ağırlaşmaz).
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const INPUT = 'ui-input h-8 py-0 text-xs w-full';
const LABEL = 'block text-[11px] font-bold text-fg-2 mb-1';

const toUsername = (name: string) =>
  name
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);

const allModules = (): Partial<Record<KurumModule, boolean>> => Object.fromEntries(KURUM_MODULES.map((m) => [m.key, true]));

export const YeniKurumModal: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({ open, onClose, onDone }) => {
  const [kurumName, setKurumName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [username, setUsername] = useState('');
  const [userTouched, setUserTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => dataService.generatePassword(10));
  const [modules, setModules] = useState(allModules);
  const [logo, setLogo] = useState('');
  const [sendMail, setSendMail] = useState(true);
  const [step, setStep] = useState<KurumAcStep | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<(KurumAcResult & { kurumName: string }) | null>(null);
  const [mailNote, setMailNote] = useState<{ tone: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const busy = step !== null;
  const nMod = KURUM_MODULES.filter((m) => modules[m.key]).length;
  const ready = kurumName.trim().length >= 2 && adminName.trim().length >= 3 && username.trim().length >= 3 && password.trim().length >= 6 && nMod > 0;

  const pickLogo = async (f?: File | null) => {
    if (!f) return;
    setErr(null);
    try {
      setLogo(await imageFileToLogo(f));
    } catch (e: any) {
      setErr(e?.message || 'Logo okunamadı.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async () => {
    if (!ready || busy) return;
    setErr(null);
    try {
      const res = await openKurum({ kurumName, adminName, username, email, password, modules, logo: logo || undefined }, setStep);
      setDone({ ...res, kurumName: kurumName.trim().replace(/\s+/g, ' ') });
      onDone();
      if (sendMail && email.trim()) {
        setMailNote({ tone: 'info', text: 'Giriş bilgileri yöneticiye e-postayla gönderiliyor…' });
        callMail('teacher-account', { teacherId: res.teacherId, kind: 'created', password: res.password })
          .then((r) => setMailNote(describeMailResult(r)))
          .catch(() => setMailNote({ tone: 'warning', text: 'E-posta gönderilemedi; bilgileri kopyalayıp iletin.' }));
      }
    } catch (e: any) {
      setErr(e?.message || 'Kurum açılamadı.');
    } finally {
      setStep(null);
    }
  };

  const credText = done
    ? `Merhaba ${done.adminName},\n"${done.kurumName}" kurumunuz Eğitim & Öğrenci Takip Sistemi'nde açıldı.\nAdres: ${window.location.origin}\nGiriş ekranında "Öğretmen" sekmesini seçiniz.\nKullanıcı adı: ${done.username}\nŞifre: ${done.password}\nGiriş yaptıktan sonra profil menüsünden şifrenizi değiştiriniz.`
    : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credText);
      setCopied(true);
    } catch {
      window.prompt('Kopyalamak için metni seçiniz:', credText);
    }
  };

  const close = () => !busy && onClose();

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop={false}
      size="sm"
      id="yeni-kurum"
      icon={Building2}
      title="Yeni kurum"
      description={done ? 'Kurum açıldı.' : 'Kurum ve kurum yöneticisi tek adımda açılır.'}
      footer={
        done ? (
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => void copy()} id="yeni-kurum-kopyala">
              {copied ? 'Kopyalandı' : 'Bilgileri kopyala'}
            </button>
            <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={onClose} id="yeni-kurum-kapat">
              Kapat
            </button>
          </>
        ) : (
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={busy} onClick={onClose}>
              Vazgeç
            </button>
            <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={busy || !ready} onClick={() => void run()} id="yeni-kurum-ac">
              {busy ? 'Açılıyor…' : 'Kurumu aç'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-2.5 text-xs" id="yeni-kurum-sonuc">
          <p className="flex items-start gap-2 rounded-lg bg-success-soft text-success-fg px-2.5 py-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              "{done.kurumName}" açıldı; yöneticisi {done.adminName}. Şifre saklanmaz, pencereyi kapatmadan önce yöneticiye iletin.
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <span className="block text-[10px] text-muted">Kullanıcı adı</span>
              <span className="font-mono font-bold text-fg select-all">{done.username}</span>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <span className="block text-[10px] text-muted">Şifre</span>
              <span className="font-mono font-bold text-fg select-all">{done.password}</span>
            </div>
          </div>
          {mailNote && (
            <p className={cx('rounded-lg px-2.5 py-1.5', mailNote.tone === 'success' ? 'bg-success-soft text-success-fg' : mailNote.tone === 'danger' ? 'bg-danger-soft text-danger-fg' : mailNote.tone === 'warning' ? 'bg-warning-soft text-warning-fg' : 'bg-info-soft text-info-fg')}>
              E-posta: {mailNote.text}
            </p>
          )}
          {done.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-lg bg-warning-soft text-warning-fg px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </p>
          ))}
          <p className="text-muted">
            Sonraki adım: kurum yöneticisi kendi öğretmen, sınıf ve öğrencilerini ekler. Rol yetkileri anahtarını roller verildikten sonra "Kurum Ayarları"ndan açın.
          </p>
        </div>
      ) : (
        <form
          className="space-y-3 text-xs"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="yk-ad">
                Kurum adı
              </label>
              <input id="yk-ad" type="text" className={INPUT} value={kurumName} maxLength={120} onChange={(e) => setKurumName(e.target.value)} placeholder="Örn: Işık Eğitim Kurumları" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL} htmlFor="yk-yonetici">
                  Yönetici ad soyad
                </label>
                <input
                  id="yk-yonetici" type="text"
                  className={INPUT}
                  value={adminName}
                  onChange={(e) => {
                    setAdminName(e.target.value);
                    if (!userTouched) setUsername(toUsername(e.target.value));
                  }}
                  placeholder="Örn: Ayşe Demir"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="yk-kad">
                  Kullanıcı adı
                </label>
                <input
                  id="yk-kad" type="text"
                  className={cx(INPUT, 'font-mono')}
                  value={username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setUserTouched(true);
                    setUsername(e.target.value.toLowerCase());
                  }}
                  placeholder="aysedemir"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="yk-eposta">
                  E-posta
                </label>
                <input id="yk-eposta" type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isteğe bağlı" />
              </div>
              <div>
                <label className={LABEL} htmlFor="yk-sifre">
                  Giriş şifresi
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="yk-sifre" type="text"
                    className={cx(INPUT, 'font-mono')}
                    value={password}
                    minLength={6}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-14 justify-center shrink-0" onClick={() => setPassword(dataService.generatePassword(10))} title="Yeni şifre üret">
                    Üret
                  </button>
                </div>
              </div>
            </div>

            <div>
              <span className={LABEL}>
                Bölümler <span className="font-normal text-muted">({nMod} / {KURUM_MODULES.length})</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {KURUM_MODULES.map((m) => (
                  <label
                    key={m.key}
                    title={m.description}
                    className={cx('flex items-center gap-1.5 rounded-lg border px-2 h-8 cursor-pointer', modules[m.key] ? 'border-brand bg-brand-soft' : 'border-line bg-surface')}
                  >
                    <input type="checkbox" data-module={m.key} checked={!!modules[m.key]} onChange={(e) => setModules((p) => ({ ...p, [m.key]: e.target.checked }))} />
                    <span className="truncate text-fg">{m.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-fg-2 w-12" title="İsteğe bağlı; sonradan Kurum Ayarları'ndan da eklenir">Logo</span>
              {logo ? (
                <img src={logo} alt="Kurum logosu" className="h-8 w-8 rounded-md border border-line object-contain bg-white" />
              ) : (
                <span className="h-8 w-8 rounded-md border border-dashed border-line" aria-hidden />
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pickLogo(e.target.files?.[0])} id="yk-logo" />
              <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => fileRef.current?.click()}>
                {logo ? 'Değiştir' : 'Logo seç'}
              </button>
              {logo && (
                <button type="button" className={cx(BTN, 'ui-btn-ghost')} onClick={() => setLogo('')}>
                  Kaldır
                </button>
              )}
            </div>

            <MailOptIn
              id="yk-mail"
              checked={sendMail}
              onChange={setSendMail}
              label="Giriş bilgilerini yöneticiye e-postayla gönder"
              hint={email.trim() ? 'Kullanıcı adı, şifre ve giriş adresi gider.' : 'Göndermek için yöneticinin e-posta adresini yazın.'}
            />
          </fieldset>

          {busy && step && (
            <p className="rounded-lg bg-info-soft text-info-fg px-2.5 py-1.5 font-semibold" role="status" id="yeni-kurum-adim">
              {KURUM_AC_STEPS[step]}
            </p>
          )}
          {err && (
            <p role="alert" className="font-semibold text-danger-fg bg-danger-soft rounded-lg px-2.5 py-1.5" id="yeni-kurum-hata">
              {err}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
};
