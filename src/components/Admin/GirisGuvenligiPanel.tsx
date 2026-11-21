import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, LockOpen, RefreshCw, ShieldAlert } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { Yukleniyor } from '../ui/Durum';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import { girisAyarOku, girisAyarYaz, girisHatalari, girisKilitAc, type GirisAyar, type GirisHataSatiri } from '../../lib/girisGuvenligi';

// ============================================================================
// Aşama 339: GİRİŞ GÜVENLİĞİ (kurum yöneticisi: Yönetim › Genel; sistem sahibi: Yönetim › Bildirim ve SMS)
//  - İki anahtar: hatalı girişte telefon bildirimi / SMS (aynı hesapta 15 dk'da 5 hata = 15 dk kilit; kilit başına bir kez)
//  - Son 7 günün hatalı girişleri, hesap başına tek satır (en çok 50 satır: liste zamanla büyümez)
//  - Kilitli hesabın kilidi buradan açılır
// ============================================================================

const saatYaz = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const kalanDk = (iso: string | null) => (iso ? Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000)) : 0);

const Anahtar: React.FC<{ on: boolean; disabled?: boolean; onChange: () => void; label: string; id: string }> = ({ on, disabled, onChange, label, id }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    id={id}
    disabled={disabled}
    onClick={onChange}
    className={cx(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
      on ? 'bg-brand' : 'bg-surface-3 border border-line-strong'
    )}
  >
    <span
      className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-300', on ? 'translate-x-4' : 'translate-x-0.5')}
      style={{ transitionTimingFunction: 'var(--spring, cubic-bezier(.34,1.56,.64,1))' }}
    />
  </button>
);

const AYARLAR: { key: keyof GirisAyar; ad: string; acik: string }[] = [
  { key: 'bildirim', ad: 'Hatalı girişte telefon bildirimi', acik: 'Hesap kilitlenince yöneticilerin telefonuna bir kez bildirim gider.' },
  { key: 'sms', ad: 'Hatalı girişte SMS', acik: 'Hesap kilitlenince yöneticilerin kayıtlı cep numarasına bir kez SMS gider.' },
];

