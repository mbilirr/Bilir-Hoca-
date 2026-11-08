import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, FileBarChart, Landmark, UserX } from 'lucide-react';
import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student, StudentMessage, TeacherTabType } from '../../types';
import { dataService } from '../../services/dataService';
import type { setQuickFocus } from '../../lib/quickFocus';
import { isEtutAttendanceMissing } from '../../lib/etutTiming';
import { getEtutStatus, etutTeacherNames, teacherShort } from '../../lib/etutStatus';
import { BugunOzet, dersCanliDinle, ozetBugun } from '../../services/dersService';
import { Panel, cx } from '../ui/kit';
import { dersHatirlat } from '../../lib/push'; // Aşama 230

// ============================================================================
// KURUM ÖZETİ — idarenin ana sayfası. Aşama 221: SADELEŞTİ (ana sayfa hafif kalsın).
//  * Bugün etüt (yalnız bugün etüdü olan öğretmenler, saat sırasıyla)
//  * Geciken yoklama: yalnız varsa görünür (ders: bitiminden gecikme dakikası sonra; etüt: bitti, yoklama yok)
//  * Bugün derse gelmeyen öğrenci sayısı (yalnız ders yoklamasından; Aşama 223: etütle karışmaz)
//  * Ayrıntı (öğretmen etkinliği, devamsızlık, ödev oranları) → "Kurum raporu" penceresi (Yazdır + Excel)
// Ders bilgisi tek küçük sorguyla (ders_ozet_bugun) gelir; açıkken kayıt olunca canlı, 5 dakikada bir yenilenir.
// Önceki sürümdeki öğretmen etkinliği tablosu, "Son 14 gün devamsızlık" ve oran kartları ana sayfadan kalktı.
// ============================================================================

const KurumRaporu = lazy(() => import('./KurumRaporu').then((m) => ({ default: m.KurumRaporu })));

type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;
const ETUT_ROWS = 6;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  etuts: Etut[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
  messages: StudentMessage[];
  onGo: Go;
}

const ETUT_CHIP: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'Sonra', cls: 'text-muted' },
  live: { label: 'Sürüyor', cls: 'text-warning-fg' },
  done: { label: 'Yoklama alındı', cls: 'text-success-fg' },
  past: { label: 'Yoklama yok', cls: 'text-danger-fg font-semibold' },
};

