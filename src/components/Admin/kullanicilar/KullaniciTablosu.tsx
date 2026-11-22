// Kullanıcı yönetimi › kullanıcı tablosu (Aşama 354d: ayrı parça)
import { ShowMoreBar } from '../../../lib/listPaging';
import { ShieldCheck, Users, Crown, GraduationCap, Edit, Trash2, Ban, Play, AlertTriangle, Phone, Mail, School, Shield, BadgeCheck, Send } from 'lucide-react';
import { canSendCredentials } from '../../../lib/grantCred';
import { dataService } from '../../../services/dataService';
import { ROLE_BY_CODE, sortRoles, type TeacherRole } from '../../../lib/teacherRoles';
import { birthDateLabel } from '../../../lib/teacherImport';
import { profilResmi, ogretmenProfilRol } from '../../../lib/profilResmi';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function KullaniciTablosu() {
  const { currentAdmin, setYetkiTeacherId, setDeleteModalUser, setSuspendModalUser, setStuSendOne, grantCredOn, studentById, setNotifyTeacher, accessCounts, unvanlar, phoneOf, birthOf, stats, filteredUsers, pagedUsers, isHead, rowManageable, handleOpenEdit, handleOpenRoleModal, handleOpenAuthModal } = useKullaniciBaglam();
  return (
    <>
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-xs font-bold uppercase tracking-wider text-muted">
                <th className="py-3.5 px-4 sm:px-6">Kullanıcı (Ad Soyad & Profil)</th>
                <th className="py-3.5 px-4">İletişim & Kullanıcı Adı</th>
                <th className="py-3.5 px-4">Mevcut Rolü</th>
                <th className="py-3.5 px-4">Birim / Sınıf / Branş</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4 text-right sm:pr-6">Yönetici İşlemleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <Users className="w-10 h-10 text-subtle mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-fg">Kullanıcı Bulunamadı</p>
                    <p className="text-xs text-muted mt-1">Arama veya filtre kriterlerinize uyan kayıt yok.</p>
                  </td>
                </tr>
              ) : (
                pagedUsers.visible.map((u) => {
                  const isCurrentAdminSelf = u.id === currentAdmin?.id;
                  const manageable = rowManageable(u);
                  const isProtectedAdmin = isCurrentAdminSelf || (u.role === 'admin' && stats.admins <= 1) || !manageable;
                  const isSuspended = u.isSuspended || u.status === 'suspended';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-surface-2/50 transition-colors ${
                        isSuspended ? 'bg-danger-soft text-muted' : ''
                      }`}
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center space-x-3">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-2 ring-2 ring-line overflow-hidden flex items-center justify-center">
                              {/* Aşama 171: kendi resmi yoksa cinsiyet + unvana göre çizim */}
                              <img
                                loading="lazy"
                                decoding="async"
                                src={profilResmi(u, u.role === 'student' ? 'student' : ogretmenProfilRol(u, unvanlar.get(u.id)))}
                                alt={u.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="font-bold text-fg text-xs sm:text-sm truncate">
                                {u.name}
                              </span>
                              {isCurrentAdminSelf && (
                                <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-brand/20 text-brand-fg border border-brand/30">
                                  Siz
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted font-mono block">
                              @{u.username}
                            </span>
                            {isHead && u.kurumId && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-2xs font-semibold bg-info-soft text-info-fg" data-kurum-badge>
                                {dataService.getKurumNameForId(u.kurumId)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {u.email ? (
                            <a
                              href={`mailto:${u.email}`}
                              className="flex items-center space-x-1 text-fg-2 hover:text-brand-fg transition-colors truncate max-w-[200px]"
                              title={u.email}
                            >
                              <Mail className="w-3 h-3 text-muted shrink-0" />
                              <span className="truncate">{u.email}</span>
                            </a>
                          ) : (
                            <span className="text-subtle italic">E-posta yok</span>
                          )}

                          {phoneOf(u) ? (
                            <div className="flex items-center space-x-1 text-muted">
                              <Phone className="w-3 h-3 text-muted shrink-0" />
                              <span>{phoneOf(u)}</span>
                            </div>
                          ) : null}
                          {birthOf(u) ? <div className="text-xs text-muted">Doğum: {birthDateLabel(birthOf(u))}</div> : null}
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-warning/15 text-warning-fg border border-warning/30">
                            <Crown className="w-3.5 h-3.5 text-warning-fg" />
                            <span>Yönetici</span>
                          </span>
                        ) : u.role === 'teacher' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-brand/15 text-brand-fg border border-brand/30">
                            <GraduationCap className="w-3.5 h-3.5 text-brand-fg" />
                            <span>Öğretmen</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-success/15 text-success-fg border border-success/30">
                            <School className="w-3.5 h-3.5 text-success-fg" />
                            <span>Öğrenci</span>
                          </span>
                        )}
                        {u.role !== 'student' && (() => {
                          // "Öğretmen" rozeti hesap türüdür; unvan(lar) altında gösterilir (yalnız Öğretmen ise tekrar yazılmaz)
                          const rs = sortRoles(unvanlar.get(u.id) || []).filter((r) => r !== 'ogretmen') as TeacherRole[];
                          return rs.length ? (
                            <div className="mt-1 flex flex-wrap gap-1" data-unvan-for={u.id}>
                              {rs.map((r) => (
                                <span key={r} className={`ui-chip ui-chip-${ROLE_BY_CODE[r]?.chip || 'neutral'}`} title={ROLE_BY_CODE[r]?.description}>
                                  {ROLE_BY_CODE[r]?.short || r}
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </td>

                      {/* Detail Unit */}
                      <td className="py-3.5 px-4">
                        {u.role === 'student' ? (
                          <div>
                            <span className="font-bold text-fg block">
                              {u.className || 'Genel'}
                            </span>
                            {u.studentNumber && (
                              <span className="text-xs text-muted">
                                No: {u.studentNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-fg block truncate max-w-[150px]">
                              {u.branch || 'Genel Branş'}
                            </span>
                            {(() => {
                              const c = accessCounts.get(u.auth_user_id || u.id);
                              if (!c || (c.classes === 0 && c.students === 0)) return null;
                              const parts = [c.classes ? `${c.classes} sınıf` : '', c.students ? `${c.students} öğrenci` : ''].filter(Boolean);
                              return (
                                <span className="text-2xs text-brand-fg font-medium">
                                  {parts.join(' · ')} yetkili
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-danger/20 text-danger-fg border border-danger/30">
                            <Ban className="w-3 h-3 text-danger-fg" />
                            <span>Askıya Alındı</span>
                          </span>
                        ) : u.status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-warning/20 text-warning-fg border border-warning/30">
                            <AlertTriangle className="w-3 h-3 text-warning-fg" />
                            <span>Onay Bekliyor</span>
                          </span>
                        ) : u.status === 'rejected' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-surface-3 text-fg-2">
                            <span>Reddedildi</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg text-xs font-bold bg-success/15 text-success-fg border border-success/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/40 animate-pulse" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Sınıf & Öğrenci Erişim Yetkilendirmesi (Erişim Matrisi) */}
                          {u.role !== 'student' && manageable && (isHead ? !u.kurumId : u.role === 'teacher') && (
                            <button
                              type="button"
                              onClick={() => handleOpenAuthModal(u)}
                              className="p-1.5 rounded-lg bg-brand-soft hover:bg-brand-soft text-brand-fg hover:text-fg border border-brand/40 transition-colors cursor-pointer"
                              title="Sınıf ve Öğrenci Erişim Yetkilerini Yönet (Erişim Matrisi)"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Rol Değiştir Butonu (öğretmen <-> yönetici): yalnızca genel yönetici */}
                          {u.role !== 'student' && isHead && (
                            <button
                              type="button"
                              onClick={() => handleOpenRoleModal(u)}
                              className="ui-btn ui-btn-secondary ui-btn-icon"
                              title="Öğretmen / Yönetici yetkisi"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Aşama 143: unvan, bölüm ve işlem izinleri (kurum öğretmeni) */}
                          {u.role !== 'student' && !!u.kurumId && manageable && !isCurrentAdminSelf && (
                            <button
                              type="button"
                              onClick={() => setYetkiTeacherId(u.id)}
                              className="ui-btn ui-btn-secondary ui-btn-icon"
                              title="Yetkiler (unvan, bölümler, işlem izinleri)"
                              aria-label="Yetkiler"
                              data-yetki-open={u.id}
                            >
                              <BadgeCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Aşama 149: öğrenciye / veliye giriş bilgisi (SMS / e-posta) */}
                          {u.role === 'student' && studentById.has(u.id) && canSendCredentials(studentById.get(u.id), grantCredOn) && (
                            <button
                              type="button"
                              onClick={() => setStuSendOne(studentById.get(u.id) || null)}
                              className="ui-btn ui-btn-secondary ui-btn-icon"
                              title="Giriş bilgisini SMS / e-postayla gönder"
                              aria-label={`${u.name} giriş bilgisini gönder`}
                              data-testid="ogrenci-giris-gonder-satir"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Bilgi & Şifre Düzenle (Admin Override) */}
                          <button
                            type="button"
                            disabled={!manageable && !isCurrentAdminSelf}
                            onClick={() => handleOpenEdit(u)}
                            className="ui-btn ui-btn-secondary ui-btn-icon"
                            title="Bilgileri ve Şifreyi Güncelle (Admin Override)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Askıya Al / Aktifleştir */}
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendModalUser(u);
                              setNotifyTeacher(true);
                            }}
                            disabled={isProtectedAdmin}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                              isSuspended
                                ? 'bg-success/15 hover:bg-success/25 text-success-fg border-success/30'
                                : 'bg-surface-2 hover:bg-danger/20 text-fg-2 hover:text-danger-fg border-line'
                            }`}
                            title={isSuspended ? 'Hesabı Yeniden Aktifleştir' : 'Hesabı Geçici Olarak Dondur (Askıya Al)'}
                          >
                            {isSuspended ? <Play className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          {/* Kalıcı Sil */}
                          <button
                            type="button"
                            onClick={() => setDeleteModalUser(u)}
                            disabled={isProtectedAdmin}
                            className="ui-btn ui-btn-secondary ui-btn-icon hover:text-danger-fg"
                            title="Kullanıcıyı Kalıcı Olarak Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ShowMoreBar
          id="users-show-more"
          remaining={pagedUsers.remaining}
          total={pagedUsers.total}
          shown={pagedUsers.visible.length}
          onMore={pagedUsers.showMore}
          onAll={pagedUsers.showAll}
        />
      </div>
    </>
  );
}
export default KullaniciTablosu;
