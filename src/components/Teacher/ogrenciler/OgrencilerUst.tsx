// Öğrenciler sayfası › başlık ve sekmeler (Aşama 354a: ayrı parça)
import { Users, Plus, School, FileSpreadsheet, Download, ShieldCheck, KeyRound, VenusAndMars } from 'lucide-react';
import { PageHeader, Segmented } from '../../ui/kit';
import { MoreMenu } from '../../ui/MoreMenu';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function OgrencilerUst() {
  const { students, classes, setCredPickOpen, canSendAnyCred, activeTab, setActiveTab, canAddStudents, canAddClasses, setIsAddStudentOpen, setIsExcelModalOpen, setIsExcelUpdateOpen, setIsListExportOpen, setIsExcelClassModalOpen, setEditingStudent, setIsAddClassOpen, setIsGenderFillOpen, genderCounts, resetStudentForm, resetClassForm } = useOgrenciBaglam();
  return (
    <>
      <PageHeader
        icon={Users}
        tone="brand"
        title="Öğrenciler"
        description="Öğrenci hesapları ve sınıflar"
        actions={
          activeTab === 'students' ? (
            <>
            {/* Aşama 207: seyrek işlemler "Diğer" menüsünde; yalnız Öğrenci ekle açıkta */}
            <MoreMenu
              id="student-more-btn"
              label="Diğer"
              sheetTitle="Öğrenciler"
              items={[
                {
                  id: 'student-list-export-btn',
                  label: 'Liste al',
                  icon: Download,
                  title: 'Sınıf ya da tüm sınıflar için öğrenci listesini Excel olarak al',
                  onClick: () => setIsListExportOpen(true),
                },
                {
                  id: 'ogrenciler-giris-bilgisi-btn',
                  label: 'Giriş bilgisi gönder',
                  icon: KeyRound,
                  title: 'Sınıf seçip öğrencilere ve/veya velilerine giriş bilgisini SMS / e-posta ile gönder',
                  show: !!canSendAnyCred,
                  onClick: () => setCredPickOpen(true),
                },
                {
                  id: 'student-excel-upload-btn',
                  label: "Excel'den toplu yükle",
                  icon: FileSpreadsheet,
                  title: 'Excel (.xlsx, .xls) veya CSV dosyasından toplu öğrenci ekle',
                  show: !!canAddStudents,
                  onClick: () => setIsExcelModalOpen(true),
                },
                {
                  id: 'student-excel-update-btn',
                  label: 'Excel ile güncelle',
                  icon: FileSpreadsheet,
                  title: "Sistemdeki öğrencilerin bilgilerini Excel'den toplu güncelle (yeni öğrenci eklemez)",
                  show: !!canAddStudents,
                  onClick: () => setIsExcelUpdateOpen(true),
                },
                {
                  /* Aşama 171 */
                  id: 'ogrenci-cinsiyet-doldur-btn',
                  label: genderCounts.none > 0 ? `Cinsiyeti doldur (${genderCounts.none})` : 'Cinsiyeti doldur',
                  icon: VenusAndMars,
                  title: 'Cinsiyeti boş öğrencileri adlarından tahmin edip doldur (kaydetmeden önce kontrol edersiniz)',
                  show: !!canAddStudents,
                  onClick: () => setIsGenderFillOpen(true),
                },
              ]}
            />
            {canAddStudents ? (
                <button
                  type="button"
                  id="student-add-btn"
                  onClick={() => {
                    resetStudentForm();
                    setEditingStudent(null);
                    setIsAddStudentOpen(true);
                  }}
                  className="ui-btn ui-btn-primary w-28"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Öğrenci ekle</span>
                </button>
            ) : (
              <span className="ui-chip ui-chip-warning py-1.5 px-3 text-xs">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Öğrenci ekleme ve çıkarma yöneticiye aittir
              </span>
            )}
            </>
          ) : canAddClasses ? (
            <>
              <button
                type="button"
                onClick={() => setIsExcelClassModalOpen(true)}
                className="ui-btn ui-btn-secondary w-28"
                title="Excel (.xlsx, .xls) veya CSV dosyasından toplu sınıf ekle"
              >
                {/* Aşama 207: iki düğme aynı en ve boy, kısa yazı */}
                <FileSpreadsheet className="w-3.5 h-3.5 text-success-fg" />
                <span>Excel'den</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetClassForm();
                  setIsAddClassOpen(true);
                }}
                className="ui-btn ui-btn-primary w-28"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sınıf ekle</span>
              </button>
            </>
          ) : (
            <span className="ui-chip ui-chip-warning py-1.5 px-3 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Sınıf ekleme yetkisi yalnızca yöneticiye aittir
            </span>
          )
        }
      />
      <Segmented
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        items={[
          { value: 'students', label: `Öğrenciler (${students.length})`, icon: Users },
          { value: 'classes', label: `Sınıflar (${classes.length})`, icon: School },
        ]}
      />
    </>
  );
}
export default OgrencilerUst;
