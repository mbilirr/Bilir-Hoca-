// Öğrenciler sayfası › öğrenci ekle / düzenle penceresi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import React, { Suspense, useState } from 'react';
import { KayitliSifre } from '../../ui/KayitliSifre';
import { Users, Plus, AlertCircle, Eye, EyeOff, Key, UserPlus, ShieldCheck, RefreshCw, Link2 } from 'lucide-react';
import { MAX_PARENTS, PARENT_RELATIONS, hasParentInfo } from '../../../lib/parents';
import { dataService } from '../../../services/dataService';
import { bugunTarih, yasHesapla } from '../../../lib/dogumTarihi';
import { formatClassDisplayName } from '../../../constants/schoolConstants';
import { inputCls } from '../FormParts';
import { Modal, cx } from '../../ui/kit';
import { CompactRow } from '../../ui/Compact';
import { emailIssue, normalizeTurkishPhone, PHONE_ERROR } from '../../../lib/importNormalize';
import { profilResmi } from '../../../lib/profilResmi';
import { ProfilResmiSecModal } from '../../ProfilResmiSecModal';
import { SF } from './ortak';
import { useOgrenciBaglam } from './useOgrenciYonetimi';
import { lazyNamed } from '../../../lib/lazyLoad';
import { useVeliDurumum } from '../../../services/veliService';

// Aşama 367: kayıtlı öğrencide Veliler başlığından açılır (bağlantı KAYITLI veli bilgisine gider)
const VeliBaglantisiPenceresi = lazyNamed<React.ComponentProps<typeof import('../../Veli/VeliBaglantisiPenceresi').VeliBaglantisiPenceresi>>(
  () => import('../../Veli/VeliBaglantisiPenceresi'),
  'VeliBaglantisiPenceresi'
);

