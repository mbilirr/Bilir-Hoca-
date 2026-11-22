// ============================================================================
// Aşama 368: KURUMU DONDUR penceresi (yalnız sistem sahibi; Yönetim › Kurumlar › Hesap durumu)
// Neden + yalnız sistem sahibinin gördüğü not; isterse kurum yöneticilerine kısa e-posta (neden ve not yazılmaz).
// Kayıt silinmez; etkinleştirince her şey aynen döner.
// ============================================================================
import React, { useState } from 'react';
import { DatabaseBackup, LogIn, MailX, PauseCircle } from 'lucide-react';
import { Modal } from '../ui/kit';
import { bildir } from '../../lib/bildirim';
import { callMailOnce } from '../../lib/mailApi';
import { DONDURMA_NEDENLERI, kurumDondur, type DondurmaNeden } from '../../services/kurumDurumu';

const ETKILER = [
  { icon: LogIn, baslik: 'Giriş kapanır', metin: 'Öğretmen, öğrenci ve kurum yöneticisi giremez; açık oturumlar kapanır.' },
  { icon: MailX, baslik: 'Otomatik gönderim durur', metin: 'E-posta, SMS, telefon bildirimi, hatırlatmalar; veli ve karne bağlantıları açılmaz.' },
  { icon: DatabaseBackup, baslik: 'Hiçbir kayıt silinmez', metin: 'Etkinleştirince aynen döner. Siz kuruma geçip bakabilirsiniz.' },
];

export const KurumDondurPenceresi: React.FC<{
  kurum: { id: string; name: string };
  ogretmen: number;
  bireysel: boolean;
  onClose: () => void;
  onDone?: () => void;
}> = ({ kurum, ogretmen, bireysel, onClose, onDone }) => {
  const [neden, setNeden] = useState<DondurmaNeden>('odeme');
  const [not, setNot] = useState('');
  const [haber, setHaber] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');

  const dondur = async () => {
    if (busy) return;
    setBusy(true);
    setHata('');
    try {
      await kurumDondur(kurum.id, neden, not);
    } catch (e: any) {
      setHata(e?.message || 'Dondurulamadı.');
      setBusy(false);
      return;
    }
    let ek = '';
    if (haber) {
      const r = await callMailOnce('kurum-durum-bildir', { kurumId: kurum.id }).catch((e: any) => ({ ok: false, error: e?.message }) as any);
      if (!r.ok) ek = `Haber e-postası gitmedi: ${r.error || 'bilinmeyen hata'}`;
      else if (!r.sent) ek = 'Kurum yöneticisinin kayıtlı e-postası yok; haber e-postası gitmedi.';
    }
    bildir({ tur: ek ? 'bilgi' : 'basari', baslik: `${kurum.name} donduruldu`, ayrinti: ek || 'Kimse giriş yapamaz; kayıtlar aynen duruyor.' });
    onDone?.();
    onClose();
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      closeOnBackdrop={!busy}
      size="sm"
      icon={PauseCircle}
      tone="warning"
      title={bireysel ? 'Hesabı Dondur' : 'Kurumu Dondur'}
      description={`${kurum.name} · ${ogretmen} öğretmen`}
      layerClass="z-(--z-pencere-ust)"
      id="kurum-dondur-pencere"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className="ui-btn ui-btn-danger ui-btn-sm h-8 w-28 justify-center" onClick={dondur} disabled={busy} id="kurum-dondur-onay">
            {busy ? 'Donduruluyor…' : 'Dondur'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-1.5">
          <p className="text-xs font-bold text-fg">Neden</p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Neden">
            {DONDURMA_NEDENLERI.map((n) => (
              <button
                key={n.value}
                type="button"
                role="radio"
                aria-checked={neden === n.value}
                aria-pressed={neden === n.value}
                className="ui-secim w-full"
                onClick={() => setNeden(n.value)}
                disabled={busy}
              >
                {n.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-1.5">
          <label htmlFor="kurum-dondur-not" className="block text-xs font-bold text-fg">
            Not <span className="font-normal text-muted">(yalnız siz görürsünüz)</span>
          </label>
          <textarea
            id="kurum-dondur-not"
            className="ui-input w-full resize-none text-sm"
            rows={2}
            maxLength={300}
            value={not}
            onChange={(e) => setNot(e.target.value)}
            placeholder="Ör. Aidat ödemesi gelince açılacak."
            disabled={busy}
          />
        </section>

        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2">
          {ETKILER.map((x) => (
            <li key={x.baslik} className="flex items-start gap-2.5 px-3 py-2">
              <x.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="text-xs text-fg-2">
                <b className="text-fg">{x.baslik}.</b> {x.metin}
              </span>
            </li>
          ))}
        </ul>

        <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
          <input type="checkbox" className="accent-brand" checked={haber} onChange={(e) => setHaber(e.target.checked)} disabled={busy} id="kurum-dondur-haber" />
          {bireysel ? 'Hesap sahibine e-postayla haber ver' : 'Kurum yöneticisine e-postayla haber ver'}
        </label>

        {hata && (
          <p className="text-xs font-semibold text-danger-fg" role="alert">
            {hata}
          </p>
        )}
      </div>
    </Modal>
  );
};
export default KurumDondurPenceresi;
