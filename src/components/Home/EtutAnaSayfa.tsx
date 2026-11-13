import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardCheck, Users } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Etut, Student, Teacher, TeacherTabType } from '../../types';
import { GUN_ADLARI } from '../../services/dersService';
import { etutEndTime, isEtutAttendanceMissing, hasEtutAttendance } from '../../lib/etutTiming';
import { getEtutStatus } from '../../lib/etutStatus';
import { gradeOf } from '../../lib/teacherGrades';
import { AkSheet, AnaSayfaKabuk, akBasHarf, akSelam } from './AnaSayfaKabuk';
import './kalanAnaSayfa.css';

// ============================================================================
// Aşama 253: ETÜT ÖĞRETMENİ ANA SAYFASI (taslak: kalan-roller.html › Etüt öğretmeni, Odak renkleri)
// Kimde: yalnız Etüt Öğretmeni rolü olan hesap (dataService.roleEtutOnly). Etüt planlayamaz; yalnız kendi etütleri.
// Bölümler: sıradaki etüt + bugünkü etütlerim (koyu kart), sizi bekleyenler (alınmamış yoklama, yazılmamış görüş),
//   bu ay (etüt, saat, katılım), bu hafta (7 gün), etüt öğrencilerim (ÖZET: sayılar + sınıf düzeyi dağılımı + tek uyarı).
// KURAL (13 Kas, Mustafa): öğrenci listesi ana sayfada liste olarak çizilmez (haftalar geçtikçe büyür); yalnız özet,
//   gerekirse "Göster" ile sağdan açılan listede.
// Veri: dataService'teki etütler (yalnız bu öğretmenin etütleri, isMyEtut). Etüt bölümü kapalıysa hiçbir şey çizilmez.
// ============================================================================

