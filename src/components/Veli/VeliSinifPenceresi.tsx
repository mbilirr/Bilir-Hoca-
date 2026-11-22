// ============================================================================
// Aşama 367: SINIFIN VELİLERİNE GÖNDER (toplu)
// Sabit boylu özet: dört durum satırı (açık, süresi doluyor, hiç gönderilmedi, velisi kayıtlı değil) ve iki iş:
//  - Eksiklere gönder: bağlantısı hiç gitmemiş ya da süresi dolmak üzere olan veliler (açık ve gönderilmiş olan atlanır)
//  - Hepsini yenile: bütün velilere yeni bağlantı (eskiler hemen geçersiz olur)
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Users } from 'lucide-react';
import { Modal, Segmented, cx } from '../ui/kit';
import { IskeletListe, YuklemeHatasi } from '../ui/Durum';
import { appConfirm } from '../../lib/appDialog';
import { bildir } from '../../lib/bildirim';
import { veliDurum, veliGonder, veliOgrenciOzeti, veliSonucYazi, VELI_SURELER, type VeliDurumYaniti, type VeliKanal } from '../../services/veliService';

export interface VeliSinifPenceresiProps {
  sinifAdi: string;
  ogrenciler: Array<{ id: string; name: string }>;
  onClose: () => void;
  layerClass?: string;
}

type Durum = 'acik' | 'doluyor' | 'gonderilmedi' | 'kayitsiz';

