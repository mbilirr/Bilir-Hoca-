// Ödevler › Tüm Ödevler sekmesi (Aşama 361: ayrı parça, yalnız gerekince yüklenir)
import { ExpandableStrip, StripAction, StripProgress } from '../../ui/ExpandableStrip';
import { ShowMoreBar } from '../../../lib/listPaging';
import { Plus, Clock, CheckCircle2, X, Trash2, Paperclip, Search, Edit3, Download, Eye, School, Copy } from 'lucide-react';
import { HomeworkResourceViewer } from '../../Common/HomeworkResourceViewer';
import { MoreMenu } from '../../ui/MoreMenu';
import { submissionHasContent } from '../SubmissionViewModal';
import { normalizeSubject } from '../../../lib/subjects';
import { MINE } from './ortak';
import { useOdevBaglam } from './useOdevYonetimi';

export function TumOdevler() {
  const { homeworks, classes, activeTab, focusHomeworkInTracker, expandedHwId, setExpandedHwId, setHomeworkToDelete, setViewingSubmissionKey, hwSearchQuery, setHwSearchQuery, hwFilterSubject, setHwFilterSubject, hwFilterClassId, setHwFilterClassId, seesOthers, hwFilterTeacher, setHwFilterTeacher, setActiveViewingHomework, formatDueDateTurkish, handleDownloadHomeworkDoc, canGive, openHomeworkForm, handleOpenEditResources, submissionsByHw, studentsForHw, ownerOptions, allTabHomeworks, pagedAllHw, visibleAllHw } = useOdevBaglam();
  return (
    <>
      {activeTab === 'all' && (() => {
        // Aşama 116: eski ders adları (Fen Bilgisi, Edebiyat) güncel adla tek seçenek (Etütler'deki kuralla aynı)
        const availableSubjects = Array.from(new Set(homeworks.map((h) => normalizeSubject(h.subject)))).filter(Boolean);
        const filteredHomeworks = allTabHomeworks;

        const isFiltered = hwSearchQuery.trim() !== '' || hwFilterSubject !== 'all' || hwFilterClassId !== 'all' || hwFilterTeacher !== 'all';

        return (
          <div className="space-y-5">
            {/* Minimalist Beyaz Filtreleme ve Arama Çubuğu */}
            <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Sol: Arama Kutusu ve Dropdown Filtreler */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Hızlı Arama Kutusu */}
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                    <input
                      type="text"
                      value={hwSearchQuery}
                      onChange={(e) => setHwSearchQuery(e.target.value)}
                      placeholder="Ödev başlığı, ders veya konu ara..."
                      className="ui-field w-full pl-9 pr-8"
                    />
                    {hwSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHwSearchQuery('')}
                        className="ui-input-btn right-2.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sınıf Filtresi */}
                  <div className="flex items-center">
                    <select
                      value={hwFilterClassId}
                      onChange={(e) => setHwFilterClassId(e.target.value)}
                      className="ui-field w-auto text-fg-2 font-medium cursor-pointer"
                    >
                      <option value="all">Tüm Sınıflar</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Aşama 98: Öğretmen Filtresi (birden fazla öğretmenin ödevi görünüyorsa) */}
                  {(ownerOptions.length > 1 || hwFilterTeacher !== 'all') && (
                    <div className="flex items-center">
                      <select
                        id="hw-filter-teacher"
                        aria-label="Öğretmene göre"
                        value={hwFilterTeacher}
                        onChange={(e) => setHwFilterTeacher(e.target.value)}
                        className="ui-field w-auto text-fg-2 font-medium cursor-pointer max-w-[12rem]"
                      >
                        <option value="all">Tüm Öğretmenler</option>
                        {seesOthers && <option value={MINE}>Benim ödevlerim</option>}
                        {hwFilterTeacher !== 'all' && hwFilterTeacher !== MINE && !ownerOptions.some((o) => o.id === hwFilterTeacher) && (
                          <option value={hwFilterTeacher}>Seçilen öğretmen</option>
                        )}
                        {ownerOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Ders Filtresi */}
                  <div className="flex items-center">
                    <select
                      value={hwFilterSubject}
                      onChange={(e) => setHwFilterSubject(e.target.value)}
                      className="ui-field w-auto text-fg-2 font-medium cursor-pointer"
                    >
                      <option value="all">Tüm Dersler</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtreleri Temizle */}
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => {
                        setHwSearchQuery('');
                        setHwFilterSubject('all');
                        setHwFilterClassId('all');
                        setHwFilterTeacher('all');
                      }}
                      className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-muted min-w-24"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Filtreleri Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç & Yeni Ödev Butonu */}
                <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                  <span className="text-xs text-muted font-medium">
                    Toplam <strong>{filteredHomeworks.length}</strong> / {homeworks.length} ödev
                  </span>
                  {canGive && (
                    <button
                      type="button"
                      id="hw-create-btn"
                      onClick={() => {
                        openHomeworkForm('create');
                      }}
                      className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas shadow-sm min-w-24 max-lg:!hidden"
                    >
                      {/* Aşama 292: dar ekranda sayfa başındaki "Ödev Oluştur" hemen üstte; aynı düğme iki kez görünmesin */}
                      <Plus className="w-3.5 h-3.5" />
                      <span>Yeni Ödev Oluştur</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sade, Minimalist ve Beyaz Arka Yüzeyli Ödev Kartları Grid */}
            {filteredHomeworks.length === 0 ? (
              <div className="bg-surface border border-line rounded-2xl p-12 text-center text-muted space-y-3 shadow-sm">
                <Search className="w-10 h-10 mx-auto text-subtle" />
                <p className="text-sm font-bold text-fg">Arama kriterlerinize uygun ödev bulunamadı.</p>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Farklı bir ders, sınıf veya anahtar kelime seçebilir ya da filtreleri sıfırlayabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHwSearchQuery('');
                    setHwFilterSubject('all');
                    setHwFilterClassId('all');
                  }}
                  className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas shadow-sm min-w-24"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              <>
              <div className="space-y-2" id="hw-all-strips">
                {visibleAllHw.map((hw) => {
                  const hwSubmissions = submissionsByHw.get(hw.id) || [];
                  const isExpanded = expandedHwId === hw.id;

                  const hwStudents = studentsForHw(hw);
                  const assignedCount = hwStudents.length;

                  const isOverdue = new Date() > new Date(hw.dueDate);
                  const targetClassNames = (hw.targetClassIds || [])
                    .map((cid) => classes.find((c) => c.id === cid)?.name)
                    .filter(Boolean);
                  const resourceCount = (hw.resources?.length || 0) + (hw.attachmentUrl ? 1 : 0);
                  const classText = targetClassNames.length > 0 ? targetClassNames.join(', ') : 'Tüm Sınıflar';
                  const whoText = hw.assignedTo === 'all' ? 'Tüm Öğrenciler' : `${assignedCount} Öğrenci`;
                  const allOutcomes = Array.from(new Set([...(hw.outcomes || []), ...(hw.learningOutcomes || [])].filter(Boolean)));

                  return (
                    <ExpandableStrip
                      key={hw.id}
                      id={`hw-card-${hw.id}`}
                      noun="Ödev"
                      open={isExpanded}
                      onToggle={() => setExpandedHwId(isExpanded ? null : hw.id)}
                      accent={isOverdue ? 'border-l-slate-300 dark:border-l-slate-600' : 'border-l-brand'}
                      badges={
                        <>
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-brand-soft text-brand-fg">
                            {hw.subject}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                              isOverdue
                                ? 'bg-danger-soft text-danger-fg'
                                : 'bg-warning-soft text-warning-fg'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {new Date(hw.dueDate).toLocaleDateString('tr-TR')}
                          </span>
                          {resourceCount > 0 && (
                            <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-surface-2 text-muted inline-flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {resourceCount}
                            </span>
                          )}
                        </>
                      }
                      title={hw.title}
                      meta={`${classText} · ${whoText}${hw.description ? ` · ${hw.description}` : ''}`}
                      stats={<StripProgress label="Teslim" value={hwSubmissions.length} total={assignedCount} />}
                      actions={
                        <>
                          <StripAction label="Kontrol Et" tone="success" onClick={() => focusHomeworkInTracker(hw)}>
                            <CheckCircle2 className="w-4 h-4" />
                          </StripAction>
                          {/* Aşama 207: görüntüle / indir / kopyala / düzenle / sil "⋯" menüsünde (sil onay penceresi aynen) */}
                          <MoreMenu
                            quiet
                            id={`btn-more-hw-${hw.id}`}
                            ariaLabel="Ödev işlemleri"
                            sheetTitle={hw.title}
                            items={[
                              { id: `btn-view-hw-${hw.id}`, label: 'Görüntüle', icon: Eye, onClick: () => setActiveViewingHomework(hw) },
                              { id: `btn-download-hw-${hw.id}`, label: 'İndir (.doc)', icon: Download, onClick: () => handleDownloadHomeworkDoc(hw) },
                              {
                                id: `btn-copy-hw-${hw.id}`,
                                label: 'Kopyala',
                                icon: Copy,
                                title: 'Başka sınıfa da ver',
                                show: !!canGive,
                                onClick: () => openHomeworkForm('copy', hw),
                              },
                              { id: `btn-edit-hw-${hw.id}`, label: 'Düzenle', icon: Edit3, onClick: () => openHomeworkForm('edit', hw) },
                              { id: `btn-delete-hw-${hw.id}`, label: 'Sil', icon: Trash2, danger: true, onClick: () => setHomeworkToDelete(hw) },
                            ]}
                          />
                        </>
                      }
                    >
                      <div className="grid gap-4 lg:grid-cols-2" data-hw-detail>
                        <div className="space-y-3 min-w-0">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted">Açıklama</p>
                            <p className="text-sm text-fg-2 whitespace-pre-wrap break-words mt-1">
                              {hw.description || 'Ödev açıklaması bulunmuyor.'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-1">
                              <School className="w-3.5 h-3.5" /> <strong className="text-fg-2">{classText}</strong>
                            </span>
                            <span>{whoText}</span>
                            <span>Son teslim: {formatDueDateTurkish(hw.dueDate)}</span>
                            {hw.schoolLevel && <span>{hw.schoolLevel}</span>}
                          </div>
                          {allOutcomes.length > 0 && (
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-muted">Kazanımlar</p>
                              <ul className="mt-1 space-y-0.5 text-xs text-fg-2 list-disc pl-4">
                                {allOutcomes.map((o, i) => (
                                  <li key={i}>{o}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {resourceCount > 0 && (
                            <HomeworkResourceViewer resources={hw.resources} legacyAttachmentUrl={hw.attachmentUrl} isCompact />
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveViewingHomework(hw)}
                              className="ui-btn ui-btn-primary ui-btn-sm"
                              title="Ödev detayını tam sayfa görüntüle"
                            >
                              <Eye className="w-3.5 h-3.5" /> Görüntüle
                            </button>
                            <button
                              type="button"
                              onClick={() => focusHomeworkInTracker(hw)}
                              className="ui-btn ui-btn-secondary ui-btn-sm"
                              title="Ödev kontrol çizelgesini aç"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Kontrol Et
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditResources(hw)}
                              className="ui-btn ui-btn-secondary ui-btn-sm"
                              title="Materyalleri yönet"
                            >
                              <Paperclip className="w-3.5 h-3.5" /> Materyal
                            </button>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-bold uppercase tracking-wide text-muted mb-1.5">
                            Öğrenci Teslim Listesi ({hwSubmissions.length}/{assignedCount})
                          </h4>
                          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                            {hwStudents.length === 0 && <p className="text-xs text-muted">Bu ödeve atanmış öğrenci yok.</p>}
                            {hwStudents.map((student) => {
                              const sub = hwSubmissions.find((s) => s.studentId === student.id);
                              return (
                                <div
                                  key={student.id}
                                  className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                                    sub
                                      ? 'bg-success-soft/60 border-success/30 text-success-fg'
                                      : 'bg-surface-2 border-line text-muted'
                                  }`}
                                >
                                  <span className="font-semibold truncate">{student.name}</span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-bold">
                                      {sub
                                        ? sub.status === 'late'
                                          ? '⚠️ Geç Teslim'
                                          : sub.status === 'not_submitted'
                                            ? 'Teslim Edilmedi'
                                            : '✓ Teslim Edildi'
                                        : 'Teslim Edilmedi'}
                                    </span>
                                    {sub && submissionHasContent(sub) && (
                                      <button
                                        type="button"
                                        onClick={() => setViewingSubmissionKey({ homeworkId: hw.id, studentId: student.id })}
                                        className="ui-btn ui-btn-secondary ui-btn-sm"
                                      >
                                        Gör
                                      </button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </ExpandableStrip>
                  );
                })}
              </div>
              <ShowMoreBar
                id="hw-all-show-more"
                remaining={pagedAllHw.remaining}
                total={pagedAllHw.total}
                shown={pagedAllHw.visible.length}
                onMore={pagedAllHw.showMore}
                onAll={pagedAllHw.showAll}
              />
              </>
            )}
          </div>
        );
      })()}
    </>
  );
}
export default TumOdevler;
