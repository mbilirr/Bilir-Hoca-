import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { InfoTip } from '../ui/Compact'; // Aşama 187
import {
  ShieldCheck,
  Building2,
  Bell,
  Database,
  UserRound,
  Plus,
  LogIn,
  Users,
  GraduationCap,
  School,
  UserCheck,
  ShieldAlert,
  LayoutGrid,
  Info,
} from 'lucide-react';
import type { ClassGroup, Teacher } from '../../types';
import { dataService, KURUM_MODULES, kurumModulListesi } from '../../services/dataService';
import { PageHeader, Segmented, cx } from '../ui/kit';
import { lazyNamed, PageLoading } from '../../lib/lazyLoad';
import { SelectBox } from '../Teacher/FormParts';
import { KendiAlaniTasima } from './KendiAlaniTasima'; // Aşama 259
import type { KurumRow } from '../../lib/kurumSettings';
import { useQuickFocus } from '../../lib/quickFocus'; // Aşama 244

// ============================================================================
// Aşama 143: YÖNETİM SAYFASI — tek uzun sayfa yerine bölümler (Örnek A, 3 Kasım 2026)
//  Genel yönetici: üstte Kurumlar · Bildirim ve SMS · Yedek ve bakım · Kendi alanım.
//    Kurumlar: kurum seçilince o kurumun her şeyi alt sekmelerde (Genel, Öğretmenler, Öğrenciler, Roller ve yetkiler,
//    Bölümler ve sınıflar). Kurum öğrencileri kurum ayrımı kuralı gereği (96–98) yalnız kuruma geçince görünür.
//  Kurum yöneticisi ve kuruma geçmiş genel yönetici: doğrudan kendi kurumunun alt sekmeleri.
//  Yalnız açık sekmenin bileşeni yüklenir ve çalışır (hız); seçimler sekmede hatırlanır (sessionStorage).
// ============================================================================

const KurumManagement = lazyNamed(() => import('./KurumManagement'), 'KurumManagement');
const AdminMaintenancePanel = lazyNamed(() => import('./AdminMaintenancePanel'), 'AdminMaintenancePanel');
const NotificationPolicyPanel = lazyNamed(() => import('./NotificationPolicyPanel'), 'NotificationPolicyPanel');
const TeacherRolesPanel = lazyNamed(() => import('./TeacherRolesPanel'), 'TeacherRolesPanel');
const KurumSettingsPanel = lazyNamed(() => import('./KurumSettingsPanel'), 'KurumSettingsPanel');
const AdminUserManagement = lazyNamed(() => import('./AdminUserManagement'), 'AdminUserManagement');
const UserCredentialsExport = lazyNamed(() => import('./UserCredentialsExport'), 'UserCredentialsExport');
const YeniKurumModal = lazyNamed(() => import('./YeniKurumModal'), 'YeniKurumModal');
const OgrenciBolumPanel = lazyNamed(() => import('./OgrenciBolumPanel'), 'OgrenciBolumPanel'); // Aşama 165
const DersYonetimi = lazyNamed(() => import('./DersYonetimi'), 'DersYonetimi'); // Aşama 217

type UstSekme = 'kurumlar' | 'bildirim' | 'yedek' | 'kendi';
type KurumSekme = 'genel' | 'ogretmen' | 'ogrenci' | 'roller' | 'bolumler' | 'dersler'; // Aşama 217: dersler

const STORE_KEY = 'edu_yonetim_v1';
interface Saved {
  ust?: UstSekme;
  kurumId?: string;
  alt?: KurumSekme;
}
const readSaved = (): Saved => {
  try {
    return JSON.parse(window.sessionStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const writeSaved = (s: Saved) => {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* depolama kapalı */
  }
};

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

/** Küçük sayı kutusu (Yönetim sayfasına özgü, yazıyla aynı boyda) */
const Sayi: React.FC<{ icon: React.ComponentType<{ className?: string }>; tone: string; value: React.ReactNode; label: string; id?: string }> = ({
  icon: Icon,
  tone,
  value,
  label,
  id,
}) => (
  <div id={id} className="ui-card flex items-center gap-2.5 px-3 py-2.5 min-w-0">
    <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tone)}>
      <Icon className="w-4 h-4" />
    </span>
    <span className="min-w-0">
      <span className="block text-base font-bold text-fg tabular-nums leading-tight">{value}</span>
      <span className="block text-[11px] text-muted truncate">{label}</span>
    </span>
  </div>
);

