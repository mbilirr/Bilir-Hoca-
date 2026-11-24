// ============================================================================
// Aşama 381: Oyunlar — oyun ayrıntısı: bağlantılar (sınıf QR'ı ya da kişisel), sonuçlar, kazanım başarısı,
// kapat / aç / süreyi uzat / sil. Sonuçları RLS ile oyunu hazırlayan ve kurum yöneticisi / Müdür / Müdür Yrd. görür.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Lock, LockOpen, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { SelectBox } from '../FormParts';
import { appConfirm } from '../../../lib/appDialog';
import { basariBildir, hataBildir } from '../../../lib/bildirim';
import {
  DURUM_AD,
  GUN_SECENEKLERI,
  MOD_AD,
  OYUN_TABLOLARI,
  birimAd,
  acOyun,
  kapatOyun,
  listDenemeler,
  listKazanimSonuclari,
  oyunBaglantilari,
  oyunDurumu,
  silOyun,
  sifirlaDeneme,
  uzatOyun,
  type DenemeKaydi,
  type KazanimSonucu,
  type OyunBaglantilari,
  type OyunKaydi,
} from '../../../services/oyunOturumService';
import { QrKod } from './QrKod';
import type { OyunBaslangic } from './OyunHazirla';
import { panoyaKopyala } from './kopya';
import { MOD_SIMGE, tarihYaz } from './ortak';
import { useTabloSurumu } from '../../../lib/tabloSurumu';

const saatYaz = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

/** Aşama 384: doğru oranı bu sınırın altındaki kazanım "zayıf" sayılır */
const ZAYIF_ORAN = 0.5;

