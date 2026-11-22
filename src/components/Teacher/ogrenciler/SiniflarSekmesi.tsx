// Öğrenciler sayfası › Sınıflar sekmesi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { ExpandableStrip, StripAction } from '../../ui/ExpandableStrip';
import { Users, Plus, Edit2, Trash2, Eye, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { formatClassDisplayName } from '../../../constants/schoolConstants';
import { Segmented } from '../../ui/kit';
import { InfoTip } from '../../ui/Compact';
import { MoreMenu } from '../../ui/MoreMenu';
import { siraliSinifOgrencileri } from './ortak';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function SiniflarSekmesi() {
  const { students, classes, setSelectedClassFilter, setActiveTab, expandedClassId, setExpandedClassId, classDetailSort, setClassDetailSort, isAdmin, canAddClasses, sinifSubesi, isNoBranchClass, setIsAddStudentOpen, setEditingStudent, setViewingClassStudents, setClassStudentSearch, setTransferTargetClass, setTransferSearchTerm, setTransferSelectedStudentIds, setClassToDelete, setStudentClassId, resetStudentForm, openEditClass } = useOgrenciBaglam();
  return (
    <>
      <div className="space-y-4">
          {!isAdmin && (
            /* Aşama 184: büyük bilgi kutusu tek satıra indi, ayrıntı ⓘ içinde */
            <div className="px-3 py-2 rounded-xl bg-brand-soft border border-brand/30 text-brand-fg text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-brand-fg" />
              <span className="flex-1">Yetkili olduğunuz {classes.length} sınıf görünüyor.</span>
              <InfoTip text="Yalnız kurum yöneticisinin size yetki verdiği sınıflar listelenir. Sınıf ekleme, düzenleme ve silme yöneticiye aittir." />
            </div>
          )}
          <div className="space-y-2" id="class-strips">
            {classes.map((cls) => {
              const classStudents = students.filter((s) => s.classId === cls.id);
              const isOpen = expandedClassId === cls.id;
              const branchText = isNoBranchClass(cls) ? 'Şubesiz' : `Şube ${sinifSubesi(cls)}`; // Aşama 325
              return (
                <ExpandableStrip
                  key={cls.id}
                  id={`class-strip-${cls.id}`}
                  noun="Sınıf"
                  open={isOpen}
                  onToggle={() => setExpandedClassId(isOpen ? null : cls.id)}
                  badges={
                    <>
                      {cls.schoolLevel && (
                        <span className="text-2xs font-bold px-2 py-0.5 rounded bg-warning/10 text-warning-fg">{cls.schoolLevel}</span>
                      )}
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-brand/10 text-brand-fg">{branchText}</span>
                      {cls.kurumId && dataService.isHeadAdmin() && (
                        <span className="text-2xs font-bold px-2 py-0.5 rounded bg-info-soft text-info-fg" data-kurum-badge>
                          {dataService.getKurumNameForId(cls.kurumId)}
                        </span>
                      )}
                      {!cls.kurumId && dataService.isKurumAdmin() && (
                        <span className="text-2xs font-bold px-2 py-0.5 rounded bg-surface-2 text-muted" data-granted-badge>
                          Genel yöneticinin izin verdiği sınıf
                        </span>
                      )}
                    </>
                  }
                  title={formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                  meta={[cls.academicYear, cls.description].filter(Boolean).join(' · ') || undefined}
                  stats={
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Users className="w-3.5 h-3.5 text-brand-fg" />
                      <span>
                        <strong className="text-fg">{classStudents.length}</strong> Kayıtlı Öğrenci
                      </span>
                    </div>
                  }
                  actions={
                    <>
                      <StripAction
                        label={`Öğrenciler (${classStudents.length})`}
                        onClick={() => {
                          setViewingClassStudents(cls);
                          setClassStudentSearch('');
                        }}
                      >
                        <Users className="w-4 h-4" />
                      </StripAction>
                      {canAddClasses && dataService.canManageClass(cls) && (
                        /* Aşama 207: düzenle / sil "⋯" menüsünde (sil onay penceresi aynen) */
                        <MoreMenu
                          quiet
                          id={`class-more-${cls.id}`}
                          ariaLabel="Sınıf işlemleri"
                          sheetTitle={cls.name}
                          items={[
                            { id: `class-edit-${cls.id}`, label: 'Düzenle', icon: Edit2, onClick: () => openEditClass(cls) },
                            { id: `class-delete-${cls.id}`, label: 'Sınıfı sil', icon: Trash2, danger: true, onClick: () => setClassToDelete(cls) },
                          ]}
                        />
                      )}
                    </>
                  }
                >
                  <div className="space-y-3" data-class-detail>
                    <p className="text-xs text-muted">{cls.description || 'Akademik takip ve ders çizelgesi grubu.'}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingClassStudents(cls);
                          setClassStudentSearch('');
                        }}
                        className="ui-btn ui-btn-primary ui-btn-sm"
                        title={`${cls.name} sınıfına kayıtlı öğrencilerin listesini görüntüle`}
                      >
                        <Users className="w-3.5 h-3.5" /> Öğrenci Listesi ({classStudents.length})
                      </button>
                      {dataService.canManageClass(cls) && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferTargetClass(cls);
                            setTransferSelectedStudentIds([]);
                            setTransferSearchTerm('');
                          }}
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                          title="Sistemdeki öğrencileri tek tek veya toplu bu sınıfa aktar"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-success-fg" /> Öğrenci Aktar
                        </button>
                      )}
                      {dataService.canAddStudentToClass(cls) && (
                        <button
                          type="button"
                          onClick={() => {
                            resetStudentForm();
                            setEditingStudent(null);
                            setStudentClassId(cls.id);
                            setIsAddStudentOpen(true);
                          }}
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                          title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                        >
                          <Plus className="w-3.5 h-3.5 text-brand-fg" /> Yeni Öğrenci
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassFilter(cls.id);
                          setActiveTab('students');
                        }}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Öğrenci tablosunda bu sınıfı filtrele"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted" /> Tabloda Gör
                      </button>
                    </div>
                    {classStudents.length > 0 && (
                      /* Aşama 274: dağınık etiketler yerine eşit boylu ızgara; satır satır, yan yana. Sıra: okul no ya da alfabetik */
                      <div className="space-y-2" data-class-student-grid>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-muted">Öğrenciler · {classStudents.length}</span>
                          <Segmented
                            size="sm"
                            value={classDetailSort}
                            onChange={setClassDetailSort}
                            items={[
                              { value: 'no', label: 'Okul no', id: `class-sort-no-${cls.id}` },
                              { value: 'ad', label: 'Alfabetik', id: `class-sort-ad-${cls.id}` },
                            ]}
                          />
                        </div>
                        <ol className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-1.5 max-h-80 overflow-y-auto overscroll-contain pr-0.5">
                          {siraliSinifOgrencileri(classStudents, classDetailSort).map((st) => (
                            <li
                              key={st.id}
                              className="flex items-center gap-2 h-8 px-2 rounded-lg bg-surface-2 border border-line min-w-0"
                              title={st.studentNumber ? `${st.studentNumber} · ${st.name}` : st.name}
                            >
                              <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
                                {st.studentNumber || '–'}
                              </span>
                              <span className="flex-1 min-w-0 truncate text-xs text-fg-2">{st.name}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </ExpandableStrip>
              );
            })}
          </div>
        </div>
    </>
  );
}
export default SiniflarSekmesi;
