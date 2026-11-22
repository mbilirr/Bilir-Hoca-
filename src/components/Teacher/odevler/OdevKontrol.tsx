// Ödevler › Ödev Kontrol sekmesi (arama, süzgeçler, ödev şeritleri, teslim çizelgesi) (Aşama 361: ayrı parça, yalnız gerekince yüklenir)
import { BookOpen, Plus, Clock, CheckCircle2, ChevronDown, X, Paperclip, Search, School, XCircle, AlertCircle, Info, HelpCircle } from 'lucide-react';
import { Homework, HomeworkCheckStatus } from '../../../types';
import { dataService } from '../../../services/dataService';
import { submissionHasContent, getSubmissionAttachmentCount } from '../SubmissionViewModal';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { normalizeSubject } from '../../../lib/subjects';
import { profilResmi } from '../../../lib/profilResmi';
import { useOdevBaglam } from './useOdevYonetimi';

export function OdevKontrol() {
  const { homeworks, students, classes, submissions, activeTab, selectedHomeworkId, setSelectedHomeworkId, selectedClassIdForCheck, setSelectedClassIdForCheck, studentSearchInput, setStudentSearchInput, setSaveFeedback, isSavingChecks, setIsSavingChecks, showSaveError, setDraftCheckStatuses, setViewingSubmissionKey, trackerSearch, setTrackerSearch, trackerFilterSubject, setTrackerFilterSubject, formatDueDateTurkish, canGive, openHomeworkForm, homeworkTargetsClass, studentsForHomeworkInClass, savedCheckStatusOf, dueInfoOf, getStudentCheckStatus } = useOdevBaglam();
  return (
    <>
      {activeTab === 'tracker' && (() => {
        if (homeworks.length === 0) {
          return (
            <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 text-brand-fg flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-fg mb-2">Henüz Kayıtlı Ödev Bulunmuyor</h3>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                {canGive ? 'Ödev kontrolü yapabilmek için lütfen önce sisteme bir ödev ekleyiniz.' : 'Öğretmenler ödev verdiğinde burada görünür.'}
              </p>
              {canGive && (
                <button
                  type="button"
                  onClick={() => openHomeworkForm('create')}
                  className="ui-btn ui-btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  <span>İlk Ödevi Oluştur</span>
                </button>
              )}
            </div>
          );
        }

        // 1. Seçili sınıf (tek sınıf varsa kendiliğinden seçilir)
        const effectiveClassId =
          selectedClassIdForCheck && classes.some((c) => c.id === selectedClassIdForCheck)
            ? selectedClassIdForCheck
            : classes.length === 1
              ? classes[0].id
              : '';
        const currentClass = classes.find((c) => c.id === effectiveClassId) || null;
        const classAllStudents = currentClass ? students.filter((s) => s.classId === currentClass.id) : [];

        // 2. Bu sınıfa verilen ödevler ve dersleri
        const classHomeworks = currentClass
          ? homeworks.filter((hw) => homeworkTargetsClass(hw, currentClass.id, classAllStudents))
          : [];
        const classSubjects = Array.from(new Set(classHomeworks.map((h) => normalizeSubject(h.subject)).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b, 'tr')
        );
        const subjectFilter =
          trackerFilterSubject !== 'all' && classSubjects.includes(trackerFilterSubject) ? trackerFilterSubject : 'all';

        // 3. Arama + ders süzgeci. Sıralama: önce süresi bugün dolan/dolmuş ödevler (en yenisi üstte),
        //    sonra yaklaşan ödevler (en yakını üstte)
        const endOfToday = (() => {
          const d = new Date();
          d.setHours(23, 59, 59, 999);
          return d.getTime();
        })();
        const dueMs = (hw: Homework) => {
          const t = new Date(hw.dueDate).getTime();
          return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
        };
        const searchQ = trackerSearch.trim();
        const stripHomeworks = classHomeworks
          .filter((hw) => subjectFilter === 'all' || normalizeSubject(hw.subject) === subjectFilter)
          .filter((hw) => {
            if (!searchQ) return true;
            const hay = [hw.title, hw.subject, hw.description, ...(hw.outcomes || []), ...(hw.learningOutcomes || [])].filter(Boolean).join(' ');
            return matchTurkishSearch(hay, searchQ);
          })
          .sort((a, b) => {
            const ta = dueMs(a);
            const tb = dueMs(b);
            const pa = ta <= endOfToday;
            const pb = tb <= endOfToday;
            if (pa !== pb) return pa ? -1 : 1;
            return pa ? tb - ta : ta - tb;
          });

        const isTrackerFiltered = Boolean(selectedClassIdForCheck) || subjectFilter !== 'all' || searchQ !== '';

        // 4. Açık olan ödev şeridi ve öğrencileri
        const currentHw = stripHomeworks.find((h) => h.id === selectedHomeworkId) || null;
        const classStudents = currentHw ? studentsForHomeworkInClass(currentHw, classAllStudents) : [];

        const displayedStudents = classStudents.filter((std) => {
          if (!studentSearchInput.trim()) return true;
          const q = studentSearchInput.toLocaleLowerCase('tr-TR').trim();
          return (
            std.name.toLocaleLowerCase('tr-TR').includes(q) ||
            (std.studentNumber && std.studentNumber.includes(q))
          );
        });

        let countYapti = 0;
        let countYapmadi = 0;
        let countEksik = 0;
        let countIzinli = 0;
        let countGelmedi = 0;
        classStudents.forEach((std) => {
          const status = getStudentCheckStatus(std.id);
          if (status === 'yapti') countYapti++;
          else if (status === 'yapmadi') countYapmadi++;
          else if (status === 'eksik') countEksik++;
          else if (status === 'izinli') countIzinli++;
          else if (status === 'gelmedi') countGelmedi++;
        });

        // Durum butonuna tıklandığında anında kaydet
        const handleStatusClick = async (studentId: string, status: HomeworkCheckStatus) => {
          if (!currentHw) return;
          setDraftCheckStatuses((prev) => {
            const next = { ...prev };
            delete next[studentId];
            return next;
          });
          try {
            await dataService.saveHomeworkCheckStatuses(currentHw.id, [{ studentId, checkStatus: status }]);
          } catch (err: any) {
            showSaveError(err, 'Kontrol durumu kaydedilemedi.');
          }
        };

        // Toplu durum belirleme
        const handleBulkStatusChange = async (status: HomeworkCheckStatus) => {
          if (!currentHw || classStudents.length === 0 || isSavingChecks) return;
          setIsSavingChecks(true);
          try {
            await dataService.saveHomeworkCheckStatuses(
              currentHw.id,
              classStudents.map((std) => ({ studentId: std.id, checkStatus: status }))
            );
          } catch (err: any) {
            showSaveError(err, 'Toplu kontrol durumu kaydedilemedi.');
            return;
          } finally {
            setIsSavingChecks(false);
          }
          setDraftCheckStatuses({});
          const labels: Record<HomeworkCheckStatus, string> = {
            yapti: 'Yaptı',
            yapmadi: 'Yapmadı',
            eksik: 'Eksik',
            izinli: 'İzinli',
            gelmedi: 'Gelmedi',
          };
          setSaveFeedback(`✓ ${currentClass?.name || 'Sınıf'} için tüm öğrenciler "${labels[status]}" olarak kaydedildi.`);
        };

        const toggleStrip = (hw: Homework) => {
          setDraftCheckStatuses({});
          setStudentSearchInput('');
          if (currentHw && currentHw.id === hw.id) {
            setSelectedHomeworkId('');
            return;
          }
          setSelectedHomeworkId(hw.id);
          setTimeout(() => {
            document.getElementById(`hw-strip-${hw.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        };

        const clearTrackerFilters = () => {
          setTrackerSearch('');
          setTrackerFilterSubject('all');
          setSelectedClassIdForCheck('');
          setSelectedHomeworkId('');
        };

        return (
          <div className="space-y-4">
            {/* Arama ve süzgeç çubuğu (Tüm Ödevler ekranıyla aynı düzen) */}
            <div id="tracker-filter-bar" className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Hızlı Arama Kutusu */}
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                    <input
                      type="text"
                      id="tracker-search-input"
                      value={trackerSearch}
                      onChange={(e) => setTrackerSearch(e.target.value)}
                      placeholder="Ödev başlığı, ders veya konu ara..."
                      className="ui-field w-full pl-9 pr-8"
                    />
                    {trackerSearch && (
                      <button
                        type="button"
                        onClick={() => setTrackerSearch('')}
                        aria-label="Aramayı temizle"
                        className="ui-input-btn right-2.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sınıf Seçimi */}
                  <div className="flex items-center">
                    <select
                      id="tracker-class-select"
                      aria-label="Sınıf seçiniz"
                      value={effectiveClassId}
                      onChange={(e) => {
                        setSelectedClassIdForCheck(e.target.value);
                        setDraftCheckStatuses({});
                        setStudentSearchInput('');
                      }}
                      className={`ui-field w-auto font-medium cursor-pointer ${
                        effectiveClassId ? 'border-line text-fg-2' : 'border-brand/30 text-brand-fg'
                      }`}
                    >
                      <option value="">Sınıf Seçiniz</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders Seçimi */}
                  <div className="flex items-center">
                    <select
                      id="tracker-subject-select"
                      aria-label="Ders seçiniz"
                      value={subjectFilter}
                      onChange={(e) => setTrackerFilterSubject(e.target.value)}
                      disabled={!currentClass}
                      className="ui-field w-auto text-fg-2 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="all">Tüm Dersler</option>
                      {classSubjects.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtreleri Temizle */}
                  {isTrackerFiltered && (
                    <button
                      type="button"
                      onClick={clearTrackerFilters}
                      className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-muted min-w-24"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Filtreleri Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç */}
                <div className="flex items-center lg:justify-end shrink-0">
                  <span className="text-xs text-muted font-medium">
                    {currentClass ? (
                      <>
                        <strong className="text-fg">{currentClass.name}</strong> · {stripHomeworks.length} ödev ·{' '}
                        {classAllStudents.length} öğrenci
                      </>
                    ) : (
                      <>Toplam {homeworks.length} ödev</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Sınıf seçilmeden önce yönlendirme */}
            {!currentClass ? (
              <div className="bg-surface border border-line rounded-2xl p-10 text-center shadow-sm space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-fg flex items-center justify-center mx-auto">
                  <School className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-fg">Kontrol edilecek sınıfı seçin</p>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  {/* Aşama 185: kısaltıldı */}
                  Yukarıdan <strong>sınıfı</strong> seçin, ödevler burada listelenir. Kontrol için ödeve tıklayın.
                </p>
              </div>
            ) : stripHomeworks.length === 0 ? (
              <div className="bg-surface border border-line rounded-2xl p-10 text-center shadow-sm space-y-3">
                <Search className="w-10 h-10 mx-auto text-subtle" />
                <p className="text-sm font-bold text-fg">
                  {classHomeworks.length === 0
                    ? `${currentClass.name} sınıfına verilmiş ödev bulunmuyor.`
                    : 'Seçimlerinize uygun ödev bulunamadı.'}
                </p>
                {classHomeworks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackerSearch('');
                      setTrackerFilterSubject('all');
                    }}
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    Ders ve aramayı sıfırla
                  </button>
                )}
              </div>
            ) : (
              <div id="tracker-hw-strips" className="space-y-2.5">
                {stripHomeworks.map((hw) => {
                  const isOpen = currentHw?.id === hw.id;
                  const hwStudents = studentsForHomeworkInClass(hw, classAllStudents);
                  const total = hwStudents.length;
                  const tally = { yapti: 0, yapmadi: 0, eksik: 0, izinli: 0, gelmedi: 0 } as Record<HomeworkCheckStatus, number>;
                  let delivered = 0;
                  hwStudents.forEach((std) => {
                    const sub = submissions.find((s) => s.homeworkId === hw.id && s.studentId === std.id);
                    if (sub && submissionHasContent(sub)) delivered++;
                    const st = savedCheckStatusOf(sub);
                    if (st) tally[st]++;
                  });
                  const checked = tally.yapti + tally.yapmadi + tally.eksik + tally.izinli + tally.gelmedi;
                  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
                  const due = dueInfoOf(hw.dueDate);
                  const resourceCount = (hw.resources?.length || 0) + (hw.attachmentUrl ? 1 : 0);

                  return (
                    <div
                      key={hw.id}
                      className={`rounded-2xl border bg-surface transition scroll-mt-24 ${
                        isOpen
                          ? 'border-brand ring-2 ring-brand/15 shadow-md'
                          : 'border-line hover:border-line-strong shadow-sm'
                      }`}
                      id={`hw-strip-${hw.id}`}
                    >
                      {/* Şerit: ödev özet bilgileri */}
                      <button
                        type="button"
                        onClick={() => toggleStrip(hw)}
                        aria-expanded={isOpen}
                        className="w-full text-left p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5 cursor-pointer"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-brand-soft text-brand-fg">
                                {hw.subject}
                              </span>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 ${due.cls}`}
                              >
                                <Clock className="w-3 h-3" />
                                {due.label}
                              </span>
                              {resourceCount > 0 && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-surface-2 text-muted inline-flex items-center gap-1">
                                  <Paperclip className="w-3 h-3" />
                                  {resourceCount} kaynak
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-fg truncate">{hw.title}</h4>
                            <p className="text-xs text-muted truncate mt-0.5">
                              Son teslim: {formatDueDateTurkish(hw.dueDate)}
                              {hw.description ? ` · ${hw.description}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 md:w-[24rem] shrink-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-muted">Kontrol</span>
                              <span className="text-fg">
                                {checked}/{total}
                                <span className="text-muted font-medium"> · Teslim {delivered}</span>
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-[width] ${checked === total && total > 0 ? 'bg-success' : 'bg-brand'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-xs font-semibold">
                              <span className="text-success-fg">Yaptı {tally.yapti}</span>
                              <span className="text-danger-fg">Yapmadı {tally.yapmadi}</span>
                              <span className="text-warning-fg">Eksik {tally.eksik}</span>
                              {tally.izinli > 0 && <span className="text-info-fg">İzinli {tally.izinli}</span>}
                              {tally.gelmedi > 0 && <span className="text-fg-2">Gelmedi {tally.gelmedi}</span>}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                              isOpen ? 'bg-brand text-white' : 'bg-surface-2 text-fg-2 border border-line'
                            }`}
                          >
                            {isOpen ? 'Kapat' : 'Kontrol Et'}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </span>
                        </div>
                      </button>

                      {/* Açılan kontrol paneli: öğrenci listesi ve durumlar */}
                      {isOpen && currentHw && currentClass && (
                        <div id="hw-check-panel" className="border-t border-line p-3.5 sm:p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm sm:text-base font-bold text-fg truncate">
                                {currentClass.name} — Öğrenci Listesi
                              </h3>
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand-soft text-brand-fg shrink-0">
                                {classStudents.length} öğrenci
                              </span>
                            </div>
                            <div className="relative w-full sm:w-64">
                              <Search className="w-3.5 h-3.5 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={studentSearchInput}
                                onChange={(e) => setStudentSearchInput(e.target.value)}
                                placeholder="Öğrenci adı veya numarası ara..."
                                className="ui-field w-full pl-8 pr-3"
                              />
                            </div>
                          </div>

                          {/* Sayaçlar */}
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            <div className="p-2.5 rounded-xl bg-surface-2 border border-line text-center">
                              <span className="text-2xs uppercase font-bold text-muted block">Toplam</span>
                              <span className="text-base font-bold text-fg">{classStudents.length}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-success-soft border border-success/30 text-center">
                              <span className="text-2xs uppercase font-bold text-success-fg block">Yaptı</span>
                              <span className="text-base font-bold text-success-fg">{countYapti}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-danger-soft border border-danger/30 text-center">
                              <span className="text-2xs uppercase font-bold text-danger-fg block">Yapmadı</span>
                              <span className="text-base font-bold text-danger-fg">{countYapmadi}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-warning-soft border border-warning/30 text-center">
                              <span className="text-2xs uppercase font-bold text-warning-fg block">Eksik</span>
                              <span className="text-base font-bold text-warning-fg">{countEksik}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-info-soft border border-info/30 text-center">
                              <span className="text-2xs uppercase font-bold text-info-fg block">İzinli</span>
                              <span className="text-base font-bold text-info-fg">{countIzinli}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-surface-2 border border-line-strong text-center">
                              <span className="text-2xs uppercase font-bold text-fg-2 block">Gelmedi</span>
                              <span className="text-base font-bold text-fg-2">{countGelmedi}</span>
                            </div>
                          </div>

                          {/* Toplu İşlem Butonları */}
                          <div className="p-3 rounded-xl bg-surface-2/80 border border-line flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-fg-2">
                              Sınıf İçin Hızlı İşlem:
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('yapti')}
                                className="ui-btn ui-btn-sm bg-success-soft hover:bg-success-soft border border-success/30 text-success-fg min-w-24"
                              >
                                ✓ Tümünü Yaptı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('yapmadi')}
                                className="ui-btn ui-btn-sm bg-danger-soft hover:bg-danger-soft border border-danger/30 text-danger-fg min-w-24"
                              >
                                ✕ Tümünü Yapmadı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('eksik')}
                                className="ui-btn ui-btn-sm bg-warning-soft hover:bg-warning-soft border border-warning/30 text-warning-fg min-w-24"
                              >
                                ⚠ Tümünü Eksik
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('izinli')}
                                className="ui-btn ui-btn-sm bg-info-soft hover:bg-info-soft border border-info/30 text-info-fg min-w-24"
                              >
                                ℹ Tümünü İzinli
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('gelmedi')}
                                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-2 border border-line-strong text-fg-2 min-w-24"
                              >
                                ○ Tümünü Gelmedi
                              </button>
                            </div>
                          </div>

                          {/* ALT ALTA SIRALANMIŞ BEYAZ MİNİMALİST ÖĞRENCİ LİSTESİ */}
                          {classStudents.length === 0 ? (
                            <div className="py-8 text-center text-subtle text-xs">
                              "{currentClass.name}" sınıfına henüz kayıtlı öğrenci bulunmuyor.
                            </div>
                          ) : displayedStudents.length === 0 ? (
                            <div className="py-8 text-center text-subtle text-xs">
                              "{studentSearchInput}" aramasına uygun öğrenci bulunamadı.
                            </div>
                          ) : (
                            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
                              {displayedStudents.map((std, idx) => {
                                const currentStatus = getStudentCheckStatus(std.id);
                                return (
                                  <div
                                    key={std.id}
                                    className="p-3 sm:p-3.5 hover:bg-surface-2/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                                  >
                                    {/* Öğrenci Bilgisi */}
                                    <div className="flex items-center space-x-3 min-w-0">
                                      <span className="w-6 text-center text-xs font-mono text-subtle font-semibold shrink-0">
                                        {idx + 1}
                                      </span>
                                      <img
                                        src={profilResmi(std, 'student')}
                                        alt={std.name}
                                        className="w-8 h-8 rounded-full bg-surface-2 object-cover border border-line shrink-0"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-fg truncate">{std.name}</h4>
                                        {(() => {
                                          const stdSub = currentHw
                                            ? submissions.find((s) => s.homeworkId === currentHw.id && s.studentId === std.id)
                                            : undefined;
                                          if (!currentHw || !stdSub || !submissionHasContent(stdSub)) return null;
                                          const attachCount = getSubmissionAttachmentCount(stdSub);
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => setViewingSubmissionKey({ homeworkId: currentHw.id, studentId: std.id })}
                                              className="ui-link mt-0.5 inline-flex items-center gap-1"
                                            >
                                              <Paperclip className="w-3 h-3" />
                                              <span>
                                                Teslimi Gör{attachCount > 0 ? ` (${attachCount} ek)` : ' (not)'}
                                                {stdSub.status === 'late' ? ' · Geç' : ''}
                                              </span>
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    </div>

                                    {/* İSİMLERİN KARŞISINDA 'YAPTI, YAPMADI, EKSİK, İZİNLİ VE GELMEDİ' BUTONLARI */}
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                                      {/* Yaptı */}
                                      <button
                                        type="button"
                                        onClick={() => handleStatusClick(std.id, 'yapti')}
                                        className={`ui-btn ui-btn-sm ${
                                          currentStatus === 'yapti'
                                            ? 'bg-success text-white shadow-xs ring-2 ring-success'
                                            : 'bg-surface-2 hover:bg-success-soft text-fg-2 hover:text-success-fg border border-line hover:border-success/30'
                                        }`}
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Yaptı</span>
                                      </button>

                                      {/* Yapmadı */}
                                      <button
                                        type="button"
                                        onClick={() => handleStatusClick(std.id, 'yapmadi')}
                                        className={`ui-btn ui-btn-sm ${
                                          currentStatus === 'yapmadi'
                                            ? 'bg-danger text-white shadow-xs ring-2 ring-danger'
                                            : 'bg-surface-2 hover:bg-danger-soft text-fg-2 hover:text-danger-fg border border-line hover:border-danger/30'
                                        }`}
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>Yapmadı</span>
                                      </button>

                                      {/* Eksik */}
                                      <button
                                        type="button"
                                        onClick={() => handleStatusClick(std.id, 'eksik')}
                                        className={`ui-btn ui-btn-sm ${
                                          currentStatus === 'eksik'
                                            ? 'bg-warning text-white shadow-xs ring-2 ring-warning'
                                            : 'bg-surface-2 hover:bg-warning-soft text-fg-2 hover:text-warning-fg border border-line hover:border-warning/30'
                                        }`}
                                      >
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        <span>Eksik</span>
                                      </button>

                                      {/* İzinli */}
                                      <button
                                        type="button"
                                        onClick={() => handleStatusClick(std.id, 'izinli')}
                                        className={`ui-btn ui-btn-sm ${
                                          currentStatus === 'izinli'
                                            ? 'bg-info text-white shadow-xs ring-2 ring-info'
                                            : 'bg-surface-2 hover:bg-info-soft text-fg-2 hover:text-info-fg border border-line hover:border-info/30'
                                        }`}
                                      >
                                        <Info className="w-3.5 h-3.5" />
                                        <span>İzinli</span>
                                      </button>

                                      {/* Gelmedi */}
                                      <button
                                        type="button"
                                        onClick={() => handleStatusClick(std.id, 'gelmedi')}
                                        className={`ui-btn ui-btn-sm ${
                                          currentStatus === 'gelmedi'
                                            ? 'bg-muted text-white shadow-xs ring-2 ring-line-strong'
                                            : 'bg-surface-2 hover:bg-surface-2 text-fg-2 hover:text-fg-2 border border-line hover:border-line-strong'
                                        }`}
                                      >
                                        <HelpCircle className="w-3.5 h-3.5" />
                                        <span>Gelmedi</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
export default OdevKontrol;
