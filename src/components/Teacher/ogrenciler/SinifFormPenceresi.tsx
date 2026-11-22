// Öğrenciler sayfası › sınıf ekle / düzenle penceresi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { Trash2, School, X, FileSpreadsheet, Download, Upload, AlertCircle } from 'lucide-react';
import { subeAdi, SUBE_EN_UZUN } from '../../../lib/subeAdi';
import { getGradesForSchoolLevel, formatClassDisplayName } from '../../../constants/schoolConstants';
import { Modal, cx } from '../../ui/kit';
import { CompactRow, InfoTip } from '../../ui/Compact';
import { currentAcademicYear } from '../../../lib/importNormalize';
import { classLabelCls, classCtrlCls, classBtnCls } from './ortak';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function SinifFormPenceresi() {
  const { NO_BRANCH, subesizMi, branchValue, subeOnerileri, isAddClassOpen, setIsAddClassOpen, editingClass, className, setClassName, classSchoolLevel, setClassSchoolLevel, classGradeLevel, setClassGradeLevel, classBranch, setClassBranch, classAcademicYear, setClassAcademicYear, classDescription, setClassDescription, classFormError, isSavingClass, classExcelStudents, setClassExcelStudents, classExcelFileName, isReadingClassExcel, classExcelError, showExcelStudentList, setShowExcelStudentList, classExcelValidRows, classExcelInvalidCount, validateClassExcelRows, resetClassExcelState, downloadSampleClassExcel, handleClassExcelFile, handleSaveClass } = useOgrenciBaglam();
  return (
    <>
      <Modal
        open={isAddClassOpen}
        onClose={() => {
          if (!isSavingClass) setIsAddClassOpen(false);
        }}
        closeOnBackdrop={false}
        icon={School}
        tone="brand"
        title={editingClass ? 'Sınıfı Düzenle' : 'Sınıf Ekle'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddClassOpen(false)}
              disabled={isSavingClass}
              className={classBtnCls('ui-btn-secondary')}
            >
              İptal
            </button>
            {/* Aşama 202: kısa, sabit yazı; Excel'den gelecek öğrenci sayısı yukarıdaki "Öğrenci Hazır" etiketinde görünür */}
            <button type="submit" form="class-form" disabled={isSavingClass} className={classBtnCls('ui-btn-primary')}>
              {isSavingClass ? 'Kaydediliyor' : editingClass ? 'Kaydet' : 'Oluştur'}
            </button>
          </>
        }
      >
        {classFormError && (
          <div role="alert" className="mb-4 p-3 bg-danger-soft rounded-xl flex items-start gap-2 text-xs font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{classFormError}</span>
          </div>
        )}

        <form id="class-form" onSubmit={handleSaveClass} className="space-y-4">
          {/* Aşama 202: sade düzen — kutu, "Mecburi" başlığı, "Zorunlu" etiketi, yıldızlar ve emojiler kalktı; bütün alanlar aynı boyda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="class-form-school" className={classLabelCls}>
                Okul
              </label>
              <select
                id="class-form-school"
                required
                value={classSchoolLevel}
                onChange={(e) => {
                  const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                  setClassSchoolLevel(newSchool);
                  const firstGrade = newSchool === 'Lise' ? '9. Sınıf' : '5. Sınıf';
                  setClassGradeLevel(firstGrade);
                  setClassName(formatClassDisplayName('', branchValue(classBranch), firstGrade));
                }}
                className={cx(classCtrlCls, 'cursor-pointer')}
              >
                <option value="">Okul seçin</option>
                <option value="Ortaokul">Ortaokul</option>
                <option value="Lise">Lise</option>
              </select>
            </div>

            <div>
              <label htmlFor="class-form-grade" className={classLabelCls}>
                Sınıf
              </label>
              <select
                id="class-form-grade"
                required
                value={classGradeLevel}
                onChange={(e) => {
                  const newGrade = e.target.value;
                  setClassGradeLevel(newGrade);
                  setClassName(formatClassDisplayName('', branchValue(classBranch), newGrade));
                }}
                className={cx(classCtrlCls, 'cursor-pointer')}
              >
                {!classSchoolLevel ? (
                  <option value="">Önce okul seçin</option>
                ) : (
                  getGradesForSchoolLevel(classSchoolLevel).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="class-form-branch" className={classLabelCls}>
                Şube
              </label>
              {/* Aşama 325: şube harf seçilir ya da kelime yazılır (ZÜMRÜT, VENÜS); "Şubesiz" de listede */}
              <input
                autoComplete="off"
                id="class-form-branch"
                type="text"
                required
                list="class-form-branch-list"
                maxLength={SUBE_EN_UZUN + 6}
                placeholder="A ya da ZÜMRÜT"
                value={classBranch === NO_BRANCH ? 'Şubesiz' : classBranch}
                onChange={(e) => {
                  const v = e.target.value;
                  const newBranch = subesizMi(v) ? NO_BRANCH : v;
                  setClassBranch(newBranch);
                  setClassName(formatClassDisplayName('', branchValue(newBranch), classGradeLevel));
                }}
                onBlur={() => {
                  // yazılan şube büyük harfe (Türkçe) çevrilir: "zümrüt" → "ZÜMRÜT"
                  if (!subesizMi(classBranch) && subeAdi(classBranch)) setClassBranch(subeAdi(classBranch));
                }}
                aria-describedby="class-form-branch-hint"
                className={cx(classCtrlCls, 'ui-combo uppercase placeholder:normal-case')}
              />
              <datalist id="class-form-branch-list">
                {subeOnerileri.map((b) => (
                  <option key={b} value={b} />
                ))}
                <option value="Şubesiz">Yalnızca sınıf düzeyi</option>
              </datalist>
              <span id="class-form-branch-hint" className="sr-only">
                Harf seçin ya da şube adını yazın; şubesiz sınıf için Şubesiz seçin.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="class-form-name" className={cx(classLabelCls, 'flex items-center gap-1')}>
                <span>Sınıf adı</span>
                <InfoTip text="Okul, sınıf ve şubeye göre kendiliğinden yazılır; isterseniz değiştirebilirsiniz." />
              </label>
              <input
                autoComplete="off"
                id="class-form-name"
                type="text"
                required
                placeholder="Örn: 8/A"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className={classCtrlCls}
              />
            </div>

            <div>
              <label htmlFor="class-form-year" className={classLabelCls}>
                Eğitim yılı
              </label>
              <input
                autoComplete="off"
                id="class-form-year"
                type="text"
                value={classAcademicYear}
                onChange={(e) => setClassAcademicYear(e.target.value)}
                placeholder={currentAcademicYear()}
                className={classCtrlCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="class-form-description" className={cx(classLabelCls, 'flex items-center justify-between')}>
              <span>Açıklama</span>
              <span className="font-normal text-subtle">isteğe bağlı</span>
            </label>
            <input
              autoComplete="off"
              id="class-form-description"
              type="text"
              maxLength={300}
              value={classDescription}
              onChange={(e) => setClassDescription(e.target.value)}
              placeholder="Örn: LGS hazırlık sınıfı"
              className={classCtrlCls}
            />
          </div>

          {/* Toplu Öğrenci Yükleme Bölümü — Aşama 202: tek satırlık kompakt bölüm, sütun bilgisi ⓘ içinde */}
          <CompactRow
            icon={FileSpreadsheet}
            title="Excel ile öğrenci ekle"
            status={<span className="text-xs font-normal text-subtle">isteğe bağlı</span>}
            info="Sütunlar: Ad Soyad (veya Ad + Soyad), Öğrenci No, E-posta, Telefon. Dosya türü: .xlsx, .xls ya da .csv. Önce şablonu indirip doldurabilirsiniz."
            actions={
              classExcelStudents.length === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={downloadSampleClassExcel}
                    className={classBtnCls('ui-btn-ghost')}
                    title="Excel şablonunu bilgisayarınıza indirin"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Şablon</span>
                  </button>
                  <label htmlFor="class-excel-upload" className={classBtnCls('ui-btn-secondary', 'cursor-pointer')}>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isReadingClassExcel ? 'Okunuyor' : 'Dosya seç'}</span>
                  </label>
                  <input
                    id="class-excel-upload"
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleClassExcelFile(file);
                      e.target.value = '';
                    }}
                  />
                </>
              ) : null
            }
          >
            {classExcelError || classExcelStudents.length > 0 ? (
              <div className="space-y-2">
                {classExcelError && (
                  <div role="alert" className="p-2.5 bg-danger-soft rounded-xl flex items-center gap-2 text-xs font-semibold text-danger-fg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{classExcelError}</span>
                  </div>
                )}
                {classExcelStudents.length > 0 && (
              <div className="space-y-2 bg-surface p-3 rounded-xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-chip ui-chip-success">{classExcelValidRows.length} Öğrenci Hazır</span>
                    {classExcelInvalidCount > 0 && (
                      <span className="ui-chip ui-chip-danger">{classExcelInvalidCount} Hatalı Satır</span>
                    )}
                    <span className="text-xs text-muted truncate max-w-[160px]">({classExcelFileName})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowExcelStudentList(!showExcelStudentList)}
                      className={classBtnCls('ui-btn-ghost')}
                      aria-expanded={showExcelStudentList}
                    >
                      {showExcelStudentList ? 'Gizle' : 'Listeyi gör'}
                    </button>
                    <button
                      type="button"
                      onClick={resetClassExcelState}
                      className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon h-8 w-8 p-0 hover:text-danger-fg"
                      title="Listeyi Temizle"
                      aria-label="Listeyi Temizle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {classExcelInvalidCount > 0 && (
                  <p className="text-xs text-warning-fg">
                    Hatalı satırlar aktarılmaz. Satırı kaldırabilir veya Excel'i düzeltip yeniden yükleyebilirsiniz.
                  </p>
                )}

                {showExcelStudentList && (
                  <ul className="max-h-48 overflow-y-auto border border-line rounded-lg bg-surface-2 p-1.5 space-y-1">
                    {classExcelStudents.map((st, i) => (
                      <li
                        key={`${st.rowNumber}-${i}`}
                        className={cx('flex items-start justify-between gap-2 text-xs py-1 px-2 rounded', st.error ? 'bg-danger-soft' : 'text-fg-2')}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-fg">
                            <span className="text-muted font-mono mr-1">{st.rowNumber}.</span>
                            {st.fullName || <em className="text-muted">(isim yok)</em>}
                          </span>
                          {st.error && <span className="block text-danger-fg font-semibold">{st.error}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-muted font-mono">No: {st.studentNumber || '-'}</span>
                          <button
                            type="button"
                            onClick={() => setClassExcelStudents((prev) => validateClassExcelRows(prev.filter((_, idx) => idx !== i)))}
                            className="inline-flex items-center justify-center w-6 h-6 text-subtle hover:text-danger-fg rounded cursor-pointer"
                            title="Satırı kaldır"
                            aria-label={`${st.rowNumber}. satırı kaldır`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
                )}
              </div>
            ) : null}
          </CompactRow>
        </form>
      </Modal>
    </>
  );
}
export default SinifFormPenceresi;
