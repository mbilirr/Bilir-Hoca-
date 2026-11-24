// Kullanıcı yönetimi › öğretmen sınıf ve öğrenci erişim penceresi (Aşama 354d: ayrı parça, yalnız gerekince yüklenir)
import { ShieldCheck, GraduationCap, Search, Check, School, Shield, LayoutGrid } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { InfoTip } from '../../ui/Compact';
import { MailOptIn } from '../../Teacher/FormParts';
import { gradesLabel } from '../../../lib/teacherGrades';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { Modal } from '../../ui/kit';
import { wideRoleText } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function ErisimPenceresi() {
  const { classes, authModalTeacher, setAuthModalTeacher, setSinifDersUser, selectedAuthClassIds, selectedAuthStudentIds, setSelectedAuthStudentIds, authStudentSearch, setAuthStudentSearch, authGrades, notifyTeacher, setNotifyTeacher, gradeCovered, authWideRoles, kurumRolesOn, roleSeesAll, authExtraRoleNote, handleSaveAuthModal } = useKullaniciBaglam();
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
                <span className="flex-1">Öğretmen yalnız verilen sınıfları ve burada işaretlenen öğrencileri görür.</span>
                <InfoTip text="Yetkisi olmayan sınıflar ve öğrenciler öğretmenin panelinde hiç listelenmez. Sınıflar (kademe dahil) Sınıflar ve dersler penceresinden verilir; burada sınıfı dışında tek tek öğrenci izni verilir." />
              </div>

              {/* Aşama 377: kademe ve sınıf seçimi "Sınıflar ve dersler" penceresine taşındı (ders programıyla tek kayıt) */}
              <div className="space-y-1.5">
                {authWideRoles.length > 0 && !kurumRolesOn && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-warning-soft text-warning-fg border-warning/30" id="teacher-access-role-off">
                    Kurumda "Rol yetkileri" kapalı: {wideRoleText(authWideRoles)} rolü şu an etkin değil; bu kişi yalnızca verilen sınıfları görür. Anahtar Kurum Ayarları'nda.
                  </p>
                )}
                {authExtraRoleNote && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-info-soft text-info-fg border-info/30" id="teacher-access-role-extra">
                    {authExtraRoleNote}
                  </p>
                )}
                <div className="ui-card ui-card-pad flex flex-wrap items-center gap-3" id="teacher-access-classes">
                  <School className="w-4 h-4 text-brand-fg shrink-0" aria-hidden />
                  <div className="flex-1 min-w-40">
                    <p className="text-sm font-semibold text-fg">Sınıflar</p>
                    <p className="text-xs text-muted">
                      {roleSeesAll
                        ? `${wideRoleText(authWideRoles)} rolü gereği bütün sınıfları görür.`
                        : `${new Set([...selectedAuthClassIds, ...gradeCovered]).size}/${classes.length} sınıfı görür${authGrades.all || authGrades.grades.length ? ` · kademe: ${gradesLabel(authGrades)}` : ''}. Derse girdiği ve gördüğü sınıflar Sınıflar ve dersler penceresinden seçilir.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    id="teacher-access-siniflar"
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-40 justify-center"
                    title="Bu pencere kapanır; öğrenci değişikliklerini önce kaydedin"
                    onClick={() => {
                      const t = authModalTeacher;
                      setAuthModalTeacher(null);
                      setSinifDersUser(t);
                    }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Sınıflar ve dersler
                  </button>
                </div>
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
