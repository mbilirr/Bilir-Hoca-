// ============================================================================
// Aşama 362: ETÜTLER SAYFASI BÖLÜNDÜ. Eskiden 1.678 satırlık tek dosyaydı; sayfa açılınca takvim, liste, yoklama
// görünümleri ve bütün pencereler (etüt formu, analiz, liste indirme, bilgilendirme, etüt öğretmenleri) birlikte
// indirilip çalıştırılıyordu.
//   etutler/useEtutYonetimi.tsx : bütün durum ve işlemler (davranış aynı), bağlamla parçalara verilir
//   etutler/EtutlerUst.tsx      : başlık, görünüm seçimi, takip görünümü ve süzgeç çubuğu (hep görünür)
//   Takvim, Liste, Yoklama görünümleri ve pencereler ayrı parça: yalnız gerekince yüklenir (sayfa açıldıktan kısa
//   süre sonra görünümler ve etüt formu arka planda hazırlanır, ilk tıklama beklemez).
//   Hep yerinde duran pencereler (form, bilgilendirme, etüt öğretmenleri) ilk açılışta yüklenir ve sonra eskisi gibi
//   yerinde kalır: içlerindeki seçimler korunur, kapanış canlandırması bozulmaz.
// ============================================================================
import React, { Suspense, useEffect } from 'react';
import { lazyNamed, prefetchModules, useEverTrue } from '../../lib/lazyLoad';
import { IskeletListe } from '../ui/Durum';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { SentCommunicationsModal } from './SentCommunicationsModal';
import { dataService } from '../../services/dataService';
import type { Etut } from '../../types';
import { EtutDetayModal, type EtutManagementProps } from './etutler/ortak';
import { EtutBaglam, useEtutYonetimi } from './etutler/useEtutYonetimi';
import { EtutlerUst } from './etutler/EtutlerUst';

const yukle = {
  takvim: () => import('./etutler/EtutTakvim'),
  kartlar: () => import('./etutler/EtutKartlari'),
  yoklama: () => import('./etutler/EtutYoklamaGorunumu'),
  form: () => import('./EtutFormModal'),
  disaAktar: () => import('./EtutScheduleExportModal'),
  analiz: () => import('./EtutAnalysisReportModal'),
  bilgilendirme: () => import('./EtutNotificationModal'),
  yoklamaPenceresi: () => import('./EtutAttendanceModal'),
  ogretmenler: () => import('./EtutTeacherManagerModal'),
};
const EtutTakvim = lazyNamed<React.ComponentProps<typeof import('./etutler/EtutTakvim').EtutTakvim>>(yukle.takvim, 'EtutTakvim');
const EtutKartlari = lazyNamed<React.ComponentProps<typeof import('./etutler/EtutKartlari').EtutKartlari>>(yukle.kartlar, 'EtutKartlari');
const EtutYoklamaGorunumu = lazyNamed<React.ComponentProps<typeof import('./etutler/EtutYoklamaGorunumu').EtutYoklamaGorunumu>>(yukle.yoklama, 'EtutYoklamaGorunumu');
const EtutFormModal = lazyNamed<React.ComponentProps<typeof import('./EtutFormModal').EtutFormModal>>(yukle.form, 'EtutFormModal');
const EtutScheduleExportModal = lazyNamed<React.ComponentProps<typeof import('./EtutScheduleExportModal').EtutScheduleExportModal>>(yukle.disaAktar, 'EtutScheduleExportModal');
const EtutAnalysisReportModal = lazyNamed<React.ComponentProps<typeof import('./EtutAnalysisReportModal').EtutAnalysisReportModal>>(yukle.analiz, 'EtutAnalysisReportModal');
const EtutNotificationModal = lazyNamed<React.ComponentProps<typeof import('./EtutNotificationModal').EtutNotificationModal>>(yukle.bilgilendirme, 'EtutNotificationModal');
const EtutAttendanceModal = lazyNamed<React.ComponentProps<typeof import('./EtutAttendanceModal').EtutAttendanceModal>>(yukle.yoklamaPenceresi, 'EtutAttendanceModal');
const EtutTeacherManagerModal = lazyNamed<React.ComponentProps<typeof import('./EtutTeacherManagerModal').EtutTeacherManagerModal>>(yukle.ogretmenler, 'EtutTeacherManagerModal');

