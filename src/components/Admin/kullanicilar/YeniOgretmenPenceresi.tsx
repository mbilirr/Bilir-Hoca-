// Kullanıcı yönetimi › yeni öğretmen hesabı penceresi (Aşama 354d: ayrı parça, yalnız açılınca yüklenir)
import React, { useState, useMemo } from 'react';
import { RefreshCw, Copy, Check, AlertTriangle, UserPlus } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { InfoTip } from '../../ui/Compact';
import { FieldLabel, MailOptIn, SelectBox } from '../../Teacher/FormParts';
import { ROLE_DEFS, roleLabel, saveTeacherRoles, roleFromBranch, type TeacherRole } from '../../../lib/teacherRoles';
import { EMPTY_GRADES, gradeOptionsFrom, gradesLabel, saveTeacherGrades, type TeacherGrades } from '../../../lib/teacherGrades';
import { GradeTicks, secimCls } from '../GradeTicks';
import { saveTeacherContact } from '../../../lib/teacherContacts';
import { normalizeTurkishPhone, PHONE_ERROR, trFold } from '../../../lib/importNormalize';
import { saveTeacherTc, teacherTcExists, teacherTcHash } from '../../../lib/teacherTc';
import { appCopyFallback } from '../../../lib/appDialog';
import { Modal } from '../../ui/kit';
import { useBildirimKanali } from '../../../lib/bildirim';
import { WIDE_ROLES, wideRoleText, notifyTeacherByMail } from './ortak';

// =============================================================================
// Yeni öğretmen hesabı (yalnızca yönetici). Kayıt + giriş hesabı birlikte açılır.
// =============================================================================
export interface CreateTeacherAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}

export const toUsernameSuggestion = (name: string) =>
  name
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\./g, '')
    .slice(0, 30);

