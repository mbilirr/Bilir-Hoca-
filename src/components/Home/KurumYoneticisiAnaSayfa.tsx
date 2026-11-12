import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { dataService, KURUM_MODULES } from '../../services/dataService';
import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student, Teacher, TeacherTabType } from '../../types';
import {
  BugunOzet,
  DersAyar,
  ProgramSatiri,
  SinifDersOgretmen,
  Tatil,
  dersAyarOku,
  dersCanliDinle,
  guncelProgram,
  ozetBugun,
  sinifDersOgretmenleri,
  tatilEkle,
  tatilListesi,
} from '../../services/dersService';
import { hasEtutAttendance, isEtutAttendanceMissing } from '../../lib/etutTiming';
import { dersHatirlat } from '../../lib/push';
import { ROLE_DEFS, fetchTeacherRoles, onTeacherRolesSaved, type TeacherRole } from '../../lib/teacherRoles';
import { yonetimHedefle, type DersAdim, type YonetimHedef } from '../../lib/yonetimGecis';
import { trBugun } from '../../lib/trSaat';
import { AnaSayfaKabuk, AkSheet, akSelam, akTarih } from './AnaSayfaKabuk';

// ============================================================================
// Aşama 245: KURUM YÖNETİCİSİ ANA SAYFASI (taslak: "diğer kurum yöneticileri.html", koyu panel + kâğıt)
// Kimde: kurum yöneticisi kaydı olan hesap (Kurum yöneticisi portalında ya da portal seçimi olmayan);
//        genel yönetici kuruma geçince de bu sayfa açılır.
// KURAL (12 Kas, Mustafa): sayfadaki her şey kurumun AÇIK bölümlerinden gelir. Kapalı bölümün eksiği, sayısı,
//        düğmesi hiç çizilmez (Dersler kapalıysa ders saatleri / program / tatil / yoklama yok; Etütler kapalıysa etüt yok…).
//  Koyu panel: selam, kurum hazırlığı (yalnız gösterilen adımlardan), kurum bugün (öğrenci, öğretmen, sınıf, günlük ders)
//  Kâğıt    : kurulum eksikleri (sağdan açılan panelde iş biter ya da Yönetim'in doğru adımı açılır), tamamlananlar,
//             bugün kurumda (geciken yoklama + Hatırlat, gelmeyen, etüt), hesap işleri, ekip (rol yetkileri açıksa), açık bölümler
// Senkron: ders tabloları canlı dinlenir (dersCanliDinle), öğrenci / sınıf / öğretmen / etüt dataService'ten anlık gelir,
//          roller kaydedilince yenilenir, 5 dakikada bir ve sekmeye dönünce sunucudan yeniden okunur. Yerel kopya yok.
// ============================================================================

const KurumRaporu = lazy(() => import('../Teacher/KurumRaporu').then((m) => ({ default: m.KurumRaporu })));
const ProgramExcelModal = lazy(() => import('../Admin/ProgramExcelModal').then((m) => ({ default: m.ProgramExcelModal })));

const ROL_RENK: Partial<Record<TeacherRole, string>> = {
  mudur: 'var(--red)',
  mudur_yardimcisi: 'var(--copper)',
  rehberlik: 'var(--blue)',
  olcme_degerlendirme: 'var(--green)',
  zumre_baskani: '#6d5bd0',
  ogretmen: 'var(--line-2)',
  etut_ogretmeni: 'var(--subtle)',
};

const adlar = (list: string[], n = 3) => (list.length > n ? `${list.slice(0, n).join(', ')} +${list.length - n}` : list.join(', '));
const sinifSirala = (a: ClassGroup, b: ClassGroup) => a.name.localeCompare(b.name, 'tr', { numeric: true });

