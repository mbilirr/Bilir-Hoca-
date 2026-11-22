// ============================================================================
// Aşama 354c: ÖĞRENCİ SORU MODÜLÜ BÖLÜNDÜ. Eskiden 3.200 satırlık tek dosyaydı; öğrenci Sorular bölümünü
// açınca haftalık, aylık panolar, kayıt formu, geçmiş ve iki pencere birlikte indirilip çalıştırılıyordu.
//   soruModulu/useSoruModulu.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   soruModulu/SoruModuluUst.tsx : üst çubuk ve sekmeler (hep görünür)
//   soruModulu/ortak.tsx         : ortak yardımcılar (öğretmenin Soru Takibi sayfası da bunları kullanır)
//   Sekmeler ve pencereler ayrı parça: yalnız açılınca yüklenir (sayfa açıldıktan kısa süre sonra öbür
//   sekmeler arka planda hazırlanır, sekme değişince bekleme olmaz).
// ============================================================================
import React, { Suspense, lazy, useEffect } from 'react';
import { IskeletListe } from '../ui/Durum';
import type { StudentQuestionModuleProps } from './soruModulu/ortak';
import { SoruModuluBaglam, useSoruModulu } from './soruModulu/useSoruModulu';
import { SoruModuluUst } from './soruModulu/SoruModuluUst';

const yukle = {
  haftalik: () => import('./soruModulu/HaftalikSoruPanosu'),
  aylik: () => import('./soruModulu/AylikSoruPanosu'),
  giris: () => import('./soruModulu/SoruGirisFormu'),
  gecmis: () => import('./soruModulu/GecmisKayitlar'),
  gecmisHafta: () => import('./soruModulu/GecmisHaftalarPenceresi'),
  gecmisAy: () => import('./soruModulu/GecmisAylarPenceresi'),
};
const HaftalikSoruPanosu = lazy(yukle.haftalik);
const AylikSoruPanosu = lazy(yukle.aylik);
const SoruGirisFormu = lazy(yukle.giris);
const GecmisKayitlar = lazy(yukle.gecmis);
const GecmisHaftalarPenceresi = lazy(yukle.gecmisHafta);
const GecmisAylarPenceresi = lazy(yukle.gecmisAy);

export const StudentQuestionModule: React.FC<StudentQuestionModuleProps> = (props) => {
  const s = useSoruModulu(props);
  // Sayfa çizildikten sonra öbür sekmeleri boşta hazırla (sekme değişince bekleme olmasın)
  useEffect(() => {
    const t = window.setTimeout(() => {
      void yukle.haftalik();
      void yukle.giris();
      void yukle.aylik();
      void yukle.gecmis();
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <SoruModuluBaglam.Provider value={s}>
      <div className="space-y-6">
        <SoruModuluUst />

        <Suspense fallback={<IskeletListe satir={6} />}>
          {s.activeTab === 'weekly' && <HaftalikSoruPanosu />}
          {s.activeTab === 'monthly' && <AylikSoruPanosu />}
          {s.activeTab === 'entry' && <SoruGirisFormu />}
          {s.activeTab === 'history' && <GecmisKayitlar />}
        </Suspense>

        {/* her pencere kendi bekleme sınırında */}
        {s.isWeekModalOpen && <Suspense fallback={null}><GecmisHaftalarPenceresi /></Suspense>}
        {s.isMonthModalOpen && <Suspense fallback={null}><GecmisAylarPenceresi /></Suspense>}
      </div>
    </SoruModuluBaglam.Provider>
  );
};

export default StudentQuestionModule;
