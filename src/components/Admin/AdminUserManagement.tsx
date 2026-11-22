// ============================================================================
// Aşama 354d: KULLANICI YÖNETİMİ BÖLÜNDÜ. Eskiden 2.600 satırlık tek dosyaydı; Yönetim > Öğretmenler /
// Öğrenciler açılınca düzenleme, rol, erişim ve yeni öğretmen pencereleri de birlikte indirilip çalıştırılıyordu.
//   kullanicilar/useKullaniciYonetimi.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   kullanicilar/KullanicilarUst, KullaniciSuzgecleri, KullaniciTablosu : hep görünen kısım
//   Düzenleme, rol, erişim ve yeni öğretmen pencereleri ayrı parça: yalnız açılınca yüklenir
//   (sayfa açıldıktan kısa süre sonra arka planda hazırlanır, ilk tıklama beklemez).
// ============================================================================
import React, { Suspense, useEffect } from 'react';
import { lazyNamed } from '../../lib/lazyLoad'; // Aşama 370: yeni sürümde eksik parça → sayfa bir kez yenilenir
import type { AdminUserManagementProps } from './kullanicilar/ortak';
import { KullaniciBaglam, useKullaniciYonetimi } from './kullanicilar/useKullaniciYonetimi';
import { YetkisizErisim } from './kullanicilar/YetkisizErisim';
import { KullanicilarUst } from './kullanicilar/KullanicilarUst';
import { KullaniciSuzgecleri } from './kullanicilar/KullaniciSuzgecleri';
import { KullaniciTablosu } from './kullanicilar/KullaniciTablosu';
import { OnayPencereleri } from './kullanicilar/OnayPencereleri';
import { KullaniciPencereleri } from './kullanicilar/KullaniciPencereleri';

const yukle = {
  duzenle: () => import('./kullanicilar/KullaniciDuzenlePenceresi'),
  rol: () => import('./kullanicilar/RolPenceresi'),
  erisim: () => import('./kullanicilar/ErisimPenceresi'),
  yeniOgretmen: () => import('./kullanicilar/YeniOgretmenParcasi'),
};
const KullaniciDuzenlePenceresi = lazyNamed<React.ComponentProps<typeof import('./kullanicilar/KullaniciDuzenlePenceresi').default>>(yukle.duzenle, 'default');
const RolPenceresi = lazyNamed<React.ComponentProps<typeof import('./kullanicilar/RolPenceresi').default>>(yukle.rol, 'default');
const ErisimPenceresi = lazyNamed<React.ComponentProps<typeof import('./kullanicilar/ErisimPenceresi').default>>(yukle.erisim, 'default');
const YeniOgretmenParcasi = lazyNamed<React.ComponentProps<typeof import('./kullanicilar/YeniOgretmenParcasi').default>>(yukle.yeniOgretmen, 'default');

export const AdminUserManagement: React.FC<AdminUserManagementProps> = (props) => {
  const s = useKullaniciYonetimi(props);
  // Sayfa çizildikten sonra sık açılan pencereleri boşta hazırla
  useEffect(() => {
    const t = window.setTimeout(() => {
      void yukle.duzenle();
      void yukle.rol();
      void yukle.erisim();
      void yukle.yeniOgretmen();
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Route Guard: yalnız yöneticiler erişebilir
  if (!s.isSuperAdmin) return <YetkisizErisim onNavigateHome={props.onNavigateHome} />;

  return (
    <KullaniciBaglam.Provider value={s}>
      <div className="space-y-6 animate-in fade-in duration-200">
        <KullanicilarUst />
        <KullaniciSuzgecleri />
        <KullaniciTablosu />

        {/* her pencere kendi bekleme sınırında: biri yüklenirken açık olan öbürü kaybolmaz */}
        {s.editModalUser && <Suspense fallback={null}><KullaniciDuzenlePenceresi /></Suspense>}
        {s.roleModalUser && <Suspense fallback={null}><RolPenceresi /></Suspense>}
        <OnayPencereleri />
        {s.authModalTeacher && <Suspense fallback={null}><ErisimPenceresi /></Suspense>}
        {s.isCreateTeacherOpen && <Suspense fallback={null}><YeniOgretmenParcasi /></Suspense>}
        <KullaniciPencereleri />
      </div>
    </KullaniciBaglam.Provider>
  );
};

export default AdminUserManagement;
