import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, X, Share, PlusSquare } from 'lucide-react';
import { disablePush, enablePush, getPushState, resyncPush, testPush, type PushState } from '../../lib/push';

// ============================================================================
// "Telefonuma bildirim gönder" kartı (Aşama 34) — öğrenci ve öğretmen ana sayfasında
//  - kapalıysa: kısa açıklama + "Bildirimleri aç" düğmesi ("Şimdi değil" 7 gün gizler)
//  - iPhone'da Safari sekmesindeyse: "Ana Ekrana Ekle" anlatımı
//  - açıksa: tek satır "Bu cihazda bildirimler açık" + Deneme / Kapat
// ============================================================================

const SNOOZE_KEY = 'push_optin_snooze_until';
const SNOOZE_MS = 7 * 86400000;

const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

export const PushOptInCard: React.FC<{ role: 'student' | 'teacher' }> = ({ role }) => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [hidden, setHidden] = useState(snoozed);

  useEffect(() => {
    let alive = true;
    getPushState().then((s) => {
      if (!alive) return;
      setState(s);
      if (s === 'on') void resyncPush(); // cihaz oturumdaki hesaba bağlı kalsın
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 15000);
    return () => window.clearTimeout(t);
  }, [msg]);

  if (!state || state === 'unsupported' || state === 'not-configured') return null;
  if (state !== 'on' && hidden) return null;

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setHidden(true);
  };

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setState('on');
      setMsg({ tone: 'ok', text: 'Bildirimler açıldı. Bir deneme bildirimi gönderildi.' });
      void testPush();
    } else {
      setState(await getPushState());
      setMsg({ tone: 'err', text: r.error || 'Bildirimler açılamadı.' });
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState('off');
    setMsg({ tone: 'ok', text: 'Bu cihazda bildirimler kapatıldı.' });
  };
  const sendTest = async () => {
    setBusy(true);
    const r = await testPush();
    setBusy(false);
    setMsg(r.ok ? { tone: 'ok', text: 'Deneme bildirimi gönderildi.' } : { tone: 'err', text: r.error || 'Gönderilemedi.' });
  };

  const what =
    role === 'student'
      ? 'Yeni ödev, teslim günü, etüt saati, öğretmeninin duyurusu ve sana özel mesajları, günlük plan ve soru sayısı hatırlatmaları'
      : 'Öğrenci mesajları, etüt saati ve alınmayan yoklama hatırlatmaları';

  const note = msg && (
    <p role="status" className={`text-xs font-semibold mt-2 ${msg.tone === 'ok' ? 'text-success-fg' : 'text-danger-fg'}`}>
      {msg.text}
    </p>
  );

  if (state === 'on') {
    return (
      <div id="push-optin" data-state="on" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-line bg-surface text-xs">
        <span className="inline-flex items-center gap-2 text-fg-2">
          <BellRing className="w-4 h-4 text-success-fg" /> Bu cihazda telefon bildirimleri açık
        </span>
        <span className="flex items-center gap-2">
          <button type="button" disabled={busy} onClick={sendTest} className="ui-btn ui-btn-ghost ui-btn-sm">
            Deneme gönder
          </button>
          <button type="button" disabled={busy} onClick={turnOff} className="ui-btn ui-btn-ghost ui-btn-sm">
            <BellOff className="w-3.5 h-3.5" /> Kapat
          </button>
        </span>
        {note && <div className="w-full">{note}</div>}
      </div>
    );
  }

  return (
    <div id="push-optin" data-state={state} className="relative rounded-2xl border border-brand/30 bg-brand-soft/60 p-4 pr-10">
      <button type="button" onClick={snooze} aria-label="Şimdi değil" title="Şimdi değil (7 gün sonra tekrar sorulur)" className="absolute top-2 right-2 ui-btn ui-btn-ghost ui-btn-icon">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-bold text-fg">Telefonuna bildirim gelsin</p>
          <p className="text-xs text-fg-2">{what} site kapalıyken bile telefonunun ekranına gelir.</p>

          {state === 'ios-install' && (
            <ol className="text-xs text-fg-2 space-y-1 list-decimal pl-4">
              <li>
                Bu sayfayı <strong>Safari</strong>'de açın, alttaki <Share className="inline w-3.5 h-3.5 -mt-0.5" /> <strong>Paylaş</strong> düğmesine dokunun.
              </li>
              <li>
                <PlusSquare className="inline w-3.5 h-3.5 -mt-0.5" /> <strong>Ana Ekrana Ekle</strong>'yi seçin.
              </li>
              <li>Ana ekrandaki <strong>Eğitim Takip</strong> simgesinden açıp giriş yapın; bu kartta "Bildirimleri aç"a dokunun.</li>
            </ol>
          )}

          {state === 'denied' && (
            <p className="text-xs text-danger-fg">
              Bu cihazda bildirim izni kapalı. Telefon ayarlarından (Ayarlar › Bildirimler › tarayıcı ya da Eğitim Takip) izin verip sayfayı yenileyin.
            </p>
          )}

          {state === 'off' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" id="push-enable" disabled={busy} onClick={turnOn} className="ui-btn ui-btn-primary ui-btn-sm">
                <BellRing className="w-3.5 h-3.5" /> {busy ? 'Açılıyor…' : 'Bildirimleri aç'}
              </button>
              <button type="button" onClick={snooze} className="ui-btn ui-btn-ghost ui-btn-sm">
                Şimdi değil
              </button>
            </div>
          )}
          {note}
        </div>
      </div>
    </div>
  );
};
