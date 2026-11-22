// ============================================================================
// Aşama 367: VELİ BAĞLANTISI (tek öğrenci)
// Öğrencinin kayıtlı velileri (en çok 3), her birinin bağlantı durumu ve dört iş: SMS, e-posta, kopyala, iptal.
// Numara / adres elle yazılmaz: sunucu kayıtlı veli bilgisini kullanır; ekranda yalnız maskeli hâli görünür.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Copy, Link2, Mail, MessageSquare, Users } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { IskeletListe, YuklemeHatasi } from '../ui/Durum';
import { appConfirm, appCopyFallback } from '../../lib/appDialog';
import { bildir } from '../../lib/bildirim';
import {
  veliBaglantiOzeti,
  veliDurum,
  veliGonder,
  veliIptal,
  veliKopya,
  veliSonucYazi,
  veliTarihYazi,
  VELI_SURELER,
  type VeliDurumYaniti,
  type VeliKanal,
  type VeliSatiri,
} from '../../services/veliService';

export interface VeliBaglantisiPenceresiProps {
  ogrenci: { id: string; name: string };
  /** başlık altındaki kısa bilgi (ör. sınıf adı) */
  altBaslik?: string;
  onClose: () => void;
  /** başka bir pencerenin üstünde açılınca 'z-(--z-pencere-ust)' */
  layerClass?: string;
}

const KANAL_AD: Record<string, string> = { sms: 'SMS', eposta: 'E-posta', kopya: 'Kopyalandı' };

function durumCipi(v: VeliSatiri, yenileGun: number): { yazi: string; sinif: string } {
  const b = v.baglanti;
  if (!b) return { yazi: 'Yok', sinif: 'ui-chip-neutral' };
  if (b.durum === 'iptal') return { yazi: 'İptal', sinif: 'ui-chip-neutral' };
  if (b.durum === 'dolmus') return { yazi: 'Doldu', sinif: 'ui-chip-neutral' };
  if (!b.sonGonderim) return { yazi: 'Gönderilmedi', sinif: 'ui-chip-neutral' };
  return veliBaglantiOzeti(v, yenileGun) === 'doluyor' ? { yazi: 'Doluyor', sinif: 'ui-chip-warning' } : { yazi: 'Açık', sinif: 'ui-chip-success' };
}

function veliAltSatir(v: VeliSatiri): string {
  const p: string[] = [v.tel || v.eposta || 'iletişim bilgisi yok'];
  const b = v.baglanti;
  if (b && b.durum === 'acik' && b.sonGonderim) p.push(`${KANAL_AD[b.sonKanal || ''] || 'Gönderildi'}: ${veliTarihYazi(b.sonGonderim)}`);
  else p.push('gönderilmedi');
  if (b && b.durum === 'acik' && b.acilma) p.push(`${b.acilma} kez açıldı`);
  return p.join(' · ');
}

