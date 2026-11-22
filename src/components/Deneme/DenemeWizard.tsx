// ============================================================================
// Aşama 363: DENEME SİHİRBAZI BÖLÜNDÜ. Eskiden 1.831 satırlık tek dosyaydı ve Deneme sayfasıyla birlikte (sihirbaz
// açılmasa da) indiriliyordu.
//   sihirbaz/useSihirbaz.tsx  : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   sihirbaz/SihirbazUst, Adim1Bilgiler, SihirbazAlt, SihirbazPencereleri : hep gereken parçalar
//   Adim2Optik, Adim3Eslestirme, Adim4Kayit : ayrı parça; sihirbaz açılınca hemen arka planda hazırlanır.
//   Sihirbazın kendisi de Deneme sayfasında yalnız "Yeni deneme", taslak ya da optik yükleme açılınca iner.
// ============================================================================
import React, { Suspense, lazy, useEffect } from 'react';
import { IskeletListe } from '../ui/Durum';
import type { DenemeWizardProps } from './sihirbaz/ortak';
import { SihirbazBaglam, useSihirbaz } from './sihirbaz/useSihirbaz';
import { SihirbazUst } from './sihirbaz/SihirbazUst';
import { Adim1Bilgiler } from './sihirbaz/Adim1Bilgiler';
import { SihirbazAlt } from './sihirbaz/SihirbazAlt';
import { SihirbazPencereleri } from './sihirbaz/SihirbazPencereleri';

const yukle = {
  optik: () => import('./sihirbaz/Adim2Optik'),
  eslestirme: () => import('./sihirbaz/Adim3Eslestirme'),
  kayit: () => import('./sihirbaz/Adim4Kayit'),
};
const Adim2Optik = lazy(yukle.optik);
const Adim3Eslestirme = lazy(yukle.eslestirme);
const Adim4Kayit = lazy(yukle.kayit);

export type { DenemeWizardProps };

export const DenemeWizard: React.FC<DenemeWizardProps> = (props) => {
  const s = useSihirbaz(props);
  // Sihirbaz açıldı: öbür adımları hemen arka planda hazırla (adım değişince bekleme olmasın)
  useEffect(() => {
    void yukle.optik();
    void yukle.eslestirme();
    void yukle.kayit();
  }, []);

  return (
    <SihirbazBaglam.Provider value={s}>
      <div className="space-y-4" id="deneme-wizard">
        <SihirbazUst />
        <Adim1Bilgiler />
        <Suspense fallback={<IskeletListe satir={6} />}>
          {s.step === 2 && <Adim2Optik />}
          {s.step === 3 && <Adim3Eslestirme />}
          {s.step === 4 && s.computed && <Adim4Kayit />}
        </Suspense>
        <SihirbazAlt />
        <SihirbazPencereleri />
      </div>
    </SihirbazBaglam.Provider>
  );
};
