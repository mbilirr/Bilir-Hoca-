// Etütler › Liste görünümü (etüt şeritleri) (Aşama 362: ayrı parça, yalnız gerekince yüklenir)
import { ExpandableStrip, StripAction } from '../../ui/ExpandableStrip';
import { ShowMoreBar } from '../../../lib/listPaging';
import { CalendarDays, Clock, MapPin, Users, CalendarCheck, Trash2, Edit2, CheckCircle2, Mail, MessageCircle, AlertCircle, MessageSquareQuote, Copy, Lock, Eye } from 'lucide-react';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../../lib/calendar';
import { isEtutEnded, hasEtutAttendance, etutExpectsAttendance } from '../../../lib/etutTiming';
import { MoreMenu } from '../../ui/MoreMenu';
import { ETUT_STATUS_STYLE, getEtutStatus } from '../../../lib/etutStatus';
import { useEtutBaglam } from './useEtutYonetimi';

export function EtutKartlari() {
  const { students, viewMode, expandedEtutId, setExpandedEtutId, setViewEtut, setIsReportModalOpen, setReportSelectedStudentId, setEtutToDelete, setSelectedEtutForDispatch, setIsDispatchModalOpen, setSelectedEtutForAttendance, canEditEtut, cardEtuts, pagedListEtuts, openEdit, openCopy } = useEtutBaglam();
  return (
    <>
      {viewMode === 'cards' && (
        /* Etüt List */
        <div className="space-y-3">
        {cardEtuts.length === 0 && (
          <div className="ui-card p-8 text-center text-sm text-muted">Bu seçimde etüt yok.</div>
        )}
        <div className="space-y-2" id="etut-list-grid">
          {pagedListEtuts.visible.map((etut) => {
            const assignedStudents = etut.privacyRedacted
              ? []
              : etut.assignedStudentIds === 'all'
                ? students
                : students.filter((s) => (etut.assignedStudentIds as string[]).includes(s.id));
            const att = etut.studentAttendance ? Object.values(etut.studentAttendance) : [];
            const present = att.filter((a) => a.status === 'present').length;
            const absent = att.filter((a) => a.status === 'absent').length;
            const late = att.filter((a) => a.status === 'late').length;
            const isOpen = expandedEtutId === etut.id;
            // Aşama 24: etüt bitti mi, bittiyse yoklaması alınmış mı
            const ended = isEtutEnded(etut);
            const status = getEtutStatus(etut);
            const missingAtt = ended && etutExpectsAttendance(etut) && !hasEtutAttendance(etut);
            const dateText = new Date(etut.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' });

            return (
              <ExpandableStrip
                key={etut.id}
                id={`etut-strip-${etut.id}`}
                noun="Etüt"
                open={isOpen}
                onToggle={() => setExpandedEtutId(isOpen ? null : etut.id)}
                accent={ETUT_STATUS_STYLE[status].accent}
                className={`bg-surface ${status === 'past' ? 'opacity-90' : ''}`}
                badges={
                  <>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-brand-soft text-brand-fg">
                      {etut.subject}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-warning-soft text-warning-fg inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateText} · {etut.time ? `${etut.time} (${etut.duration} dk)` : 'Saat belirtilmedi'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-2xs font-bold ${ETUT_STATUS_STYLE[status].chip}`} data-etut-status={status}>
                      {ETUT_STATUS_STYLE[status].label}
                    </span>
                    {missingAtt && (
                      <span className="px-2 py-0.5 rounded-lg text-2xs font-bold bg-danger-soft text-danger-fg inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Yoklama alınmadı
                      </span>
                    )}
                    {etut.gradeLevel && (
                      <span className="px-2 py-0.5 rounded-lg text-2xs font-semibold bg-info-soft text-info-fg">
                        {etut.gradeLevel}
                      </span>
                    )}
                    {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                      <span className="px-2 py-0.5 rounded-lg text-2xs font-bold bg-surface-2 text-fg-2">{etut.lessonPeriod}</span>
                    )}
                  </>
                }
                title={etut.topic}
                meta={[etut.location, etut.teacherName ? `Öğretmen: ${etut.teacherName}` : '', `${assignedStudents.length} öğrenci`].filter(Boolean).join(' · ')}
                stats={
                  <div className="text-xs font-semibold">
                    <span className="text-muted block">Yoklama</span>
                    {att.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2">
                        <span className="text-success-fg">{present} Geldi</span>
                        <span className="text-danger-fg">{absent} Gelmedi</span>
                        {late > 0 && <span className="text-warning-fg">{late} Geç</span>}
                      </span>
                    ) : (
                      missingAtt ? (
                        <span className="text-danger-fg font-bold">Alınmadı</span>
                      ) : (
                        <span className="text-warning-fg font-normal">Yoklama henüz alınmadı</span>
                      )
                    )}
                  </div>
                }
                actions={
                  etut.privacyRedacted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted px-2" data-etut-private title="Konu, yorumlar ve yoklama yalnızca etüdü veren öğretmen ve yöneticiye görünür">
                      <Lock className="w-3.5 h-3.5" /> Başka öğretmenin etüdü
                    </span>
                  ) : !canEditEtut(etut) ? (
                    /* Aşama 111: Rehberlik / Zümre başkasının etüdünü yalnız görür */
                    <StripAction label="Yoklamayı görüntüle" id={`btn-view-etut-${etut.id}`} title="Yoklama ve yorumlar (salt okunur)" onClick={() => setViewEtut(etut)}>
                      <Eye className="w-4 h-4" />
                    </StripAction>
                  ) : (
                  <>
                    <StripAction label="Yoklama Al" tone="success" onClick={() => setSelectedEtutForAttendance(etut)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </StripAction>
                    {/* Aşama 207: kopyala / düzenle / sil "⋯" menüsünde (sil onay penceresi aynen) */}
                    <MoreMenu
                      quiet
                      id={`btn-more-etut-${etut.id}`}
                      ariaLabel="Etüt işlemleri"
                      sheetTitle={etut.topic || 'Etüt'}
                      items={[
                        { id: `btn-copy-etut-${etut.id}`, label: 'Kopyala', icon: Copy, title: 'Başka tarihe yeniden tanımla', onClick: () => openCopy(etut) },
                        { id: `btn-edit-etut-${etut.id}`, label: 'Düzenle', icon: Edit2, onClick: () => openEdit(etut) },
                        { id: `btn-delete-etut-${etut.id}`, label: 'Sil', icon: Trash2, danger: true, onClick: () => setEtutToDelete(etut) },
                      ]}
                    />
                  </>
                  )
                }
              >
                <div className="grid gap-4 lg:grid-cols-2" data-etut-detail>
                  <div className="space-y-2 text-xs text-muted min-w-0">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-warning-fg" />
                      <span className="text-fg font-medium">
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time ? `${etut.time} (${etut.duration} dk)` : 'Saat belirtilmedi'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-danger-fg" />
                      <span className="text-fg-2 font-medium">{etut.location}</span>
                    </div>
                    {etut.teacherName && (
                      <div className="flex items-center gap-2 text-brand-fg font-semibold">
                        <Users className="w-3.5 h-3.5 text-brand-fg" />
                        <span>
                          Öğretmen: <strong>{etut.teacherName}</strong> {etut.teacherBranch ? `(${etut.teacherBranch})` : ''}
                        </span>
                      </div>
                    )}
                    {etut.schoolLevel && <div>{etut.schoolLevel}</div>}
                    {etut.notes && (
                      <p className="text-xs text-muted italic pt-1 border-t border-line">
                        <span className="font-semibold text-fg-2 not-italic">Açıklama:</span> {etut.notes}
                      </p>
                    )}
                    {etut.teacherFeedback && (
                      <div className="p-2.5 rounded-xl bg-warning-soft border border-warning/30 text-warning-fg space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <MessageSquareQuote className="w-3.5 h-3.5 shrink-0" />
                          <span>Öğretmen Görüş ve Düşünceleri:</span>
                        </div>
                        <p className="italic text-fg-2 leading-relaxed font-normal">"{etut.teacherFeedback}"</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!etut.privacyRedacted && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEtutForDispatch(etut);
                          setIsDispatchModalOpen(true);
                        }}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="WhatsApp ve Mail ile İlet"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-success-fg" /> WhatsApp / Mail
                      </button>
                      )}
                      <a
                        href={createGoogleCalendarUrlForEtut(etut)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Google Takvime Ekle"
                      >
                        <CalendarCheck className="w-3.5 h-3.5 text-info-fg" /> Google Takvim
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          downloadIcsFile(
                            `etut-${etut.subject}-${etut.date}`,
                            `[ETÜT] ${etut.subject}: ${etut.topic}`,
                            etut.notes || `${etut.location} yerinde etüt çalışması`,
                            `${etut.date}T${etut.time || '14:00'}:00`,
                            etut.duration,
                            etut.location
                          )
                        }
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Takvim dosyası indir"
                      >
                        <CalendarDays className="w-3.5 h-3.5" /> Takvim dosyası
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && <span className="text-2xs text-brand-fg font-bold">Tümü Dahil</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {assignedStudents.map((std) => {
                        const st = etut.studentAttendance?.[std.id]?.status;
                        return (
                          <button
                            type="button"
                            key={std.id}
                            onClick={() => {
                              setReportSelectedStudentId(std.id);
                              setIsReportModalOpen(true);
                            }}
                            className="ui-chip ui-chip-neutral cursor-pointer transition-colors hover:bg-brand-soft hover:text-brand-fg"
                            title={`${std.name} için etüt analizini görüntüle`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                st === 'present' ? 'bg-success' : st === 'absent' ? 'bg-danger' : st === 'late' ? 'bg-warning' : 'bg-brand'
                              }`}
                            ></span>
                            <span>{std.name}</span>
                          </button>
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
          id="etut-list-show-more"
          remaining={pagedListEtuts.remaining}
          total={pagedListEtuts.total}
          shown={pagedListEtuts.visible.length}
          onMore={pagedListEtuts.showMore}
          onAll={pagedListEtuts.showAll}
          step={30}
        />
        </div>
      )}
    </>
  );
}
export default EtutKartlari;