const EtutAttendanceModal = lazy(() => import('../Teacher/EtutAttendanceModal').then((m) => ({ default: m.EtutAttendanceModal })));

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  etuts: Etut[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdYerel = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const gunEkleY = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const tarihOku = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN3 = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PAZ'];
const isoG = (d: Date) => (d.getDay() + 6) % 7; // 0 = Pazartesi
const sureYazi = (dk: number) => {
  const s = Math.floor(dk / 60);
  const d = dk % 60;
  return s && d ? `${s} sa ${d} dk` : s ? `${s} sa` : `${d} dk`;
};
const siraKey = (e: Etut) => `${e.date || ''} ${e.time || '99:99'}`;
const dersKonu = (e: Etut) => [e.subject || 'Etüt', e.topic].filter(Boolean).join(' · ');
const ogrIdleri = (e: Etut) => (Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds : []);
const geldi = (st?: string) => st === 'present' || st === 'late';
const n1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export const EtutAnaSayfa: React.FC<Props> = ({ currentTeacher, students, classes, etuts, unreadMessages, onNavigateTab }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const acik = useMemo(
    () => dataService.canUseTab('etuts'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const go = (tab: TeacherTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };

  // ---- saat (etüt saatleri cihaz saatine göre; Etütler sayfasıyla aynı)
  const [simdi, setSimdi] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setSimdi(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const bugun = ymdYerel(simdi);

  const ogrMap = useMemo(() => new Map(students.map((s) => [s.id, s] as const)), [students]);
  const sinifMap = useMemo(() => new Map(classes.map((c) => [c.id, c] as const)), [classes]);

  // ================================================================ ETÜTLERİM
  const benim = useMemo(
    () => (acik ? etuts.filter((e) => !e.privacyRedacted && dataService.isMyEtut(e)).sort((a, b) => siraKey(a).localeCompare(siraKey(b))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acik, etuts, tick],
  );
  const bugunkuler = useMemo(() => benim.filter((e) => e.date === bugun), [benim, bugun]);
  const siradaki = useMemo(() => {
    const t = simdi.getTime();
    return benim.find((e) => e.date >= bugun && (etutEndTime(e)?.getTime() ?? 0) > t) || null;
  }, [benim, bugun, simdi]);
  const sonraki = useMemo(() => (siradaki ? benim.find((e) => e !== siradaki && siraKey(e) > siraKey(siradaki) && e.date === siradaki.date) || null : null), [benim, siradaki]);

  const eksikYoklama = useMemo(() => {
    const sinir = ymdYerel(gunEkleY(simdi, -30));
    return benim.filter((e) => e.date >= sinir && isEtutAttendanceMissing(e, simdi)).sort((a, b) => siraKey(b).localeCompare(siraKey(a)));
  }, [benim, simdi]);
  const gorusYok = useMemo(() => {
    const dun = ymdYerel(gunEkleY(simdi, -1));
    return benim.filter((e) => e.date >= dun && e.date <= bugun && hasEtutAttendance(e) && !(e.teacherFeedback || '').trim()).sort((a, b) => siraKey(b).localeCompare(siraKey(a)));
  }, [benim, bugun, simdi]);

  // ---- bu ay
  const ay = useMemo(() => {
    const bas = `${simdi.getFullYear()}-${pad(simdi.getMonth() + 1)}-01`;
    const list = benim.filter((e) => e.date >= bas && e.date <= bugun && (e.date < bugun || getEtutStatus(e, simdi) === 'done' || getEtutStatus(e, simdi) === 'past'));
    let dk = 0;
    const say = { geldi: 0, izinli: 0, gelmedi: 0 };
    let eksik = 0;
    for (const e of list) {
      dk += Number(e.duration) || 45;
      if (isEtutAttendanceMissing(e, simdi)) eksik++;
      for (const a of Object.values(e.studentAttendance || {})) {
        if (geldi(a.status)) say.geldi++;
        else if (a.status === 'excused') say.izinli++;
        else if (a.status === 'absent') say.gelmedi++;
      }
    }
    const top = say.geldi + say.izinli + say.gelmedi;
    // öğrenci özeti: bu ay etüdüme atanan öğrenciler (liste değil, sayılar)
    const ogr = new Map<string, number>();
    for (const e of benim.filter((x) => x.date >= bas && x.date <= bugun)) for (const id of ogrIdleri(e)) ogr.set(id, (ogr.get(id) || 0) + 1);
    const siniflar = new Set<string>();
    const duzey = new Map<string, number>();
    ogr.forEach((_, id) => {
      const s = ogrMap.get(id);
      if (!s) return;
      if (s.classId) siniflar.add(s.classId);
      const c = s.classId ? sinifMap.get(s.classId) : undefined;
      const g = c ? gradeOf(c) : null;
      const k = g !== null ? `${g}. sınıf` : 'Diğer';
      duzey.set(k, (duzey.get(k) || 0) + 1);
    });
    const atama = Array.from(ogr.values()).reduce((a, b) => a + b, 0);
    const duzeyler = Array.from(duzey.entries()).sort((a, b) => b[1] - a[1]);
    return {
      adet: list.length,
      dk,
      say,
      top,
      katilim: top ? Math.round((say.geldi / top) * 100) : null,
      eksik,
      ogrSayi: ogr.size,
      sinifSayi: siniflar.size,
      ortalama: ogr.size ? atama / ogr.size : 0,
      duzeyler: duzeyler.length > 3 ? [...duzeyler.slice(0, 2), ['Diğer', duzeyler.slice(2).reduce((a, b) => a + b[1], 0)] as [string, number]] : duzeyler,
    };
  }, [benim, bugun, simdi, ogrMap, sinifMap]);

  // ---- son 2 etüdüne üst üste gelmeyenler (benim etütlerim; yoklaması alınmış)
  const ustUste = useMemo(() => {
    const son = new Map<string, Array<{ st: string; e: Etut }>>();
    for (const e of benim) {
      if (!hasEtutAttendance(e) || e.date > bugun) continue;
      for (const [id, a] of Object.entries(e.studentAttendance || {})) {
        const l = son.get(id) || [];
        l.push({ st: a.status, e });
        son.set(id, l);
      }
    }
    const out: Array<{ id: string; ad: string; sinif: string; son: string }> = [];
    son.forEach((l, id) => {
      if (l.length < 2) return;
      const [a, b] = l.slice(-2);
      if (a.st === 'absent' && b.st === 'absent') {
        const s = ogrMap.get(id);
        const att = b.e.studentAttendance?.[id];
        out.push({ id, ad: s?.name || att?.studentName || 'Öğrenci', sinif: s?.className || '', son: `${tarihOku(b.e.date)?.getDate() || ''} ${AYLAR[(tarihOku(b.e.date)?.getMonth() ?? 0)]} · ${b.e.subject || 'Etüt'}` });
      }
    });
    return out.sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
  }, [benim, bugun, ogrMap]);

  // ---- bu hafta (Pazartesi – Pazar)
  const hafta = useMemo(() => {
    const pzt = gunEkleY(simdi, -isoG(simdi));
    return Array.from({ length: 7 }, (_, i) => {
      const d = gunEkleY(pzt, i);
      const y = ymdYerel(d);
      return { y, gun: GUN3[i], no: d.getDate(), etutler: benim.filter((e) => e.date === y) };
    });
  }, [simdi, benim]);
  const haftaToplam = hafta.reduce((a, g) => a + g.etutler.length, 0);
  const haftaDk = hafta.reduce((a, g) => a + g.etutler.reduce((x, e) => x + (Number(e.duration) || 45), 0), 0);
  const haftaAlinan = hafta.reduce((a, g) => a + g.etutler.filter((e) => hasEtutAttendance(e)).length, 0);
  const haftaBiten = hafta.reduce((a, g) => a + g.etutler.filter((e) => (etutEndTime(e)?.getTime() ?? 0) <= simdi.getTime()).length, 0);

  // ---- katmanlar
  const [yoklama, setYoklama] = useState<Etut | null>(null);
  const [sheet, setSheet] = useState<null | 'liste' | 'ustuste'>(null);

  const kalanDk = siradaki ? Math.round(((tarihOku(siradaki.date) ? new Date(`${siradaki.date}T${siradaki.time || '00:00'}:00`).getTime() : 0) - simdi.getTime()) / 60000) : 0;
  const siradakiDurum = siradaki ? getEtutStatus(siradaki, simdi) : null;
  const siradakiYazi = (() => {
    if (!siradaki) return '';
    if (siradakiDurum === 'live') return 'Şimdi devam ediyor';
    if (siradaki.date === bugun) return kalanDk < 60 ? `${Math.max(1, kalanDk)} dk sonra` : `${sureYazi(kalanDk)} sonra`;
    const d = tarihOku(siradaki.date);
    const yarin = ymdYerel(gunEkleY(simdi, 1));
    return siradaki.date === yarin ? 'Yarın' : d ? `${GUN_ADLARI[isoG(d)]}, ${d.getDate()} ${AYLAR[d.getMonth()]}` : '';
  })();
  const ogrAdlari = (e: Etut) => ogrIdleri(e).map((id) => ogrMap.get(id)?.name || e.studentAttendance?.[id]?.studentName || '').filter(Boolean);

  const { selam, ad } = akSelam(currentTeacher);
  const gunBaslik = `${GUN_ADLARI[isoG(simdi)]}, ${simdi.getDate()} ${AYLAR[simdi.getMonth()]}`;
  const lede = !acik ? (
    <>Etüt bölümü kurumunuzda kapalı.</>
  ) : (
    <>
      {bugunkuler.length ? (
        <>
          Bugün <b>{bugunkuler.length} etüdünüz</b> var
          {siradaki && siradaki.date === bugun ? (
            <>
              ; sıradaki saat <b>{siradaki.time}</b>
            </>
          ) : (
            '; hepsi bitti'
          )}
          .{' '}
        </>
      ) : (
        <>Bugün etüdünüz yok. </>
      )}
      {eksikYoklama.length ? (
        <>
          Alınmamış <b>{eksikYoklama.length} yoklama</b> sizi bekliyor.
        </>
      ) : (
        'Bütün yoklamalar alınmış.'
      )}
    </>
  );

  const katman = (
    <>
      {yoklama && (
        <Suspense fallback={null}>
          <EtutAttendanceModal isOpen onClose={() => setYoklama(null)} etut={yoklama} allStudents={students} />
        </Suspense>
      )}
      <AkSheet
        open={sheet === 'liste'}
        onClose={() => setSheet(null)}
        kicker={siradaki ? `${siradaki.time || ''} · ${siradaki.location || 'Derslik yok'}` : 'Etüt'}
        title={siradaki ? dersKonu(siradaki) : 'Öğrenci listesi'}
        desc={siradaki && siradaki.assignedStudentIds === 'all' ? 'Bu etüt bütün öğrencilere açık.' : undefined}
        footer={
          <>
            <span className="cnt tnum">{siradaki ? `${ogrIdleri(siradaki).length} öğrenci` : ''}</span>
            <button type="button" className="ak-btn w-24" onClick={() => setSheet(null)}>
              Kapat
            </button>
            {siradaki && (
              <button
                type="button"
                className="ak-btn dark"
                onClick={() => {
                  setSheet(null);
                  setYoklama(siradaki);
                }}
              >
                Yoklama al
              </button>
            )}
          </>
        }
      >
        <ul className="kl-list">
          {(siradaki ? ogrIdleri(siradaki) : []).map((id) => {
            const s = ogrMap.get(id);
            return (
              <li key={id}>
                <span>
                  <b>{s?.name || siradaki?.studentAttendance?.[id]?.studentName || 'Öğrenci'}</b>
                  <small>{s?.className || '—'}</small>
                </span>
                <span />
              </li>
            );
          })}
        </ul>
      </AkSheet>
      <AkSheet
        open={sheet === 'ustuste'}
        onClose={() => setSheet(null)}
        kicker="Etüt öğrencilerim"
        title="Son 2 etüdüne gelmeyenler"
        desc="Yoklamasını aldığınız etütlerden; en son iki etüdünde de “Gelmedi” işaretlenen öğrenciler."
        footer={
          <>
            <span className="cnt tnum">{ustUste.length} öğrenci</span>
            <button type="button" className="ak-btn w-24" onClick={() => setSheet(null)}>
              Kapat
            </button>
            <button type="button" className="ak-btn dark" onClick={() => go('etuts')}>
              Etütlerim
            </button>
          </>
        }
      >
        <ul className="kl-list">
          {ustUste.map((o) => (
            <li key={o.id}>
              <span>
                <b>{o.ad}</b>
                <small>
                  {o.sinif || '—'} · son: {o.son}
                </small>
              </span>
              <span className="v dn">2 / 2</span>
            </li>
          ))}
        </ul>
      </AkSheet>
    </>
  );

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" sinif="ak-kl" overlay={katman}>
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">{gunBaslik} · Etüt öğretmeni</div>
          <h1>
            {selam} {ad && <em>{ad}</em>} Öğretmenim
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        {acik && (
          <div className="kl-acts">
            <button type="button" className="ak-btn" id="etut-home-etutlerim" onClick={() => go('etuts')}>
              <CalendarDays /> Etütlerim
            </button>
          </div>
        )}
      </div>

      {acik && (
        <>
          {/* ===== Sıradaki etüt + bugünkü etütlerim ===== */}
          <section className={'kl-ink' + (bugunkuler.length ? '' : ' tek')} aria-label="Sıradaki etüt">
            <div>
              {siradaki ? (
                <>
                  <div className="k">
                    <span className={'live' + (siradaki.date === bugun ? ' now' : '')} />
                    Sıradaki etüt · {siradakiYazi}
                  </div>
                  <h2>{dersKonu(siradaki)}</h2>
                  <div className="sub">
                    {siradaki.time || 'Saat yok'}
                    {siradaki.time ? ` – ${(() => {
                      const b = etutEndTime(siradaki);
                      return b ? `${pad(b.getHours())}:${pad(b.getMinutes())}` : '';
                    })()}` : ''}
                    {siradaki.location ? ` · ${siradaki.location}` : ''}
                    {siradaki.gradeLevel ? ` · ${siradaki.gradeLevel}` : ''}
                    {siradaki.assignedStudentIds === 'all' ? ' · bütün öğrenciler' : ` · ${ogrIdleri(siradaki).length} öğrenci`}
                  </div>
                  {ogrIdleri(siradaki).length > 0 && (
                    <div className="kl-stu" aria-label="Öğrenciler">
                      {ogrAdlari(siradaki)
                        .slice(0, 6)
                        .map((a, i) => (
                          <span key={i} title={a}>
                            {akBasHarf(a)}
                          </span>
                        ))}
                      {ogrIdleri(siradaki).length > 6 && <span>+{ogrIdleri(siradaki).length - 6}</span>}
                    </div>
                  )}
                  <div className="row">
                    <button type="button" className="ak-btn light" onClick={() => setYoklama(siradaki)}>
                      <ClipboardCheck /> Yoklama al
                    </button>
                    {ogrIdleri(siradaki).length > 0 && (
                      <button type="button" className="ak-btn ghost" onClick={() => setSheet('liste')}>
                        Öğrenci listesi
                      </button>
                    )}
                    {sonraki && <span className="chip ok">Sonra {sonraki.time}</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="k">
                    <span className="live" />
                    Etütlerim
                  </div>
                  <h2>Planlanmış etüt yok</h2>
                  <div className="sub">Size etüt atandığında saati, dersliği ve öğrencileri burada görünür.</div>
                  <div className="row">
                    <button type="button" className="ak-btn light" onClick={() => go('etuts')}>
                      Etütlerim
                    </button>
                  </div>
                </>
              )}
            </div>
            {bugunkuler.length > 0 && (
              <div className="right">
                <div className="rh">
                  <span>Bugünkü etütlerim</span>
                  <span>
                    {bugunkuler.length} etüt · {sureYazi(bugunkuler.reduce((a, e) => a + (Number(e.duration) || 45), 0))}
                  </span>
                </div>
                <div className="kl-tl">
                  {bugunkuler.slice(0, 6).map((e) => {
                    const st = getEtutStatus(e, simdi);
                    const yok = Object.values(e.studentAttendance || {}).filter((a) => a.status === 'absent').length;
                    const cur = e === siradaki;
                    return (
                      <div className={'kl-tli' + (cur ? ' cur' : '')} key={e.id}>
                        <span className="h tnum">{e.time || '—'}</span>
                        <span className={'o' + (st === 'done' ? ' done' : st === 'past' && isEtutAttendanceMissing(e, simdi) ? ' miss' : cur ? ' now' : '')} />
                        <div>
                          <b>{dersKonu(e)}</b>
                          <small>
                            {e.location || 'Derslik yok'} · {e.assignedStudentIds === 'all' ? 'bütün öğrenciler' : `${ogrIdleri(e).length} öğrenci`}
                          </small>
                        </div>
                        {st === 'done' ? (
                          <span className="kl-pill ok">Alındı{yok ? ` · ${yok} yok` : ''}</span>
                        ) : isEtutAttendanceMissing(e, simdi) ? (
                          <span className="kl-pill bad">Yoklama yok</span>
                        ) : st === 'live' ? (
                          <span className="kl-pill now">Şimdi</span>
                        ) : cur ? (
                          <span className="kl-pill now">Sıradaki</span>
                        ) : (
                          <span className="kl-pill mute">{Number(e.duration) || 45} dk</span>
                        )}
                      </div>
                    );
                  })}
                  {bugunkuler.length > 6 && <div className="nil">+{bugunkuler.length - 6} etüt daha</div>}
                </div>
              </div>
            )}
          </section>

          {/* ===== Sizi bekleyenler + Bu ay ===== */}
          <div className="kl-grid2">
            <section className="kl-card" aria-label="Sizi bekleyenler">
              <div className="kl-card-h">
                <div>
                  <h3>
                    Sizi bekleyenler {eksikYoklama.length + gorusYok.length > 0 && <span className="kl-cnt tnum">{eksikYoklama.length + gorusYok.length}</span>}
                  </h3>
                  <p>Geciken işler · yapınca kaybolur</p>
                </div>
              </div>
              {eksikYoklama.length + gorusYok.length ? (
                <div className="kl-body">
                  {eksikYoklama.slice(0, 3).map((e) => {
                    const d = tarihOku(e.date);
                    const gun = d ? Math.round((tarihOku(bugun)!.getTime() - d.getTime()) / 86400000) : 0;
                    return (
                      <div className="kl-task" key={e.id}>
                        <span className="bar" />
                        <div>
                          <b>{e.subject || 'Etüt'} etüdü yoklaması</b>
                          <small>
                            {d ? `${GUN_ADLARI[isoG(d)]}, ${d.getDate()} ${AYLAR[d.getMonth()]}` : ''} {e.time || ''} · {e.assignedStudentIds === 'all' ? 'bütün öğrenciler' : `${ogrIdleri(e).length} öğrenci`}
                          </small>
                        </div>
                        <span className="when">{gun <= 0 ? 'Bugün' : `${gun} gün`}</span>
                        <button type="button" className="ak-btn sm dark" onClick={() => setYoklama(e)}>
                          Yoklama al
                        </button>
                      </div>
                    );
                  })}
                  {gorusYok.slice(0, eksikYoklama.length >= 3 ? 1 : 2).map((e) => (
                    <div className="kl-task" key={'g' + e.id}>
                      <span className="bar w" />
                      <div>
                        <b>{e.subject || 'Etüt'} etüdüne görüş yazılmadı</b>
                        <small>
                          {e.date === bugun ? 'Bugün' : 'Dün'} {e.time || ''} · öğretmen görüşü (isteğe bağlı)
                        </small>
                      </div>
                      <span className="when w">{e.date === bugun ? 'Bugün' : 'Dün'}</span>
                      <button type="button" className="ak-btn sm" onClick={() => setYoklama(e)}>
                        Görüş yaz
                      </button>
                    </div>
                  ))}
                  {eksikYoklama.length > 3 && <div className="kl-more">+{eksikYoklama.length - 3} yoklama daha · Etütlerim sayfasında</div>}
                </div>
              ) : (
                <div className="kl-empty">
                  <i>✓</i> Alınmamış yoklama yok.
                </div>
              )}
              <div className="kl-foot">
                <span>
                  Bu ay alınmayan yoklama <b>{ay.eksik}</b>
                </span>
                <span>
                  Bu hafta alınan{' '}
                  <b className="tnum">
                    {haftaAlinan} / {haftaBiten}
                  </b>
                </span>
              </div>
            </section>

            <section className="kl-card" aria-label="Bu ay">
              <div className="kl-card-h">
                <div>
                  <h3>Bu ay</h3>
                  <p>Verdiğim etütler ve katılım · {AYLAR[simdi.getMonth()]}</p>
                </div>
              </div>
              <div className="kl-body">
                <div className="kl-kpi">
                  <div>
                    <b className="tnum">{ay.adet}</b>
                    <span>etüt</span>
                  </div>
                  <div>
                    <b className="tnum">{n1(ay.dk / 60)}</b>
                    <span>saat</span>
                  </div>
                  <div>
                    <b className={'tnum' + (ay.katilim !== null && ay.katilim >= 85 ? ' ok' : ay.katilim !== null && ay.katilim < 70 ? ' bad' : '')}>{ay.katilim === null ? '—' : `%${ay.katilim}`}</b>
                    <span>katılım</span>
                  </div>
                </div>
                <div style={{ marginTop: 'calc(0.75 * var(--ak-rem))' }}>
                  {(
                    [
                      ['Geldi', ay.say.geldi, 'var(--success)'],
                      ['İzinli', ay.say.izinli, 'var(--warning)'],
                      ['Gelmedi', ay.say.gelmedi, 'var(--danger)'],
                    ] as const
                  ).map(([k, v, r]) => (
                    <div className="kl-hb" key={k}>
                      <span className="lbl">{k}</span>
                      <span className="tr">
                        <i style={{ width: `${ay.top ? (v / ay.top) * 100 : 0}%`, background: r }} />
                      </span>
                      <span className="v tnum">{v}</span>
                      <span className="d tnum">%{ay.top ? Math.round((v / ay.top) * 100) : 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="kl-foot">
                <span>Geç gelen öğrenci “Geldi” sayılır</span>
              </div>
            </section>
          </div>

          {/* ===== Bu hafta ===== */}
          <section className="kl-card" aria-label="Bu hafta">
            <div className="kl-card-h">
              <div>
                <h3>Bu hafta</h3>
                <p>{haftaToplam ? `${haftaToplam} etüt · ${sureYazi(haftaDk)}` : 'Bu hafta etüdünüz yok'}</p>
              </div>
              <button type="button" className="od-link" onClick={() => go('etuts')}>
                Etütlerim <ArrowRight />
              </button>
            </div>
            <div className="kl-week">
              {hafta.map((g) => (
                <div className={'kl-day' + (g.y === bugun ? ' today' : '')} key={g.y}>
                  <div className="dh">
                    {g.gun} <b>{g.no}</b>
                  </div>
                  {g.etutler.length ? (
                    <>
                      {g.etutler.slice(0, 3).map((e) => {
                        const st = getEtutStatus(e, simdi);
                        const cls = st === 'done' ? ' ok' : isEtutAttendanceMissing(e, simdi) ? ' bad' : '';
                        return (
                          <span className={'kl-ev' + cls} key={e.id} title={dersKonu(e)}>
                            {e.time ? `${e.time} ` : ''}
                            {e.subject || 'Etüt'}
                          </span>
                        );
                      })}
                      {g.etutler.length > 3 && <span className="kl-ev mute">+{g.etutler.length - 3} etüt</span>}
                    </>
                  ) : (
                    <span className="kl-ev mute">Boş gün</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ===== Etüt öğrencilerim (özet) ===== */}
          <section className="kl-card" aria-label="Etüt öğrencilerim">
            <div className="kl-card-h">
              <div>
                <h3>Etüt öğrencilerim</h3>
                <p>Bu ay etüdüme atanan öğrencilerin özeti · liste Etütlerim sayfasında</p>
              </div>
              <button type="button" className="od-link" onClick={() => go('etuts')}>
                Etütlerim <ArrowRight />
              </button>
            </div>
            {ay.ogrSayi ? (
              <div className="kl-grid2" style={{ gap: 'calc(1.5 * var(--ak-rem))', alignItems: 'start' }}>
                <div className="kl-kpi">
                  <div>
                    <b className="tnum">{ay.ogrSayi}</b>
                    <span>öğrenci</span>
                  </div>
                  <div>
                    <b className="tnum">{ay.sinifSayi}</b>
                    <span>sınıf</span>
                  </div>
                  <div>
                    <b className="tnum">{n1(ay.ortalama)}</b>
                    <span>etüt / öğrenci</span>
                  </div>
                </div>
                <div>
                  <div className="kl-sec-l">Sınıf düzeyine göre</div>
                  <div className="kl-stack" aria-hidden="true" style={{ marginTop: 'calc(0.5 * var(--ak-rem))' }}>
                    {ay.duzeyler.map(([k, v], i) => (
                      <i key={k} style={{ width: `${(v / ay.ogrSayi) * 100}%`, background: DUZEY_RENK[i] || DUZEY_RENK[2] }} />
                    ))}
                  </div>
                  <div className="kl-leg">
                    {ay.duzeyler.map(([k, v], i) => (
                      <span key={k}>
                        <i style={{ background: DUZEY_RENK[i] || DUZEY_RENK[2] }} />
                        {k} <b>{v}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="kl-empty">Bu ay etüdünüze atanmış öğrenci yok.</div>
            )}
            {ustUste.length > 0 ? (
              <div className="kl-alert">
                <span className="ic">
                  <Users />
                </span>
                <span>
                  <b>{ustUste.length} öğrenci</b> son 2 etüdüne üst üste gelmedi
                </span>
                <button type="button" className="ak-btn sm" onClick={() => setSheet('ustuste')}>
                  Göster
                </button>
              </div>
            ) : (
              ay.ogrSayi > 0 && (
                <div className="kl-alert ok">
                  <span className="ic">✓</span>
                  <span>Son 2 etüdüne üst üste gelmeyen öğrenci yok</span>
                  <span />
                </div>
              )
            )}
          </section>
        </>
      )}
    </AnaSayfaKabuk>
  );
};

const DUZEY_RENK = ['var(--brand)', 'color-mix(in srgb, var(--brand) 55%, var(--surface))', 'color-mix(in srgb, var(--brand) 25%, var(--surface))'];