export const VeliBaglantisiPenceresi: React.FC<VeliBaglantisiPenceresiProps> = ({ ogrenci, altBaslik, onClose, layerClass }) => {
  const [veri, setVeri] = useState<VeliDurumYaniti | null>(null);
  const [hata, setHata] = useState('');
  const [secili, setSecili] = useState<Set<number>>(new Set());
  const [isleniyor, setIsleniyor] = useState<'' | VeliKanal | 'kopya' | 'iptal'>('');

  const yukle = useCallback(async (ilk = false) => {
    setHata('');
    try {
      const d = await veliDurum([ogrenci.id]);
      setVeri(d);
      if (ilk) setSecili(new Set((d.ogrenciler[0]?.veliler || []).map((v) => v.sira)));
    } catch (e: any) {
      setHata(e?.message || 'Veli bilgisi okunamadı.');
    }
  }, [ogrenci.id]);
  useEffect(() => {
    void yukle(true);
  }, [yukle]);

  const veliler = veri?.ogrenciler[0]?.veliler || [];
  const seciliVeliler = veliler.filter((v) => secili.has(v.sira));
  const yenileGun = veri?.yenileGun || 7;
  const acikSecili = seciliVeliler.filter((v) => v.baglanti?.durum === 'acik');
  const ozet = useMemo(() => {
    const acik = veliler.filter((v) => v.baglanti?.durum === 'acik');
    const bitis = acik.map((v) => v.baglanti!.bitis).sort().pop() || null;
    const sonAcilis = veliler.map((v) => v.baglanti?.sonAcilis || '').filter(Boolean).sort().pop() || null;
    return { bitis, sonAcilis };
  }, [veliler]);
  const sureYazi = VELI_SURELER.find((s) => s.value === veri?.sure)?.label || '30 gün';
  const smsYok = seciliVeliler.length > 0 && !seciliVeliler.some((v) => v.tel);
  const epostaYok = seciliVeliler.length > 0 && !seciliVeliler.some((v) => v.eposta);

  const degistir = (sira: number) =>
    setSecili((s) => {
      const n = new Set(s);
      if (n.has(sira)) n.delete(sira);
      else n.add(sira);
      return n;
    });

  const gonder = async (kanal: VeliKanal) => {
    setIsleniyor(kanal);
    try {
      const r = await veliGonder([ogrenci.id], kanal, { veliSira: seciliVeliler.map((v) => v.sira) });
      const y = veliSonucYazi(r, kanal);
      bildir({ tur: y.tur === 'basari' ? 'basari' : y.tur === 'hata' ? 'hata' : 'bilgi', baslik: y.baslik, ayrinti: y.ayrinti });
      await yukle();
    } catch (e: any) {
      bildir({ tur: 'hata', baslik: 'Gönderilemedi', ayrinti: e?.message });
    } finally {
      setIsleniyor('');
    }
  };

  const kopyala = async () => {
    const v = seciliVeliler[0];
    if (!v) return;
    setIsleniyor('kopya');
    try {
      const { url } = await veliKopya(ogrenci.id, v.sira);
      try {
        await navigator.clipboard.writeText(url);
        bildir({ tur: 'basari', baslik: 'Bağlantı panoya kopyalandı', ayrinti: `${v.yakinlik || 'Veli'} için; yalnız bu veliyle paylaşın.` });
      } catch {
        await appCopyFallback('Veli bağlantısı', url);
      }
      await yukle();
    } catch (e: any) {
      bildir({ tur: 'hata', baslik: 'Bağlantı hazırlanamadı', ayrinti: e?.message });
    } finally {
      setIsleniyor('');
    }
  };

  const iptal = async () => {
    if (!acikSecili.length) return;
    const kim = acikSecili.map((v) => v.yakinlik || v.ad || 'Veli').join(', ');
    if (!(await appConfirm({ title: 'Bağlantı iptal edilsin mi?', message: `${kim} için açık bağlantı hemen geçersiz olur. Yeniden göndermek gerekirse yeni bağlantı hazırlanır.`, confirmText: 'Evet, iptal et' }))) return;
    setIsleniyor('iptal');
    try {
      let n = 0;
      if (acikSecili.length === veliler.filter((v) => v.baglanti?.durum === 'acik').length) n = await veliIptal([ogrenci.id]);
      else for (const v of acikSecili) n += await veliIptal([ogrenci.id], v.sira);
      bildir({ tur: 'basari', baslik: n ? `${n} bağlantı iptal edildi` : 'İptal edilecek açık bağlantı yoktu' });
      await yukle();
    } catch (e: any) {
      bildir({ tur: 'hata', baslik: 'İptal edilemedi', ayrinti: e?.message });
    } finally {
      setIsleniyor('');
    }
  };

  const mesgul = isleniyor !== '';
  const BTN = 'ui-btn ui-btn-sm h-8 w-full justify-center';

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={Link2}
      title="Veli Bağlantısı"
      description={[ogrenci.name, altBaslik].filter(Boolean).join(' · ')}
      layerClass={layerClass}
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Giriş gerekmez; yalnız okunur · {sureYazi} geçerli</span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28">
            Kapat
          </button>
        </div>
      }
    >
      {hata ? (
        <YuklemeHatasi mesaj={hata} onTekrar={() => yukle(true)} />
      ) : !veri ? (
        <IskeletListe satir={3} />
      ) : !veliler.length ? (
        <div className="py-8 text-center space-y-2" id="veli-baglanti-bos">
          <div className="w-10 h-10 rounded-2xl bg-surface-2 text-muted grid place-items-center mx-auto">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-fg">Kayıtlı veli yok</p>
          <p className="text-xs text-muted max-w-xs mx-auto">Öğrenci bilgilerindeki Veliler bölümüne ad ve telefon ya da e-posta ekleyin; bağlantı yalnız kayıtlı veliye gider.</p>
        </div>
      ) : (
        <div className="space-y-3" id="veli-baglanti">
          <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface">
            {veliler.map((v) => {
              const cip = durumCipi(v, yenileGun);
              const on = secili.has(v.sira);
              return (
                <li key={v.sira}>
                  <label className={cx('flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors', on ? 'bg-brand-soft/40' : 'hover:bg-surface-2')}>
                    <input type="checkbox" className="w-3.5 h-3.5 shrink-0" checked={on} onChange={() => degistir(v.sira)} disabled={mesgul} />
                    <span className="w-8 h-8 rounded-full bg-surface-2 border border-line grid place-items-center text-xs font-bold text-fg-2 shrink-0" aria-hidden>
                      {(v.yakinlik || v.ad || 'V').trim().charAt(0).toLocaleUpperCase('tr-TR')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-fg truncate">{[v.yakinlik, v.ad].filter(Boolean).join(' · ') || 'Veli'}</span>
                      <span className="block text-2xs text-muted truncate">{veliAltSatir(v)}</span>
                    </span>
                    <span className={cx('ui-chip shrink-0', cip.sinif)}>{cip.yazi}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
              <span className="block text-2xs text-muted">Geçerlilik</span>
              <span className="font-semibold text-fg">{ozet.bitis ? veliTarihYazi(ozet.bitis) : 'Açık bağlantı yok'}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
              <span className="block text-2xs text-muted">Son Açılış</span>
              <span className="font-semibold text-fg">{ozet.sonAcilis ? veliTarihYazi(ozet.sonAcilis, true) : 'Henüz açılmadı'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cx(BTN, 'ui-btn-primary')}
              onClick={() => gonder('sms')}
              disabled={mesgul || !seciliVeliler.length || !veri.smsHazir || smsYok}
              title={!veri.smsHazir ? 'SMS ayarları eksik (Yönetim › Bildirimler)' : smsYok ? 'Seçili velilerin telefonu kayıtlı değil' : undefined}
            >
              <MessageSquare className="w-3.5 h-3.5" /> {isleniyor === 'sms' ? 'Gönderiliyor…' : 'SMS ile Gönder'}
            </button>
            <button
              type="button"
              className={cx(BTN, 'ui-btn-secondary')}
              onClick={() => gonder('eposta')}
              disabled={mesgul || !seciliVeliler.length || epostaYok}
              title={epostaYok ? 'Seçili velilerin e-postası kayıtlı değil' : undefined}
            >
              <Mail className="w-3.5 h-3.5" /> {isleniyor === 'eposta' ? 'Gönderiliyor…' : 'E-posta'}
            </button>
            <button
              type="button"
              className={cx(BTN, 'ui-btn-secondary')}
              onClick={kopyala}
              disabled={mesgul || seciliVeliler.length !== 1}
              title={seciliVeliler.length !== 1 ? 'Kopyalamak için tek veli seçin' : 'Bağlantıyı kopyala (WhatsApp vb. ile kendiniz gönderin)'}
            >
              <Copy className="w-3.5 h-3.5" /> {isleniyor === 'kopya' ? 'Hazırlanıyor…' : 'Kopyala'}
            </button>
            <button type="button" className={cx(BTN, 'ui-btn-danger-soft')} onClick={iptal} disabled={mesgul || !acikSecili.length} title={!acikSecili.length ? 'Seçili velilerde açık bağlantı yok' : undefined}>
              <Ban className="w-3.5 h-3.5" /> {isleniyor === 'iptal' ? 'İptal ediliyor…' : 'İptal Et'}
            </button>
          </div>
          {!veri.smsHazir && <p className="text-2xs text-muted">SMS ayarı yapılmadığı için yalnız e-posta ve kopyalama kullanılabilir.</p>}
        </div>
      )}
    </Modal>
  );
};
export default VeliBaglantisiPenceresi;
