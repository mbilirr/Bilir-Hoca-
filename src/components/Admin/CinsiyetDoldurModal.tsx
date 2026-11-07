import React, { useEffect, useMemo, useState } from 'react';
import { VenusAndMars, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { cinsiyetTahmin } from '../../lib/cinsiyetTahmin';
import { profilResmi, ogretmenProfilRol } from '../../lib/profilResmi';
import { turkishCompare } from '../../utils/turkishSearch';

// ============================================================================
// AŞAMA 171 — CİNSİYETİ ADDAN DOLDUR
// Cinsiyeti boş olan kişiler için addan tahmin yapılır; kayıt öncesi her satır elle düzeltilebilir.
// Yalnız boş olanlar değişir (girilmiş cinsiyetlere dokunulmaz). Aynı cinsiyetliler tek istekte yazılır.
// ============================================================================

type G = '' | 'K' | 'E';
export interface CinsiyetKisi {
  id: string;
  name: string;
  gender?: 'K' | 'E';
  avatar?: string;
  branch?: string;
  isAdmin?: boolean;
  sub?: string; // sınıf / branş
}

export const CinsiyetDoldurModal: React.FC<{
  open: boolean;
  onClose: () => void;
  kind: 'student' | 'teacher';
  people: CinsiyetKisi[];
  onDone?: (msg: string) => void;
}> = ({ open, onClose, kind, people, onDone }) => {
  const bos = useMemo(
    () => people.filter((p) => !p.gender).sort((a, b) => turkishCompare(a.name, b.name)),
    [people]
  );
  const [secim, setSecim] = useState<Record<string, G>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pencere açılınca tahminler bir kez hesaplanır
  useEffect(() => {
    if (!open) return;
    const next: Record<string, G> = {};
    for (const p of bos) next[p.id] = cinsiyetTahmin(p.name) || '';
    setSecim(next);
    setError(null);
  }, [open, bos]);

  const sayim = useMemo(() => {
    let k = 0, e = 0, y = 0;
    for (const p of bos) {
      const g = secim[p.id];
      if (g === 'K') k++;
      else if (g === 'E') e++;
      else y++;
    }
    return { k, e, y };
  }, [bos, secim]);

  const kadin = kind === 'student' ? 'Kız' : 'Kadın';
  const kisi = kind === 'student' ? 'öğrenci' : 'öğretmen';

  const kaydet = async () => {
    const changes = bos
      .map((p) => ({ id: p.id, gender: (secim[p.id] || null) as 'K' | 'E' | null }))
      .filter((c) => c.gender);
    if (!changes.length) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await dataService.saveGenders(kind, changes);
      if (res.error && res.saved === 0) {
        setError(res.error);
        return;
      }
      onDone?.(
        `${res.saved} ${kisi}nin cinsiyeti kaydedildi.` +
          (res.failed ? ` ${res.failed} kayıt yazılamadı${res.error ? ` (${res.error})` : ''}.` : '') +
          (sayim.y ? ` ${sayim.y} kişi boş bırakıldı.` : '')
      );
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const rol = (p: CinsiyetKisi) => (kind === 'student' ? 'student' : ogretmenProfilRol(p));

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      id="cinsiyet-doldur-modal"
      icon={VenusAndMars}
      tone="brand"
      size="sm"
      title="Cinsiyeti addan doldur"
      description={
        bos.length
          ? `Cinsiyeti boş ${bos.length} ${kisi} var. Tahminleri kontrol edip kaydedin.`
          : `Tüm ${kisi}lerin cinsiyeti girilmiş.`
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center">
            {bos.length ? 'Vazgeç' : 'Kapat'}
          </button>
          {bos.length > 0 && (
            <button
              type="button"
              id="cinsiyet-doldur-kaydet"
              onClick={kaydet}
              disabled={saving || sayim.k + sayim.e === 0}
              className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}
        </>
      }
    >
      {bos.length === 0 ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-success-fg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Yapılacak bir şey yok.
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 text-center" aria-live="polite">
            {[
              { l: kadin, v: sayim.k },
              { l: 'Erkek', v: sayim.e },
              { l: 'Boş kalacak', v: sayim.y },
            ].map((x) => (
              <div key={x.l} className="rounded-lg border border-line bg-surface-2 py-1.5">
                <div className="text-sm font-bold text-fg tabular-nums">{x.v}</div>
                <div className="text-[10px] font-semibold text-muted">{x.l}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            İki cinsiyette de kullanılan ya da tanınmayan adlar boş bırakılır; dilerseniz satırdan seçebilirsiniz.
          </p>
          {error && (
            <div role="alert" className="p-2 rounded-lg bg-danger-soft text-danger-fg text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <ul className="max-h-[min(50vh,22rem)] overflow-y-auto rounded-lg border border-line divide-y divide-line" id="cinsiyet-doldur-liste">
            {bos.map((p) => {
              const g = secim[p.id] || '';
              return (
                <li key={p.id} className={cx('flex items-center gap-2 px-2 py-1.5', !g && 'bg-warning-soft/40')}>
                  <img
                    src={profilResmi({ id: p.id, name: p.name, avatar: p.avatar, gender: g || undefined }, rol(p))}
                    alt=""
                    decoding="async"
                    className="w-7 h-7 rounded-full shrink-0 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-fg truncate">{p.name}</div>
                    {p.sub && <div className="text-[10px] text-muted truncate">{p.sub}</div>}
                  </div>
                  <select
                    aria-label={`${p.name} cinsiyeti`}
                    value={g}
                    onChange={(e) => setSecim((s) => ({ ...s, [p.id]: e.target.value as G }))}
                    className="h-8 w-24 text-xs font-semibold px-2 rounded-lg border border-line bg-surface text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="">Seçiniz</option>
                    <option value="K">{kadin}</option>
                    <option value="E">Erkek</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
};
