// Kullanıcı yönetimi › öğretmen sınıf ve öğrenci erişim penceresi (Aşama 354d: ayrı parça, yalnız gerekince yüklenir)
import { ShieldCheck, GraduationCap, Search, Check, School, Shield, CheckCircle2 } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { InfoTip } from '../../ui/Compact';
import { MailOptIn } from '../../Teacher/FormParts';
import { GradeTicks } from '../GradeTicks';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { Modal } from '../../ui/kit';
import { wideRoleText } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function ErisimPenceresi() {
  const { classes, authModalTeacher, setAuthModalTeacher, selectedAuthClassIds, setSelectedAuthClassIds, selectedAuthStudentIds, setSelectedAuthStudentIds, authStudentSearch, setAuthStudentSearch, authGrades, setAuthGrades, authGradesMissing, notifyTeacher, setNotifyTeacher, authGradeOptions, gradeCovered, authWideRoles, kurumRolesOn, roleSeesAll, authExtraRoleNote, handleSaveAuthModal } = useKullaniciBaglam();
  return (
    <>
      {authModalTeacher && (
        <Modal
          open
          onClose={() => setAuthModalTeacher(null)}
          size="lg"
          icon={ShieldCheck}
          title="Erişim Yetki Matrisi"
          description={
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand/20 text-brand-fg font-mono border border-brand/30">{authModalTeacher.name}</span>
              <span>Öğretmenin sisteme eriştiğinde görebileceği ve işlem yapabileceği sınıf ile öğrencileri belirleyin.</span>
            </span>
          }
          govdeClass="p-5 sm:p-6 space-y-5"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <MailOptIn
                id="teacher-access-notify"
                checked={notifyTeacher}
                onChange={setNotifyTeacher}
                label="Öğretmene yetkili sınıflarını e-postayla bildir"
              />
              <div className="flex items-center gap-2 ml-auto">
                <button type="button" onClick={() => setAuthModalTeacher(null)} className="ui-btn ui-btn-secondary min-w-24">
                  Vazgeç
                </button>
                <button type="button" onClick={handleSaveAuthModal} className="ui-btn ui-btn-primary min-w-24">
                  <Check className="w-3.5 h-3.5" />
                  <span>Yetkileri Kaydet ve Uygula</span>
                </button>
              </div>
            </div>
          }
        >
              {/* Info Alert */}
              {/* Aşama 184: tek satır, ayrıntı ⓘ içinde */}
              <div className="px-3 py-2 bg-brand-soft border border-brand/30 rounded-xl text-xs text-brand-fg flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-fg shrink-0" />
                <span className="flex-1">Öğretmen yalnız burada işaretlenen sınıf ve öğrencileri görür.</span>
                <InfoTip text="Yetkisi olmayan sınıflar ve öğrenciler öğretmenin panelinde hiç listelenmez. Kademe yetkisi verilirse o kademedeki bütün sınıflar da görünür." />
              </div>

              {/* Aşama 102: Görebileceği kademeler */}
              <div className="space-y-1.5">
                {authWideRoles.length > 0 && !kurumRolesOn && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-warning-soft text-warning-fg border-warning/30" id="teacher-access-role-off">
                    Kurumda "Rol yetkileri" kapalı: {wideRoleText(authWideRoles)} rolü şu an etkin değil; bu kişi yalnızca aşağıda işaretli sınıfları görür. Anahtar Kurum Ayarları'nda.
                  </p>
                )}
                {authExtraRoleNote && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-info-soft text-info-fg border-info/30" id="teacher-access-role-extra">
                    {authExtraRoleNote}
                  </p>
                )}
                <GradeTicks
                  id="teacher-access-grades"
                  options={authGradeOptions}
                  value={authGrades}
                  onChange={setAuthGrades}
                  roleNote={roleSeesAll ? `${wideRoleText(authWideRoles)} rolü gereği kurumdaki bütün sınıf ve öğrencileri görür; işaretlemek gerekmez.` : undefined}
                />
                {authGradesMissing && (
                  <p className="text-xs font-semibold text-warning-fg" id="teacher-access-grades-missing">
                    Kademe için önce Supabase'de sql/102_ogretmen_kademe.sql çalıştırılmalı.
                  </p>
                )}
              </div>

              {/* 1. Sınıf Yetkilendirmeleri */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2 flex items-center space-x-2">
                    <School className="w-4 h-4 text-brand-fg" />
                    <span>Sınıf Erişim Yetkileri ({roleSeesAll ? classes.length : new Set([...selectedAuthClassIds, ...gradeCovered]).size}/{classes.length} Sınıf Seçili)</span>
                  </h4>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedAuthClassIds(classes.map((c) => c.id))}
                      className="px-2 py-0.5 rounded text-brand-fg hover:bg-brand-soft font-medium cursor-pointer"
                    >
                      Tümünü Seç
                    </button>
                    <span className="text-subtle">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAuthClassIds([])}
                      className="px-2 py-0.5 rounded text-danger-fg hover:bg-danger-soft font-medium cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {classes.length === 0 ? (
                  <p className="text-xs text-muted italic">Sistemde henüz kayıtlı sınıf bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {classes.map((cls) => {
                      const viaRole = roleSeesAll;
                      const viaGrade = !viaRole && gradeCovered.has(cls.id);
                      const locked = viaRole || viaGrade;
                      const isChecked = locked || selectedAuthClassIds.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          title={viaRole ? 'Rolünden açık; rol değişince kendiliğinden güncellenir' : viaGrade ? 'Kademeden açık; kapatmak için yukarıdan kademeyi kaldırın' : undefined}
                          className={`p-3 rounded-xl border flex items-center justify-between transition ${locked ? 'cursor-default' : 'cursor-pointer'} ${
                            isChecked
                              ? 'bg-brand/15 border-brand/50 text-fg'
                              : 'bg-canvas/80 border-line text-muted hover:border-line'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={locked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAuthClassIds([...selectedAuthClassIds, cls.id]);
                                } else {
                                  setSelectedAuthClassIds(selectedAuthClassIds.filter((id) => id !== cls.id));
                                }
                              }}
                              className="rounded bg-surface border-line text-brand-fg focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold block truncate text-fg">
                                {cls.name}
                              </span>
                              <span className="text-2xs text-muted block truncate">
                                {cls.gradeLevel || cls.schoolLevel || cls.branch || 'Genel'}
                              </span>
                            </div>
                          </div>
                          {viaRole ? (
                            <span className="ui-chip ui-chip-info shrink-0 ml-2 text-2xs">Rolünden</span>
                          ) : viaGrade ? (
                            <span className="ui-chip ui-chip-brand shrink-0 ml-2 text-2xs">Kademeden</span>
                          ) : (
                            isChecked && <CheckCircle2 className="w-4 h-4 text-brand-fg shrink-0 ml-2" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Bireysel Öğrenci Yetkilendirmeleri */}
              <div className="space-y-3 pt-4 border-t border-line">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2 flex items-center space-x-2">
                    <GraduationCap className="w-4 h-4 text-success-fg" />
                    <span>Bireysel / Etüt Öğrenci Yetkileri ({selectedAuthStudentIds.length} Bireysel Yetkili)</span>
                  </h4>
                </div>

                <p className="text-xs text-muted">
                  Sınıf haricinde bu öğretmene özel olarak atanmış bireysel öğrencileri seçebilirsiniz.
                </p>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input autoComplete="off"
                    type="text"
                    placeholder="Öğrenci ara (Ad, Sınıf, Numara)..."
                    value={authStudentSearch}
                    onChange={(e) => setAuthStudentSearch(e.target.value)}
                    className="ui-field w-full pl-9 pr-3.5"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-line">
                  {dataService
                    .getAllStudents()
                    .filter((s) => {
                      if (!authStudentSearch.trim()) return true;
                      const q = authStudentSearch;
                      return (
                        matchTurkishSearch(s.name, q) ||
                        matchTurkishSearch(s.className, q) ||
                        (s.studentNumber || '').includes(q.trim())
                      );
                    })
                    .slice(0, 30)
                    .map((std) => {
                      const isDirectAuth = selectedAuthStudentIds.includes(std.id);
                      const isViaClass = roleSeesAll || selectedAuthClassIds.includes(std.classId) || gradeCovered.has(std.classId);

                      return (
                        <div
                          key={std.id}
                          className="pt-1.5 flex items-center justify-between text-xs py-1"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className="font-bold text-fg truncate">{std.name}</span>
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                              {std.className}
                            </span>
                            {isViaClass && (
                              <span className="text-3xs px-1.5 py-0.2 rounded bg-brand/20 text-brand-fg font-mono">
                                Sınıfından Yetkili
                              </span>
                            )}
                          </div>

                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDirectAuth}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAuthStudentIds([...selectedAuthStudentIds, std.id]);
                                } else {
                                  setSelectedAuthStudentIds(
                                    selectedAuthStudentIds.filter((id) => id !== std.id)
                                  );
                                }
                              }}
                              className="rounded bg-surface border-line text-success-fg focus:ring-0 w-3.5 h-3.5"
                            />
                            <span className="text-xs text-muted">Bireysel İzin</span>
                          </label>
                        </div>
                      );
                    })}
                </div>
              </div>
        </Modal>
      )}
    </>
  );
}
export default ErisimPenceresi;
