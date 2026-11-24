// Kullanıcı yönetimi › bilgi ve şifre güncelleme penceresi (Aşama 354d: ayrı parça, yalnız gerekince yüklenir)
import React from 'react';
import { RefreshCw, Edit, Key, Copy, Check, Eye, EyeOff, BadgeCheck, LayoutGrid } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { CompactRow } from '../../ui/Compact';
import { KayitliSifre } from '../../ui/KayitliSifre';
import { MailOptIn } from '../../Teacher/FormParts';
import { trFold } from '../../../lib/importNormalize';
import { profilResmi, ogretmenProfilRol } from '../../../lib/profilResmi';
import { Modal } from '../../ui/kit';
import { ProfilResmiSecModal, isTeacherAccount } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function KullaniciDuzenlePenceresi() {
  const { currentAdmin, classes, setYetkiTeacherId, setSinifDersUser, editModalUser, setEditModalUser, editFormData, setEditFormData, resimAcik, setResimAcik, showPassword, setShowPassword, editPwOpen, setEditPwOpen, copiedPassword, setCopiedPassword, notifyTeacher, setNotifyTeacher, unvanlar, handleSaveEdit, handleGeneratePassword, handleCopyPassword } = useKullaniciBaglam();
  return (
    <>
      {editModalUser && (
        <Modal
          open
          onClose={() => setEditModalUser(null)}
          size="lg"
          icon={Edit}
          title="Kullanıcı Bilgilerini Güncelle"
          description={
            <span className="flex items-center gap-2 flex-wrap">
              {/* Aşama 281: rol adı Türkçe (STUDENT/TEACHER yerine) */}
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-fg-2 font-semibold">
                {editModalUser.role === 'student' ? 'Öğrenci' : editModalUser.role === 'admin' ? 'Yönetici' : 'Öğretmen'}
              </span>
              <span>Sistem yöneticisi yetkisiyle profil alanlarını ve şifreyi doğrudan güncelleyin.</span>
            </span>
          }
          baslikSag={
            <>
                {/* Aşama 377: girdiği ve gördüğü sınıflar, sınıf öğretmenliği (ders programıyla aynı kayıt) */}
                {editModalUser.role !== 'student' && !!editModalUser.kurumId && editModalUser.kurumId === dataService.getMyKurumId() && (
                  <button
                    type="button"
                    onClick={() => setSinifDersUser(editModalUser)}
                    className="ui-btn ui-btn-primary ui-btn-sm h-8 w-40 justify-center"
                    id="edit-siniflar-btn"
                    title="Derse girdiği ve gördüğü sınıflar, sınıf öğretmenliği"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Sınıflar ve dersler
                  </button>
                )}
                {/* Aşama 143: aynı Yetkiler penceresi (unvan, bölümler, işlem izinleri) */}
                {editModalUser.role !== 'student' && !!editModalUser.kurumId && editModalUser.id !== currentAdmin?.id && (
                  <button
                    type="button"
                    onClick={() => setYetkiTeacherId(editModalUser.id)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-40 justify-center"
                    id="edit-yetkiler-btn"
                    title="Unvan, bölümler ve işlem izinleri"
                  >
                    <BadgeCheck className="w-3.5 h-3.5" /> Yetkiler
                  </button>
                )}
            </>
          }
          govdeClass="p-5 sm:p-6"
          footer={
            <>
              {/* Aşama 182: iki düğme eşit boyda, ortak düğme görünümü */}
              <button type="button" onClick={() => setEditModalUser(null)} className="ui-btn ui-btn-secondary w-32">
                İptal
              </button>
              <button type="submit" form="kullanici-duzenle-formu" className="ui-btn ui-btn-primary w-32">
                Kaydet
              </button>
            </>
          }
        >
            {resimAcik && (
              <React.Suspense fallback={null}>
                <ProfilResmiSecModal
                  open
                  onClose={() => setResimAcik(false)}
                  kind={editModalUser.role === 'student' ? 'student' : 'teacher'}
                  rol={editModalUser.role === 'student' ? 'student' : ogretmenProfilRol(editModalUser, unvanlar.get(editModalUser.id))}
                  person={{ id: editModalUser.id, name: editFormData.name, avatar: editFormData.avatar || undefined, gender: editFormData.gender || undefined }}
                  onSave={async (avatar: string | undefined) => setEditFormData((f) => ({ ...f, avatar: avatar || '' }))}
                />
              </React.Suspense>
            )}
            {/* Form */}
            <form id="kullanici-duzenle-formu" onSubmit={handleSaveEdit} className="space-y-4">
              {/* Aşama 334: bilgileri düzenleme izni olan profil resmini de değiştirir (Kaydet ile yazılır) */}
              <CompactRow
                lead={
                  <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line overflow-hidden shrink-0">
                    <img
                      decoding="async"
                      src={profilResmi(
                        { id: editModalUser.id, name: editFormData.name, avatar: editFormData.avatar, gender: editFormData.gender || undefined },
                        editModalUser.role === 'student' ? 'student' : ogretmenProfilRol(editModalUser, unvanlar.get(editModalUser.id))
                      )}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                }
                title="Profil Resmi"
                info="Çizim seçin ya da fotoğraf yükleyin; Kaydet ile yazılır."
                actions={
                  <button type="button" onClick={() => setResimAcik(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24" id="edit-profil-resmi-btn">
                    Değiştir
                  </button>
                }
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ad Soyad */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Ad Soyad</label>
                  <input autoComplete="off"
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Kullanıcı Adı */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Kullanıcı Adı</label>
                  <input autoComplete="off"
                    type="text"
                    required
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: trFold(e.target.value) })} // Aşama 154
                    className="ui-field w-full"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">E-posta Adresi</label>
                  <input autoComplete="off"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Telefon Numarası</label>
                  <input autoComplete="off"
                    type="tel"
                    placeholder="05XX XXX XX XX"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Aşama 171: cinsiyet (öğretmen + öğrenci) */}
                <div>
                  <label htmlFor="kullanici-duzen-cinsiyet" className="block text-xs font-bold text-fg-2 mb-1">Cinsiyet</label>
                  <select
                    id="kullanici-duzen-cinsiyet"
                    value={editFormData.gender}
                    onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value as '' | 'K' | 'E' })}
                    className="ui-field w-full font-semibold cursor-pointer"
                  >
                    <option value="">Seçiniz</option>
                    <option value="K">{editModalUser.role === 'student' ? 'Kız' : 'Kadın'}</option>
                    <option value="E">Erkek</option>
                  </select>
                </div>

                {/* Aşama 144: doğum tarihi (öğretmen) */}
                {editModalUser.role !== 'student' && (
                  <div>
                    <label className="block text-xs font-bold text-fg-2 mb-1">Doğum Tarihi</label>
                    <input autoComplete="off"
                      type="date"
                      id="ogretmen-duzen-dogum"
                      value={editFormData.birthDate}
                      onChange={(e) => setEditFormData({ ...editFormData, birthDate: e.target.value })}
                      className="ui-field w-full"
                    />
                  </div>
                )}

                {/* Öğretmen / Admin Branşı */}
                {editModalUser.role !== 'student' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-fg-2 mb-1">Branş / Görev</label>
                    <input autoComplete="off"
                      type="text"
                      placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Kurum Müdürü"
                      value={editFormData.branch}
                      onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                      className="ui-field w-full"
                    />
                  </div>
                )}

                {/* Öğrenci Alanları */}
                {editModalUser.role === 'student' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-fg-2 mb-1">Kayıtlı Sınıf</label>
                      <select
                        value={editFormData.classId}
                        onChange={(e) => {
                          const cls = classes.find((c) => c.id === e.target.value);
                          setEditFormData({
                            ...editFormData,
                            classId: e.target.value,
                            className: cls ? cls.name : editFormData.className,
                          });
                        }}
                        className="ui-field w-full cursor-pointer"
                      >
                        {classes.filter((c) => dataService.canManageClass(c) || c.id === editFormData.classId).map((c) => (
                          <option key={c.id} value={c.id} className="bg-surface text-fg">
                            {c.name} ({c.gradeLevel || c.branch || 'Genel'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-fg-2 mb-1">Okul Numarası</label>
                      <input autoComplete="off"
                        type="text"
                        placeholder="Örn: 482"
                        value={editFormData.studentNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, studentNumber: e.target.value })}
                        className="ui-field w-full"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Aşama 182: şifre bölümü tek satır; kutu yalnız "Yeni şifre" ile açılır, açıklama ⓘ içinde */}
              {(() => {
                const pwOpen = editPwOpen || !!editFormData.newPassword;
                return (
                  <CompactRow
                    icon={Key}
                    title="Giriş şifresi"
                    info="Verdiğiniz son şifre, kişi kendisi değiştirene kadar burada noktalı görünür (göz ile açılır). Kişinin kendi belirlediği şifre kimseye görünmez; unuttuysa Yeni şifre verin."
                    actions={
                      pwOpen ? (
                        <>
                          <button type="button" onClick={handleGeneratePassword} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24" title="Rastgele şifre oluştur">
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Rastgele</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditFormData({ ...editFormData, newPassword: '' });
                              setEditPwOpen(false);
                              setCopiedPassword(false);
                            }}
                            className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-24"
                          >
                            Vazgeç
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setEditPwOpen(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
                          Yeni şifre
                        </button>
                      )
                    }
                  >
                    {pwOpen && (
                      <div className="relative mb-2">
                        <input autoComplete="off"
                          type="text"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          spellCheck={false}
                          autoCapitalize="none"
                          autoFocus={editPwOpen && !editFormData.newPassword}
                          aria-label="Yeni şifre"
                          placeholder="En az 8 karakter, harf ve rakam"
                          value={editFormData.newPassword}
                          onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                          className={`ui-field w-full pl-3 pr-16 font-mono ${showPassword ? '' : 'pw-mask'}`}
                        />
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          {editFormData.newPassword && (
                            <button
                              type="button"
                              onClick={handleCopyPassword}
                              className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-fg"
                              title={copiedPassword ? 'Kopyalandı' : 'Şifreyi kopyala'}
                              aria-label="Şifreyi kopyala"
                            >
                              {copiedPassword ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-fg"
                            title={showPassword ? 'Gizle' : 'Göster'}
                            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Aşama 262: verilen son şifre (öğrencideki gibi noktalı; yalnız yöneticiler, kendi hesabı hariç) */}
                    {!pwOpen && editModalUser.id !== dataService.getCurrentTeacher()?.id && (
                      <KayitliSifre tur={isTeacherAccount(editModalUser) ? 'teacher' : 'student'} kayitId={editModalUser.id} className="mb-2" />
                    )}
                    <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.mustChangePassword}
                        onChange={(e) => setEditFormData({ ...editFormData, mustChangePassword: e.target.checked })}
                        className="rounded border-line focus:ring-0"
                      />
                      <span>İlk girişte şifresini değiştirsin</span>
                    </label>
                  </CompactRow>
                );
              })()}

              {isTeacherAccount(editModalUser) && (
                <MailOptIn
                  id="teacher-edit-notify"
                  checked={notifyTeacher}
                  onChange={setNotifyTeacher}
                  label="Öğretmene değişiklikleri e-postayla bildir"
                  hint={
                    editFormData.newPassword
                      ? 'Değişen bilgiler ve yeni şifre öğretmenin e-posta adresine gider.'
                      : 'Yalnızca değişen bilgiler gider; hiçbir şey değişmediyse e-posta gönderilmez.'
                  }
                />
              )}

            </form>
        </Modal>
      )}
    </>
  );
}
export default KullaniciDuzenlePenceresi;