export const GirisGuvenligiPanel: React.FC = () => {
  const [ayar, setAyar] = useState<GirisAyar | null>(null);
  const [ayarMesgul, setAyarMesgul] = useState<keyof GirisAyar | null>(null);
  const [rows, setRows] = useState<GirisHataSatiri[] | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useAutoDismiss(notice, () => setNotice(null));

  const oku = useCallback(async () => {
    const [a, r] = await Promise.allSettled([girisAyarOku(), girisHatalari()]);
    if (a.status === 'fulfilled') setAyar(a.value);
    if (r.status === 'fulfilled') setRows(r.value);
    else setRows([]);
    const err = a.status === 'rejected' ? a.reason : r.status === 'rejected' ? r.reason : null;
    if (err) setNotice({ tone: 'err', text: err?.message || 'Okunamadı.' });
  }, []);
  useEffect(() => {
    void oku();
  }, [oku]);

  const degistir = async (key: keyof GirisAyar) => {
    if (!ayar || ayarMesgul) return;
    const yeni = { ...ayar, [key]: !ayar[key] };
    setAyar(yeni); // hemen görünür; hata olursa geri alınır
    setAyarMesgul(key);
    try {
      await girisAyarYaz(yeni);
      setNotice({ tone: 'ok', text: 'Kaydedildi.' });
    } catch (e: any) {
      setAyar(ayar);
      setNotice({ tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setAyarMesgul(null);
    }
  };

  const kilidiAc = async (r: GirisHataSatiri) => {
    setMesgul(r.anahtar);
    try {
      await girisKilitAc(r.anahtar);
      setRows((list) => (list || []).map((x) => (x.anahtar === r.anahtar ? { ...x, kilitBitis: null } : x)));
      setNotice({ tone: 'ok', text: `${r.kimlik} hesabının kilidi açıldı.` });
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Kilit açılamadı.' });
    } finally {
      setMesgul(null);
    }
  };

  return (
    <Panel
      id="giris-guvenligi"
      icon={ShieldAlert}
      tone="danger"
      title="Giriş güvenliği"
      description="Aynı hesapta 15 dakikada 5 hatalı şifre denemesi olursa hesap 15 dakika kilitlenir."
      actions={
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 !px-0 justify-center" onClick={() => void oku()} aria-label="Yenile" title="Yenile">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
          {AYARLAR.map((a) => (
            <li key={a.key} className="flex items-center gap-3 px-3 py-2.5 bg-surface">
              <label htmlFor={`giris-ayar-${a.key}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-xs font-semibold text-fg">{a.ad}</span>
                <span className="block text-xs text-muted">{a.acik}</span>
              </label>
              {ayarMesgul === a.key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted shrink-0" aria-hidden="true" />}
              <Anahtar id={`giris-ayar-${a.key}`} label={a.ad} on={!!ayar?.[a.key]} disabled={!ayar || !!ayarMesgul} onChange={() => void degistir(a.key)} />
            </li>
          ))}
        </ul>

        {notice && (
          <p role={notice.tone === 'err' ? 'alert' : 'status'} className={cx('text-xs font-semibold rounded-xl px-3 py-2', notice.tone === 'err' ? 'text-danger-fg bg-danger-soft' : 'text-success-fg bg-success-soft')}>
            {notice.text}
          </p>
        )}

        <div className="space-y-2">
          <p className="ui-eyebrow">Son 7 gün</p>
          {rows === null ? (
            <Yukleniyor metin="Okunuyor…" className="py-4" />
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center border border-dashed border-line rounded-xl">Son 7 günde hatalı giriş yok.</p>
          ) : (
            <div className="border border-line rounded-xl overflow-hidden">
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem_7.5rem_4rem_4rem_8rem] gap-3 px-3 py-2 bg-surface-2 text-xs font-semibold text-muted">
                <span>Hesap</span>
                <span>Tür</span>
                <span>Son deneme</span>
                <span className="text-right">24 saat</span>
                <span className="text-right">7 gün</span>
                <span className="text-right">Durum</span>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const kilitli = !!r.kilitBitis && new Date(r.kilitBitis).getTime() > Date.now();
                  return (
                    <li key={r.anahtar} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_4rem_4rem_8rem] items-center gap-x-3 gap-y-1 px-3 py-2 bg-surface">
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-fg font-mono truncate" title={r.kimlik}>
                          {r.kimlik}
                        </span>
                        <span className="block text-xs text-muted truncate" title={r.ad || undefined}>
                          {r.ad || 'Kayıtlı hesap yok'}
                          <span className="sm:hidden"> · {saatYaz(r.son)} · {r.sayi24}/{r.sayi7}</span>
                        </span>
                      </span>
                      <span className="hidden sm:inline-flex ui-chip w-20 justify-center">{r.tur === 'ogrenci' ? 'Öğrenci' : 'Öğretmen'}</span>
                      <span className="hidden sm:block text-xs text-fg-2 tabular-nums">{saatYaz(r.son)}</span>
                      <span className="hidden sm:block text-xs text-fg font-semibold tabular-nums text-right">{r.sayi24}</span>
                      <span className="hidden sm:block text-xs text-fg-2 tabular-nums text-right">{r.sayi7}</span>
                      <span className="flex justify-end">
                        {kilitli ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32 justify-center text-xs"
                            disabled={mesgul === r.anahtar}
                            onClick={() => void kilidiAc(r)}
                            title={`Kilitli: ${kalanDk(r.kilitBitis)} dk kaldı. Basınca kilit açılır.`}
                          >
                            {mesgul === r.anahtar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5" />}
                            Kilidi aç · {kalanDk(r.kilitBitis)} dk
                          </button>
                        ) : (
                          <span className="text-xs text-muted">Açık</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};
