// ============================================================================
// Aşama 361: ÖDEVLER SAYFASI BÖLÜNDÜ. Eskiden 1.760 satırlık tek dosyaydı; sayfa açılınca Ödev Kontrol, Tüm Ödevler,
// Haftalık Plan ve bütün pencereler (ödev formu, ödev ayrıntısı) birlikte indirilip çalıştırılıyordu.
//   odevler/useOdevYonetimi.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   odevler/OdevlerUst.tsx      : sayfa başlığı ve sekme seçimi (hep görünür)
//   Sekmeler, materyal penceresi, ödev formu ve ödev ayrıntısı ayrı parça: yalnız gerekince yüklenir (sayfa
//   açıldıktan kısa süre sonra sekmeler ve ödev formu arka planda hazırlanır, ilk tıklama beklemez).
// ============================================================================
import React, { Suspense, lazy, useEffect } from 'react';
import { IskeletListe } from '../ui/Durum';
import type { HomeworkManagementProps } from './odevler/ortak';
import { OdevBaglam, useOdevYonetimi } from './odevler/useOdevYonetimi';
import { OdevlerUst } from './odevler/OdevlerUst';
import { SilmeVeTeslimPencereleri } from './odevler/SilmeVeTeslimPencereleri';

const yukle = {
  kontrol: () => import('./odevler/OdevKontrol'),
  tum: () => import('./odevler/TumOdevler'),
  plan: () => import('./StudyPlanManager'),
  kaynak: () => import('./odevler/KaynakPenceresi'),
  form: () => import('./HomeworkFormModal'),
  ayrinti: () => import('./HomeworkDetailModal'),
};
const OdevKontrol = lazy(yukle.kontrol);
const TumOdevler = lazy(yukle.tum);
const StudyPlanManager = lazy(() => yukle.plan().then((m) => ({ default: m.StudyPlanManager })));
const KaynakPenceresi = lazy(yukle.kaynak);
const HomeworkFormModal = lazy(() => yukle.form().then((m) => ({ default: m.HomeworkFormModal })));
const HomeworkDetailModal = lazy(() => yukle.ayrinti().then((m) => ({ default: m.HomeworkDetailModal })));

export const HomeworkManagement: React.FC<HomeworkManagementProps> = (props) => {
  const s = useOdevYonetimi(props);
  // Sayfa çizildikten sonra sekmeleri ve ödev formunu boşta hazırla (sekme değişince ya da "Ödev Oluştur"da bekleme olmasın)
  useEffect(() => {
    const t = window.setTimeout(() => {
      void yukle.kontrol();
      void yukle.tum();
      void yukle.form();
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <OdevBaglam.Provider value={s}>
      <div className="space-y-6">
        <OdevlerUst />

        <Suspense fallback={<IskeletListe satir={6} />}>
          {/* TAB 3: HAFTALIK ÇALIŞMA PLANI (Aşama 19) */}
          {s.activeTab === 'plan' && <StudyPlanManager students={s.students} classes={s.classes} odakOgrenci={s.planOdak} />}
          {s.activeTab === 'tracker' && <OdevKontrol />}
          {s.activeTab === 'all' && <TumOdevler />}
        </Suspense>

        {/* her pencere kendi bekleme sınırında: biri yüklenirken açık olan öbürü kaybolmaz (kapalıyken hepsi boş çizer) */}
        {s.editingResourcesHw && <Suspense fallback={null}><KaynakPenceresi /></Suspense>}
        {/* ÖDEV OLUŞTUR / KOPYALA / DÜZENLE */}
        {s.homeworkForm && (
          <Suspense fallback={null}>
            <HomeworkFormModal
              open={!!s.homeworkForm}
              mode={s.homeworkForm?.mode || 'create'}
              source={s.homeworkForm?.source || null}
              students={s.students}
              classes={s.classes}
              onClose={() => s.setHomeworkForm(null)}
              onSaved={s.handleHomeworkSaved}
            />
          </Suspense>
        )}
        <SilmeVeTeslimPencereleri />
        {/* HOMEWORK DETAIL MODAL (Sayfanın hepsi açılır, sayfa altında indir butonu vardır) */}
        {s.activeViewingHomework && (
          <Suspense fallback={null}>
            <HomeworkDetailModal
              isOpen={!!s.activeViewingHomework}
              onClose={() => s.setActiveViewingHomework(null)}
              homework={s.activeViewingHomework}
              students={s.students}
              classes={s.classes}
              submissions={s.submissions}
            />
          </Suspense>
        )}
      </div>
    </OdevBaglam.Provider>
  );
};
