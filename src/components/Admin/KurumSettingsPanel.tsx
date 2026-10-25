import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2, Save, Mail, Link2, Unlink, ShieldCheck, Loader2, Info } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { Panel, Modal, cx } from '../ui/kit';
import { SelectBox } from '../Teacher/FormParts';
import { callMail } from '../../lib/mailApi';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import {
  fetchKurumRows,
  setRolesEnabled,
  setRehberlikOgrenciEkle,
  updateKurumIdentity,
  imageFileToLogo,
  type KurumRow,
} from '../../lib/kurumSettings';

// ============================================================================
// KURUM AYARLARI (Aşama 82)
//  - Kurum adı ve logosu (üst menüde ve karnelerde görünür; kurum e-postalarının başlığında kurum adı yazar)
//  - Kurum gönderim e-postası: kurumdaki bütün e-postalar bu tek Gmail adresinden gider, "Yanıtla" öğretmene gider
//  - Rol yetkileri anahtarı (yalnızca genel yönetici) ve "Rehberlik öğrenci ekleyip silebilsin" ayarı
// Genel yönetici kurum seçerek, kurum yöneticisi (Müdür / Müdür Yrd.) yalnızca kendi kurumunda düzenler.
// Tüm kutular ve düğmeler aynı yükseklikte (2rem) ve aynı yazı boyutunda; düğmeler eşit genişlikte.
// ============================================================================

const CTRL = 'w-full h-8 px-2.5 bg-surface border border-line-strong rounded-lg text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

const Switch: React.FC<{ on: boolean; disabled?: boolean; onChange: () => void; label: string; id: string }> = ({ on, disabled, onChange, label, id }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    id={id}
    disabled={disabled}
    onClick={onChange}
    className={cx(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
      on ? 'bg-brand' : 'bg-surface-3 border border-line-strong'
    )}
  >
    <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
  </button>
);

