// ============================================================================
// Aşama 354b: SORU TAKİBİ SAYFASI BÖLÜNDÜ. Eskiden 3.400 satırlık tek dosyaydı; sayfa açılınca haftalık,
// aylık, sınıf sıralaması panoları ve bütün pencereler birlikte indirilip çalıştırılıyordu.
//   soruTakibi/useSoruTakibi.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   soruTakibi/SoruTakibiUst.tsx : üst denetim çubuğu (hep görünür)
//   Sınıf görünümü, haftalık / aylık pano, sınıf sıralaması ve büyük pencereler ayrı parça: yalnız gerekince
//   yüklenir (sayfa açıldıktan kısa süre sonra panolar arka planda hazırlanır, ilk tıklama beklemez).
// ============================================================================
import React, { Suspense, useEffect } from 'react';
import { lazyNamed } from '../../lib/lazyLoad'; // Aşama 370: yeni sürümde eksik parça → sayfa bir kez yenilenir
import { IskeletListe } from '../ui/Durum';
import type { QuestionTrackingViewProps } from './soruTakibi/ortak';
import { SoruTakibiBaglam, useSoruTakibi } from './soruTakibi/useSoruTakibi';
import { SoruTakibiUst } from './soruTakibi/SoruTakibiUst';
import { HedefPencereleri } from './soruTakibi/HedefPencereleri';

const yukle = {
  sinif: () => import('./soruTakibi/SinifGenelBakis'),
  haftalik: () => import('./soruTakibi/HaftalikPano'),
  aylik: () => import('./soruTakibi/AylikPano'),
  siralama: () => import('./soruTakibi/SinifSiralamasi'),
  kayitlar: () => import('./soruTakibi/SoruKayitlariPenceresi'),
  gecmisHafta: () => import('./soruTakibi/GecmisHaftaPenceresi'),
  gecmisAy: () => import('./soruTakibi/GecmisAylarPenceresi'),
  tebrik: () => import('./soruTakibi/TebrikPenceresi'),
};
const SinifGenelBakis = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/SinifGenelBakis').default>>(yukle.sinif, 'default');
const HaftalikPano = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/HaftalikPano').default>>(yukle.haftalik, 'default');
const AylikPano = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/AylikPano').default>>(yukle.aylik, 'default');
const SinifSiralamasi = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/SinifSiralamasi').default>>(yukle.siralama, 'default');
const SoruKayitlariPenceresi = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/SoruKayitlariPenceresi').default>>(yukle.kayitlar, 'default');
const GecmisHaftaPenceresi = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/GecmisHaftaPenceresi').default>>(yukle.gecmisHafta, 'default');
const GecmisAylarPenceresi = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/GecmisAylarPenceresi').default>>(yukle.gecmisAy, 'default');
const TebrikPenceresi = lazyNamed<React.ComponentProps<typeof import('./soruTakibi/TebrikPenceresi').default>>(yukle.tebrik, 'default');

export const QuestionTrackingView: React.FC<QuestionTrackingViewProps> = (props) => {
  const s = useSoruTakibi(props);
  // Sayfa çizildikten sonra panoları boşta hazırla (öğrenci seçilince ya da sekme değişince bekleme olmasın)
  useEffect(() => {
    const t = window.setTimeout(() => {
      void yukle.sinif();
      void yukle.haftalik();
      void yukle.aylik();
      void yukle.siralama();
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <SoruTakibiBaglam.Provider value={s}>
      <div className="space-y-6">
        <SoruTakibiUst />

        <Suspense fallback={<IskeletListe satir={6} />}>
          {!s.activeStudent ? (
            <SinifGenelBakis />
          ) : s.activeAnalysisMode === 'weekly' ? (
            <HaftalikPano />
          ) : s.activeAnalysisMode === 'monthly' ? (
            <AylikPano />
          ) : (
            <SinifSiralamasi />
          )}
        </Suspense>

        {/* her pencere kendi bekleme sınırında: biri yüklenirken açık olan öbürü kaybolmaz */}
        {s.isManageLogsModalOpen && s.activeStudent && <Suspense fallback={null}><SoruKayitlariPenceresi /></Suspense>}
        {s.isWeekModalOpen && s.activeStudent && <Suspense fallback={null}><GecmisHaftaPenceresi /></Suspense>}
        {s.isMonthModalOpen && s.activeStudent && <Suspense fallback={null}><GecmisAylarPenceresi /></Suspense>}
        <HedefPencereleri />
        {s.praiseTargetDay && s.activeStudent && <Suspense fallback={null}><TebrikPenceresi /></Suspense>}
      </div>
    </SoruTakibiBaglam.Provider>
  );
};

export default QuestionTrackingView;
