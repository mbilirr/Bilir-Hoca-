// Akademik takvim › etkinlik ekle / düzenle penceresi (Aşama 364: AkademikTakvim.tsx'ten ayrı parça, yalnız açılınca yüklenir)
import React, { useEffect, useState } from 'react';
import { CalendarRange, Trash2 } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { SelectBox } from '../FormParts';
import { appConfirm } from '../../../lib/appDialog';
import {
  AY_ADLARI,
  BIRIMLER,
  OKUL_AYLARI,
  SINIFLAR,
  ZUMRELER,
  araliktaMi,
  baslik,
  buyuk,
  etkinlikKaydet,
  sinifAdi,
  siniflarYazi,
  tarihCoz,
  yilAdi,
  yilAraligi,
  type AktEtkinlik,
  type AktKapsam,
  type AktYer,
} from '../../../services/akademikTakvimService';
import { BTN } from './ortak';

// ---------------------------------------------------------------------------- etkinlik ekle / düzenle
export const EtkinlikPenceresi: React.FC<{
  acik: boolean;
  etkinlik: AktEtkinlik | null;
  yil: number;
  hepsi: AktEtkinlik[];
  onClose: () => void;
  onBitti: (text: string) => void | Promise<void>;
}> = ({ acik, etkinlik, yil, hepsi, onClose, onBitti }) => {
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState('');
  const [bitis, setBitis] = useState(''); // Aşama 327: isteğe bağlı son gün
  const [ayIcinde, setAyIcinde] = useState(false); // Aşama 327: günü belli değil, ay içinde
  const [birim, setBirim] = useState('ORTAOKUL');
  const [zumre, setZumre] = useState('');
  const [siniflar, setSiniflar] = useState<string[]>([]);
  const [kapsam, setKapsam] = useState<AktKapsam>('ogrenci');
  const [yer, setYer] = useState<AktYer>('ic');
  const [salon, setSalon] = useState<'0' | '1'>('0');
  const [denendi, setDenendi] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const { bas, bit } = yilAraligi(yil);

  useEffect(() => {
    if (!acik) return;
    setAd(etkinlik ? baslik(etkinlik.ad) : '');
    setTarih(etkinlik?.tarih || '');
    setBitis(etkinlik?.ayIcinde ? '' : etkinlik?.bitis || '');
    setAyIcinde(!!etkinlik?.ayIcinde);
    setBirim(etkinlik?.birim || 'ORTAOKUL');
    setZumre(etkinlik?.zumre || '');
    setSiniflar(etkinlik ? etkinlik.siniflar.filter(Boolean) : []);
    setKapsam(etkinlik?.kapsam || 'ogrenci');
    setYer(etkinlik?.yer || 'ic');
    setSalon(etkinlik?.salon ? '1' : '0');
    setDenendi(false);
    setHata(null);
  }, [acik, etkinlik]);

  const okAd = ad.trim().length > 0;
  const okTarih = !!tarih && tarih >= bas && tarih <= bit;
  const bitisGun = tarih && bitis ? Math.round((tarihCoz(bitis).getTime() - tarihCoz(tarih).getTime()) / 864e5) : 0;
  const okBitis = ayIcinde || !bitis || (bitisGun >= 0 && bitisGun <= 60 && bitis <= bit);
  const okSinif = siniflar.length > 0;
  const kayitBitis = ayIcinde ? '' : bitis && bitis > tarih ? bitis : ''; // aynı gün seçildiyse tek günlük; ay içinde: sunucu kurar
  const aySecenek = OKUL_AYLARI.map((m) => `${m >= 9 ? yil : yil + 1}-${String(m).padStart(2, '0')}-01`);
  const salonCakisma =
    salon === '1' && tarih && !ayIcinde ? hepsi.find((g) => g.salon && g.key !== etkinlik?.key && araliktaMi(g, tarih, kayitBitis || tarih)) : undefined;

  const kaydet = async () => {
    setDenendi(true);
    if (!okAd || !okTarih || !okBitis || !okSinif || mesgul) return;
    setMesgul(true);
    setHata(null);
    const ortak = { tarih: ayIcinde ? `${tarih.slice(0, 7)}-01` : tarih, bitis: kayitBitis, ayIcinde, ad: buyuk(ad), birim, zumre, kapsam, yer, salon: salon === '1', kontrol: etkinlik?.kontrol || false };
    try {
      await etkinlikKaydet(etkinlik?.ids || [], siniflar.map((s) => ({ ...ortak, sinif: s })));
      await onBitti(etkinlik ? 'Etkinlik güncellendi.' : 'Etkinlik takvime eklendi.');
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };
  const sil = async () => {
    if (!etkinlik || mesgul) return;
    const ok = await appConfirm({ title: 'Etkinlik silinsin mi?', message: `"${baslik(etkinlik.ad)}" (${siniflarYazi(etkinlik.siniflar)}) takvimden silinecek.`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    setMesgul(true);
    try {
      await etkinlikKaydet(etkinlik.ids, []);
      await onBitti('Etkinlik takvimden silindi.');
    } catch (e: any) {
      setHata(e?.message || 'Silinemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const hataCls = (bad: boolean) => cx('ui-field w-full', denendi && bad && 'border-danger');
  return (
    <Modal
      open={acik}
      onClose={onClose}
      icon={CalendarRange}
      title={etkinlik ? 'Etkinliği düzenle' : 'Etkinlik ekle'}
      description="Akademik takvime yazılır; ana sayfada haftasında görünür."
      id="akt-etkinlik-pencere"
      footer={
        <>
          {etkinlik && (
            <button type="button" className={cx(BTN, 'ui-btn-danger-soft mr-auto')} onClick={() => void sil()} disabled={mesgul}>
              <Trash2 className="w-3.5 h-3.5" /> Sil
            </button>
          )}
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={mesgul}>
            Vazgeç
          </button>
          <button type="button" id="akt-etkinlik-kaydet" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="akt-ad" className="ui-label">Etkinlik adı</label>
          <input id="akt-ad" className={hataCls(!okAd)} maxLength={200} value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Bilim Merkezi gezisi" />
          {denendi && !okAd && <p className="text-xs font-semibold text-danger-fg mt-1">Etkinlik adını yazın.</p>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ayIcinde ? (
            // Aşama 327: günü belli olmayan etkinlik yalnız ay seçer
            <div className="col-span-2 sm:col-span-2">
              <label htmlFor="akt-ay" className="ui-label">Ay</label>
              <SelectBox id="akt-ay" className={cx(hataCls(!okTarih), 'cursor-pointer')} value={tarih ? `${tarih.slice(0, 7)}-01` : ''} onChange={(e) => setTarih(e.target.value)}>
                <option value="">Ay seçiniz</option>
                {aySecenek.map((t) => (
                  <option key={t} value={t}>
                    {AY_ADLARI[tarihCoz(t).getMonth()]} {t.slice(0, 4)}
                  </option>
                ))}
              </SelectBox>
              {denendi && !okTarih && <p className="text-xs font-semibold text-danger-fg mt-1">Ayı seçin.</p>}
            </div>
          ) : (
          <>
          <div>
            <label htmlFor="akt-tarih" className="ui-label">{bitis ? 'Başlangıç' : 'Tarih'}</label>
            <input id="akt-tarih" type="date" className={hataCls(!okTarih)} min={bas} max={bit} value={tarih} onChange={(e) => setTarih(e.target.value)} />
            {denendi && !okTarih && <p className="text-xs font-semibold text-danger-fg mt-1">{yilAdi(yil)} yılı içinde bir tarih seçin.</p>}
          </div>
          {/* Aşama 327: birkaç gün süren etkinlik (boş = tek gün) */}
          <div>
            <label htmlFor="akt-bitis" className="ui-label flex items-center justify-between gap-1">
              Bitiş <span className="text-2xs font-normal text-subtle">isteğe bağlı</span>
            </label>
            <input id="akt-bitis" type="date" className={hataCls(!okBitis)} min={tarih || bas} max={bit} value={bitis} onChange={(e) => setBitis(e.target.value)} />
            {denendi && !okBitis && (
              <p className="text-xs font-semibold text-danger-fg mt-1">{bitisGun < 0 ? 'Bitiş, başlangıçtan önce olamaz.' : 'En çok 60 gün, yıl içinde.'}</p>
            )}
          </div>
          </>
          )}
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="akt-birim" className="ui-label">Birim</label>
            <SelectBox id="akt-birim" className="ui-field w-full cursor-pointer" value={birim} onChange={(e) => setBirim(e.target.value)}>
              {BIRIMLER.map((b) => (
                <option key={b} value={b}>
                  {baslik(b)}
                </option>
              ))}
            </SelectBox>
          </div>
          <label className="col-span-2 sm:col-span-3 -mt-1 flex w-fit items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="akt-ay-icinde"
              className="w-4 h-4 accent-[var(--color-brand)]"
              checked={ayIcinde}
              onChange={(e) => {
                setAyIcinde(e.target.checked);
                if (e.target.checked && tarih) setTarih(`${tarih.slice(0, 7)}-01`);
              }}
            />
            Günü belli değil, ay içinde yapılacak
          </label>
        </div>
        <div>
          <span className="ui-label flex items-center justify-between">
            Sınıf <span className="text-2xs font-normal text-subtle">birden çok seçilebilir</span>
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="group" aria-label="Sınıf">
            {SINIFLAR.map((s) => {
              const on = siniflar.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSiniflar((p) => (on ? p.filter((x) => x !== s) : [...p, s]))}
                  className="ui-secim rounded-full"
                >
                  {sinifAdi(s)}
                </button>
              );
            })}
          </div>
          {denendi && !okSinif && <p className="text-xs font-semibold text-danger-fg mt-1">En az bir sınıf seçin.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="ui-label">Kapsam</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={kapsam} onChange={setKapsam} items={[{ value: 'ogrenci', label: 'Öğrenci' }, { value: 'veli', label: 'Veli' }]} />
          </div>
          <div>
            <span className="ui-label">Yer</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={yer} onChange={setYer} items={[{ value: 'ic', label: 'Okul içi' }, { value: 'dis', label: 'Okul dışı' }]} />
          </div>
          <div>
            <span className="ui-label">Konferans salonu</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={salon} onChange={setSalon} items={[{ value: '0', label: 'Hayır' }, { value: '1', label: 'Evet' }]} />
          </div>
          <div>
            <label htmlFor="akt-zumre" className="ui-label flex items-center justify-between">
              Zümre <span className="text-2xs font-normal text-subtle">isteğe bağlı</span>
            </label>
            <SelectBox id="akt-zumre" className="ui-field w-full cursor-pointer" value={zumre} onChange={(e) => setZumre(e.target.value)}>
              <option value="">Seçilmedi</option>
              {zumre && !(ZUMRELER as readonly string[]).includes(zumre) && <option value={zumre}>{baslik(zumre)}</option>}
              {ZUMRELER.map((z) => (
                <option key={z} value={z}>
                  {baslik(z)}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        {salonCakisma && (
          <p className="rounded-xl bg-warning-soft text-warning-fg text-xs font-medium px-3 py-2.5">
            {kayitBitis ? 'Bu günlerde' : 'Bu tarihte'} konferans salonu "{baslik(salonCakisma.ad)}" için ayrılmış. Yine de kaydedebilirsiniz.
          </p>
        )}
        {hata && <p className="rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
      </div>
    </Modal>
  );
};
export default EtkinlikPenceresi;