export const KurumSettingsPanel: React.FC = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const isHead = dataService.isHeadAdmin();
  const my = dataService.getMyKurum();

  const [rows, setRows] = useState<KurumRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useAutoDismiss(notice, () => setNotice(null));

  const loadRows = useCallback(async () => {
    if (!isHead) return;
    setLoadError(null);
    try {
      setRows(await fetchKurumRows());
    } catch (e: any) {
      setLoadError(e?.message || 'Kurumlar okunamadı.');
    }
  }, [isHead]);
  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Düzenlenen kurum
  const kurum: KurumRow | null = useMemo(() => {
    if (isHead) return (rows || []).find((r) => r.id === selectedId) || null;
    if (!my.kurumId) return null;
    return {
      id: my.kurumId,
      name: my.kurumName,
      logo: my.logo || '',
      rolesEnabled: my.rolesEnabled === true,
      rehberlikOgrenciEkle: my.roleSettings?.rehberlik_ogrenci_ekle === true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHead, rows, selectedId, tick]);

  // ---- ad ve logo
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined); // undefined = değişmedi
  const [savingId, setSavingId] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setName(kurum?.name || '');
    setLogo(undefined);
  }, [kurum?.id, kurum?.name]);
  const shownLogo = logo !== undefined ? logo : kurum?.logo || '';
  const idDirty = !!kurum && (name.trim() !== kurum.name || logo !== undefined);

  const refreshAfter = async () => {
    if (isHead) {
      await loadRows();
      dataService.listKurumlar().catch(() => {});
    } else {
      await dataService.syncMyKurum();
    }
  };

  const pickLogo = async (f?: File | null) => {
    if (!f) return;
    try {
      setLogo(await imageFileToLogo(f));
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Logo okunamadı.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveIdentity = async () => {
    if (!kurum || !idDirty || savingId) return;
    setSavingId(true);
    try {
      await updateKurumIdentity(kurum.id, name.trim(), logo);
      await refreshAfter();
      setLogo(undefined);
      setNotice({ tone: 'ok', text: 'Kurum adı ve logosu kaydedildi.' });
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setSavingId(false);
    }
  };

  // ---- kurum e-postası
  const [mailAccount, setMailAccount] = useState<{ gmail: string } | null | undefined>(undefined);
  const [gmail, setGmail] = useState('');
  const [appPass, setAppPass] = useState('');
  const [mailBusy, setMailBusy] = useState(false);
  const loadMail = useCallback(async () => {
    if (!kurum) return setMailAccount(undefined);
    const r = await callMail('kurum-mail-status', { kurumId: kurum.id });
    if (r.ok) setMailAccount((r.account as any) || null);
    else {
      setMailAccount(undefined);
      setNotice({ tone: 'err', text: r.error || 'Kurum e-posta durumu okunamadı.' });
    }
  }, [kurum]);
  useEffect(() => {
    setGmail('');
    setAppPass('');
    loadMail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurum?.id]);

  const connectMail = async () => {
    if (!kurum || mailBusy) return;
    setMailBusy(true);
    const r = await callMail('kurum-mail-connect', { kurumId: kurum.id, gmail: gmail.trim(), appPassword: appPass });
    setMailBusy(false);
    if (r.ok) {
      setMailAccount((r.account as any) || null);
      setAppPass('');
      setNotice({ tone: 'ok', text: 'Kurum e-posta hesabı bağlandı. Kurumdaki bütün e-postalar artık bu adresten gidecek.' });
      refreshAfter();
    } else setNotice({ tone: 'err', text: r.error || 'Bağlanamadı.' });
  };
  const disconnectMail = async () => {
    if (!kurum || mailBusy) return;
    setMailBusy(true);
    const r = await callMail('kurum-mail-disconnect', { kurumId: kurum.id });
    setMailBusy(false);
    if (r.ok) {
      setMailAccount(null);
      setNotice({ tone: 'ok', text: 'Kurum e-posta hesabı kaldırıldı. E-postalar öğretmenlerin kendi hesaplarından ya da okul hesabından gider.' });
      refreshAfter();
    } else setNotice({ tone: 'err', text: r.error || 'Kaldırılamadı.' });
  };

  // ---- rol ayarları
  const [confirmRoles, setConfirmRoles] = useState<boolean | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const applyRoles = async (on: boolean) => {
    if (!kurum) return;
    setRoleBusy(true);
    try {
      await setRolesEnabled(kurum.id, on);
      await refreshAfter();
      setNotice({ tone: 'ok', text: on ? 'Rol yetkileri açıldı. Kurumdaki kişiler bir sonraki girişte (ya da sayfayı yenileyince) rollerine göre görür.' : 'Rol yetkileri kapatıldı; kurum eski düzene döndü.' });
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Değiştirilemedi.' });
    } finally {
      setRoleBusy(false);
      setConfirmRoles(null);
    }
  };
  const toggleRehberlik = async () => {
    if (!kurum || roleBusy) return;
    setRoleBusy(true);
    try {
      await setRehberlikOgrenciEkle(kurum.id, !kurum.rehberlikOgrenciEkle);
      await refreshAfter();
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Değiştirilemedi.' });
    } finally {
      setRoleBusy(false);
    }
  };

  if (!isHead && !dataService.isKurumAdmin()) return null;

  return (
    <Panel
      id="kurum-settings-panel"
      icon={Building2}
      tone="brand"
      title="Kurum Ayarları"
      description="Kurum adı ve logosu, kurum e-postası ve rol yetkileri"
    >
      <div className="space-y-4">
        {isHead && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SelectBox aria-label="Kurum" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={cx(CTRL, 'cursor-pointer')} id="kurum-settings-select">
              <option value="">Kurum seçiniz</option>
              {(rows || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectBox>
          </div>
        )}
        {loadError && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {loadError}
          </p>
        )}
        {notice && (
          <p role="status" className={cx('text-xs font-semibold', notice.tone === 'ok' ? 'text-success-fg' : 'text-danger-fg')}>
            {notice.text}
          </p>
        )}

        {!kurum ? (
          <p className="text-xs text-muted">{isHead ? 'Ayarlarını görmek için kurum seçiniz.' : 'Kurum bilgisi yükleniyor…'}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Ad ve logo */}
            <section className="rounded-xl border border-line p-3 space-y-2.5" id="kurum-identity">
              <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand-fg" /> Kurum adı ve logosu
              </h3>
              <div className="flex items-center gap-2.5">
                <span className="w-12 h-12 rounded-lg border border-line bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {shownLogo ? <img src={shownLogo} alt="Kurum logosu" className="w-full h-full object-contain" /> : <Building2 className="w-5 h-5 text-subtle" />}
                </span>
                <div className="flex flex-col gap-1.5">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
                  <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="w-3.5 h-3.5" /> Logo seç
                  </button>
                  <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setLogo('')} disabled={!shownLogo}>
                    <Trash2 className="w-3.5 h-3.5" /> Logoyu kaldır
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="kurum-name" className="block text-[11px] font-semibold text-fg-2 mb-1">
                  Kurum adı
                </label>
                <input id="kurum-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={CTRL} />
              </div>
              <div className="flex justify-end">
                <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={saveIdentity} disabled={!idDirty || savingId || name.trim().length < 2}>
                  {savingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
                </button>
              </div>
              <p className="text-[11px] text-muted">Logo üst menüde ve karnelerde, kurum adı ayrıca e-posta başlıklarında görünür. PNG / JPG, kare resim önerilir.</p>
            </section>

            {/* Kurum e-postası */}
            <section className="rounded-xl border border-line p-3 space-y-2.5" id="kurum-mail">
              <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-brand-fg" /> Kurum gönderim e-postası
              </h3>
              {mailAccount === undefined ? (
                <p className="text-[11px] text-muted">Durum okunuyor…</p>
              ) : mailAccount ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="ui-chip ui-chip-success truncate">Bağlı: {mailAccount.gmail}</span>
                  <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={disconnectMail} disabled={mailBusy}>
                    <Unlink className="w-3.5 h-3.5" /> Kaldır
                  </button>
                </div>
              ) : (
                <span className="ui-chip ui-chip-neutral">Bağlı değil</span>
              )}
              <div className="space-y-1.5">
                <input type="email" value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder="kurum.adresi@gmail.com" aria-label="Gmail adresi" className={CTRL} autoComplete="off" />
                <input type="password" value={appPass} onChange={(e) => setAppPass(e.target.value)} placeholder="16 harfli uygulama şifresi" aria-label="Uygulama şifresi" className={CTRL} autoComplete="new-password" />
              </div>
              <div className="flex justify-end">
                <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={connectMail} disabled={mailBusy || !gmail.trim() || appPass.replace(/\s+/g, '').length < 16}>
                  {mailBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} {mailAccount ? 'Değiştir' : 'Bağla'}
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Bağlanınca kurumdaki bütün e-postalar bu adresten gider; veli ya da öğrenci "Yanıtla"ya basarsa yanıt öğretmene gider. Gmail'de iki adımlı doğrulama açık olmalı ve "Uygulama şifresi" alınmalıdır.
              </p>
            </section>

            {/* Rol yetkileri */}
            <section className="rounded-xl border border-line p-3 space-y-2.5" id="kurum-roles">
              <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-fg" /> Rol yetkileri
              </h3>
              <div className="flex items-center justify-between gap-2 h-8">
                <span className="text-xs text-fg-2">Rollere göre yetkiler</span>
                <span className="flex items-center gap-2">
                  <span className={cx('ui-chip', kurum.rolesEnabled ? 'ui-chip-success' : 'ui-chip-neutral')}>{kurum.rolesEnabled ? 'Açık' : 'Kapalı'}</span>
                  <Switch
                    id="roles-enabled-switch"
                    label="Rollere göre yetkiler"
                    on={kurum.rolesEnabled}
                    disabled={!isHead || roleBusy}
                    onChange={() => setConfirmRoles(!kurum.rolesEnabled)}
                  />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 h-8">
                <span className="text-xs text-fg-2">Rehberlik öğrenci ekleyip silebilsin</span>
                <Switch id="rehberlik-add-switch" label="Rehberlik öğrenci ekleyip silebilsin" on={kurum.rehberlikOgrenciEkle} disabled={roleBusy} onChange={toggleRehberlik} />
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-muted">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {isHead
                    ? 'Kapalıyken kurum bugünkü gibi çalışır. Açınca "Unvanlar ve Roller" bölümünde verilen roller uygulanır. Önce rolleri verin, sonra açın.'
                    : 'Rol yetkilerini genel yönetici açar. Rehberlik ayarını kurum yöneticisi değiştirebilir.'}
                </span>
              </p>
            </section>
          </div>
        )}
      </div>

      <Modal
        open={confirmRoles !== null}
        onClose={() => setConfirmRoles(null)}
        icon={ShieldCheck}
        tone={confirmRoles ? 'warning' : 'neutral'}
        title={confirmRoles ? 'Rol yetkileri açılsın mı?' : 'Rol yetkileri kapatılsın mı?'}
        description={kurum?.name}
        size="sm"
        id="roles-enable-confirm"
        footer={
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setConfirmRoles(null)}>
              Vazgeç
            </button>
            <button type="button" className={cx(BTN, confirmRoles ? 'ui-btn-warning' : 'ui-btn-primary')} onClick={() => applyRoles(!!confirmRoles)} disabled={roleBusy}>
              {roleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} {confirmRoles ? 'Aç' : 'Kapat'}
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2 leading-relaxed">
          {confirmRoles
            ? 'Açınca kurumdaki herkes yalnızca rolünün izin verdiği bölümleri ve verileri görür: Müdür / Müdür Yrd. kurum yöneticisi olur, öğretmenler yalnızca kendi sınıflarını ve çalışmalarını görür, etüt öğretmeni yalnızca etütlerini görür. Rolü verilmemiş kişiler öğretmen gibi devam eder. Sorun olursa buradan hemen kapatabilirsiniz.'
            : 'Kapatınca roller kayıtlı kalır ama uygulanmaz; kurum bugünkü (rol öncesi) düzene döner.'}
        </p>
      </Modal>
    </Panel>
  );
};