export const OyunDetay: React.FC<{ oyun: OyunKaydi; onClose: () => void; onChanged: () => void; onZayifOyun?: (b: OyunBaslangic) => void }> = ({ oyun: ilk, onClose, onChanged, onZayifOyun }) => {
  const [oyun, setOyun] = useState(ilk);
  const [baglanti, setBaglanti] = useState<OyunBaglantilari | null>(null);
  const [denemeler, setDenemeler] = useState<DenemeKaydi[] | null>(null);
  const [kazanimlar, setKazanimlar] = useState<KazanimSonucu[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [gun, setGun] = useState(7);
  const [arama, setArama] = useState('');
  const durum = oyunDurumu(oyun);

  const yukle = useCallback(async () => {
    try {
      const [b, d, k] = await Promise.all([oyunBaglantilari(oyun.id), listDenemeler(oyun.id), listKazanimSonuclari(oyun.id)]);
      setBaglanti(b);
      setDenemeler(d);
      setKazanimlar(k);
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Oyun bilgileri yüklenemedi.');
    }
  }, [oyun.id]);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Aşama 386: öğrenci oyuna başlayınca / bitirince sonuçlar ve kazanım başarısı kendiliğinden tazelenir (sql/386).
  // Bağlantılar yeniden istenmez (değişmezler).
  const surum = useTabloSurumu(OYUN_TABLOLARI);
  useEffect(() => {
    if (!surum) return;
    let iptal = false;
    Promise.all([listDenemeler(oyun.id), listKazanimSonuclari(oyun.id)])
      .then(([d, k]) => {
        if (iptal) return;
        setDenemeler(d);
        setKazanimlar(k);
      })
      .catch(() => undefined); // tazeleme olmazsa ekrandaki sonuçlar kalır
    return () => {
      iptal = true;
    };
  }, [surum, oyun.id]);

  const kopyala = async (metin: string, ad = 'Bağlantı') => {
    if (await panoyaKopyala(metin)) basariBildir(`${ad} kopyalandı`);
    else hataBildir('Kopyalanamadı', 'Bağlantıyı elle seçip kopyalayın.');
  };

  const islem = async (yap: () => Promise<void>, basari: string) => {
    setMesgul(true);
    try {
      await yap();
      basariBildir(basari);
      onChanged();
    } catch (e) {
      hataBildir('İşlem yapılamadı', e instanceof Error ? e.message : undefined);
    } finally {
      setMesgul(false);
    }
  };

  const kapatAc = () =>
    islem(async () => {
      if (oyun.kapaliAt) await acOyun(oyun.id);
      else await kapatOyun(oyun.id);
      setOyun((o) => ({ ...o, kapaliAt: o.kapaliAt ? null : new Date().toISOString() }));
    }, oyun.kapaliAt ? 'Oyun yeniden açıldı' : 'Oyun kapatıldı');

  const uzat = () =>
    islem(async () => {
      const bitis = await uzatOyun(oyun.id, gun);
      setOyun((o) => ({ ...o, bitis, kapaliAt: null }));
    }, 'Süre uzatıldı');

  const sil = async () => {
    const onay = await appConfirm({ title: 'Oyun silinsin mi?', message: `"${oyun.ad}" oyununun bağlantıları çalışmaz olur ve bütün sonuçları silinir.`, danger: true });
    if (!onay) return;
    await islem(async () => {
      await silOyun(oyun.id);
      onClose();
    }, 'Oyun silindi');
  };

  const sifirla = async (d: DenemeKaydi) => {
    const onay = await appConfirm({ title: 'Sonuç sıfırlansın mı?', message: `${d.ad} bu oyunu yeniden oynayabilecek; şimdiki sonucu silinir.`, danger: true });
    if (!onay) return;
    await islem(async () => {
      await sifirlaDeneme(oyun.id, d.studentId);
      await yukle();
    }, 'Sonuç sıfırlandı');
  };

  const zayif = kazanimlar.filter((k) => k.toplam > 0 && k.dogru / k.toplam < ZAYIF_ORAN).map((k) => k.kod);
  const bitenler = (denemeler || []).filter((d) => d.durum === 'bitti');
  const ortalama = bitenler.length ? Math.round(bitenler.reduce((t, d) => t + d.puan, 0) / bitenler.length) : 0;
  const kisiler = useMemo(() => baglanti?.kisisel || [], [baglanti]);
  const oynamayan = useMemo(() => {
    const oynayan = new Set((denemeler || []).map((d) => d.studentId));
    return kisiler.filter((k) => !oynayan.has(k.id));
  }, [kisiler, denemeler]);
  const gorunenKisiler = kisiler.filter((k) => !arama.trim() || k.ad.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')));

  return (
    <Modal open onClose={onClose} icon={MOD_SIMGE[oyun.mod]} title={oyun.ad} description={`${MOD_AD[oyun.mod]} · ${oyun.classAd} · ${oyun.soruSayisi} ${birimAd(oyun.mod)}`} size="lg">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
          <span className={cx('rounded-lg px-2 py-1 font-semibold', durum === 'acik' ? 'bg-success-soft text-success-fg' : durum === 'doldu' ? 'bg-warning-soft text-warning-fg' : 'bg-surface-2 text-fg-2')}>{DURUM_AD[durum]}</span>
          <span>{durum === 'acik' ? `${saatYaz(oyun.bitis)} tarihine kadar açık` : oyun.kapaliAt ? 'Öğretmen kapattı' : `${tarihYaz(oyun.bitis)} tarihinde doldu`}</span>
          <span aria-hidden>·</span>
          <span>{oyun.olusturanAd || 'Yönetici'}</span>
        </div>

        {hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
        {!hata && !baglanti && <Yukleniyor satir={4} metin="Oyun yükleniyor…" />}

        {baglanti?.sinif && (
          <section className="space-y-3" aria-labelledby="oyun-bag">
            <h3 id="oyun-bag" className="text-sm font-semibold text-fg">
              Sınıf bağlantısı
            </h3>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 rounded-2xl border border-line bg-white p-2">
                <QrKod metin={baglanti.sinif} boyut={176} />
              </div>
              <div className="w-full min-w-0 space-y-2.5">
                <p className="text-xs text-muted">QR kodu tahtaya yansıt ya da bağlantıyı gönder; öğrenci listeden adını seçer. Öğrenci kendi ana sayfasından (Bana gelenler › Oyun) da oynayabilir; her öğrenci bir kez oynar.</p>
                <div className="flex items-center gap-2">
                  <input readOnly aria-label="Sınıf bağlantısı" value={baglanti.sinif} onFocus={(e) => e.currentTarget.select()} className="ui-field min-w-0 flex-1" />
                  <Button variant="secondary" leftIcon={<Copy className="w-3.5 h-3.5" />} onClick={() => void kopyala(baglanti.sinif!)}>
                    Kopyala
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {baglanti?.kisisel && (
          <section className="space-y-3" aria-labelledby="oyun-kisisel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="oyun-kisisel" className="text-sm font-semibold text-fg">
                Kişisel bağlantılar ({kisiler.length})
              </h3>
              <Button variant="secondary" leftIcon={<Copy className="w-3.5 h-3.5" />} onClick={() => void kopyala(kisiler.map((k) => `${k.ad}: ${k.url}`).join('\n'), 'Bütün bağlantılar')}>
                Hepsini kopyala
              </Button>
            </div>
            <p className="text-xs text-muted">Her bağlantı yalnız o öğrenciye aittir. Adıyla birlikte kopyalayıp mesaj olarak gönderebilirsiniz.</p>
            {kisiler.length > 8 && <input type="search" aria-label="Öğrenci ara" value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Öğrenci ara" className="ui-field w-full" />}
            <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
              {gorunenKisiler.map((k) => (
                <li key={k.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{k.ad}</span>
                  <Button variant="ghost" size="sm" ikon aria-label={`${k.ad} bağlantısını kopyala`} title="Bağlantıyı kopyala" onClick={() => void kopyala(k.url, `${k.ad} bağlantısı`)}>
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
              {gorunenKisiler.length === 0 && <li className="py-4 text-center text-xs text-muted">Öğrenci bulunamadı.</li>}
            </ul>
          </section>
        )}

        {denemeler && (
          <section className="space-y-3" aria-labelledby="oyun-sonuc">
            <h3 id="oyun-sonuc" className="text-sm font-semibold text-fg">
              Sonuçlar
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { ad: 'Bitiren', deger: bitenler.length },
                { ad: 'Devam eden', deger: denemeler.length - bitenler.length },
                { ad: 'Ortalama puan', deger: ortalama },
              ].map((x) => (
                <div key={x.ad} className="rounded-xl bg-surface-2 px-3 py-2.5 text-center">
                  <p className="text-xl font-bold tabular-nums text-fg">{x.deger}</p>
                  <p className="text-2xs font-semibold text-muted">{x.ad}</p>
                </div>
              ))}
            </div>
            {denemeler.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">Henüz kimse oynamadı.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {denemeler.map((d, i) => (
                  <li key={d.studentId} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-5 text-center text-xs font-semibold tabular-nums text-subtle">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{d.ad}</span>
                      <span className="block text-2xs text-muted">
                        {d.durum === 'bitti' ? `${d.toplam} ${birimAd(oyun.mod)}dan ${d.dogru} doğru` : 'Oyun sürüyor'}
                        {d.bitisAt ? ` · ${saatYaz(d.bitisAt)}` : ''}
                      </span>
                    </span>
                    <span className="w-12 text-right text-sm font-bold tabular-nums text-fg">{d.puan}</span>
                    <Button variant="ghost" size="sm" ikon aria-label={`${d.ad} sonucunu sıfırla`} title="Sonucu sıfırla (yeniden oynasın)" onClick={() => void sifirla(d)} disabled={mesgul}>
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {oyun.kapsam === 'kisisel' && oynamayan.length > 0 && (
              <p className="text-xs text-muted">
                Henüz oynamayan {oynamayan.length} öğrenci: {oynamayan.slice(0, 8).map((k) => k.ad).join(', ')}
                {oynamayan.length > 8 ? ` ve ${oynamayan.length - 8} kişi daha` : ''}
              </p>
            )}
          </section>
        )}

        {kazanimlar.length > 0 && (
          <section className="space-y-3" aria-labelledby="oyun-kaz">
            <h3 id="oyun-kaz" className="text-sm font-semibold text-fg">
              Kazanım başarısı
            </h3>
            <ul className="space-y-2">
              {kazanimlar.map((k) => {
                const oran = Math.round((k.dogru / k.toplam) * 100);
                return (
                  <li key={k.kod} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-fg-2">{k.kod}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        %{oran} · {k.dogru}/{k.toplam}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className={cx('h-full rounded-full', oran < 50 ? 'bg-danger' : oran < 75 ? 'bg-warning' : 'bg-success')} style={{ width: `${oran}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-2xs text-subtle">En zayıf kazanım üstte. Düşük çıkanları derste tekrar edebilirsiniz.</p>
            {onZayifOyun && zayif.length > 0 && (
              <Button variant="secondary" leftIcon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => onZayifOyun({ ad: `${oyun.ad} · tekrar`.slice(0, 80), classId: oyun.classId, kazanimlar: zayif })}>
                Zayıf kazanımlardan oyun hazırla ({zayif.length})
              </Button>
            )}
          </section>
        )}

        <section className="space-y-3 border-t border-line pt-4" aria-labelledby="oyun-yonet">
          <h3 id="oyun-yonet" className="text-sm font-semibold text-fg">
            Yönet
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" leftIcon={oyun.kapaliAt ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} onClick={() => void kapatAc()} disabled={mesgul}>
              {oyun.kapaliAt ? 'Yeniden aç' : 'Kapat'}
            </Button>
            <div className="flex items-center gap-2">
              <SelectBox aria-label="Uzatma süresi" value={String(gun)} onChange={(e) => setGun(Number(e.target.value))} className="ui-field cursor-pointer w-32">
                {GUN_SECENEKLERI.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </SelectBox>
              <Button variant="secondary" onClick={() => void uzat()} disabled={mesgul}>
                Süreyi uzat
              </Button>
            </div>
            <Button variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => void sil()} disabled={mesgul}>
              Sil
            </Button>
          </div>
          <p className="text-2xs text-subtle">Süreyi uzatmak bugünden başlayarak yeni bir bitiş verir ve oyun kapalıysa yeniden açar.</p>
        </section>
      </div>
    </Modal>
  );
};