export const KurumOzeti: React.FC<Props> = ({ etuts, homeworks, submissions, students, classes, onGo }) => {
  const kurumId = dataService.getMyKurum().kurumId;
  const canEtut = dataService.canUseTab('etuts');
  const canDers = dataService.canUseTab('grades');
  const todayStr = ymd(new Date());
  const [rapor, setRapor] = useState<null | 'yoklama' | 'devamsizlik' | 'ogretmen'>(null);
  const [tumEtut, setTumEtut] = useState(false);

  // Dakikada bir: etüt durumları (sürüyor / bitti) ekranda güncellensin
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // ---- Ders yoklaması özeti (sunucu; 217/221 kurulu değilse sessizce yok sayılır)
  const [ders, setDers] = useState<BugunOzet | null>(null);
  const yukle = useCallback(async () => {
    try {
      setDers(await ozetBugun());
    } catch {
      setDers(null);
    }
  }, []);
  useEffect(() => {
    if (!canDers || !kurumId) return;
    void yukle();
    const t = setInterval(() => document.visibilityState === 'visible' && void yukle(), 5 * 60_000);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar'], () => void yukle());
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [canDers, kurumId, yukle]);

  // ---- Bugünün etütleri (yalnız bugün etüdü olanlar)
  const now = new Date();
  const bugunEtut = useMemo(
    () => (canEtut ? etuts.filter((e) => e.date === todayStr).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')) : []),
    [etuts, todayStr, canEtut]
  );
  const etutEksik = bugunEtut.filter((e) => isEtutAttendanceMissing(e, now));
  const etutOgretmen = new Set(bugunEtut.flatMap((e) => etutTeacherNames(e))).size;

  // Bugün gelmeyen: YALNIZ ders yoklamasından (Aşama 223: etüt devamsızlığı buraya karışmaz; etüt ekranında ayrı)
  const dersVar = !!ders?.kayitli;
  const gelmeyen = dersVar ? ders!.gelmeyen : 0;
  const gecikenDers = ders?.gecikenler || [];
  const gecikenToplam = gecikenDers.length + etutEksik.length;

  // Aşama 230: geciken ders satırında elle "Hatırlat" (dersin öğretmenine telefon bildirimi; sunucu ders başına günde bir kez gönderir)
  const [hatirlat, setHatirlat] = useState<Record<string, { durum: 'gidiyor' | 'tamam' | 'hata'; yazi: string }>>({});
  const [sonYazi, setSonYazi] = useState('');
  const hatirlatGonder = async (classId: string, sira: number) => {
    const tarih = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const k = `${classId}|${tarih}|${sira}`;
    if (hatirlat[k]?.durum === 'gidiyor' || hatirlat[k]?.durum === 'tamam') return;
    setHatirlat((m) => ({ ...m, [k]: { durum: 'gidiyor', yazi: '' } }));
    const r = await dersHatirlat(classId, tarih, sira);
    const yazi = r.ok ? r.message || 'Hatırlatıldı.' : r.error || 'Hatırlatılamadı.';
    setHatirlat((m) => ({ ...m, [k]: { durum: r.ok ? 'tamam' : 'hata', yazi } }));
    setSonYazi(`${gecikenDers.find((x) => x.classId === classId && x.sira === sira)?.classAd || ''} · ${sira}. ders: ${yazi}`);
  };
  const hatirlatDurum = (classId: string, sira: number) =>
    hatirlat[`${classId}|${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())}|${sira}`];

  const tiles = [
    canEtut && {
      id: 'ko-etut',
      icon: CalendarDays,
      tone: 'text-info-fg bg-info-soft',
      label: 'Bugün etüt',
      value: bugunEtut.length,
      hint: bugunEtut.length ? `${etutOgretmen} öğretmen` : 'Etüt yok',
      onClick: () => onGo('etuts'),
    },
    gecikenToplam > 0 && {
      id: 'ko-geciken',
      icon: AlertTriangle,
      tone: 'text-danger-fg bg-danger-soft',
      label: 'Geciken yoklama',
      value: gecikenToplam,
      hint: [gecikenDers.length && `${gecikenDers.length} ders`, etutEksik.length && `${etutEksik.length} etüt`].filter(Boolean).join(' · '),
      onClick: () => (gecikenDers.length ? setRapor('yoklama') : onGo('etuts')),
    },
    dersVar && {
      id: 'ko-gelmeyen',
      icon: UserX,
      tone: 'text-warning-fg bg-warning-soft',
      label: 'Bugün derse gelmeyen',
      value: gelmeyen,
      hint: 'öğrenci · ders yoklaması',
      onClick: () => setRapor('devamsizlik'),
    },
  ].filter(Boolean) as Array<{ id: string; icon: React.ComponentType<{ className?: string }>; tone: string; label: string; value: number; hint: string; onClick: () => void }>;

  const gosterilenEtut = tumEtut ? bugunEtut : bugunEtut.slice(0, ETUT_ROWS);

  return (
    <Panel
      id="kurum-ozeti"
      icon={Landmark}
      tone="brand"
      title="Kurum Özeti"
      actions={
        <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-28 justify-center" onClick={() => setRapor('yoklama')} id="kurum-ozeti-rapor">
          <FileBarChart className="w-3.5 h-3.5" /> Kurum raporu
        </button>
      }
    >
      <div className="space-y-3">
        {tiles.length > 0 && (
          <div className={cx('grid grid-cols-2 gap-2', tiles.length === 3 ? '@3xl:grid-cols-3' : '')} id="kurum-ozeti-bugun">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  id={t.id}
                  type="button"
                  onClick={t.onClick}
                  className={cx(
                    'rounded-xl border bg-surface-2/60 hover:border-line-strong px-3 py-2.5 text-left cursor-pointer transition-colors min-w-0',
                    t.id === 'ko-geciken' ? 'border-danger/40' : 'border-line'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted truncate">{t.label}</span>
                    <span className={cx('w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0', t.tone)}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                  </span>
                  <span className="block mt-1 text-xl font-bold text-fg tabular-nums">{t.value}</span>
                  <span className="block text-[11px] text-muted truncate">{t.hint}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Geciken ders yoklamaları: yalnız varsa */}
        {gecikenDers.length > 0 && (
          <section className="rounded-xl border border-danger/40 bg-danger-soft/40 p-3 space-y-1.5" id="kurum-ozeti-geciken">
            <h3 className="text-xs font-bold text-danger-fg flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Yoklaması alınmayan dersler
              <span className="font-normal text-muted">· bitiminden {ders?.gecikmeDk || 40} dk sonra</span>
            </h3>
            <ul className="space-y-0.5">
              {gecikenDers.slice(0, 6).map((g) => {
                const h = hatirlatDurum(g.classId, g.sira);
                return (
                <li key={`${g.classId}-${g.sira}`} className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setRapor('yoklama')}
                    className="flex-1 flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface text-left text-xs cursor-pointer min-w-0"
                  >
                    <span className="font-semibold text-fg shrink-0">
                      {g.classAd} · {g.sira}. ders
                    </span>
                    <span className="text-fg-2 truncate">
                      {g.ders}
                      {g.teacherAdlari.length ? ` · ${g.teacherAdlari.join(', ')}` : ''}
                    </span>
                    <span className="ml-auto text-muted tabular-nums shrink-0">{g.bit}</span>
                  </button>
                  {/* Aşama 230: elle hatırlatma */}
                  <button
                    type="button"
                    onClick={() => void hatirlatGonder(g.classId, g.sira)}
                    disabled={h?.durum === 'gidiyor' || h?.durum === 'tamam'}
                    title={h?.yazi || 'Dersin öğretmenine telefon bildirimi gönderir (ders başına günde bir kez)'}
                    aria-label={`${g.classAd} ${g.sira}. ders öğretmenine hatırlat`}
                    className={cx('ui-btn ui-btn-sm h-8 w-24 shrink-0', h?.durum === 'hata' ? 'ui-btn-danger' : 'ui-btn-secondary')}
                  >
                    {h?.durum === 'gidiyor' ? 'Gönderiliyor' : h?.durum === 'tamam' ? 'Hatırlatıldı' : h?.durum === 'hata' ? 'Tekrar dene' : 'Hatırlat'}
                  </button>
                </li>
                );
              })}
            </ul>
            {sonYazi && (
              <p className="text-[11px] text-muted" aria-live="polite">
                {sonYazi}
              </p>
            )}
            {gecikenDers.length > 6 && (
              <button type="button" onClick={() => setRapor('yoklama')} className="text-[11px] font-semibold text-danger-fg hover:underline cursor-pointer">
                +{gecikenDers.length - 6} ders daha
              </button>
            )}
          </section>
        )}

        {/* Bugünün etütleri */}
        {bugunEtut.length > 0 && (
          <section className="rounded-xl border border-line p-3 space-y-1.5" id="kurum-ozeti-etut">
            <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-info-fg" /> Bugünün etütleri
            </h3>
            <ul className="divide-y divide-line">
              {gosterilenEtut.map((e) => {
                const st = getEtutStatus(e, now);
                const chip = st === 'past' && !isEtutAttendanceMissing(e, now) ? { label: 'Bitti', cls: 'text-muted' } : ETUT_CHIP[st];
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onGo('etuts')}
                      className="w-full flex items-center gap-2 py-1.5 text-left text-xs cursor-pointer hover:bg-surface-2 rounded-md px-1 min-w-0"
                    >
                      <span className="w-11 shrink-0 tabular-nums text-fg-2">{e.time || '—'}</span>
                      <span className="font-semibold text-fg truncate">{e.subject}</span>
                      <span className="text-muted truncate">{teacherShort(etutTeacherNames(e))}</span>
                      <span className={cx('ml-auto shrink-0 text-[11px]', chip.cls)}>{chip.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {bugunEtut.length > ETUT_ROWS && (
              <button type="button" onClick={() => setTumEtut((v) => !v)} className="text-[11px] font-semibold text-brand-fg hover:underline cursor-pointer" id="kurum-ozeti-tumu">
                {tumEtut ? 'Daralt' : `+${bugunEtut.length - ETUT_ROWS} etüt daha`}
              </button>
            )}
          </section>
        )}
      </div>

      {rapor && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </Panel>
  );
};
