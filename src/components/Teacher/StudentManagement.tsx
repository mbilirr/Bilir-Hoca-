// ============================================================================
// Aşama 354a: ÖĞRENCİLER SAYFASI BÖLÜNDÜ. Eskiden 3.700 satırlık tek dosyaydı; telefon sayfayı açınca
// bütün pencereleri ve iki sekmeyi birden indirip çalıştırıyordu.
//   ogrenciler/useOgrenciYonetimi.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   ogrenciler/OgrencilerUst.tsx      : başlık ve sekmeler (hep görünür)
//   Öğrenciler / Sınıflar sekmeleri ve büyük pencereler ayrı parça: yalnız açılınca yüklenir
//   (sayfa açıldıktan kısa süre sonra öğrenci/sınıf pencereleri arka planda hazırlanır, ilk açılış beklemez).
// ============================================================================
import React, { Suspense, useEffect } from 'react';
import { lazyNamed } from '../../lib/lazyLoad'; // Aşama 370: yeni sürümde eksik parça → sayfa bir kez yenilenir
import { IskeletListe } from '../ui/Durum';
import type { StudentManagementProps } from './ogrenciler/ortak';
import { OgrenciBaglam, useOgrenciYonetimi } from './ogrenciler/useOgrenciYonetimi';
import { OgrencilerUst } from './ogrenciler/OgrencilerUst';
import { OgrenciPencereleri } from './ogrenciler/OgrenciPencereleri';

const yukle = {
  liste: () => import('./ogrenciler/OgrenciListesiSekmesi'),
  siniflar: () => import('./ogrenciler/SiniflarSekmesi'),
  ogrenciFormu: () => import('./ogrenciler/OgrenciFormPenceresi'),
  sinifFormu: () => import('./ogrenciler/SinifFormPenceresi'),
  sinifOgrencileri: () => import('./ogrenciler/SinifOgrencileriPenceresi'),
  aktar: () => import('./ogrenciler/OgrenciAktarPenceresi'),
  cakisan: () => import('./ogrenciler/CakisanOgrenciPenceresi'),
};
const OgrenciListesiSekmesi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/OgrenciListesiSekmesi').default>>(yukle.liste, 'default');
const SiniflarSekmesi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/SiniflarSekmesi').default>>(yukle.siniflar, 'default');
const OgrenciFormPenceresi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/OgrenciFormPenceresi').default>>(yukle.ogrenciFormu, 'default');
const SinifFormPenceresi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/SinifFormPenceresi').default>>(yukle.sinifFormu, 'default');
const SinifOgrencileriPenceresi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/SinifOgrencileriPenceresi').default>>(yukle.sinifOgrencileri, 'default');
const OgrenciAktarPenceresi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/OgrenciAktarPenceresi').default>>(yukle.aktar, 'default');
const CakisanOgrenciPenceresi = lazyNamed<React.ComponentProps<typeof import('./ogrenciler/CakisanOgrenciPenceresi').default>>(yukle.cakisan, 'default');

export const StudentManagement: React.FC<StudentManagementProps> = (props) => {
  const s = useOgrenciYonetimi(props);
  // Sayfa çizildikten sonra sık açılan parçaları boşta hazırla (ilk tıklamada bekleme olmasın)
  useEffect(() => {
    const t = window.setTimeout(() => {
      void yukle.ogrenciFormu();
      void yukle.sinifFormu();
      void yukle.sinifOgrencileri();
      void (s.activeTab === 'students' ? yukle.siniflar() : yukle.liste());
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <OgrenciBaglam.Provider value={s}>
      <div className="space-y-6">
        <OgrencilerUst />

        <Suspense fallback={<IskeletListe satir={6} />}>{s.activeTab === 'students' ? <OgrenciListesiSekmesi /> : <SiniflarSekmesi />}</Suspense>

        {/* her pencere kendi bekleme sınırında: biri yüklenirken açık olan öbürü kaybolmaz */}
        {s.isAddStudentOpen && <Suspense fallback={null}><OgrenciFormPenceresi /></Suspense>}
        {s.isAddClassOpen && <Suspense fallback={null}><SinifFormPenceresi /></Suspense>}
        {s.viewingClassStudents && <Suspense fallback={null}><SinifOgrencileriPenceresi /></Suspense>}
        {s.transferTargetClass && <Suspense fallback={null}><OgrenciAktarPenceresi /></Suspense>}
        {s.duplicateWarning && <Suspense fallback={null}><CakisanOgrenciPenceresi /></Suspense>}

        <OgrenciPencereleri />
      </div>
    </OgrenciBaglam.Provider>
  );
};

export default StudentManagement;