export const CreateTeacherAccountContent: React.FC<CreateTeacherAccountModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [branch, setBranch] = useState('');
  const [email, setEmail] = useState('');
  // Aşama 144: telefon ve doğum tarihi korumalı tabloya yazılır (Excel ile eklemeyle aynı veri)
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  // Aşama 171: cinsiyet (elle seçilmediyse addan tahmin)
  const [gender, setGender] = useState<'' | 'K' | 'E'>('');
  const genderTouched = React.useRef(false);
  const [contactNote, setContactNote] = useState<string | null>(null);
  // Aşama 254: TC yalnız bu pencerede yazılır; kaydedilen yalnız geri çevrilemez parmak izidir
  const [tc, setTc] = useState('');
  const [tcNote, setTcNote] = useState<string | null>(null);
  const [password, setPassword] = useState(() => dataService.generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  const setMailNotice = useBildirimKanali(); // Aşama 353: ortak bildirim
  // Aşama 99b: kurumda açılan hesaba unvan / rol (genel yöneticinin kendi panelinde roller uygulanmadığı için yok)
  const roleUi = !dataService.isHeadAdmin() && dataService.isKurumAdmin() && !!dataService.getMyKurumId();
  const canMudur = dataService.isKurumGecis();
  const rolesOff = roleUi && dataService.getMyKurum().rolesEnabled !== true;
  const [roles, setRoles] = useState<TeacherRole[]>(['ogretmen']);
  const [roleNote, setRoleNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Aşama 102: görebileceği kademeler (kurumdaki sınıflardan)
  const gradeOptions = useMemo(() => gradeOptionsFrom(dataService.getAllClasses()), []);
  const [grades, setGrades] = useState<TeacherGrades>(EMPTY_GRADES);
  const [gradeNote, setGradeNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Aşama 107: geniş görüşlü rol seçilince kademeler "Tümü" kilitli görünür (rol yetkileri açıkken)
  const createWide = roleUi ? roles.filter((r) => WIDE_ROLES.includes(r)) : [];
  const createSeesAll = createWide.length > 0 && !rolesOff;
  // Aşama 147: unvan elle değiştirilmediyse branşa göre otomatik işaretlenir (Rehberlik → Rehberlik, diğer → Öğretmen)
  const [rolesTouched, setRolesTouched] = useState(false);
  const changeBranch = (v: string) => {
    setBranch(v);
    if (!rolesTouched) setRoles([roleFromBranch(v)]);
  };
  const toggleRole = (r: TeacherRole) => {
    setRolesTouched(true);
    setRoles((cur) => {
      if (cur.includes(r)) return cur.filter((x) => x !== r);
      // Zümre başkanı öğretmen rolüyle birlikte verilir
      return r === 'zumre_baskani' && !cur.includes('ogretmen') ? [...cur, r, 'ogretmen'] : [...cur, r];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneN = normalizeTurkishPhone(phone);
    if (!phoneN.valid) {
      setError(PHONE_ERROR);
      return;
    }
    setIsSaving(true);
    try {
      // Aşama 254: TC yazıldıysa hesap açılmadan önce denetlenir (geçersiz ya da kurumda kayıtlıysa hesap açılmaz)
      let tcHash: string | null = null;
      if (tc.trim()) {
        tcHash = await teacherTcHash(tc);
        if (await teacherTcExists(tcHash)) throw new Error('Bu TC kimlik numarasıyla kayıtlı bir öğretmen zaten var.');
      }
      const wanted = roleUi ? roles.filter((r) => r !== 'zumre_baskani' || branch.trim()) : [];
      const res = await dataService.createTeacherAccount({ name, username, branch, email, password, gender: gender || undefined });
      // Roller hesapla birlikte verilir; verilemezse hesap yine açılmış olur (Unvanlar ve Roller'den verilir)
      if (wanted.length) {
        try {
          const saved = await saveTeacherRoles(res.teacher.id, wanted);
          setRoleNote({ ok: true, text: `Unvan: ${saved.map(roleLabel).join(', ')}` });
        } catch (er: any) {
          setRoleNote({ ok: false, text: `Rol verilemedi (${er?.message || 'hata'}). "Unvanlar ve Roller" bölümünden verin.` });
        }
      }
      // Aşama 102: kademeler hesapla birlikte verilir; verilemezse erişim (kalkan) penceresinden verilir
      if (!createSeesAll && (grades.all || grades.grades.length)) {
        try {
          if (!res.teacher.auth_user_id) throw new Error('giriş hesabı bulunamadı');
          const g = await saveTeacherGrades(res.teacher.auth_user_id, grades);
          setGradeNote({ ok: true, text: `Kademe: ${gradesLabel(g)} (${g.classes} sınıf)` });
        } catch (er: any) {
          setGradeNote({ ok: false, text: `Kademe verilemedi (${er?.message || 'hata'}). Listedeki kalkan (erişim) düğmesinden verin.` });
        }
      }
      if (phoneN.value || birthDate) {
        try {
          await saveTeacherContact(res.teacher.id, { phone: phoneN.value, birthDate });
        } catch (er: any) {
          setContactNote(`Telefon / doğum tarihi kaydedilemedi (${er?.message || 'hata'}). Düzenle penceresinden yeniden girin.`);
        }
      }
      if (tcHash) {
        try {
          await saveTeacherTc(res.teacher.id, tcHash);
        } catch (er: any) {
          setTcNote(`TC kaydedilemedi (${er?.message || 'hata'}). Hesap açıldı; TC'yi daha sonra yeniden girin.`);
        }
      }
      setTc('');
      setCreated({ name: res.teacher.name, username: res.teacher.username, password: res.password });
      onCreated(res.teacher.name);
      // Hesap bilgileri öğretmenin e-posta adresine gönderilir (adres kayıttan okunur)
      if (sendMail && email.trim()) {
        setMailNotice({ tone: 'info', text: 'Giriş bilgileri öğretmene e-postayla gönderiliyor…' });
        notifyTeacherByMail(res.teacher.id, 'created', { password: res.password }).then(setMailNotice);
      } else if (sendMail) {
        setMailNotice({ tone: 'warning', text: 'E-posta adresi yazılmadığı için e-posta gönderilmedi; bilgileri aşağıdan kopyalayıp iletin.' });
      }
    } catch (err: any) {
      setError(err?.message || 'Öğretmen hesabı açılamadı.');
    } finally {
      setIsSaving(false);
    }
  };

  const credentialText = created
    ? `Merhaba ${created.name},\nbiliredu öğretmen giriş bilgileriniz:\nAdres: ${window.location.origin}\nGiriş ekranında "Öğretmen" sekmesini seçiniz.\nKullanıcı adı: ${created.username}\nŞifre: ${created.password}\nGiriş yaptıktan sonra profil menüsünden şifrenizi değiştiriniz.`
    : '';

  // Aşama 236: pencere ortak Modal kabuğunda; kutular ui-field (32 px, 12 px yazı), etiketler FieldLabel,
  // seçim düğmeleri GradeTicks ile aynı ölçü (secimCls). Alanlar ve işlev aynı; yalnız görünüm sadeleşti.
  const noteCls = (tone: 'ok' | 'warn' | 'info' | 'danger') =>
    `px-3 py-2 rounded-lg text-xs font-medium ${
      tone === 'ok'
        ? 'bg-success-soft text-success-fg'
        : tone === 'warn'
          ? 'bg-warning-soft text-warning-fg'
          : tone === 'danger'
            ? 'bg-danger-soft text-danger-fg'
            : 'bg-info-soft text-info-fg'
    }`;

  return (
    <Modal
      open
      onClose={onClose}
      id="teacher-create-modal"
      icon={UserPlus}
      title="Yeni Öğretmen Hesabı"
      description="Öğretmen, kullanıcı adı ve bu şifreyle giriş yapar."
      size="md"
      layerClass="z-(--z-pencere)"
      closeOnBackdrop={false}
      footer={
        created ? (
          <>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credentialText);
                  setCopied(true);
                } catch {
                  void appCopyFallback('Giriş bilgileri', credentialText);
                }
              }}
              className="ui-btn ui-btn-secondary"
            >
              {copied ? <Check className="text-success-fg" /> : <Copy />}
              <span>{copied ? 'Kopyalandı' : 'Bilgileri Kopyala'}</span>
            </button>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">
              Kapat
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Vazgeç
            </button>
            <button type="submit" form="teacher-create-form" disabled={isSaving} className="ui-btn ui-btn-primary">
              {isSaving ? 'Hesap açılıyor...' : 'Hesabı Aç'}
            </button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <div className={noteCls('ok')}>
            Hesap açıldı. Şifre güvenlik nedeniyle saklanmaz; bu pencereyi kapatmadan önce öğretmene iletiniz.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 rounded-lg bg-surface-2 border border-line">
              <span className="block text-xs text-muted">Kullanıcı adı</span>
              <span className="font-mono text-sm font-semibold text-fg select-all">{created.username}</span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-2 border border-line">
              <span className="block text-xs text-muted">Şifre</span>
              <span className="font-mono text-sm font-semibold text-fg select-all">{created.password}</span>
            </div>
          </div>
          {contactNote && <div className={noteCls('warn')}>{contactNote}</div>}
          {tcNote && <div className={noteCls('warn')}>{tcNote}</div>}
          {roleNote && (
            <div id="teacher-create-role-note" className={noteCls(roleNote.ok ? 'info' : 'warn')}>
              {roleNote.text}
            </div>
          )}
          {gradeNote && (
            <div id="teacher-create-grade-note" className={noteCls(gradeNote.ok ? 'info' : 'warn')}>
              {gradeNote.text}
            </div>
          )}
        </div>
      ) : (
        <form id="teacher-create-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className={`${noteCls('danger')} flex items-start gap-2`} role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {/* Hesap */}
          <section className="space-y-3">
            <h3 className="ui-eyebrow">Hesap</h3>
            <div>
              <FieldLabel htmlFor="teacher-create-name">Ad Soyad *</FieldLabel>
              <input
                id="teacher-create-name"
                autoComplete="off"
                autoFocus
                required
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  if (!usernameTouched) setUsername(toUsernameSuggestion(v));
                  if (!genderTouched.current) {
                    void import('../../../lib/cinsiyetTahmin').then(({ cinsiyetTahmin }) => {
                      if (!genderTouched.current) setGender(cinsiyetTahmin(v) || '');
                    });
                  }
                }}
                placeholder="Örn: Ayşe Demir"
                className="ui-field"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-username">Kullanıcı adı *</FieldLabel>
                <input
                  id="teacher-create-username"
                  autoComplete="off"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(trFold(e.target.value)); // Aşama 154: ş→s, ı→i (giriş adı yalnız ASCII)
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Örn: aysedemir"
                  className="ui-field font-mono"
                />
                <p className="text-xs text-muted mt-1">Küçük harf, rakam, - ve _ ; Türkçe karakter ve boşluk olmadan.</p>
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-password">Giriş şifresi *</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    id="teacher-create-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                    className="ui-field font-mono font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(dataService.generatePassword())}
                    className="ui-btn ui-btn-secondary shrink-0"
                    title="Yeni şifre üret"
                  >
                    <RefreshCw />
                    <span>Üret</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Kişisel bilgiler */}
          <section className="space-y-3 pt-4 border-t border-line">
            <h3 className="ui-eyebrow">Kişisel Bilgiler</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-branch">Branş</FieldLabel>
                <input id="teacher-create-branch" autoComplete="off" value={branch} onChange={(e) => changeBranch(e.target.value)} placeholder="Örn: Matematik" className="ui-field" />
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-email">E-posta</FieldLabel>
                <input id="teacher-create-email" autoComplete="off" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isteğe bağlı" className="ui-field" />
              </div>
            </div>
            {/* Aşama 254: TC yalnız ilk kayıtta yazılır; parmak izi saklanır, sonra hiçbir yerde görünmez */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-tc">TC kimlik no</FieldLabel>
                <input
                  id="teacher-create-tc"
                  inputMode="numeric"
                  maxLength={11}
                  value={tc}
                  onChange={(e) => setTc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                  placeholder="11 hane, isteğe bağlı"
                  aria-describedby="teacher-create-tc-help"
                  className="ui-field font-mono tracking-wider"
                />
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-phone">Telefon</FieldLabel>
                <input autoComplete="off" type="tel" id="teacher-create-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" className="ui-field" />
              </div>
              <p id="teacher-create-tc-help" className="col-span-2 -mt-1.5 text-xs text-muted">
                TC saklanmaz; yalnız geri çevrilemez parmak izi tutulur, kayıttan sonra görünmez.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-birth">Doğum tarihi</FieldLabel>
                <input autoComplete="off" type="date" id="teacher-create-birth" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="ui-field" />
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-gender">Cinsiyet</FieldLabel>
                <SelectBox
                  id="teacher-create-gender"
                  value={gender}
                  onChange={(e) => {
                    genderTouched.current = true;
                    setGender(e.target.value as '' | 'K' | 'E');
                  }}
                >
                  <option value="">Seçiniz</option>
                  <option value="K">Kadın</option>
                  <option value="E">Erkek</option>
                </SelectBox>
              </div>
            </div>
          </section>

          {/* Yetki ve erişim */}
          <section className="space-y-4 pt-4 border-t border-line">
            <h3 className="ui-eyebrow">Yetki ve Erişim</h3>
            {/* Aşama 99b: unvan / rol (kurumda) */}
            {roleUi && (
              <div id="teacher-create-roles">
                <FieldLabel>Unvan / Rol</FieldLabel>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unvan / Rol">
                  {ROLE_DEFS.filter((r) => r.code !== 'mudur' || canMudur).map((r) => {
                    const on = roles.includes(r.code);
                    const locked = r.code === 'zumre_baskani' && !branch.trim();
                    return (
                      <button
                        key={r.code}
                        type="button"
                        id={`teacher-create-role-${r.code}`}
                        aria-pressed={on}
                        disabled={locked || (r.code === 'ogretmen' && on && roles.includes('zumre_baskani'))}
                        title={locked ? 'Zümre başkanı için önce branşı yazın' : r.description}
                        onClick={() => toggleRole(r.code)}
                        className={secimCls(on)}
                      >
                        {on && <Check className="w-3.5 h-3.5" />}
                        {r.short}
                      </button>
                    );
                  })}
                </div>
                {rolesOff && (
                  <p className="text-xs font-medium text-warning-fg mt-1.5" id="teacher-create-roles-off">
                    Kurumda rol yetkileri kapalı: roller kaydedilir, rol yetkileri açılınca uygulanır.
                  </p>
                )}
                <p className="text-xs text-muted mt-1.5">Sonradan "Unvanlar ve Roller" bölümünden değiştirilir.</p>
              </div>
            )}
            <GradeTicks
              id="teacher-create-grades"
              options={gradeOptions}
              value={grades}
              onChange={setGrades}
              roleNote={createSeesAll ? `${wideRoleText(createWide)} rolü gereği kurumdaki bütün sınıf ve öğrencileri görür; kademe seçmek gerekmez.` : undefined}
            />
            <p className="text-xs text-muted flex items-center gap-1">
              Tek tek sınıf / öğrenci erişimi
              <InfoTip text="Kademe dışında tek tek sınıf ya da öğrenci vermek için listedeki kalkan (erişim) düğmesini kullanınız." />
            </p>
          </section>

          <MailOptIn
            id="teacher-create-notify"
            checked={sendMail}
            onChange={setSendMail}
            label="Giriş bilgilerini öğretmene e-postayla gönder"
            hint={email.trim() ? 'Kullanıcı adı, şifre ve giriş adresi öğretmenin e-posta adresine gider.' : 'Göndermek için yukarıya öğretmenin e-posta adresini yazın.'}
          />
        </form>
      )}
    </Modal>
  );
};

export const CreateTeacherAccountModal: React.FC<CreateTeacherAccountModalProps> = (props) =>
  props.isOpen ? <CreateTeacherAccountContent {...props} /> : null;
