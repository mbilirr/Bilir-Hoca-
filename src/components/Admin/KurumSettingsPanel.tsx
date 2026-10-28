import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2, Save, Mail, Link2, Unlink, ShieldCheck, Loader2, Info, LayoutGrid, AlertTriangle, UserPlus, Copy, Check, RefreshCw } from 'lucide-react';
import { dataService, KURUM_MODULES } from '../../services/dataService';
import { Panel, Modal, cx } from '../ui/kit';
import { SelectBox } from '../Teacher/FormParts';
import { callMail } from '../../lib/mailApi';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import {
  fetchKurumRows,
  setRolesEnabled,
  setRehberlikOgrenciEkle,
  setIdareDersVerir,
  setKurumModules,
  kurumKayitAyar,
  kayitLinkOf,
  updateKurumIdentity,
  imageFileToLogo,
  type KurumRow,
} from '../../lib/kurumSettings';

// ============================================================================
// KURUM AYARLARI (Aşama 82)
//  - Kurum adı ve logosu (üst menüde ve karnelerde görünür; kurum e-postalarının başlığında kurum adı yazar)
//  - Kurum gönderim e-postası: kurumdaki bütün e-postalar bu tek Gmail adresinden gider, "Yanıtla" öğretmene gider
//  - Rol yetkileri anahtarı (yalnızca genel yönetici) ve "Rehberlik öğrenci ekleyip silebilsin" ayarı
//  - Aşama 98: "İdare ödev / etüt verebilsin" ayarı; genel yönetici kuruma geçmişken rol anahtarını ve kurum bölümlerini
//    burada değiştirir (izinli sınıflar genel yöneticinin kendi panelinde kalır)
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
  const gecis = dataService.isKurumGecis(); // Aşama 98: genel yönetici kuruma geçmiş
  const canRoles = isHead || gecis;
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
      idareDersVerir: my.roleSettings?.idare_ders_verir === true,
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

  const toggleIdare = async () => {
    if (!kurum || roleBusy) return;
    setRoleBusy(true);
    try {
      await setIdareDersVerir(kurum.id, !kurum.idareDersVerir);
      await refreshAfter();
      setNotice({
        tone: 'ok',
        text: !kurum.idareDersVerir ? 'İdare artık ödev ve etüt verebilir.' : 'İdare artık ödev vermez; etüdü yalnızca başka öğretmen adına planlar.',
      });
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Değiştirilemedi.' });
    } finally {
      setRoleBusy(false);
    }
  };

  // ---- Aşama 98: kurum bölümleri (yalnızca genel yönetici kuruma geçmişken)
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [modBusy, setModBusy] = useState(false);
  const modKey = JSON.stringify(my.modules || {});
  useEffect(() => {
    setMods(Object.fromEntries(KURUM_MODULES.map((m) => [m.key, (my.modules as any)?.[m.key] === true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modKey]);
  const modDirty = KURUM_MODULES.some((m) => !!mods[m.key] !== ((my.modules as any)?.[m.key] === true));
  const saveMods = async () => {
    if (!kurum || modBusy || !modDirty) return;
    if (!Object.values(mods).some(Boolean)) return setNotice({ tone: 'err', text: 'Kurum için en az bir bölüm açık olmalıdır.' });
    setModBusy(true);
    try {
      await setKurumModules(kurum.id, mods);
      await dataService.syncMyKurum();
      setNotice({ tone: 'ok', text: 'Kurum bölümleri kaydedildi. Kurumdaki kullanıcılar sayfayı yenileyince yeni izinleri görür.' });
    } catch (e: any) {
      setNotice({ tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setModBusy(false);
    }
  };

  // ---- Aşama 99b: öğrenci kayıt bağlantısı (kurum seçilince / açılınca bir kez okunur)
  const [kayit, setKayit] = useState<{ kod: string; acik: boolean } | null>(null);
  const [kayitBusy, setKayitBusy] = useState(false);
  const [kayitErr, setKayitErr] = useState<string | null>(null);
  const [kayitCopied, setKayitCopied] = useState(false);
  const [confirmYenile, setConfirmYenile] = useState(false);
  useEffect(() => {
    setKayit(null);
    setKayitErr(null);
    if (!kurum?.id) return;
    let alive = true;
    kurumKayitAyar(kurum.id)
      .then((r) => alive && setKayit(r))
      .catch((e: any) => alive && setKayitErr(e?.message || 'Kayıt bağlantısı okunamadı.'));
    return () => {
      alive = false;
    };
  }, [kurum?.id]);
  const kayitDo = async (opts: { acik?: boolean; yenile?: boolean }) => {
    if (!kurum || kayitBusy) return;
    setKayitBusy(true);
    setKayitErr(null);
    try {
      setKayit(await kurumKayitAyar(kurum.id, opts));
      if (opts.yenile) setNotice({ tone: 'ok', text: 'Yeni kayıt bağlantısı oluşturuldu; eski bağlantı artık çalışmaz.' });
    } catch (e: any) {
      setKayitErr(e?.message || 'Değiştirilemedi.');
    } finally {
      setKayitBusy(false);
      setConfirmYenile(false);
    }
  };
  const copyKayit = async () => {
    if (!kayit) return;
    try {
      await navigator.clipboard.writeText(kayitLinkOf(kayit.kod));
      setKayitCopied(true);
      window.setTimeout(() => setKayitCopied(false), 2000);
    } catch {
      window.prompt('Bağlantıyı kopyalayın:', kayitLinkOf(kayit.kod));
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
                <span className="w-28 h-20 rounded-lg border border-line bg-white p-1.5 flex items-center justify-center overflow-hidden shrink-0" id="kurum-logo-onizleme">
                  {shownLogo ? <img src={shownLogo} alt="Kurum logosu" className="max-w-full max-h-full object-contain" /> : <Building2 className="w-6 h-6 text-subtle" />}
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
              <p className="text-[11px] text-muted">Logo üst menüde ve karnelerde, kurum adı ayrıca e-posta başlıklarında görünür. Yüksek çözünürlüklü PNG (saydam zeminli) önerilir; boş kenarlar kendiliğinden kırpılır.</p>
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
                    disabled={!canRoles || roleBusy}
                    onChange={() => setConfirmRoles(!kurum.rolesEnabled)}
                  />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 h-8">
                <span className="text-xs text-fg-2">Rehberlik öğrenci ekleyip silebilsin</span>
                <Switch id="rehberlik-add-switch" label="Rehberlik öğrenci ekleyip silebilsin" on={kurum.rehberlikOgrenciEkle} disabled={roleBusy} onChange={toggleRehberlik} />
              </div>
              <div className="flex items-center justify-between gap-2 h-8">
                <span className="text-xs text-fg-2">İdare ödev / etüt verebilsin</span>
                <Switch id="idare-ders-switch" label="İdare ödev / etüt verebilsin" on={kurum.idareDersVerir} disabled={roleBusy} onChange={toggleIdare} />
              </div>
              {!kurum.rolesEnabled && (
                <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft text-warning-fg px-2 py-1.5 text-[11px] font-semibold" id="roles-off-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>Rol yetkileri kapalı: verilen roller (Rehberlik, Ölçme vb.) ve kişiye özel bölüm izinleri uygulanmaz.</span>
                </p>
              )}
              <p className="flex items-start gap-1.5 text-[11px] text-muted">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {canRoles
                    ? 'Kapalıyken kurum bugünkü gibi çalışır. Açınca "Unvanlar ve Roller" bölümünde verilen roller uygulanır. İdare ayarı kapalıyken Müdür / Müdür Yrd. ödev vermez, etüdü başka öğretmen adına planlar.'
                    : 'Rol yetkilerini genel yönetici açar. Rehberlik ve idare ayarlarını kurum yöneticisi değiştirebilir.'}
                </span>
              </p>
            </section>

            {/* Aşama 99b: öğrenci kayıt bağlantısı */}
            <section className="rounded-xl border border-line p-3 space-y-2.5 lg:col-span-3" id="kurum-kayit">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-brand-fg" /> Öğrenci kayıt bağlantısı
                </h3>
                <span className="flex items-center gap-2">
                  <span className={cx('ui-chip', kayit?.acik ? 'ui-chip-success' : 'ui-chip-neutral')}>{kayit ? (kayit.acik ? 'Kayıt açık' : 'Kayıt kapalı') : '…'}</span>
                  <Switch id="kurum-kayit-switch" label="Öğrenci kaydı açık" on={!!kayit?.acik} disabled={!kayit || kayitBusy} onChange={() => kayit && kayitDo({ acik: !kayit.acik })} />
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  readOnly
                  id="kurum-kayit-link"
                  value={kayit ? kayitLinkOf(kayit.kod) : kayitErr ? '' : 'Bağlantı hazırlanıyor…'}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Kayıt bağlantısı"
                  className={cx(CTRL, 'font-mono flex-1 min-w-0', !kayit?.acik && 'text-muted line-through')}
                />
                <span className="flex gap-2 shrink-0">
                  <button type="button" id="kurum-kayit-kopyala" className={cx(BTN, 'ui-btn-primary')} onClick={copyKayit} disabled={!kayit}>
                    {kayitCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {kayitCopied ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                  <button type="button" id="kurum-kayit-yenile" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setConfirmYenile(true)} disabled={!kayit || kayitBusy}>
                    <RefreshCw className="w-3.5 h-3.5" /> Yenile
                  </button>
                </span>
              </div>
              {kayitErr && <p className="text-[11px] font-semibold text-danger-fg">{kayitErr}</p>}
              <p className="text-[11px] text-muted">
                Bağlantıyı öğrenci ve velilere gönderin. Açılan kayıt ekranında kurumun adı ve logosu görünür, sınıf listesinde yalnızca bu
                kurumun sınıfları çıkar. Başvurular Kullanıcılar bölümüne gelir ve kurum yöneticisi onaylar. "Yenile" eski bağlantıyı geçersiz yapar.
              </p>
            </section>

            {/* Aşama 98: kurum bölümleri — genel yönetici kuruma geçmişken */}
            {gecis && (
              <section className="rounded-xl border border-line p-3 space-y-2.5 lg:col-span-3" id="kurum-modules">
                <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-brand-fg" /> Kurum bölümleri
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                  {KURUM_MODULES.map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-2 h-8" title={m.description}>
                      <span className="text-xs text-fg-2 truncate">{m.title}</span>
                      <Switch
                        id={`kurum-mod-${m.key}`}
                        label={m.title}
                        on={!!mods[m.key]}
                        disabled={modBusy}
                        onChange={() => setMods((p) => ({ ...p, [m.key]: !p[m.key] }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">İzinli sınıflar genel yöneticinin kendi panelindeki "Kurumlar" bölümünden verilir.</p>
                  <button type="button" id="kurum-modules-save" className={cx(BTN, 'ui-btn-primary shrink-0')} onClick={saveMods} disabled={!modDirty || modBusy}>
                    {modBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <Modal
        open={confirmYenile}
        onClose={() => setConfirmYenile(false)}
        icon={RefreshCw}
        tone="warning"
        title="Yeni kayıt bağlantısı"
        description={kurum?.name}
        size="sm"
        id="kurum-kayit-yenile-onay"
        footer={
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setConfirmYenile(false)}>
              Vazgeç
            </button>
            <button type="button" id="kurum-kayit-yenile-evet" className={cx(BTN, 'ui-btn-warning')} onClick={() => kayitDo({ yenile: true })} disabled={kayitBusy}>
              {kayitBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2 leading-relaxed">Yeni bağlantı oluşturulur; daha önce paylaştığınız bağlantı artık açılmaz. Bekleyen başvurular etkilenmez.</p>
      </Modal>

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
