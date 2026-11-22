// Öğrenciler sayfası › sınıfın öğrenci listesi penceresi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { Users, Search, Plus, Edit2, School, AlertTriangle, Eye, UserMinus, ArrowRightLeft } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { formatClassDisplayName } from '../../../constants/schoolConstants';
import { Modal } from '../../ui/kit';
import { appConfirm } from '../../../lib/appDialog';
import { profilResmi } from '../../../lib/profilResmi';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function SinifOgrencileriPenceresi() {
  const { students, setSelectedClassFilter, setActiveTab, setIsAddStudentOpen, setEditingStudent, viewingClassStudents, setViewingClassStudents, classStudentSearch, setClassStudentSearch, setTransferTargetClass, setTransferSearchTerm, setTransferSelectedStudentIds, setStudentSuccessFeedback, setStudentClassId, duplicateStudentGroups, resetStudentForm, openEditStudent } = useOgrenciBaglam();
  return (
    <>
      {viewingClassStudents && (() => {
        const classStudents = students.filter((s) => s.classId === viewingClassStudents.id);
        const filteredStudents = classStudents.filter((s) => {
          const q = classStudentSearch.trim();
          if (!q) return true;
          return (
            matchTurkishSearch(s.name, q) ||
            (s.studentNumber && s.studentNumber.includes(q)) ||
            (s.phone && s.phone.includes(q)) ||
            matchTurkishSearch(s.email, q)
          );
        });

        const handleCopyList = () => {
          const text = classStudents
            .map((s, idx) => `${idx + 1}. ${s.name} (No: ${s.studentNumber || '-'})`)
            .join('\n');
          navigator.clipboard
            .writeText(text)
            .then(() => dataService.showToast('Sınıf öğrenci listesi panoya kopyalandı.'))
            .catch(() => dataService.showToast('Liste kopyalanamadı. Tarayıcı izin vermedi.', 'error'));
        };

        return (
        <Modal
          open
          onClose={() => setViewingClassStudents(null)}
          size="lg"
          icon={School}
          title={`${formatClassDisplayName(viewingClassStudents.name, viewingClassStudents.branch, viewingClassStudents.gradeLevel)} — Kayıtlı Öğrenci Listesi`}
          description={
            <span className="flex items-center gap-2 flex-wrap">
              {viewingClassStudents.schoolLevel && (
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-warning/10 text-warning-fg border border-warning/20">{viewingClassStudents.schoolLevel}</span>
              )}
              <span>
                {viewingClassStudents.branch} • {viewingClassStudents.academicYear} • Toplam{' '}
                <strong className="text-brand-fg font-bold">{classStudents.length}</strong> Öğrenci Kayıtlı
              </span>
            </span>
          }
          govdeClass="p-4"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  Gösterilen: <strong className="text-fg">{filteredStudents.length}</strong> / {classStudents.length} Öğrenci
                </span>
                <button
                  type="button"
                  onClick={() => setViewingClassStudents(null)}
                  className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg min-w-24"
                >
                  Kapat
                </button>
            </div>
          }
          ust={
            <>
              {/* Toolbar: Search & Action buttons */}
              <div className="p-4 border-b border-line bg-canvas/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input autoComplete="off"
                    type="text"
                    value={classStudentSearch}
                    onChange={(e) => setClassStudentSearch(e.target.value)}
                    placeholder="Sınıf içinde isim, no veya veli tel ara..."
                    className="ui-field w-full pl-9 pr-3"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {dataService.canAddStudentToClass(viewingClassStudents) && (
                  <button
                    type="button"
                    onClick={() => {
                      resetStudentForm();
                      setEditingStudent(null);
                      setStudentClassId(viewingClassStudents.id);
                      setIsAddStudentOpen(true);
                    }}
                    className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas min-w-24"
                    title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Öğrenci</span>
                  </button>
                  )}

                  {dataService.canManageClass(viewingClassStudents) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTargetClass(viewingClassStudents);
                      setTransferSelectedStudentIds([]);
                      setTransferSearchTerm('');
                    }}
                    className="ui-btn ui-btn-success ui-btn-sm min-w-24"
                    title="Sistemdeki öğrencileri tek tek veya toplu olarak bu sınıfa aktar"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Öğrenci Aktar</span>
                  </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyList}
                    disabled={classStudents.length === 0}
                    className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 disabled:opacity-40 text-fg hover:text-fg border border-line min-w-24"
                    title="Öğrenci listesini kopyala"
                  >
                    <span>📋 Kopyala</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClassFilter(viewingClassStudents.id);
                      setViewingClassStudents(null);
                      setActiveTab('students');
                    }}
                    className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg border border-line min-w-24"
                  >
                    <Eye className="w-3.5 h-3.5 text-brand-fg" />
                    <span>Tabloda Aç</span>
                  </button>
                </div>
              </div>
            </>
          }
        >
                {classStudents.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-surface-2 text-muted flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-fg mb-1">Bu Sınıfa Kayıtlı Öğrenci Yok</h4>
                    <p className="text-xs text-muted max-w-sm mx-auto mb-4">
                      Yeni öğrenci ekleyin ya da var olan öğrencileri bu sınıfa aktarın.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {dataService.canAddStudentToClass(viewingClassStudents) && (
                      <button
                        type="button"
                        onClick={() => {
                          resetStudentForm();
                          setEditingStudent(null);
                          setStudentClassId(viewingClassStudents.id);
                          setIsAddStudentOpen(true);
                        }}
                        className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas min-w-24"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Yeni Öğrenci Ekle</span>
                      </button>
                      )}

                      {dataService.canManageClass(viewingClassStudents) && (
                      <button
                        type="button"
                        onClick={() => {
                          setTransferTargetClass(viewingClassStudents);
                          setTransferSelectedStudentIds([]);
                          setTransferSearchTerm('');
                        }}
                        className="ui-btn ui-btn-success ui-btn-sm min-w-24"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Sistemdeki Öğrencileri Aktar</span>
                      </button>
                      )}
                    </div>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs">
                    "{classStudentSearch}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-sm">
                    <table className="w-full text-left text-xs text-fg-2">
                      <thead className="bg-surface-2 text-muted text-xs font-bold border-b border-line uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Öğrenci Adı Soyadı</th>
                          <th className="py-2.5 px-3">Okul No</th>
                          <th className="py-2.5 px-3">Veli / İletişim</th>
                          <th className="py-2.5 px-3">E-posta</th>
                          <th className="py-2.5 px-3 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line bg-surface">
                        {filteredStudents.map((std, idx) => {
                          const isDuplicate = duplicateStudentGroups.duplicateIds.has(std.id);
                          return (
                          <tr
                            key={std.id}
                            className={
                              isDuplicate
                                ? 'bg-warning-soft/90 hover:bg-warning-soft/90 transition-colors border-l-4 border-l-warning'
                                : 'hover:bg-surface-2/80 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-3 text-center text-subtle font-mono font-semibold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2.5">
                                <img loading="lazy" decoding="async"
                                  src={profilResmi(std, 'student')}
                                  alt={std.name}
                                  className={`w-7 h-7 rounded-full object-cover border ${
                                    isDuplicate
                                      ? 'bg-warning-soft ring-2 ring-warning'
                                      : 'bg-surface-2 border-line'
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                                <div className="flex items-center space-x-2 flex-wrap">
                                  <span className={`font-bold ${isDuplicate ? 'text-warning-fg font-extrabold' : 'text-fg'}`}>
                                    {std.name}
                                  </span>
                                  {isDuplicate && (
                                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-3xs font-bold bg-warning-soft text-warning-fg border border-warning/30">
                                      <AlertTriangle className="w-2.5 h-2.5 text-warning-fg" />
                                      <span>Mükerrer</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-mono px-2 py-0.5 rounded text-xs font-semibold border ${
                                  isDuplicate
                                    ? 'bg-warning-soft text-warning-fg border-warning font-bold'
                                    : 'text-brand-fg bg-brand-soft border-brand/30'
                                }`}
                              >
                                #{std.studentNumber || '-'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-muted font-medium">
                              {std.phone ? (
                                <span className="font-mono text-muted">{std.phone}</span>
                              ) : (
                                <span className="text-subtle italic">Belirtilmedi</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-muted">
                              {std.email || <span className="text-subtle italic">E-posta yok</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {dataService.canManageStudent(std) && (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingClassStudents(null);
                                    openEditStudent(std);
                                  }}
                                  className="ui-btn-mini"
                                  title="Öğrenciyi Düzenle"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (await appConfirm({ title: 'Sınıftan çıkarılsın mı?', message: `"${std.name}" adlı öğrenciyi "${viewingClassStudents.name}" sınıfından çıkarmak istediğinize emin misiniz?`, confirmText: 'Evet, çıkar' })) {
                                      try {
                                        await dataService.removeStudentFromClass(std.id);
                                        setStudentSuccessFeedback(`"${std.name}" adlı öğrenci ${viewingClassStudents.name} sınıfından çıkarıldı.`);
                                      } catch (e: any) {
                                        console.error(e);
                                      }
                                    }
                                  }}
                                  className="ui-btn-mini ui-btn-mini-danger"
                                  title="Öğrenciyi Bu Sınıftan Çıkar"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
        </Modal>
        );
      })()}
    </>
  );
}
export default SinifOgrencileriPenceresi;