export const VeliSinifPenceresi: React.FC<VeliSinifPenceresiProps> = ({ sinifAdi, ogrenciler, onClose, layerClass }) => {
  const [veri, setVeri] = useState<VeliDurumYaniti | null>(null);
  const [hata, setHata] = useState('');
  const [kanal, setKanal] = useState<VeliKanal>('sms');
  const [ilerleme, setIlerleme] = useState<{ bitti: number; toplam: number } | null>(null);
  // liste her çizimde yeni dizi olarak gelebilir: kimlikler değişmedikçe yeniden okunmaz
  const idAnahtar = ogrenciler.map((o) => o.id).join(',');
  const ids = useMemo(() => (idAnahtar ? idAnahtar.split(',') : []), [idAnahtar]);

  const yukle = useCallback(async () => {
    setHata('');
    try {
      const d = await veliDurum(ids);
      setVeri(d);
      if (!d.smsHazir) setKanal('eposta');
    } catch (e: any) {
      setHata(e?.message || 'Veli bilgisi okunamadı.');
    }
  }, [ids]);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  const gruplar = useMemo(() => {
    const g: Record<Durum, string[]> = { acik: [], doluyor: [], gonderilmedi: [], kayitsiz: [] };
    if (!veri) return g;
    const harita = new Map(veri.ogrenciler.map((o) => [o.id, o]));
    for (const id of ids) g[veliOgrenciOzeti(harita.get(id), veri.yenileGun)].push(id);
    return g;
  }, [veri, ids]);
  const eksikler = [...gruplar.gonderilmedi, ...gruplar.doluyor];
  const kayitli = ids.length - gruplar.kayitsiz.length;
  const velisiOlanlar = ids.filter((id) => !gruplar.kayitsiz.includes(id));
  const mesgul = ilerleme !== null;

  const calistir = async (liste: string[], secenek: { yalnizEksik?: boolean; yenile?: boolean }) => {
    if (!liste.length) return;
    setIlerleme({ bitti: 0, toplam: liste.length });
    try {
      const r = await veliGonder(liste, kanal, secenek, (bitti, toplam) => setIlerleme({ bitti, toplam }));
      const y = veliSonucYazi(r, kanal);
      bildir({ tur: y.tur === 'basari' ? 'basari' : y.tur === 'hata' ? 'hata' : 'bilgi', baslik: y.baslik, ayrinti: y.ayrinti });
    } catch (e: any) {
      bildir({ tur: 'hata', baslik: 'Gönderim yarıda kaldı', ayrinti: e?.message });
    } finally {
      setIlerleme(null);
      await yukle();
    }
  };

  const hepsiniYenile = async () => {
    if (
      !(await appConfirm({
        title: 'Bütün bağlantılar yenilensin mi?',
        message: `${sinifAdi} sınıfında velisi kayıtlı ${kayitli} öğrencinin bütün velilerine yeni bağlantı gider; eski bağlantılar hemen geçersiz olur.`,
        confirmText: 'Evet, yenile',
        danger: false,
      }))
    )
      return;
    await calistir(velisiOlanlar, { yenile: true });
  };

  const SATIRLAR: Array<{ k: Durum; yazi: string; nokta: string }> = [
    { k: 'acik', yazi: 'Açık bağlantı', nokta: 'bg-success' },
    { k: 'doluyor', yazi: `Süresi ${veri?.yenileGun || 7} gün içinde doluyor`, nokta: 'bg-warning' },
    { k: 'gonderilmedi', yazi: 'Hiç gönderilmedi', nokta: 'bg-danger' },
    { k: 'kayitsiz', yazi: 'Velisi kayıtlı değil', nokta: 'bg-line-strong' },
  ];
  const sureYazi = VELI_SURELER.find((s) => s.value === veri?.sure)?.label || '30 gün';

  return (
    <Modal
      open
      onClose={() => !mesgul && onClose()}
      size="sm"
      icon={Users}
      title="Sınıfın Velilerine Gönder"
      description={`${sinifAdi} · ${ids.length} öğrenci${veri ? ` · velisi kayıtlı ${kayitli}` : ''}`}
      layerClass={layerClass}
      closeOnBackdrop={!mesgul}
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Bağlantılar {sureYazi} geçerli</span>
          <button type="button" onClick={onClose} disabled={mesgul} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28">
            Kapat
          </button>
        </div>
      }
    >
      {hata ? (
        <YuklemeHatasi mesaj={hata} onTekrar={yukle} />
      ) : !veri ? (
        <IskeletListe satir={4} />
      ) : (
        <div className="space-y-3" id="veli-sinif">
          <div className="border border-line rounded-xl overflow-hidden bg-surface">
            <div className="flex items-center justify-between px-3 py-2 bg-surface-2 text-2xs font-bold uppercase tracking-wider text-muted border-b border-line">
              <span>Durum</span>
              <span>Öğrenci</span>
            </div>
            <ul className="divide-y divide-line">
              {SATIRLAR.map((s) => (
                <li key={s.k} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2 text-fg-2">
                    <span className={cx('w-2 h-2 rounded-full shrink-0', s.nokta)} aria-hidden />
                    {s.yazi}
                  </span>
                  <span className="font-bold text-fg tabular-nums">{gruplar[s.k].length}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg-2">Gönderim yolu</span>
            <Segmented<VeliKanal>
              size="sm"
              value={kanal}
              onChange={(v) => !mesgul && setKanal(v)}
              items={[
                ...(veri.smsHazir ? [{ value: 'sms' as VeliKanal, label: 'SMS' }] : []),
                { value: 'eposta' as VeliKanal, label: 'E-posta' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-full justify-center" onClick={() => calistir(eksikler, { yalnizEksik: true })} disabled={mesgul || !eksikler.length}>
              <Send className="w-3.5 h-3.5" /> Eksiklere Gönder ({eksikler.length})
            </button>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-full justify-center" onClick={hepsiniYenile} disabled={mesgul || !velisiOlanlar.length}>
              <RefreshCw className="w-3.5 h-3.5" /> Hepsini Yenile
            </button>
          </div>

          {ilerleme ? (
            <div className="space-y-1" aria-live="polite">
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${Math.round((ilerleme.bitti / Math.max(1, ilerleme.toplam)) * 100)}%` }} />
              </div>
              <p className="text-2xs text-muted">
                Gönderiliyor… {ilerleme.bitti} / {ilerleme.toplam} öğrenci
              </p>
            </div>
          ) : (
            <p className="text-2xs text-muted">
              {kanal === 'sms' ? 'SMS kontörü: her veli için 1 SMS. Gönderim mevcut SMS ayarıyla yapılır.' : 'E-posta kurumun gönderim hesabından gider.'}
              {!veri.smsHazir && ' SMS ayarı yapılmadığı için yalnız e-posta kullanılabilir.'}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};
export default VeliSinifPenceresi;