interface DersVeri {
  ayar: DersAyar | null;
  atama: SinifDersOgretmen[];
  program: ProgramSatiri[];
  tatil: Tatil[];
  ozet: BugunOzet | null;
}

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  etuts: Etut[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

export const KurumYoneticisiAnaSayfa: React.FC<Props> = ({ currentTeacher, students, classes, etuts, homeworks, submissions, unreadMessages, onNavigateTab }) => {
  // ---- kurum ve izinler (dataService değişince yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const my = dataService.getMyKurum();
  const kurumId = my.kurumId || '';
  const can = useMemo(
    () => ({
      ders: dataService.canUseTab('grades'),
      etut: dataService.canUseTab('etuts'),
      ogrenci: dataService.canUseTab('students'),
      yonetim: dataService.canUseTab('user_management'),
      ogrenciYonet: dataService.canManageStudents(),
      sinifYonet: dataService.canManageClasses(),
      ogretmenYonet: dataService.canManageTeachers(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  // ---- kurumun sınıfları, öğrencileri, öğretmenleri (ekrandaki canlı veri)
  const siniflar = useMemo(() => {
    const granted = new Set(my.grantedClassIds || []);
    return classes.filter((c) => (c.kurumId || '') === kurumId || granted.has(c.id)).sort(sinifSirala);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, kurumId, tick]);
  const sinifIds = useMemo(() => new Set(siniflar.map((c) => c.id)), [siniflar]);
  const ogrenciler = useMemo(() => students.filter((s) => s.status !== 'inactive' && (s.kurumId || '') === kurumId), [students, kurumId]);
  const sinifsiz = useMemo(() => ogrenciler.filter((s) => !s.classId || !sinifIds.has(s.classId)), [ogrenciler, sinifIds]);
  const ogretmenler = useMemo(
    () =>
      dataService
        .getAllTeachersInternal()
        .filter((t) => (t.kurumId || '') === kurumId && (t.status || 'approved') === 'approved')
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kurumId, tick]
  );

  // ---- ders verisi (yalnız Dersler bölümü açıksa)
  const [ders, setDers] = useState<DersVeri | null>(null);
  const [dersHata, setDersHata] = useState('');
  const dersOku = useCallback(async () => {
    if (!kurumId) return;
    try {
      const ayar = await dersAyarOku();
      const bugun = ayar?.bugun || trBugun();
      const [atama, program, tatil, ozet] = await Promise.all([
        sinifDersOgretmenleri(kurumId),
        guncelProgram(kurumId, bugun),
        tatilListesi(kurumId, bugun).catch(() => [] as Tatil[]),
        ozetBugun().catch(() => null),
      ]);
      setDers({ ayar, atama, program, tatil, ozet });
      setDersHata('');
    } catch (e: any) {
      setDersHata(e?.message || 'Ders bilgisi okunamadı.');
    }
  }, [kurumId]);
  useEffect(() => {
    if (!can.ders || !kurumId) {
      setDers(null);
      return;
    }
    void dersOku();
    const t = setInterval(() => document.visibilityState === 'visible' && void dersOku(), 5 * 60_000);
    const kapat = dersCanliDinle(kurumId, ['kurum_ders_ayar', 'sinif_ders_ogretmen', 'ders_programi', 'kurum_ders_tatil', 'ders_yoklama_oturum'], () => void dersOku());
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [can.ders, kurumId, dersOku]);

  // ---- roller (yalnız rol yetkileri açıkken "Ekip")
  const rolAcik = my.rolesEnabled === true;
  const [roller, setRoller] = useState<Map<string, TeacherRole[]> | null>(null);
  useEffect(() => {
    if (!rolAcik) {
      setRoller(null);
      return;
    }
    let iptal = false;
    const oku = () =>
      fetchTeacherRoles()
        .then((m) => !iptal && setRoller(m))
        .catch(() => !iptal && setRoller(null));
    void oku();
    const kapat = onTeacherRolesSaved(() => void oku());
    return () => {
      iptal = true;
      kapat();
    };
  }, [rolAcik]);

  // ---- yardımcılar
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'hata'; text: string } | null>(null);
  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(() => setMesaj(null), 4000);
    return () => clearTimeout(t);
  }, [mesaj]);
  const yonetim = (h: YonetimHedef, adim?: DersAdim) => {
    yonetimHedefle(h, adim);
    onNavigateTab('user_management');
    window.scrollTo({ top: 0 });
  };
  const git = (tab: TeacherTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };
  const [sheet, setSheet] = useState<null | 'sinif' | 'tatil'>(null);
  const [excel, setExcel] = useState(false);
  const [rapor, setRapor] = useState<null | 'yoklama' | 'devamsizlik'>(null);

  // ---- kurulum adımları (yalnız açık bölümler; ders adımları ders verisi gelince)
  type Adim = { id: string; tamam: boolean; ad: string; ozet: string; ico: string; warn?: boolean; t: string; d: string; act: string; on: () => void };
  const adimlar: Adim[] = [];
  const dersHazir = can.ders && !!ders;
  if (dersHazir) {
    const a = ders!.ayar;
    const kayitli = !!a?.kayitli;
    adimlar.push({
      id: 'saat',
      tamam: kayitli,
      ad: 'Ders saatleri',
      ozet: kayitli && a!.saatler.length ? `${a!.dersSayisi} ders · ${a!.saatler[0].bas}–${a!.saatler[a!.saatler.length - 1].bit}` : '',
      ico: '!',
      warn: true,
      t: 'Ders saatleri girilmedi',
      d: 'Program ve yoklama bu saatlere göre işler',
      act: 'Ayarla',
      on: () => yonetim('dersler', 'saatler'),
    });
    if (kayitli)
      adimlar.push({
        id: 'sinir',
        tamam: a!.devamsizlikSinir > 0,
        ad: 'Devamsızlık sınırı',
        ozet: `${a!.devamsizlikSinir} gün · ${a!.devamsizlikKala} gün kala uyarı`,
        ico: '!',
        warn: true,
        t: 'Devamsızlık sınırı kapalı',
        d: 'Sınıra yaklaşan öğrenci için uyarı gitmez',
        act: 'Ayarla',
        on: () => yonetim('dersler', 'saatler'),
      });
  }
  if (can.ogrenci)
    adimlar.push({
      id: 'sinif',
      tamam: siniflar.length > 0,
      ad: 'Sınıflar',
      ozet: `${siniflar.length} şube`,
      ico: '!',
      warn: true,
      t: 'Sınıf açılmadı',
      d: 'Öğrenciler sınıflara göre izlenir',
      act: can.sinifYonet ? 'Sınıf aç' : 'Öğrenciler',
      on: () => git('students'),
    });
  if (can.ogretmenYonet || ogretmenler.length > 1)
    adimlar.push({
      id: 'ogretmen',
      tamam: ogretmenler.length > 1,
      ad: 'Öğretmenler',
      ozet: `${ogretmenler.length} hesap`,
      ico: '!',
      warn: true,
      t: 'Öğretmen eklenmedi',
      d: 'Tek tek ya da Excel ile toplu eklenir',
      act: 'Ekle',
      on: () => yonetim('ogretmen'),
    });
  if (dersHazir && siniflar.length) {
    const tanimli = new Set(ders!.atama.map((x) => x.classId));
    const dersiz = siniflar.filter((c) => !tanimli.has(c.id));
    adimlar.push({
      id: 'atama',
      tamam: !dersiz.length,
      ad: 'Ders öğretmenleri',
      ozet: `${siniflar.length - dersiz.length} sınıf`,
      ico: String(dersiz.length),
      t: 'Sınıfın ders öğretmeni yok',
      d: adlar(dersiz.map((c) => c.name)),
      act: 'Ata',
      on: () => yonetim('dersler', 'ogretmenler'),
    });
    const programli = new Set(ders!.program.map((x) => x.classId));
    const bos = siniflar.filter((c) => tanimli.has(c.id) && !programli.has(c.id));
    adimlar.push({
      id: 'program',
      tamam: tanimli.size > 0 && !bos.length,
      ad: 'Ders programı',
      ozet: `${programli.size} sınıf`,
      ico: String(bos.length || '!'),
      warn: true,
      t: bos.length ? 'Sınıfın programı boş' : 'Ders programı yok',
      d: bos.length ? `${adlar(bos.map((c) => c.name))} · Excel ile de yüklenir` : 'Önce sınıfların ders öğretmenleri girilir',
      act: 'Program',
      on: () => (ders!.ayar?.kayitli && tanimli.size ? setExcel(true) : yonetim('dersler', tanimli.size ? 'program' : 'ogretmenler')),
    });
    adimlar.push({
      id: 'tatil',
      tamam: ders!.tatil.length > 0,
      ad: 'Tatil günleri',
      ozet: `${ders!.tatil.length} gün`,
      ico: '!',
      warn: true,
      t: 'Tatil günleri girilmedi',
      d: 'Girilmezse tatilde yoklama "gecikti" sayılır',
      act: 'Tatil ekle',
      on: () => setSheet('tatil'),
    });
  }
  if (can.ogrenci && can.ogrenciYonet && siniflar.length && ogrenciler.length)
    adimlar.push({
      id: 'sinifsiz',
      tamam: !sinifsiz.length,
      ad: 'Öğrenci sınıfları',
      ozet: 'hepsi sınıfta',
      ico: String(sinifsiz.length),
      t: 'Öğrenci sınıfsız',
      d: 'Etüt ve yoklamada görünmezler',
      act: 'Sınıfa ata',
      on: () => setSheet('sinif'),
    });
  const eksik = adimlar.filter((a) => !a.tamam);
  const tamam = adimlar.filter((a) => a.tamam);
  const yukleniyor = can.ders && !ders && !dersHata;
  const yuzde = adimlar.length ? Math.round((tamam.length / adimlar.length) * 100) : 100;

  // ---- bugün kurumda
  const now = new Date();
  const bugun = trBugun();
  const bugunEtut = useMemo(() => (can.etut ? etuts.filter((e) => e.date === bugun) : []), [etuts, bugun, can.etut]);
  const etutEksik = bugunEtut.filter((e) => isEtutAttendanceMissing(e, now));
  const ozet = ders?.ozet && ders.ozet.kayitli ? ders.ozet : null;
  const geciken = ozet?.gecikenler || [];
  const [hatirlatDurum, setHatirlatDurum] = useState<'' | 'gidiyor' | 'tamam'>('');
  const hatirlat = async () => {
    if (hatirlatDurum === 'gidiyor' || !geciken.length) return;
    setHatirlatDurum('gidiyor');
    let ok = 0;
    let son = '';
    for (const g of geciken) {
      const r = await dersHatirlat(g.classId, bugun, g.sira);
      if (r.ok) ok++;
      else son = r.error || '';
    }
    setHatirlatDurum('tamam');
    setMesaj(ok ? { ton: 'ok', text: `${ok} dersin öğretmenine hatırlatma gönderildi.` } : { ton: 'hata', text: son || 'Hatırlatma gönderilemedi.' });
  };
  useEffect(() => setHatirlatDurum(''), [geciken.length]);

  // ---- ekip
  const ekip = useMemo(() => {
    if (!roller) return null;
    const say = new Map<TeacherRole, number>();
    ogretmenler.forEach((t) => {
      const r = roller.get(t.id) || [];
      // kişinin en "üst" rolü sayılır (Müdür > Müdür Yrd. > … > Öğretmen), rolü yoksa Öğretmen
      const ana = ROLE_DEFS.find((d) => r.includes(d.code))?.code || 'ogretmen';
      say.set(ana, (say.get(ana) || 0) + 1);
    });
    return ROLE_DEFS.filter((d) => (say.get(d.code) || 0) > 0).map((d) => ({ code: d.code, ad: d.label, n: say.get(d.code) || 0 }));
  }, [roller, ogretmenler]);

  const acikBolumler = KURUM_MODULES.filter((m) => (my.modules as any)?.[m.key] === true);
  const selam = akSelam(currentTeacher);
  const gunlukDers = ders?.ayar?.kayitli ? ders.ayar.dersSayisi : null;

  const panel = (
    <>
      <div>
        <span className="eyebrow">{akTarih()} · Kurum yönetimi</span>
        <h1>
          {selam.selam}
          {selam.ad ? ',' : ''}
          <br />
          {selam.ad}
        </h1>
      </div>
      {adimlar.length > 0 && (
        <div className="ak-glass">
          <span className="lbl">Kurum hazırlığı</span>
          <div className="huge2">
            <b className="tnum">{yukleniyor ? '—' : `%${yuzde}`}</b>
            <span>
              kurum hazır
              <br />
              {yukleniyor ? 'okunuyor' : `${adimlar.length} adımdan ${tamam.length} tamam`}
            </span>
          </div>
          <div className="ak-line" aria-hidden="true">
            <i style={{ width: `${yukleniyor ? 0 : yuzde}%` }} />
          </div>
        </div>
      )}
      <div className="ak-glass">
        <span className="lbl">Kurum bugün</span>
        <div>
          {can.ogrenci && (
            <div className="ak-today">
              <span>
                <b className="tnum">{ogrenciler.length}</b>öğrenci
              </span>
            </div>
          )}
          <div className="ak-today">
            <span>
              <b className="tnum">{ogretmenler.length}</b>öğretmen
            </span>
          </div>
          <div className="ak-today">
            <span>
              <b className="tnum">{siniflar.length}</b>sınıf
            </span>
          </div>
          {gunlukDers !== null && (
            <div className="ak-today">
              <span>
                <b className="tnum">{gunlukDers}</b>günlük ders
              </span>
            </div>
          )}
        </div>
      </div>
      <span className="grow" />
      <span className="note">Eksikler tamamlandıkça hazırlık yükselir. Sayılar Yönetim ve Dersler bölümlerinden gelir.</span>
    </>
  );

  const raporVar = can.ders || can.etut;

  return (
    <AnaSayfaKabuk
      currentTeacher={currentTeacher}
      unreadMessages={unreadMessages}
      onNavigate={onNavigateTab}
      panelLabel="Kurumun durumu"
      panel={panel}
      overlay={
        <>
          <SinifSheet open={sheet === 'sinif'} onClose={() => setSheet(null)} ogrenciler={sinifsiz} siniflar={siniflar} onMesaj={setMesaj} />
          <TatilSheet open={sheet === 'tatil'} onClose={() => setSheet(null)} tatiller={ders?.tatil || []} bugun={ders?.ayar?.bugun || bugun} onKayit={() => void dersOku()} onMesaj={setMesaj} />
          {mesaj && (
            <div className={'ak-toast' + (mesaj.ton === 'hata' ? ' bad' : '')} role="status" aria-live="polite">
              {mesaj.text}
            </div>
          )}
        </>
      }
    >
      <div className="ak-acts">
        {can.yonetim && (
          <button type="button" className="ak-btn dark w-32" onClick={() => git('user_management')}>
            Yönetim
          </button>
        )}
        {raporVar && (
          <button type="button" className="ak-btn w-32" onClick={() => setRapor('yoklama')}>
            Kurum raporu
          </button>
        )}
      </div>

      {/* Kurulum eksikleri */}
      {(adimlar.length > 0 || yukleniyor) && (
        <section className="ak-decide" aria-labelledby="ky-eksik">
          <div className="n">
            <b className={'tnum' + (eksik.length ? '' : ' ok')}>{yukleniyor ? '—' : eksik.length}</b>
            <strong id="ky-eksik">{eksik.length ? 'eksik kaldı' : 'eksik yok'}</strong>
            <span>Tamamlayınca listeden düşer, hazırlık yükselir.</span>
          </div>
          <div>
            {eksik.map((a) => (
              <div className="ak-drow" key={a.id}>
                <span className={'ico tnum' + (a.warn ? ' w' : '')}>{a.ico}</span>
                <span className="t">
                  <b>{a.t}</b>
                  <span title={a.d}>{a.d}</span>
                </span>
                <button type="button" className="ak-btn w-24" onClick={a.on}>
                  {a.act}
                </button>
              </div>
            ))}
            {dersHata && <p className="ak-err">{dersHata}</p>}
            {!eksik.length && !yukleniyor && <div className="ak-allok">Kurulum tamam. Eksik kalmadı.</div>}
          </div>
        </section>
      )}

      {/* Tamamlananlar */}
      {tamam.length > 0 && (
        <section aria-labelledby="ky-tamam">
          <div className="ak-h2 sm">
            <span id="ky-tamam">Tamamlananlar</span>
            <small>Değiştirmek için Yönetim'e girin</small>
          </div>
          <div className="ak-done">
            {tamam.map((a) => (
              <span className="ak-chip" key={a.id}>
                ✓ {a.ad} {a.ozet && <span>{a.ozet}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Bugün kurumda (yalnız açık bölümler) */}
      {(ozet || can.etut) && (
        <section aria-labelledby="ky-bugun">
          <div className="ak-h2 sm">
            <span id="ky-bugun">Bugün kurumda</span>
            {raporVar && (
              <button type="button" className="lnk" onClick={() => setRapor('yoklama')}>
                Kurum raporu ›
              </button>
            )}
          </div>
          <div className="ak-acc">
            {ozet && (
              <div className={'ak-it' + (geciken.length ? ' bad' : '')}>
                <span className="ak-av tnum">{geciken.length}</span>
                <span className="w">
                  <b>{geciken.length ? 'yoklama gecikti' : 'geciken yoklama yok'}</b>
                  <span title={geciken.map((g) => `${g.classAd} ${g.sira}. ders`).join(', ')}>
                    {geciken.length ? adlar(geciken.map((g) => `${g.classAd} ${g.sira}. ders`), 2) : `Bitiminden ${ozet.gecikmeDk} dk sonra sayılır`}
                  </span>
                </span>
                {geciken.length ? (
                  <button type="button" className="ak-btn w-24" onClick={hatirlat} disabled={hatirlatDurum !== ''}>
                    {hatirlatDurum === 'gidiyor' ? 'Gönderiliyor' : hatirlatDurum === 'tamam' ? 'Hatırlatıldı' : 'Hatırlat'}
                  </button>
                ) : (
                  <button type="button" className="ak-btn w-24" onClick={() => setRapor('yoklama')}>
                    Yoklamalar
                  </button>
                )}
              </div>
            )}
            {ozet && (
              <div className="ak-it">
                <span className="ak-av tnum">{ozet.gelmeyen}</span>
                <span className="w">
                  <b>öğrenci gelmedi</b>
                  <span>Bugünkü ders yoklamalarından</span>
                </span>
                <button type="button" className="ak-btn w-24" onClick={() => setRapor('devamsizlik')}>
                  Liste
                </button>
              </div>
            )}
            {can.etut && (
              <div className={'ak-it' + (etutEksik.length ? ' bad' : '')}>
                <span className="ak-av tnum">{bugunEtut.length}</span>
                <span className="w">
                  <b>{bugunEtut.length ? 'etüt var' : 'bugün etüt yok'}</b>
                  <span>
                    {etutEksik.length
                      ? `${etutEksik.length} etüdün yoklaması alınmadı`
                      : bugunEtut.length
                        ? `${bugunEtut.filter((e) => hasEtutAttendance(e)).length} etüdün yoklaması alındı`
                        : 'Etütler sayfasından planlanır'}
                  </span>
                </span>
                <button type="button" className="ak-btn w-24" onClick={() => git('etuts')}>
                  Etütler
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Hesap işleri (yalnız yetkisi olan işler) */}
      {can.yonetim && (can.ogretmenYonet || can.ogrenciYonet) && (
        <section aria-labelledby="ky-hesap">
          <div className="ak-h2 sm">
            <span id="ky-hesap">Hesap işleri</span>
            <small>{can.ogrenciYonet ? 'Öğretmen, öğrenci ve veli hesapları' : 'Öğretmen hesapları'}</small>
          </div>
          <div className="ak-acc">
            {can.ogretmenYonet && (
              <div className="ak-it">
                <span className="ak-av" aria-hidden="true">
                  +
                </span>
                <span className="w">
                  <b>Öğretmen ekle</b>
                  <span>Tek tek ya da Excel ile toplu</span>
                </span>
                <button type="button" className="ak-btn w-24" onClick={() => yonetim('ogretmen')}>
                  Ekle
                </button>
              </div>
            )}
            {can.ogrenciYonet && (
              <div className="ak-it">
                <span className="ak-av" aria-hidden="true">
                  ✉
                </span>
                <span className="w">
                  <b>Giriş bilgisi gönder</b>
                  <span>Öğrenci ya da veliye · sınıfça</span>
                </span>
                <button type="button" className="ak-btn w-24" onClick={() => yonetim('ogrenci')}>
                  Gönder
                </button>
              </div>
            )}
            <div className="ak-it">
              <span className="ak-av" aria-hidden="true">
                ⟳
              </span>
              <span className="w">
                <b>Şifre yenileme</b>
                <span>{can.ogrenciYonet && can.ogretmenYonet ? 'Öğrenci ya da öğretmen · toplu' : can.ogrenciYonet ? 'Öğrenci · sınıfça toplu' : 'Öğretmen · toplu'}</span>
              </span>
              <button type="button" className="ak-btn w-24" onClick={() => yonetim(can.ogrenciYonet ? 'ogrenci' : 'ogretmen')}>
                Aç
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Ekip ve açık bölümler */}
      <div className="ak-two">
        {ekip && ekip.length > 0 && (
          <section aria-labelledby="ky-ekip">
            <div className="ak-h2 sm">
              <span id="ky-ekip">Ekip</span>
              {can.yonetim && (
                <button type="button" className="lnk" onClick={() => yonetim('roller')}>
                  Roller ve yetkiler ›
                </button>
              )}
            </div>
            <div className="ak-team" aria-hidden="true">
              {ekip.map((r) => (
                <i key={r.code} style={{ flex: r.n, background: ROL_RENK[r.code] || 'var(--line-2)' }} />
              ))}
            </div>
            <div className="ak-legend">
              {ekip.map((r) => (
                <span key={r.code}>
                  <i style={{ background: ROL_RENK[r.code] || 'var(--line-2)' }} />
                  {r.ad}
                  <b className="tnum">{r.n}</b>
                </span>
              ))}
            </div>
          </section>
        )}
        <section aria-labelledby="ky-bolum">
          <div className="ak-h2 sm">
            <span id="ky-bolum">Kurumun bölümleri</span>
            <small className="tnum">{acikBolumler.length} bölüm açık</small>
          </div>
          <div className="ak-mods">
            {acikBolumler.map((m) => (
              <span className="ak-mod" key={m.key} title={m.description}>
                {m.title}
              </span>
            ))}
          </div>
          <p className="ak-sub">Bölümleri genel yönetici açar. Açık olmayan bölüm menüde ve bu sayfada görünmez.</p>
        </section>
      </div>

      <Suspense fallback={null}>
        {rapor && (
          <KurumRaporu
            open
            ilkBolum={rapor}
            onClose={() => setRapor(null)}
            etuts={etuts}
            homeworks={homeworks}
            submissions={submissions}
            students={students}
            classes={classes}
          />
        )}
        {excel && ders?.ayar && (
          <ProgramExcelModal
            open={excel}
            onClose={() => setExcel(false)}
            ayar={ders.ayar}
            siniflar={siniflar.map((c) => ({ id: c.id, name: c.name }))}
            ogretmenler={ogretmenler.map((t) => ({ id: t.id, name: t.name }))}
            program={ders.program}
            dersAdlari={Array.from(new Set(ders.atama.map((a) => a.ders)))}
            onDone={() => void dersOku()}
          />
        )}
      </Suspense>
    </AnaSayfaKabuk>
  );
};

// ---------------------------------------------------------------------------
// Sınıfa ata: sınıfı olmayan öğrenciler (tek tek ya da seçilenleri topluca)
// ---------------------------------------------------------------------------
const SinifSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  ogrenciler: Student[];
  siniflar: ClassGroup[];
  onMesaj: (m: { ton: 'ok' | 'hata'; text: string }) => void;
}> = ({ open, onClose, ogrenciler, siniflar, onMesaj }) => {
  const [secim, setSecim] = useState<Record<string, string>>({});
  const [isaret, setIsaret] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setSecim({});
      setIsaret(new Set());
    }
  }, [open]);
  const liste = useMemo(() => [...ogrenciler].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [ogrenciler]);
  const dolu = liste.filter((s) => secim[s.id]);
  const hepsi = liste.length > 0 && liste.every((s) => isaret.has(s.id));
  const toplu = (classId: string) => {
    if (!classId) return;
    setSecim((m) => {
      const n = { ...m };
      liste.forEach((s) => isaret.has(s.id) && (n[s.id] = classId));
      return n;
    });
  };
  const kaydet = async () => {
    if (busy || !dolu.length) return;
    setBusy(true);
    try {
      const grup = new Map<string, string[]>();
      dolu.forEach((s) => grup.set(secim[s.id], [...(grup.get(secim[s.id]) || []), s.id]));
      let n = 0;
      for (const [classId, ids] of grup) n += await dataService.assignStudentsToClass(ids, classId);
      onMesaj({ ton: 'ok', text: `${n} öğrenci sınıfına atandı.` });
      setSecim({});
      setIsaret(new Set());
      if (dolu.length === liste.length) onClose();
    } catch (e: any) {
      onMesaj({ ton: 'hata', text: e?.message || 'Atanamadı.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <AkSheet
      open={open}
      onClose={onClose}
      locked={busy}
      kicker="Kurulum"
      title="Sınıfa ata"
      desc="Sınıfı olmayan öğrenci etüt ve yoklamada görünmez."
      footer={
        <>
          <span className="cnt tnum">
            {dolu.length}/{liste.length} öğrenci
          </span>
          <button type="button" className="ak-btn w-24" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className="ak-btn dark" onClick={kaydet} disabled={busy || !dolu.length}>
            {busy ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </>
      }
    >
      {liste.length ? (
        <>
          <div className="ak-bulk">
            <label>
              <input
                type="checkbox"
                checked={hepsi}
                onChange={(e) => setIsaret(e.target.checked ? new Set(liste.map((s) => s.id)) : new Set())}
                aria-label="Hepsini seç"
              />
              Seçilenleri
            </label>
            <select className="ak-sel sm" value="" onChange={(e) => toplu(e.target.value)} disabled={!isaret.size} aria-label="Seçilenlerin sınıfı">
              <option value="">Sınıf</option>
              {siniflar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            sınıfına ata
          </div>
          {liste.map((s) => (
            <label className="ak-frow" key={s.id}>
              <input
                type="checkbox"
                checked={isaret.has(s.id)}
                onChange={(e) =>
                  setIsaret((x) => {
                    const n = new Set(x);
                    if (e.target.checked) n.add(s.id);
                    else n.delete(s.id);
                    return n;
                  })
                }
              />
              <span className="w">
                <b>{s.name}</b>
                <span>{s.gradeLevel ? `${s.gradeLevel}` : 'Sınıf seviyesi yok'}</span>
              </span>
              <select
                className="ak-sel sm"
                value={secim[s.id] || ''}
                onChange={(e) => setSecim((m) => ({ ...m, [s.id]: e.target.value }))}
                aria-label={`${s.name} sınıfı`}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Sınıf</option>
                {siniflar.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </>
      ) : (
        <p className="ak-hint">Sınıfı olmayan öğrenci kalmadı.</p>
      )}
    </AkSheet>
  );
};

// ---------------------------------------------------------------------------
// Tatil ekle (Yönetim › Ders programı › Ders saatleri'ndeki tatil günleriyle aynı kayıt)
// ---------------------------------------------------------------------------
const TatilSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  tatiller: Tatil[];
  bugun: string;
  onKayit: () => void;
  onMesaj: (m: { ton: 'ok' | 'hata'; text: string }) => void;
}> = ({ open, onClose, tatiller, bugun, onKayit, onMesaj }) => {
  const [ad, setAd] = useState('');
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');
  useEffect(() => {
    if (open) {
      setAd('');
      setBas('');
      setBit('');
      setHata('');
    }
  }, [open]);
  // Ardışık günler tek satır: "25 Oca – 5 Şub · Yarıyıl tatili"
  const araliklar = useMemo(() => {
    const s = [...tatiller].sort((a, b) => a.tarih.localeCompare(b.tarih));
    const out: Array<{ bas: string; bit: string; aciklama: string; gun: number }> = [];
    const ertesi = (t: string) => {
      const d = new Date(t + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    s.forEach((t) => {
      const son = out[out.length - 1];
      if (son && son.aciklama === t.aciklama && ertesi(son.bit) === t.tarih) {
        son.bit = t.tarih;
        son.gun++;
      } else out.push({ bas: t.tarih, bit: t.tarih, aciklama: t.aciklama, gun: 1 });
    });
    return out;
  }, [tatiller]);
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const gecerli = !!bas && !!(bit || bas) && (bit || bas) >= bas && ad.trim().length > 1;
  const ekle = async () => {
    if (busy) return;
    const son = bit || bas;
    if (!bas || son < bas) return setHata('Bitiş, başlangıçtan önce olamaz.');
    if (!ad.trim()) return setHata('Tatilin adını yazın.');
    setBusy(true);
    setHata('');
    try {
      const n = await tatilEkle(bas, son, ad.trim());
      onMesaj({ ton: 'ok', text: `${n || 'Tatil'} gün tatil olarak eklendi.` });
      setAd('');
      setBas('');
      setBit('');
      onKayit();
    } catch (e: any) {
      setHata(e?.message || 'Eklenemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AkSheet
      open={open}
      onClose={onClose}
      locked={busy}
      kicker="Kurulum"
      title="Tatil günü ekle"
      desc="Tatil günlerinde ders yoklaması istenmez, gecikme sayılmaz."
      footer={
        <>
          <span className="cnt tnum">{araliklar.length ? `${tatiller.length} gün kayıtlı` : ''}</span>
          <button type="button" className="ak-btn w-24" onClick={onClose} disabled={busy}>
            Kapat
          </button>
          <button type="button" className="ak-btn dark" onClick={ekle} disabled={busy || !gecerli}>
            {busy ? 'Ekleniyor' : 'Ekle'}
          </button>
        </>
      }
    >
      <div className="ak-fgrid">
        <label className="ak-fld full">
          Ad
          <input className="ak-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Yarıyıl tatili" maxLength={80} />
        </label>
        <label className="ak-fld">
          Başlangıç
          <input className="ak-inp" type="date" value={bas} min={bugun} onChange={(e) => setBas(e.target.value)} />
        </label>
        <label className="ak-fld">
          Bitiş
          <input className="ak-inp" type="date" value={bit} min={bas || bugun} onChange={(e) => setBit(e.target.value)} />
        </label>
        {hata && <p className="ak-err full">{hata}</p>}
      </div>
      {araliklar.length ? (
        araliklar.map((t) => (
          <div className="ak-frow" key={t.bas}>
            <span className="w">
              <b>{t.aciklama || 'Tatil'}</b>
              <span>
                {t.bas === t.bit ? f(t.bas) : `${f(t.bas)} – ${f(t.bit)}`} · {t.gun} gün
              </span>
            </span>
            <span className="ak-oktag">Kayıtlı</span>
          </div>
        ))
      ) : (
        <p className="ak-hint">Bugünden sonrası için girilmiş tatil yok.</p>
      )}
    </AkSheet>
  );
};