export const YonetimSayfasi: React.FC<{
  classes: ClassGroup[];
  currentTeacher?: Teacher | null;
  onNavigateHome?: () => void;
  onOpenGuide?: () => void;
}> = ({ classes, currentTeacher, onNavigateHome, onOpenGuide }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const isHead = dataService.isHeadAdmin();
  const gecis = dataService.isKurumGecis();
  const my = dataService.getMyKurum();
  const saved = useMemo(readSaved, []);

  const [ust, setUst] = useState<UstSekme>(saved.ust || 'kurumlar');
  const [alt, setAlt] = useState<KurumSekme>(saved.alt || 'ogretmen');
  const [kurumId, setKurumId] = useState<string>(isHead ? saved.kurumId || '' : my.kurumId || '');
  const [rows, setRows] = useState<KurumRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [entering, setEntering] = useState(false);

  // Aşama 244: ana sayfadaki kısayol (Bildirim izinleri, Yedek ve bakım, Kendi alanım…) doğru üst bölümü açar
  // Aşama 245: kurum yöneticisinin ana sayfasından kurumun alt sekmesi (Öğretmenler, Öğrenciler, Roller, Ders programı…)
  useQuickFocus(['yonetim'], (f) => {
    if (isHead && (['kurumlar', 'bildirim', 'yedek', 'kendi'] as string[]).includes(f.id)) setUst(f.id as UstSekme);
    else if ((['genel', 'ogretmen', 'ogrenci', 'roller', 'bolumler', 'dersler'] as string[]).includes(f.id)) {
      if (isHead) setUst('kurumlar');
      setAlt(f.id as KurumSekme);
    }
  });

  // Genel yönetici: kurum listesi (ad, rol anahtarı, rol ayarları) — bir kez okunur, değişince yenilenir
  const loadRows = useCallback(async () => {
    if (!isHead) return;
    setRowsError(null);
    try {
      const { fetchKurumRows } = await import('../../lib/kurumSettings');
      const list = await fetchKurumRows();
      setRows(list);
      setKurumId((cur) => (cur && list.some((r) => r.id === cur) ? cur : list[0]?.id || ''));
    } catch (e: any) {
      setRowsError(e?.message || 'Kurumlar okunamadı.');
    }
  }, [isHead]);
  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    writeSaved({ ust, alt, kurumId: isHead ? kurumId : undefined });
  }, [ust, alt, kurumId, isHead]);

  // Seçili kurumun bilgileri
  const row = isHead ? (rows || []).find((r) => r.id === kurumId) || null : null;
  const kurumName = isHead ? row?.name || '' : my.kurumName || 'Kurumum';
  const rolesEnabled = isHead ? row?.rolesEnabled === true : my.rolesEnabled === true;
  // Aşama 258: bireysel (koçluk) hesabı: öğretmen, rol ve ders programı bölümleri yoktur
  const bireysel = isHead ? row?.tur === 'bireysel' : my.tur === 'bireysel';
  const roleSettings = isHead
    ? row
      ? { rehberlik_ogrenci_ekle: row.rehberlikOgrenciEkle, olcme_ogrenci_ekle: row.olcmeOgrenciEkle }
      : null
    : my.roleSettings || {};

  // Sayılar (ekrandaki veriden; ek sorgu yok)
  const counts = useMemo(() => {
    const kid = isHead ? kurumId : my.kurumId;
    const teachers = dataService.getAllTeachersInternal().filter((t) => (t.kurumId || '') === (kid || '') && t.status !== 'rejected');
    const pending = teachers.filter((t) => t.status === 'pending').length;
    const students = isHead ? null : dataService.getAllStudents().filter((s) => (s.kurumId || '') === (kid || '')).length;
    const sinif = isHead ? null : classes.filter((c) => (c.kurumId || '') === (kid || '')).length;
    const yonetici = teachers
      .filter((t) => t.isAdmin)
      .map((t) => t.name)
      .join(', ');
    return { teachers: teachers.length - pending, pending, students, sinif, yonetici };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, kurumId, classes, isHead]);
  const acikBolum = isHead ? null : kurumModulListesi(bireysel).filter((m) => (my.modules as any)?.[m.key] === true).length;

  const enter = async () => {
    if (!kurumId || entering) return;
    setEntering(true);
    try {
      writeSaved({ ust: 'kurumlar', alt: 'ogrenci', kurumId });
      const { enterKurum } = await import('../../lib/kurumGecis');
      await enterKurum(kurumId); // sayfa o kurumun oturumuyla yeniden açılır
    } catch (e: any) {
      setRowsError(e?.message || 'Kuruma geçilemedi.');
      setEntering(false);
    }
  };

  const tumAltSekmeler: Array<{ value: KurumSekme; label: string; id: string }> = [
    { value: 'genel', label: 'Genel', id: 'yonetim-alt-genel' },
    { value: 'ogretmen', label: `Öğretmenler${counts.pending ? ` (${counts.pending} bekleyen)` : ''}`, id: 'yonetim-alt-ogretmen' },
    { value: 'ogrenci', label: 'Öğrenciler', id: 'yonetim-alt-ogrenci' },
    { value: 'roller', label: 'Roller ve yetkiler', id: 'yonetim-alt-roller' },
    { value: 'bolumler', label: 'Bölümler ve sınıflar', id: 'yonetim-alt-bolumler' },
    { value: 'dersler', label: 'Ders programı', id: 'yonetim-alt-dersler' }, // Aşama 217
  ];
  const BIREYSEL_SEKMELER: KurumSekme[] = ['genel', 'ogrenci', 'bolumler'];
  const altSekmeler = bireysel ? tumAltSekmeler.filter((x) => BIREYSEL_SEKMELER.includes(x.value)) : tumAltSekmeler;
  // Kayıtlı / kısayoldan gelen sekme bu hesapta yoksa Öğrenciler açılır
  const altAktif: KurumSekme = altSekmeler.some((x) => x.value === alt) ? alt : 'ogrenci';

  // ---------------------------------------------------------------- kurumun içeriği (alt sekmeler)
  const kurumIcerik = (kid: string) => (
    <div className="space-y-3" id="yonetim-kurum">
      {bireysel ? (
        // Aşama 258: bireysel hesap: öğretmen / onay sayıları yerine yalnız anlamlı iki sayı
        <div className="grid grid-cols-2 gap-2.5" id="yonetim-bireysel-sayilar">
          {isHead ? (
            <Sayi icon={UserRound} tone="bg-brand-soft text-brand-fg" value="Bireysel" label="Koçluk hesabı" />
          ) : (
            <Sayi icon={Users} tone="bg-info-soft text-info-fg" value={counts.students ?? '—'} label="Öğrenci" id="yonetim-sayi-ogrenci" />
          )}
          {isHead ? (
            <Sayi icon={GraduationCap} tone="bg-success-soft text-success-fg" value={counts.yonetici || '—'} label="Hesap sahibi" />
          ) : (
            <Sayi icon={School} tone="bg-success-soft text-success-fg" value={counts.sinif ?? '—'} label={`Sınıf · ${acikBolum ?? 0} açık bölüm`} />
          )}
        </div>
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Sayi icon={GraduationCap} tone="bg-brand-soft text-brand-fg" value={counts.teachers} label="Öğretmen" id="yonetim-sayi-ogretmen" />
        {isHead ? (
          <Sayi icon={ShieldCheck} tone="bg-info-soft text-info-fg" value={rolesEnabled ? 'Açık' : 'Kapalı'} label="Rol yetkileri" />
        ) : (
          <Sayi icon={Users} tone="bg-info-soft text-info-fg" value={counts.students ?? '—'} label="Öğrenci" id="yonetim-sayi-ogrenci" />
        )}
        {isHead ? (
          <Sayi icon={LayoutGrid} tone="bg-success-soft text-success-fg" value={counts.yonetici || '—'} label="Kurum yöneticisi" />
        ) : (
          <Sayi icon={School} tone="bg-success-soft text-success-fg" value={counts.sinif ?? '—'} label={`Sınıf · ${acikBolum ?? 0} açık bölüm`} />
        )}
        <Sayi icon={UserCheck} tone="bg-warning-soft text-warning-fg" value={counts.pending} label="Onay bekleyen öğretmen" />
      </div>
      )}

      <Segmented size="sm" value={altAktif} onChange={setAlt} items={altSekmeler} />

      <Suspense fallback={<PageLoading />}>
        {altAktif === 'genel' && <KurumSettingsPanel kurumId={isHead ? kid : undefined} part="genel" onChanged={isHead ? loadRows : undefined} />}
        {altAktif === 'ogretmen' && (
          <AdminUserManagement
            key={`t-${kid}`}
            currentAdmin={currentTeacher}
            onNavigateHome={onNavigateHome}
            kurumLock={isHead ? kid : undefined}
            roleLock="teacher"
            roleSettings={roleSettings}
            embedded
          />
        )}
        {altAktif === 'ogrenci' &&
          (isHead ? (
            <div className="ui-card ui-card-pad flex flex-col sm:flex-row sm:items-center gap-3" id="yonetim-ogrenci-gecis">
              <Info className="w-5 h-5 text-info-fg shrink-0" />
              {/* Aşama 187: kısaltıldı, ayrıntı ⓘ içinde */}
              <p className="text-xs text-fg-2 flex-1">
                <b>{kurumName}</b> öğrencileri için kuruma geçin.{' '}
                <InfoTip className="align-middle" text='Kurumların öğrenci bilgileri, kurum ayrımı kuralı gereği sizin panelinize inmez. İşiniz bitince üst menüden "Kendi panelime dön" ile geri gelirsiniz.' />
              </p>
              <button type="button" className={cx(BTN, 'ui-btn-primary shrink-0')} onClick={enter} disabled={entering || !kid} id="yonetim-kuruma-gec">
                <LogIn className="w-3.5 h-3.5" /> {entering ? 'Geçiliyor…' : 'Kuruma geç'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <AdminUserManagement key={`s-${kid}`} currentAdmin={currentTeacher} onNavigateHome={onNavigateHome} roleLock="student" embedded />
              <UserCredentialsExport classes={classes} />
            </div>
          ))}
        {altAktif === 'roller' && (
          <div className="space-y-3">
            <KurumSettingsPanel kurumId={isHead ? kid : undefined} part="roller" onChanged={isHead ? loadRows : undefined} />
            <TeacherRolesPanel
              key={`r-${kid}`}
              kurumId={kid}
              roleSettings={roleSettings}
              rolesOffOverride={!rolesEnabled}
            />
          </div>
        )}
        {altAktif === 'bolumler' &&
          (isHead ? (
            <KurumManagement classes={classes} onlyKurumId={kid} />
          ) : gecis ? (
            <KurumSettingsPanel part="bolumler" />
          ) : (
            <div className="ui-card ui-card-pad space-y-2" id="yonetim-bolumler-salt">
              <p className="text-xs font-bold text-fg">Kurumunuzun kullanabildiği bölümler</p>
              <div className="flex flex-wrap gap-1.5">
                {kurumModulListesi(bireysel).map((m) => {
                  const on = (my.modules as any)?.[m.key] === true;
                  return (
                    <span key={m.key} className={cx('ui-chip', on ? 'ui-chip-success' : 'ui-chip-neutral')} title={m.description}>
                      {m.title}: {on ? 'Açık' : 'Kapalı'}
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted">Bölümleri ve izinli sınıfları genel yönetici açar.</p>
            </div>
          ))}
        {altAktif === 'dersler' &&
          // Aşama 217: ders saatleri / sınıf öğretmenleri / program kurumun içinden düzenlenir (kurum ayrımı)
          (isHead ? (
            <div className="ui-card ui-card-pad flex flex-col sm:flex-row sm:items-center gap-3" id="yonetim-dersler-gecis">
              <Info className="w-5 h-5 text-info-fg shrink-0" />
              <p className="text-xs text-fg-2 flex-1">
                <b>{kurumName}</b> ders programı için kuruma geçin.
              </p>
              <button type="button" className={cx(BTN, 'ui-btn-primary shrink-0')} onClick={enter} disabled={entering || !kid}>
                <LogIn className="w-3.5 h-3.5" /> {entering ? 'Geçiliyor…' : 'Kuruma geç'}
              </button>
            </div>
          ) : (
            <DersYonetimi key={`d-${kid}`} kurumId={kid} classes={classes} />
          ))}
        {altAktif === 'bolumler' && (
          // Aşama 165: öğrenci bölümleri (genel yönetici: kurum varsayılanı; kuruma geçince ve kurum yöneticisinde sınıflar da)
          <OgrenciBolumPanel
            key={`ob-${kid}`}
            kurumId={kid}
            classes={classes.filter((c) => (c.kurumId || '') === kid)}
            kurumModules={isHead ? undefined : ((my.modules || {}) as Record<string, boolean | undefined>)}
            canEdit={isHead || gecis || dataService.isKurumAdmin()}
            classesNote={isHead ? 'Kurumun sınıfları sizin panelinize inmez; sınıfa özel ayar için "Kuruma geç" ile girin.' : undefined}
          />
        )}
      </Suspense>
    </div>
  );

  // ---------------------------------------------------------------- kurum yöneticisi / kuruma geçmiş genel yönetici
  if (!isHead) {
    if (!dataService.isKurumAdmin()) {
      // Kurumsuz (eski) yönetici hesabı: bugünkü kullanıcı listesi
      return (
        <Suspense fallback={<PageLoading />}>
          <AdminUserManagement currentAdmin={currentTeacher} onNavigateHome={onNavigateHome} />
        </Suspense>
      );
    }
    return (
      <div className="space-y-4 mb-6" id="yonetim-sayfasi">
        <PageHeader
          icon={ShieldCheck}
          tone="warning"
          title={kurumName}
          description={
            gecis
              ? 'Bu kurumun içindesiniz. Bildirim, SMS ve yedek için üst menüden kendi panelinize dönün.'
              : bireysel
                ? 'Öğrencileriniz, sınıflarınız ve hesap bilgileriniz'
                : 'Kurumunuzun öğretmenleri, öğrencileri ve yetkileri'
          }
        />
        {kurumIcerik(my.kurumId || '')}
      </div>
    );
  }

  // ---------------------------------------------------------------- genel yönetici
  return (
    <div className="space-y-4 mb-6" id="yonetim-sayfasi">
      <PageHeader
        icon={ShieldCheck}
        tone="warning"
        title="Yönetim"
        description="Kurumlar, bildirimler, yedek ve kendi kayıtlarınız"
        actions={
          onOpenGuide ? (
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onOpenGuide}>
              Aşama 25 rehberi
            </button>
          ) : undefined
        }
      />
      <Segmented
        value={ust}
        onChange={setUst}
        items={[
          { value: 'kurumlar', label: 'Kurumlar', icon: Building2, id: 'yonetim-ust-kurumlar' },
          { value: 'bildirim', label: 'Bildirim ve SMS', icon: Bell, id: 'yonetim-ust-bildirim' },
          { value: 'yedek', label: 'Yedek ve bakım', icon: Database, id: 'yonetim-ust-yedek' },
          { value: 'kendi', label: 'Kendi alanım', icon: UserRound, id: 'yonetim-ust-kendi' },
        ]}
      />

      {ust === 'kurumlar' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label htmlFor="yonetim-kurum-sec" className="text-xs font-semibold text-fg-2 shrink-0">
              Kurum
            </label>
            <SelectBox
              id="yonetim-kurum-sec"
              aria-label="Kurum"
              value={kurumId}
              onChange={(e) => setKurumId(e.target.value)}
              className="w-full sm:w-72 h-8 px-2.5 bg-surface border border-line-strong rounded-lg text-xs font-semibold text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand"
            >
              {(rows || []).length === 0 && <option value="">{rows === null ? 'Kurumlar yükleniyor…' : 'Henüz kurum yok'}</option>}
              {(rows || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.tur === 'bireysel' ? `${r.name} · Bireysel` : r.name}
                </option>
              ))}
            </SelectBox>
            <div className="flex gap-2 sm:ml-auto">
              <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={enter} disabled={!kurumId || entering} title="Bu kurumun içine geçer (öğrenciler, ödev, etüt…)" id="yonetim-ust-gec">
                <LogIn className="w-3.5 h-3.5" /> Kuruma geç
              </button>
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => setNewOpen(true)} id="yonetim-yeni-kurum">
                <Plus className="w-3.5 h-3.5" /> Yeni kurum
              </button>
            </div>
          </div>
          {rowsError && (
            <p role="alert" className="text-xs font-semibold text-danger-fg flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> {rowsError}
            </p>
          )}
          {kurumId ? kurumIcerik(kurumId) : rows && rows.length === 0 ? <p className="text-xs text-muted">"Yeni kurum" ile ilk kurumu açın.</p> : null}
          {newOpen && (
            <Suspense fallback={null}>
              <YeniKurumModal open={newOpen} onClose={() => setNewOpen(false)} onDone={() => void loadRows()} />
            </Suspense>
          )}
        </>
      )}

      <Suspense fallback={<PageLoading />}>
        {ust === 'bildirim' && <NotificationPolicyPanel />}
        {ust === 'yedek' && <AdminMaintenancePanel />}
        {ust === 'kendi' && (
          <div className="space-y-3">
            {/* Aşama 259: kendi alanı yalnız yönetim merkezi; sınıflar öğrencileriyle bireysel hesaba taşınır */}
            <KendiAlaniTasima classes={classes} />
            <AdminUserManagement key="kendi" currentAdmin={currentTeacher} onNavigateHome={onNavigateHome} kurumLock="merkez" embedded />
            <UserCredentialsExport classes={classes} />
            {/* Aşama 165: kendi (kurumsuz) sınıflarım ve kurumlara açtığım sınıflar için öğrenci bölümleri */}
            <OgrenciBolumPanel key="ob-kendi" kurumId={null} classes={classes.filter((c) => !c.kurumId)} kurumModules={null} canEdit />
          </div>
        )}
      </Suspense>
    </div>
  );
};
