// ============================================================================
// Aşama 367: Yönetim › Bölümler › VELİ GÖRÜNÜMÜ ayarları (kurum yöneticisi; sistem sahibi kuruma geçince)
// Bölümün kendisi (aç / kapat) kurum bölümleri listesindedir; bu kart yalnız bölüm açıkken görünür.
//  - Gösterilecekler: velinin sayfasındaki kartlar (kurumda kapalı bölüm zaten çıkmaz, burada seçilemez)
//  - Kim gönderebilir: yönetici her zaman; Rehberlik ve Öğretmenler isteğe bağlı (bireysel hesapta tek kişi var, gizli)
//  - Geçerlilik: yeni gönderilen bağlantının süresi
// ============================================================================
import React, { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Panel, Segmented } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { bildir } from '../../lib/bildirim';
import { useVeliDurumum, veliAyarKaydet, VELI_KARTLAR, VELI_SURELER, type VeliAyar, type VeliGonderen, type VeliSure } from '../../services/veliService';

const GONDERENLER: Array<{ key: VeliGonderen; title: string }> = [
  { key: 'yonetici', title: 'Yönetici' },
  { key: 'rehberlik', title: 'Rehberlik' },
  { key: 'ogretmen', title: 'Öğretmenler' },
];
const ayni = (a: VeliAyar, b: VeliAyar) => a.sure === b.sure && a.goster.join() === b.goster.join() && a.gonderen.join() === b.gonderen.join();

export const VeliAyarPaneli: React.FC = () => {
  const durum = useVeliDurumum();
  const [ayar, setAyar] = useState<VeliAyar | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  useEffect(() => {
    if (durum) setAyar(durum.ayar);
  }, [durum]);
  if (!durum || !durum.acik || !durum.duzenleyebilir || !ayar) return null;

  const modules = (dataService.getMyKurum().modules || {}) as Record<string, boolean | undefined>;
  const bireysel = dataService.isBireysel();
  const degisti = !ayni(ayar, durum.ayar);
  const kartDegistir = (k: VeliAyar['goster'][number]) =>
    setAyar((a) => a && { ...a, goster: VELI_KARTLAR.map((x) => x.key).filter((x) => (x === k ? !a.goster.includes(x) : a.goster.includes(x))) });
  const gonderenDegistir = (g: VeliGonderen) =>
    setAyar((a) => a && { ...a, gonderen: GONDERENLER.map((x) => x.key).filter((x) => x === 'yonetici' || (x === g ? !a.gonderen.includes(x) : a.gonderen.includes(x))) });

  const kaydet = async () => {
    setKaydediliyor(true);
    try {
      const yeni = await veliAyarKaydet(ayar);
      setAyar(yeni);
      bildir({ tur: 'basari', baslik: 'Veli görünümü ayarları kaydedildi' });
    } catch (e: any) {
      bildir({ tur: 'hata', baslik: 'Kaydedilemedi', ayrinti: e?.message });
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <Panel
      id="yonetim-veli-ayar"
      icon={Link2}
      title="Veli Görünümü"
      description="Velilere yalnız okunur haftalık özet bağlantısı"
      actions={
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center" onClick={kaydet} disabled={!degisti || kaydediliyor}>
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      }
    >
      <div className="space-y-4">
        <section className="space-y-2">
          <div>
            <p className="text-xs font-bold text-fg">Gösterilecekler</p>
            <p className="text-2xs text-muted">Velinin sayfasındaki kartlar; kurumda kapalı bölüm zaten çıkmaz</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VELI_KARTLAR.map((k) => {
              const kapali = modules[k.modul] !== true;
              return (
                <button
                  key={k.key}
                  type="button"
                  className="ui-secim min-w-24"
                  aria-pressed={!kapali && ayar.goster.includes(k.key)}
                  disabled={kapali}
                  title={kapali ? 'Bu bölüm kurumda kapalı' : undefined}
                  onClick={() => kartDegistir(k.key)}
                >
                  {k.title}
                </button>
              );
            })}
          </div>
        </section>

        {!bireysel && (
          <section className="space-y-2">
            <div>
              <p className="text-xs font-bold text-fg">Kim gönderebilir</p>
              <p className="text-2xs text-muted">Kurum yöneticisi her zaman gönderir; önerilen: Yönetici ve Rehberlik</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GONDERENLER.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className="ui-secim min-w-24"
                  aria-pressed={g.key === 'yonetici' || ayar.gonderen.includes(g.key)}
                  disabled={g.key === 'yonetici'}
                  title={g.key === 'yonetici' ? 'Kurum yöneticisi her zaman gönderebilir' : undefined}
                  onClick={() => gonderenDegistir(g.key)}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <div>
            <p className="text-xs font-bold text-fg">Geçerlilik</p>
            <p className="text-2xs text-muted">Yeni gönderilen bağlantıya uygulanır; süresi dolan bağlantı açılmaz, yenisi gönderilir</p>
          </div>
          <Segmented<VeliSure> size="sm" value={ayar.sure} onChange={(v) => setAyar((a) => a && { ...a, sure: v })} items={VELI_SURELER} />
        </section>

        <p className="text-2xs text-muted border-t border-line pt-3">
          Bölüm kapatılınca bütün açık veli bağlantıları hemen geçersiz olur. Öğrenci pasif yapılır, başka kuruma geçer ya da velinin
          telefonu / e-postası değişirse o velinin bağlantısı da kendiliğinden kapanır.
        </p>
      </div>
    </Panel>
  );
};
export default VeliAyarPaneli;
