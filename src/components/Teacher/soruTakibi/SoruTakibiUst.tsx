// Soru Takibi › üst denetim çubuğu (sınıf, öğrenci, görünüm seçimi) (Aşama 354b: ayrı parça)
import { Calendar, Users, User, Download, ChevronDown, X, BarChart3, Search, Check, Sparkles, Target, ListOrdered } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { MoreMenu } from '../../ui/MoreMenu';
import { downloadWeeklyPDF, downloadMonthlyPDF } from '../../../utils/questionAnalytics';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function SoruTakibiUst() {
  const { classes, students, selectedClassId, selectedStudentId, setSelectedStudentId, activeStudent, activeClass, classStudents, isStudentDropdownOpen, setIsStudentDropdownOpen, studentSearchQuery, setStudentSearchQuery, dropdownScope, setDropdownScope, studentDropdownRef, handleSelectClass, handleSelectStudent, activeAnalysisMode, setActiveAnalysisMode, setIsManageLogsModalOpen, activeLogs, getStudentTodayQuestionCount, filteredDropdownStudents, myActiveTarget, setIsStudentTargetsModalOpen, setIsClassTargetsModalOpen, studentTargetsCount, classTargetsCount, openNewTarget, handleOpenStudentTargetModal, handleOpenClassTargetModal, weeklyAnalytics, monthlyAnalytics } = useSoruTakibiBaglam();
  return (
    <>
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        {/* Top Looker Studio Header Brand */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">Soru Takibi</h1>
              <p className="text-sm text-muted mt-0.5">Çözülen soru sayıları, hedefler ve başarı analizi</p>
            </div>
          </div>

          {/* Target Menus & Quick Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Aşama 208: seyrek kullanılan işlemler "Diğer ⋯" menüsünde (Aşama 207 ortak menü); açıkta yalnız hedef verme */}
            <MoreMenu
              id="btn-question-more"
              label="Diğer"
              sheetTitle="Soru takibi"
              items={[
                {
                  id: 'btn-open-student-targets',
                  label: `Öğrenci hedefleri${studentTargetsCount > 0 ? ` (${studentTargetsCount})` : ''}`,
                  icon: User,
                  title: 'Kayıtlı öğrenci soru hedeflerini görüntüle ve yönet',
                  onClick: () => setIsStudentTargetsModalOpen(true),
                },
                {
                  id: 'btn-open-class-targets',
                  label: `Sınıf hedefleri${classTargetsCount > 0 ? ` (${classTargetsCount})` : ''}`,
                  icon: Users,
                  title: 'Kayıtlı sınıf toplu soru hedeflerini görüntüle ve yönet',
                  onClick: () => setIsClassTargetsModalOpen(true),
                },
                {
                  id: 'btn-manage-question-logs',
                  label: 'Soru kayıtları',
                  icon: ListOrdered,
                  title: 'Öğrencinin tüm kayıtlı soru girişlerini listele ve yönet',
                  show: !!activeStudent,
                  onClick: () => setIsManageLogsModalOpen(true),
                },
                {
                  id: 'btn-looker-pdf-weekly',
                  label: 'Haftalık rapor (PDF)',
                  icon: Download,
                  show: !!activeStudent && activeAnalysisMode === 'weekly' && !!weeklyAnalytics,
                  onClick: () => {
                    if (activeStudent && weeklyAnalytics)
                      downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: activeLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) });
                  },
                },
                {
                  id: 'btn-looker-pdf-monthly',
                  label: 'Aylık rapor (PDF)',
                  icon: Download,
                  show: !!activeStudent && activeAnalysisMode === 'monthly' && !!monthlyAnalytics,
                  onClick: () => {
                    if (activeStudent && monthlyAnalytics)
                      downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: activeLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) });
                  },
                },
              ]}
            />

            {/* Soru Hedefi Belirleme Butonu (Aşama 98: hedef verebilenlerde) · Aşama 208: kısa yazı, uzun açıklama title'da */}
            {dataService.canGiveTargets() && (
            <button
              type="button"
              id="btn-set-weekly-target"
              onClick={() => {
                if (activeStudent) {
                  handleOpenStudentTargetModal(activeStudent);
                } else if (activeClass && activeClass.id !== 'all') {
                  handleOpenClassTargetModal(activeClass);
                } else {
                  openNewTarget('student');
                }
              }}
              className="ui-btn ui-btn-sm ui-btn-primary w-28"
              title={
                activeStudent
                  ? myActiveTarget
                    ? `Hedef: ${myActiveTarget.targetQuestions} soru (düzenle)`
                    : 'Öğrenciye soru hedefi ver'
                  : activeClass && activeClass.id !== 'all'
                  ? 'Sınıfa toplu soru hedefi ver'
                  : 'Soru sayısı hedefi belirle'
              }
            >
              <Target className="w-3.5 h-3.5" />
              <span className="truncate">
                {activeStudent && myActiveTarget
                  ? `Hedef: ${myActiveTarget.targetQuestions}`
                  : activeClass && activeClass.id !== 'all' && !activeStudent
                  ? 'Sınıfa hedef'
                  : 'Hedef ver'}
              </span>
            </button>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Parameter Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          {/* 1. Sınıf Seçimi */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line">
            <label className="block text-xs font-bold text-fg-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-fg" />
                Sınıf Filtresi
              </span>
              {selectedClassId && (
                <button
                  type="button"
                  onClick={() => handleSelectClass('')}
                  className="ui-link ui-link-muted text-2xs hover:text-danger-fg"
                >
                  Sınıfı Temizle ✕
                </button>
              )}
            </label>
            {/* Aşama 66: sınıf kutusu öğrenci seçimi kutusuyla aynı biçim ve boyutta (h-9, aynı kenar, ok simgesi) · Aşama 208: ikisi de ortak ölçü h-8 */}
            <div className="relative">
            <select
              id="looker-filter-class"
              value={selectedClassId}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="ui-field w-full appearance-none font-semibold pl-3 pr-8 cursor-pointer truncate"
            >
              <option value="">Sınıf Seçiniz</option>
              <option value="all">Tüm Sınıflar (Tüm Okul - {students.length} Öğrenci)</option>
              {classes.map((c) => {
                const count = students.filter((s) => s.classId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} Öğrenci)
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
          </div>

          {/* 2. Öğrenci Seçimi (Arama Kutulu & Renk Vurgulu Özel Açılır Menü) */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line relative" ref={studentDropdownRef}>
            <label className="block text-xs font-bold text-fg-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-fg" />
                Öğrenci Seçimi
              </span>
              {selectedStudentId && (
                <button
                  type="button"
                  onClick={() => setSelectedStudentId('')}
                  className="ui-link ui-link-muted text-2xs hover:text-danger-fg"
                >
                  Seçimi Kaldır ✕
                </button>
              )}
            </label>

            <button
              id="looker-filter-student-btn"
              type="button"
              onClick={() => {
                setIsStudentDropdownOpen((prev) => !prev);
                setStudentSearchQuery('');
              }}
              className="ui-field w-full font-semibold flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer text-left shadow-2xs hover:border-line-strong transition-colors"
            >
              {activeStudent ? (
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`font-bold ${
                      getStudentTodayQuestionCount(activeStudent.id) > 0
                        ? 'text-success-fg font-bold'
                        : 'text-fg'
                    }`}
                  >
                    {activeStudent.name}
                  </span>
                  {activeStudent.className && (
                    <span className="text-2xs text-subtle truncate">
                      ({activeStudent.className})
                    </span>
                  )}
                  {getStudentTodayQuestionCount(activeStudent.id) > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-3xs font-bold bg-success-soft text-success-fg border border-success/30">
                      🎯 {getStudentTodayQuestionCount(activeStudent.id)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted font-medium">Öğrenci Seçiniz</span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-subtle shrink-0 transition-transform ${
                  isStudentDropdownOpen ? 'rotate-180 text-brand-fg' : ''
                }`}
              />
            </button>

            {/* Açılır Arama ve Öğrenci Seçim Paneli */}
            {isStudentDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-surface border border-line-strong rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in duration-100">
                {/* En üstteki Yapışkan Arama Kutusu */}
                <div className="p-2 border-b border-line bg-surface-2 sticky top-0 z-20 space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Öğrenci ara (büyük/küçük harf duyarsız)..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="ui-field w-full pl-8 pr-7 font-semibold"
                    />
                    {studentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setStudentSearchQuery('')}
                        className="absolute right-2 top-2 text-subtle hover:text-muted cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Kapsam Filtresi: Eğer sınıf seçilmişse sınıf içi veya tüm okul toggle'ı */}
                  {selectedClassId && selectedClassId !== 'all' && (
                    <div className="flex rounded-lg bg-surface-3/80 p-0.5 text-2xs font-bold">
                      <button
                        type="button"
                        onClick={() => setDropdownScope('class')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'class'
                            ? 'bg-surface text-brand-fg shadow-2xs font-extrabold'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        {activeClass?.name || 'Sınıf'} ({classStudents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDropdownScope('all')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'all'
                            ? 'bg-surface text-brand-fg shadow-2xs font-extrabold'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        Tüm Okul ({students.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Seçim Seçenekleri */}
                <div className="overflow-y-auto divide-y divide-line flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId('');
                      setIsStudentDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-2 flex items-center justify-between cursor-pointer"
                  >
                    <span>Öğrenci Seçiniz (Seçimi Temizle)</span>
                    {!selectedStudentId && <Check className="w-3.5 h-3.5 text-brand-fg" />}
                  </button>

                  {filteredDropdownStudents.length === 0 ? (
                    <div className="py-6 text-center text-xs text-subtle">
                      Eşleşen öğrenci bulunamadı.
                    </div>
                  ) : (
                    filteredDropdownStudents.map((s) => {
                      const todayCount = getStudentTodayQuestionCount(s.id);
                      const hasSolvedToday = todayCount > 0;
                      const isSelected = selectedStudentId === s.id;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStudent(s.id)}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            hasSolvedToday
                              ? isSelected
                                ? 'bg-success-soft/90 text-success-fg font-bold border-l-4 border-success'
                                : 'bg-success-soft/70 hover:bg-success-soft/70 text-success-fg border-l-4 border-success'
                              : isSelected
                              ? 'bg-brand-soft text-brand-fg font-bold'
                              : 'hover:bg-surface-2 text-fg-2'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`truncate ${
                                hasSolvedToday
                                  ? 'text-success-fg font-extrabold flex items-center gap-1.5'
                                  : 'font-semibold'
                              }`}
                            >
                              {hasSolvedToday && (
                                <Sparkles className="w-3.5 h-3.5 text-success-fg shrink-0" />
                              )}
                              {s.name}
                            </span>
                            {s.className && (
                              <span className="text-2xs text-subtle shrink-0">
                                ({s.className})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {hasSolvedToday && (
                              <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-success text-white shadow-xs">
                                🎯 Bugün {todayCount} Soru
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-brand-fg" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Görünüm Dönemi (Haftalık / Aylık / Sınıf Sıralaması) */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line">
            <label className="block text-xs font-bold text-fg-2 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-fg" />
              Analiz Boyutu
            </label>
            <div className="ui-seg flex w-full" role="group" aria-label="Analiz boyutu">
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('weekly')}
                className="ui-seg-btn flex-1" aria-pressed={activeAnalysisMode === 'weekly'}
              >
                Haftalık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('monthly')}
                className="ui-seg-btn flex-1" aria-pressed={activeAnalysisMode === 'monthly'}
              >
                Aylık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('class_overview')}
                className="ui-seg-btn flex-1" aria-pressed={activeAnalysisMode === 'class_overview'}
              >
                Sınıf
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
export default SoruTakibiUst;
