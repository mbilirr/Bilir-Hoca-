import React, { useState, useSyncExternalStore } from 'react';
import { Building2, Pencil, Save, Loader2, X } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { Modal, cx } from '../ui/kit';
import { updateKurumIdentity } from '../../lib/kurumSettings';

// ============================================================================
// Aşama 86: Ana sayfada kurumun adı. Kurum yöneticisi (Müdür / Müdür Yrd. ya da
// kurum yöneticisi hesabı) adın yanındaki kalemle kendi kurumunun adını değiştirir.
// Veritabanı: kurum_update_identity (sql/82) — yalnızca kendi kurumu; ek SQL yok.
// Hız: yalnızca kurum adı / yetki değişince yeniden çizilir (useSyncExternalStore).
// ============================================================================

const CTRL = 'w-full h-8 px-2.5 bg-surface border border-line-strong rounded-lg text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

const subscribe = (cb: () => void) => dataService.subscribe(cb);
const snapshot = () => {
  const k = dataService.getMyKurum();
  if (!k.kurumId || dataService.isHeadAdmin()) return '';
  return `${dataService.isKurumAdmin() ? 1 : 0}|${k.kurumId}|${k.kurumName || ''}`;
};

export const KurumNameBadge: React.FC = () => {
  const snap = useSyncExternalStore(subscribe, snapshot);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!snap) return null;
  const [adminFlag, kurumId, ...rest] = snap.split('|');
  const kurumName = rest.join('|');
  const canEdit = adminFlag === '1';
  if (!kurumName && !canEdit) return null;

  const start = () => {
    setName(kurumName);
    setError('');
    setOpen(true);
  };
  const trimmed = name.trim();
  const save = async () => {
    if (busy || trimmed.length < 2 || trimmed === kurumName) return;
    setBusy(true);
    setError('');
    try {
      await updateKurumIdentity(kurumId, trimmed);
      await dataService.syncMyKurum();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-fg min-w-0" id="home-kurum-name">
        <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{kurumName || 'Kurum adı girilmemiş'}</span>
        {canEdit && (
          <button
            type="button"
            id="home-kurum-name-edit"
            onClick={start}
            title="Kurum adını değiştir"
            aria-label="Kurum adını değiştir"
            className="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-md text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </p>

      {canEdit && (
        <Modal
          open={open}
          onClose={() => !busy && setOpen(false)}
          icon={Building2}
          tone="brand"
          size="sm"
          title="Kurum adı"
          description="Ana sayfada, üst menüde, karnelerde ve e-posta başlıklarında görünür."
          id="home-kurum-name-modal"
          footer={
            <>
              <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setOpen(false)} disabled={busy}>
                <X className="w-3.5 h-3.5" /> Vazgeç
              </button>
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={save} disabled={busy || trimmed.length < 2 || trimmed === kurumName}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
              </button>
            </>
          }
        >
          <label htmlFor="home-kurum-name-input" className="block text-[11px] font-semibold text-fg-2 mb-1">
            Kurum adı
          </label>
          <input
            id="home-kurum-name-input"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            className={CTRL}
          />
          {error && (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-fg">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
};
