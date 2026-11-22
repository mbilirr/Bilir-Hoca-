// Öğrenciler sayfası › sınıfa öğrenci aktarma penceresi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { Search, Plus, UserPlus, ArrowRightLeft } from 'lucide-react';
import { Student } from '../../../types';
import { dataService } from '../../../services/dataService';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import confetti from 'canvas-confetti';
import { Modal } from '../../ui/kit';
import { profilResmi } from '../../../lib/profilResmi';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function OgrenciAktarPenceresi() {
  const { students, transferTargetClass, setTransferTargetClass, transferSearchTerm, setTransferSearchTerm, transferOnlyUnassigned, setTransferOnlyUnassigned, transferSelectedStudentIds, setTransferSelectedStudentIds, setStudentSuccessFeedback } = useOgrenciBaglam();
  return (
    <>
      {transferTargetClass && (() => {
        const availableStudents = students.filter(
          (s) => s.classId !== transferTargetClass.id
        );
        const filteredTransferStudents = availableStudents.filter((s) => {
          if (transferOnlyUnassigned && s.classId && s.className && s.className !== 'Atanmadı') {
            return false;
          }
          const q = transferSearchTerm.trim();
          if (!q) return true;
          return (
            matchTurkishSearch(s.name, q) ||
            (s.studentNumber && s.studentNumber.includes(q)) ||
            matchTurkishSearch(s.className, q) ||
            matchTurkishSearch(s.email, q)
          );
        });

        const isAllSelected =
          filteredTransferStudents.length > 0 &&
          filteredTransferStudents.every((s) => transferSelectedStudentIds.includes(s.id));

        const toggleSelectAll = () => {
          if (isAllSelected) {
            setTransferSelectedStudentIds([]);
          } else {
            setTransferSelectedStudentIds(filteredTransferStudents.map((s) => s.id));
          }
        };

        const toggleSelectStudent = (id: string) => {
          setTransferSelectedStudentIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
          );
        };

        const handleTransferSingle = async (student: Student) => {
          try {
            const count = await dataService.assignStudentsToClass([student.id], transferTargetClass.id);
            if (count > 0) {
              setStudentSuccessFeedback(
                `"${student.name}" başarıyla "${transferTargetClass.name}" sınıfına aktarıldı!`
              );
              confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
            }
          } catch (e: any) {
            console.error(e);
          }
        };

        const handleTransferBulk = async () => {
          if (transferSelectedStudentIds.length === 0) return;
          try {
            const count = await dataService.assignStudentsToClass(
              transferSelectedStudentIds,
              transferTargetClass.id
            );
            if (count > 0) {
              setStudentSuccessFeedback(
                `${count} öğrenci başarıyla "${transferTargetClass.name}" sınıfına aktarıldı!`
              );
              setTransferSelectedStudentIds([]);
              confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
            }
          } catch (e: any) {
            console.error(e);
          }
        };

        return (
        <Modal
          open
          onClose={() => setTransferTargetClass(null)}
          size="lg"
          icon={ArrowRightLeft}
          title="Öğrenci Aktarımı"
          description={
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand/20 text-brand-fg border border-brand/30">{transferTargetClass.name}</span>
              <span>Sistemdeki öğrencileri tek tek veya çoklu seçimle toplu olarak bu sınıfa aktarabilirsiniz.</span>
            </span>
          }
          govdeClass="p-4 space-y-2"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  Toplam {filteredTransferStudents.length} aktarılabilir öğrenci listeleniyor
                </span>
                <button
                  type="button"
                  onClick={() => setTransferTargetClass(null)}
                  className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg min-w-24"
                >
                  Kapat
                </button>
            </div>
          }
          ust={
            <>
              {/* Filter & Search Bar */}
              <div className="p-4 border-b border-line bg-canvas/40 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input autoComplete="off"
                      type="text"
                      value={transferSearchTerm}
                      onChange={(e) => setTransferSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı, okul no veya mevcut sınıf ara..."
                      className="ui-field w-full pl-9 pr-3"
                    />
                  </div>

                  <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-line shrink-0">
                    <button
                      type="button"
                      onClick={() => setTransferOnlyUnassigned(false)}
                      className={`ui-btn ui-btn-sm ${
                        !transferOnlyUnassigned
                          ? 'bg-brand text-white shadow-sm'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      Tüm Sistem ({availableStudents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransferOnlyUnassigned(true)}
                      className={`ui-btn ui-btn-sm ${
                        transferOnlyUnassigned
                          ? 'bg-brand text-white shadow-sm'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      Sadece Sınıfsızlar
                    </button>
                  </div>
                </div>

                {/* Bulk Select Toolbar */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center space-x-2 text-fg-2 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      disabled={filteredTransferStudents.length === 0}
                      className="w-4 h-4 rounded text-brand-fg focus:ring-brand bg-surface-2 border-line cursor-pointer"
                    />
                    <span>
                      Tümünü Seç ({filteredTransferStudents.length})
                      {transferSelectedStudentIds.length > 0 && (
                        <strong className="text-brand-fg ml-1.5">
                          ({transferSelectedStudentIds.length} seçildi)
                        </strong>
                      )}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTransferBulk}
                    disabled={transferSelectedStudentIds.length === 0}
                    className="ui-btn ui-btn-success ui-btn-sm disabled:opacity-40 disabled:cursor-not-allowed min-w-24"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Seçilenleri Toplu Aktar ({transferSelectedStudentIds.length})</span>
                  </button>
                </div>
              </div>
            </>
          }
        >
                {filteredTransferStudents.length === 0 ? (
                  <div className="py-12 text-center text-muted text-xs">
                    Aktarılabilecek öğrenci bulunamadı.
                  </div>
                ) : (
                  filteredTransferStudents.map((std) => {
                    const isSelected = transferSelectedStudentIds.includes(std.id);
                    return (
                      <div
                        key={std.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition ${
                          isSelected
                            ? 'bg-brand-soft border-brand/50'
                            : 'bg-surface/60 border-line hover:bg-surface-2/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(std.id)}
                            className="w-4 h-4 rounded text-brand-fg focus:ring-brand bg-surface-2 border-line cursor-pointer"
                          />
                          <img loading="lazy" decoding="async"
                            src={
                              profilResmi(std, 'student')
                            }
                            alt={std.name}
                            className="w-9 h-9 rounded-full bg-surface-2 object-cover border border-line"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-fg text-xs flex items-center space-x-2">
                              <span>{std.name}</span>
                              <span className="font-mono text-muted text-2xs">
                                #{std.studentNumber}
                              </span>
                            </div>
                            <div className="text-xs text-muted flex items-center space-x-2 mt-0.5">
                              <span>Mevcut Sınıf:</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${
                                  !std.className || std.className === 'Atanmadı'
                                    ? 'bg-surface-2 text-muted'
                                    : 'bg-brand/10 text-brand-fg border border-brand/20'
                                }`}
                              >
                                {std.className || 'Sınıfsız'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTransferSingle(std)}
                          className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas shadow-sm shrink-0 min-w-24"
                          title={`${std.name} adlı öğrenciyi ${transferTargetClass.name} sınıfına aktar`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Bu Sınıfa Aktar</span>
                        </button>
                      </div>
                    );
                  })
                )}
        </Modal>
        );
      })()}
    </>
  );
}
export default OgrenciAktarPenceresi;