export const EtutManagement: React.FC<EtutManagementProps> = (props) => {
  const s = useEtutYonetimi(props);
  const formVar = useEverTrue(!!s.etutForm);
  const bilgilendirmeVar = useEverTrue(s.isDispatchModalOpen);
  const ogretmenlerVar = useEverTrue(s.isTeacherManagerOpen);
  // Sayfa çizildikten sonra görünümleri ve etüt formunu boşta hazırla (görünüm değişince ya da "Etüt Oluştur"da bekleme olmasın)
  // (yeni sürüm yayınlanıp parça bulunamazsa sessizce geçilir; veri tasarrufunda indirilmez)
  useEffect(() => prefetchModules([yukle.takvim, yukle.kartlar, yukle.yoklama, yukle.form], 1500), []);

  return (
    <EtutBaglam.Provider value={s}>
      <div className="space-y-6">
        <EtutlerUst />

        <Suspense fallback={<IskeletListe satir={6} />}>
          {s.viewMode === 'calendar' && <EtutTakvim />}
          {s.viewMode === 'cards' && <EtutKartlari />}
          {s.viewMode === 'attendance' && <EtutYoklamaGorunumu />}
        </Suspense>

        {/* CONFIRM DELETE ETUT MODAL */}
        <ConfirmDeleteModal
          isOpen={!!s.etutToDelete}
          onClose={() => s.setEtutToDelete(null)}
          onConfirm={s.handleConfirmDeleteEtut}
          title="Etütü Sil"
          itemBadge={s.etutToDelete ? `${s.etutToDelete.subject} • ${s.etutToDelete.date} ${s.etutToDelete.time}` : undefined}
          description={`"${s.etutToDelete?.topic}" başlıklı etüt planını silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Yapılmamış bir etütse etüt öğretmenine iptal e-postası gönderilir.`}
          confirmButtonText="Etütü Sil"
        />

        {/* Giden E-Posta & Bildirim İletim Günlüğü */}
        <SentCommunicationsModal isOpen={s.isSentCommunicationsOpen} onClose={() => s.setIsSentCommunicationsOpen(false)} />

        {/* her pencere kendi bekleme sınırında: biri yüklenirken açık olan öbürü kaybolmaz */}
        {/* Etüt listesi indirme penceresi (Aşama 27; yalnızca açıkken çizilir) */}
        {s.isScheduleExportOpen && (
          <Suspense fallback={null}>
            <EtutScheduleExportModal
              onClose={() => s.setIsScheduleExportOpen(false)}
              etuts={s.activeEtuts.filter((e) => !e.privacyRedacted)}
              students={s.students}
              classes={s.classes}
            />
          </Suspense>
        )}

        {/* Etüt Analizi (yalnızca açıkken çizilir; her açılışta durum sıfırlanır) */}
        {s.isReportModalOpen && (
          <Suspense fallback={null}>
            <EtutAnalysisReportModal
              onClose={() => {
                s.setIsReportModalOpen(false);
                s.setReportSelectedStudentId(undefined);
              }}
              etuts={s.etuts.filter((e) => !e.privacyRedacted) /* Aşama 40: başka öğretmenin etüdü rapora girmez */}
              students={s.students}
              classes={s.classes}
              preselectedStudentId={s.reportSelectedStudentId}
              defaultScope={s.scope}
            />
          </Suspense>
        )}

        {/* Etüt Bilgilendirme ve İletişim (WhatsApp & Otomatik Mail) Modalı */}
        {bilgilendirmeVar && (
          <Suspense fallback={null}>
            <EtutNotificationModal
              isOpen={s.isDispatchModalOpen}
              onClose={() => {
                s.setIsDispatchModalOpen(false);
                s.setSelectedEtutForDispatch(null);
              }}
              etut={s.selectedEtutForDispatch}
              students={s.students}
            />
          </Suspense>
        )}

        {/* Etüt Yoklama ve Devamsızlık Takibi Modalı */}
        {s.selectedEtutForAttendance && (
          <Suspense fallback={null}>
            <EtutAttendanceModal
              isOpen={!!s.selectedEtutForAttendance}
              onClose={() => s.setSelectedEtutForAttendance(null)}
              etut={s.selectedEtutForAttendance}
              allStudents={s.students}
            />
          </Suspense>
        )}

        {s.viewEtut && (
          <Suspense fallback={null}>
            <EtutDetayModal
              etut={s.viewEtut}
              students={s.students}
              classes={s.classes}
              canEdit={s.canEditEtut(s.viewEtut)}
              onClose={() => s.setViewEtut(null)}
              onEditAttendance={(e: Etut) => {
                s.setViewEtut(null);
                s.setSelectedEtutForAttendance(e);
              }}
            />
          </Suspense>
        )}

        {/* ETÜT OLUŞTUR / DÜZENLE */}
        {formVar && (
          <Suspense fallback={null}>
            <EtutFormModal
              open={!!s.etutForm}
              mode={s.etutForm?.mode || 'create'}
              source={s.etutForm?.source || null}
              initialDate={s.etutForm?.initialDate || null}
              initialStudentIds={s.etutForm?.ogrenciler || null}
              students={s.students}
              classes={s.classes}
              etuts={dataService.getEtuts() /* Aşama 111: çakışma denetimi ortak takvim satırlarıyla birlikte */}
              onClose={() => s.setEtutForm(null)}
              onSaved={s.handleEtutSaved}
              onManageTeachers={() => s.setIsTeacherManagerOpen(true)}
              teacherListVersion={s.teacherListVersion}
            />
          </Suspense>
        )}

        {/* ETÜT ÖĞRETMENLERİ (YÖNETİCİ) */}
        {ogretmenlerVar && (
          <Suspense fallback={null}>
            <EtutTeacherManagerModal
              open={s.isTeacherManagerOpen}
              onClose={() => s.setIsTeacherManagerOpen(false)}
              onChanged={() => s.setTeacherListVersion((v) => v + 1)}
            />
          </Suspense>
        )}
      </div>
    </EtutBaglam.Provider>
  );
};