export function OgrenciFormPenceresi() {
  const veli = useVeliDurumum();
  const [veliAcik, setVeliAcik] = useState(false);
  const { classes, canAddStudents, studentClassOptions, NO_CLASS, isNoBranchClass, gradeNumOf, PENDING_GRADE, pendingNoBranchGrades, isAddStudentOpen, setIsAddStudentOpen, editingStudent, isSavingStudent, studentName, setStudentName, studentEmail, setStudentEmail, studentPassword, setStudentPassword, showStudentPassword, setShowStudentPassword, studentClassId, setStudentClassId, studentNumber, setStudentNumber, studentPhone, setStudentPhone, studentAvatar, setStudentAvatar, studentGender, setStudentGender, genderTouchedRef, studentBirthDate, setStudentBirthDate, resimAcik, setResimAcik, studentFormError, studentEmailError, setStudentEmailError, studentPhoneError, setStudentPhoneError, parents, setParents, parentErrors, setParentErrors, setParentField, canTc, studentTc, setStudentTc, studentTcSaved, tcEditOpen, setTcEditOpen, pwEditOpen, setPwEditOpen, studentTcRemove, setStudentTcRemove, studentTcError, setStudentTcError, handleSaveStudent } = useOgrenciBaglam();
  return (
    <>
      <Modal
        open={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        closeOnBackdrop={false}
        icon={UserPlus}
        tone="brand"
        size="lg"
        title={editingStudent ? 'Öğrenci Bilgilerini Düzenle' : 'Yeni Öğrenci Ekle'}
        footer={
          <>
            {/* Aşama 182: iki düğme eşit boyda */}
            <button type="button" onClick={() => setIsAddStudentOpen(false)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32">
              İptal
            </button>
            <button type="submit" form="student-form" disabled={isSavingStudent} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-32">
              {isSavingStudent ? 'Kaydediliyor…' : editingStudent ? 'Kaydet' : 'Öğrenciyi ekle'}
            </button>
          </>
        }
      >
        {studentFormError && (
          <div role="alert" className="mb-2.5 p-2.5 bg-danger-soft rounded-xl flex items-center gap-2 text-xs font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{studentFormError}</span>
          </div>
        )}

        <form id="student-form" onSubmit={handleSaveStudent} noValidate className="space-y-2.5">
          {/* Aşama 70: Ad Soyad, Öğrenci No ve Sınıf yan yana, eşit genişlikte ve aynı yükseklikte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5" id="student-form-main">
            <div className="min-w-0">
              <label htmlFor="student-form-name" className="block text-xs font-bold text-fg-2 mb-1 truncate">Ad Soyad *</label>
              <input autoComplete="off"
                id="student-form-name"
                type="text"
                required
                value={studentName}
                onChange={(e) => {
                  const v = e.target.value;
                  setStudentName(v);
                  // Aşama 171: cinsiyet elle seçilmediyse addan tahmin (liste yalnız gerektiğinde yüklenir)
                  if (!genderTouchedRef.current) {
                    void import('../../../lib/cinsiyetTahmin').then(({ cinsiyetTahmin }) => {
                      if (!genderTouchedRef.current) setStudentGender(cinsiyetTahmin(v) || '');
                    });
                  }
                }}
                className={cx(inputCls, SF)}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="student-form-gender" className="block text-xs font-bold text-fg-2 mb-1 truncate">
                Cinsiyet
              </label>
              <select
                id="student-form-gender"
                value={studentGender}
                onChange={(e) => {
                  genderTouchedRef.current = true;
                  setStudentGender(e.target.value as '' | 'K' | 'E');
                }}
                className={cx(inputCls, SF, 'font-semibold cursor-pointer')}
              >
                <option value="">Seçiniz</option>
                <option value="K">Kız</option>
                <option value="E">Erkek</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="student-form-number" className="block text-xs font-bold text-fg-2 mb-1 truncate">
                Öğrenci No * <span className="font-medium text-muted">(giriş adı)</span>
              </label>
              <input autoComplete="off"
                id="student-form-number"
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                className={cx(inputCls, SF)}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="student-form-class" className="block text-xs font-bold text-fg-2 mb-1 truncate">
                Sınıf *
              </label>
              {/* Sınıf Seçimi (yalnızca sistemde kayıtlı / yetkili sınıflar) */}
              <select
                id="student-form-class"
                required
                value={studentClassId}
                onChange={(e) => setStudentClassId(e.target.value)}
                className={cx(inputCls, SF, 'font-semibold cursor-pointer')}
              >
                <option value="">Sınıf seçiniz *</option>
                {canAddStudents && <option value={NO_CLASS}>Sınıfsız (sınıfa bağlı değil)</option>}
                {editingStudent &&
                  studentClassId &&
                  studentClassId !== NO_CLASS &&
                  !studentClassOptions.some((c) => c.id === studentClassId) &&
                  classes
                    .filter((c) => c.id === studentClassId)
                    .map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                      </option>
                    ))}
                {studentClassOptions.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                    {isNoBranchClass(cls) ? ' (şubesiz)' : ''}
                  </option>
                ))}
                {pendingNoBranchGrades.length > 0 && (
                  <optgroup label="Şubesiz (kaydedince açılır)">
                    {pendingNoBranchGrades.map((c) => (
                      <option key={`g-${gradeNumOf(c)}`} value={`${PENDING_GRADE}${gradeNumOf(c)}`}>
                        {gradeNumOf(c)}. Sınıf (şubesiz)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Aşama 324: doğum tarihi · telefon · e-posta; üst satırla aynı 4 sütunlu ızgara (e-posta iki sütun) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="min-w-0">
              <label htmlFor="student-form-birth" className="flex items-baseline justify-between gap-2 text-xs font-bold text-fg-2 mb-1">
                <span className="truncate">Doğum Tarihi</span>
                {yasHesapla(studentBirthDate) !== null && (
                  <span className="font-medium text-muted tabular-nums shrink-0">{yasHesapla(studentBirthDate)} yaş</span>
                )}
              </label>
              <input
                autoComplete="off"
                id="student-form-birth"
                type="date"
                min="1900-01-01"
                max={bugunTarih()}
                value={studentBirthDate}
                onChange={(e) => setStudentBirthDate(e.target.value)}
                className={cx(inputCls, SF, 'tabular-nums')}
              />
            </div>
            <div className="min-w-0 sm:col-span-2 order-last">
              <label htmlFor="student-form-email" className="block text-xs font-bold text-fg-2 mb-1">E-Posta</label>
              <input autoComplete="off"
                id="student-form-email"
                type="email"
                value={studentEmail}
                onChange={(e) => {
                  setStudentEmail(e.target.value);
                  if (studentEmailError) setStudentEmailError(null);
                }}
                onBlur={() => setStudentEmailError(emailIssue(studentEmail))}
                aria-invalid={!!studentEmailError}
                aria-describedby={studentEmailError ? 'student-form-email-error' : undefined}
                className={cx(inputCls, SF, studentEmailError && 'border-danger focus:border-danger')}
              />
              {studentEmailError && (
                <p id="student-form-email-error" className="mt-1 text-xs font-semibold text-danger-fg">
                  {studentEmailError}
                </p>
              )}
            </div>
            <div className="min-w-0">
              <label htmlFor="student-form-phone" className="block text-xs font-bold text-fg-2 mb-1">Telefon</label>
              <input autoComplete="off"
                id="student-form-phone"
                type="tel"
                inputMode="tel"
                value={studentPhone}
                onChange={(e) => {
                  setStudentPhone(e.target.value);
                  if (studentPhoneError) setStudentPhoneError(null);
                }}
                onBlur={() => {
                  const n = normalizeTurkishPhone(studentPhone);
                  if (n.valid) setStudentPhone(n.value);
                  setStudentPhoneError(n.valid ? null : PHONE_ERROR);
                }}
                aria-invalid={!!studentPhoneError}
                aria-describedby={studentPhoneError ? 'student-form-phone-error' : undefined}
                className={cx(inputCls, SF, studentPhoneError && 'border-danger focus:border-danger')}
              />
              {studentPhoneError && (
                <p id="student-form-phone-error" className="mt-1 text-xs font-semibold text-danger-fg">
                  {studentPhoneError}
                </p>
              )}
            </div>
          </div>

          {/* Aşama 69: veliler (isteğe bağlı, en çok 3) — K12'deki Veli (1), (2), (3) ile aynı */}
          <div className="p-2.5 bg-surface-2 rounded-xl border border-line space-y-2" id="student-form-parents">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg-2 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-fg" />
                Veliler <span className="font-normal text-muted">(isteğe bağlı, en çok {MAX_PARENTS})</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {editingStudent && veli?.gonderebilir && (
                  <button
                    type="button"
                    id="student-form-veli-baglanti"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    onClick={() => setVeliAcik(true)}
                    title="Kayıtlı velilere haftalık özet bağlantısı (değişikliği önce kaydedin)"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Veli Bağlantısı
                  </button>
                )}
                {parents.length < MAX_PARENTS && (
                  <button
                    type="button"
                    id="student-form-parent-add"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    onClick={() => setParents((list) => [...list, {}].slice(0, MAX_PARENTS))}
                  >
                    <Plus className="w-3.5 h-3.5" /> Veli ekle
                  </button>
                )}
              </span>
            </div>
            <datalist id="parent-relation-options">
              {PARENT_RELATIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {parents.map((p, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface p-2 space-y-1.5" data-testid="student-form-parent-row">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg">{i + 1}. veli{p.relation ? ` · ${p.relation}` : ''}</span>
                  {(parents.length > 1 || hasParentInfo(p)) && (
                    <button
                      type="button"
                      className="ui-link ui-link-muted hover:text-danger-fg"
                      onClick={() => {
                        setParents((list) => {
                          const next = list.filter((_, k) => k !== i);
                          return next.length ? next : [{}];
                        });
                        setParentErrors((e) => e.filter((_, k) => k !== i));
                      }}
                    >
                      Kaldır
                    </button>
                  )}
                </div>
                {/* Aşama 70: geniş ekranda bir velinin bilgileri tek satırda (yakınlık · ad soyad · cep · e-posta), taşmadan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[minmax(5.5rem,0.6fr)_minmax(8rem,1.2fr)_minmax(7.5rem,0.9fr)_minmax(9rem,1.5fr)] gap-1.5">
                  <input
                    autoComplete="off"
                    list="parent-relation-options"
                    aria-label={`${i + 1}. veli yakınlığı`}
                    placeholder="Yakınlık (Anne, Baba…)"
                    value={p.relation || ''}
                    title={p.relation || undefined}
                    onChange={(e) => setParentField(i, 'relation', e.target.value)}
                    className={cx(inputCls, SF, 'min-w-0')}
                  />
                  <input
                    autoComplete="off"
                    aria-label={`${i + 1}. veli adı soyadı`}
                    placeholder="Ad soyad"
                    value={p.name || ''}
                    title={p.name || undefined}
                    onChange={(e) => setParentField(i, 'name', e.target.value)}
                    className={cx(inputCls, SF, 'min-w-0')}
                  />
                  <input
                    autoComplete="off"
                    type="tel"
                    inputMode="tel"
                    aria-label={`${i + 1}. veli cep telefonu`}
                    placeholder="Cep telefonu"
                    value={p.phone || ''}
                    onChange={(e) => setParentField(i, 'phone', e.target.value)}
                    onBlur={() => {
                      const n = normalizeTurkishPhone(p.phone || '');
                      if (n.valid && n.value !== (p.phone || '')) setParentField(i, 'phone', n.value);
                    }}
                    className={cx(inputCls, SF, 'min-w-0', parentErrors[i] && /telefon/i.test(parentErrors[i] || '') && 'border-danger focus:border-danger')}
                  />
                  <input
                    autoComplete="off"
                    type="email"
                    aria-label={`${i + 1}. veli e-postası`}
                    placeholder="E-posta"
                    value={p.email || ''}
                    title={p.email || undefined}
                    onChange={(e) => setParentField(i, 'email', e.target.value)}
                    className={cx(inputCls, SF, 'min-w-0', parentErrors[i] && !/telefon/i.test(parentErrors[i] || '') && 'border-danger focus:border-danger')}
                  />
                </div>
                {parentErrors[i] && <p className="text-xs font-semibold text-danger-fg">{parentErrors[i]}</p>}
              </div>
            ))}
          </div>

          {/* Aşama 182: TC, şifre ve fotoğraf tek satırlık kompakt bölümler; açıklamalar ⓘ içinde */}
          <div className="space-y-2">
            {/* Aşama 50: TC kimlik (isteğe bağlı) — yalnızca geri çevrilemez parmak izi saklanır */}
            {canTc && (() => {
              const tcOpen = tcEditOpen || !!studentTc || !!studentTcError;
              return (
                <CompactRow
                  icon={ShieldCheck}
                  title="TC kimlik"
                  status={
                    studentTcRemove ? (
                      <span className="ui-chip ui-chip-warning">Silinecek</span>
                    ) : studentTcSaved ? (
                      <span className="ui-chip ui-chip-success">Kayıtlı</span>
                    ) : studentTcSaved === false ? (
                      <span className="ui-chip ui-chip-neutral">Kayıtlı değil</span>
                    ) : null
                  }
                  info="İsteğe bağlı; deneme sonuçlarını öğrenciyle eşleştirmek için kullanılır. TC numarası saklanmaz ve sonradan görüntülenemez, yalnız geri çevrilemez parmak izi tutulur."
                  actions={
                    tcOpen ? (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentTc('');
                          setStudentTcError(null);
                          setTcEditOpen(false);
                        }}
                        className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-24"
                      >
                        Vazgeç
                      </button>
                    ) : studentTcRemove ? (
                      <button type="button" onClick={() => setStudentTcRemove(false)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
                        Geri al
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setTcEditOpen(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
                          {studentTcSaved ? 'Değiştir' : 'Ekle'}
                        </button>
                        {studentTcSaved && (
                          <button type="button" onClick={() => setStudentTcRemove(true)} className="ui-btn ui-btn-danger-soft ui-btn-sm h-8 w-24">
                            Sil
                          </button>
                        )}
                      </>
                    )
                  }
                >
                  {tcOpen ? (
                    <>
                      <input
                        autoComplete="off"
                        id="student-form-tc"
                        inputMode="numeric"
                        maxLength={11}
                        autoFocus={tcEditOpen && !studentTc}
                        value={studentTc}
                        onChange={(e) => {
                          setStudentTc(e.target.value.replace(/\D/g, '').slice(0, 11));
                          if (studentTcError) setStudentTcError(null);
                          if (studentTcRemove) setStudentTcRemove(false);
                        }}
                        placeholder="11 haneli TC kimlik numarası"
                        aria-label="TC kimlik numarası"
                        aria-invalid={!!studentTcError}
                        className={cx(inputCls, SF, studentTcError && 'border-danger focus:border-danger')}
                      />
                      {studentTcError && <p className="mt-1 text-xs font-semibold text-danger-fg">{studentTcError}</p>}
                    </>
                  ) : null}
                </CompactRow>
              );
            })()}

            {/* Giriş şifresi: gerçek giriş hesabı bu şifreyle açılır / güncellenir (yeni öğrencide zorunlu, hep açık) */}
            {(() => {
              const pwOpen = !editingStudent || pwEditOpen || !!studentPassword;
              return (
                <CompactRow
                  icon={Key}
                  title={editingStudent ? 'Giriş şifresi' : 'Giriş şifresi *'}
                  info="Öğrenci, giriş ekranındaki Öğrenci Portalı'ndan öğrenci numarası ve bu şifreyle girer; ilk girişte şifresini değiştirir. Kaydedince giriş bilgilerini WhatsApp / e-posta ile iletebileceğiniz pencere açılır. Verdiğiniz şifre, öğrenci değiştirene kadar yalnız yöneticilere noktalı gösterilir; öğrencinin kendi koyduğu şifre hiçbir yerde görünmez, unutulursa Yeni şifre verilir."
                  actions={
                    pwOpen ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setStudentPassword(dataService.generatePassword());
                            setShowStudentPassword(true);
                          }}
                          className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24"
                          title="Rastgele şifre oluştur"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Rastgele</span>
                        </button>
                        {editingStudent && (
                          <button
                            type="button"
                            onClick={() => {
                              setStudentPassword('');
                              setPwEditOpen(false);
                            }}
                            className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-24"
                          >
                            Vazgeç
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" onClick={() => setPwEditOpen(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
                        Yeni şifre
                      </button>
                    )
                  }
                >
                  {pwOpen ? (
                    <div className="relative">
                      <input
                        id="student-form-password"
                        type="text"
                        spellCheck={false}
                        autoCapitalize="none"
                        required={!editingStudent}
                        minLength={6}
                        autoFocus={!!editingStudent && pwEditOpen && !studentPassword}
                        autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                        value={studentPassword}
                        onChange={(e) => setStudentPassword(e.target.value)}
                        placeholder="En az 6 karakter"
                        aria-label="Giriş şifresi"
                        className={cx(inputCls, SF, 'pr-10 font-mono font-bold tracking-wider', !showStudentPassword && 'pw-mask')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowStudentPassword(!showStudentPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-subtle hover:text-muted cursor-pointer"
                        title={showStudentPassword ? 'Gizle' : 'Göster'}
                        aria-label={showStudentPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      >
                        {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : editingStudent ? (
                    <KayitliSifre tur="student" kayitId={editingStudent.id} />
                  ) : null}
                </CompactRow>
              );
            })()}

            {/* Aşama 334: profil resmi ortak pencereden (çizim, fotoğraf yükle, otomatik); Kaydet ile yazılır */}
            <CompactRow
              lead={
                <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line overflow-hidden shrink-0">
                  {/* Aşama 171: fotoğraf yoksa cinsiyete göre otomatik çizim önizlenir */}
                  <img
                    decoding="async"
                    src={profilResmi({ id: editingStudent?.id, name: studentName, avatar: studentAvatar, gender: studentGender || undefined }, 'student')}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              }
              title="Profil Resmi"
              info="İsteğe bağlı. Çizim seçin ya da fotoğraf yükleyin; Kaydet ile yazılır."
              actions={
                <button type="button" onClick={() => setResimAcik(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24" id="ogrenci-profil-resmi-btn">
                  Değiştir
                </button>
              }
            />
            {resimAcik && (
              <ProfilResmiSecModal
                open
                onClose={() => setResimAcik(false)}
                kind="student"
                rol="student"
                person={{ id: editingStudent?.id || 'yeni', name: studentName || 'Öğrenci', avatar: studentAvatar || undefined, gender: studentGender || undefined }}
                onSave={async (avatar) => setStudentAvatar(avatar || '')}
              />
            )}
          </div>
        </form>
      </Modal>
      {veliAcik && editingStudent && (
        <Suspense fallback={null}>
          <VeliBaglantisiPenceresi
            ogrenci={{ id: editingStudent.id, name: editingStudent.name }}
            altBaslik={classes.find((c) => c.id === editingStudent.classId)?.name}
            layerClass="z-(--z-pencere-ust)"
            onClose={() => setVeliAcik(false)}
          />
        </Suspense>
      )}
    </>
  );
}
export default OgrenciFormPenceresi;
