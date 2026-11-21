import React, { useMemo, useState } from 'react';
import { Flame, LayoutGrid, Medal, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Segmented, cx } from '../ui/kit';
import { LEVEL_INFO } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, denemeEtiketleri } from '../../lib/deneme/karneModel';
import {
  HEAT_MIN_TOTAL,
  SCORE_BANDS,
  diffTone,
  filterHeat,
  heatInsights,
  netVsKurumTone,
  scoreVsClassTone,
  type ClassCombined,
  type ClassStudentRow,
  type HeatCell,
  type HeatOptions,
  type KazHeat,
} from '../../lib/deneme/sinifKarne';
import { InfoTip } from '../ui/Compact'; // Aşama 215
// Aşama 272: birleştirilmiş karnenin tasarım dili (ortak)
import { DersAd, DersBaslik, Fark, Gidis, IsiDaire, KBolum, KCizgi, KGrafikKart, KSutun, KT, KarneBant, KIRMIZI, SeviyeLejant, YESIL, Yuzde, dersRgb, rgb, tint, type RGB } from './KarneTasarim';

// ============================================================================
// Aşama 55: Sınıf Birleştirilmiş Karnesi ve Kazanım Isı Haritası (ekran)
// Hesaplar lib/deneme/sinifKarne.ts'te; PDF'ler karneModel.ts'te (aynı veriler).
// ============================================================================

/** Aşama 272: renkli kutu yerine renkli kalın yazı (birleştirilmiş karnenin tablo dili) */
const TONE_TEXT: Record<'success' | 'info' | 'warning' | 'danger', string> = {
  success: 'font-bold text-success-fg',
  info: 'font-bold text-info-fg',
  warning: 'font-bold text-warning-fg',
  danger: 'font-bold text-danger-fg',
};

const signed = (v: number | null, f: (n: number) => string = fmtScore) =>
  v === null || !Number.isFinite(v) ? '—' : Math.abs(v) < 0.005 ? '0' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`;

const DeltaPill: React.FC<{ v: number | null; f?: (n: number) => string; className?: string }> = ({ v, f = fmtScore, className }) => (
  <Fark v={v} bicim={f} ok={false} className={cx('whitespace-nowrap', className)} />
);

/** Küçük çizgi grafik (öğrencinin denemelerdeki puanı): yükselen yeşil, düşen kırmızı */
export const Sparkline: React.FC<{ values: Array<number | null>; width?: number; height?: number }> = ({ values, width = 64 }) => {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return <span className="text-2xs text-subtle">—</span>;
  return <Gidis degerler={values} renk={v[v.length - 1] >= v[0] ? YESIL : KIRMIZI} genislik={width} />;
};

// ============================================================================ Sınıf Birleştirilmiş Karnesi
type StudentSort = 'ort' | 'degisim' | 'ad';
/** Puan aralığı renkleri: seviye renkleri (yeşilden kırmızıya) */
const BAND_RGB: RGB[] = [LEVEL_INFO.iyi.rgb, tint(LEVEL_INFO.iyi.rgb, 0.55), LEVEL_INFO.tekrar.rgb, LEVEL_INFO.etut.rgb, [234, 88, 12], LEVEL_INFO.kritik.rgb];

export const ClassCombinedView: React.FC<{ data: ClassCombined | null; scopeLabel: string }> = ({ data, scopeLabel }) => {
  const [sort, setSort] = useState<StudentSort>('ort');
  const students = useMemo(() => {
    if (!data) return [] as ClassStudentRow[];
    const list = data.students.slice();
    if (sort === 'degisim') list.sort((a, b) => (b.change ?? -9999) - (a.change ?? -9999));
    else if (sort === 'ad') list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return list;
  }, [data, sort]);
  if (!data) return <p className="text-sm text-muted">Seçilen kapsamda bu sınıfın sonucu yok.</p>;
  const { summary: s, perExam, subjects: subs, exams } = data;
  const etiketler = denemeEtiketleri(exams);

  return (
    <div className="space-y-4" id="sinif-birlesik">
      <KarneBant
        ust="Sınıf birleştirilmiş karnesi"
        baslik={data.className}
        alt={`${scopeLabel} · ${exams.length} deneme · ${dateRange(exams)}`}
        cipler={[
          <>
            <Users className="-mt-0.5 mr-1 inline h-3 w-3" />
            {s.studentCount} öğrenci
          </>,
          s.participation !== null ? `Katılım %${s.participation}` : '',
          s.bestExam ? `En iyi: ${s.bestExam.exam.name} (${fmtScore(s.bestExam.avgScore)})` : '',
        ]}
        daire={{ etiket: 'Ort. puan', deger: fmtScore(s.avgScore), alt: `kurum ${fmtScore(s.kurumScore)}` }}
        yan={[
          ['Kuruma göre', `${signed(s.diff)} puan`],
          ['İlk → son deneme', `${signed(s.change)} puan`],
          ['Kurumdaki sıra', s.lastRank ? `${s.lastRank.rank} / ${s.lastRank.of}` : '—'],
        ]}
      />

      {/* Grafikler (Aşama 272: birleştirilmiş karnenin SVG grafikleri) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <KGrafikKart baslik="Ortalama puan: sınıf ve kurum" aciklama="kalın çizgi sınıf · kesik çizgi kurum ortalaması">
          <KCizgi
            etiketler={etiketler}
            seriler={[
              { ad: data.className, tur: 'ana', degerler: perExam.map((p) => p.avgScore) },
              { ad: 'Kurum ort.', tur: 'karsi', degerler: perExam.map((p) => p.kurumScore) },
            ]}
            bicim={(v) => fmtScore(v)}
          />
        </KGrafikKart>
        <KGrafikKart baslik="Kurum ortalamasına göre fark" aciklama="yeşil: sınıf kurumun üstünde · kırmızı: altında (puan)">
          <KSutun
            etiketler={etiketler}
            seriler={[{ ad: 'Fark', degerler: perExam.map((p) => p.diff), renkler: perExam.map((p) => ((p.diff ?? 0) >= 0 ? YESIL : KIRMIZI)) }]}
            bicim={(v) => signed(v)}
          />
        </KGrafikKart>
      </div>

      {/* Deneme deneme */}
      <KBolum tablo baslik="Deneme deneme sınıf sonuçları" aciklama="Ders netlerinde yeşil kurumun üstü, kırmızı altı (dersin soru sayısının %5'i kadar fark)">
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={KT.th}>Deneme</th>
              <th className={KT.thc}>Katılım</th>
              {subs.map((x, i) => (
                <DersBaslik key={x.key} ad={x.short} alt="ort. net" renk={dersRgb(x.key, i)} />
              ))}
              <th className={KT.thc}>Top. net</th>
              <th className={KT.thc}>Ort. puan</th>
              <th className={KT.thc}>Kurum</th>
              <th className={KT.thc}>Fark</th>
              <th className={KT.thc}>Kurumda sıra</th>
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {perExam.map((p) => (
              <tr key={p.exam.id} className={KT.satir}>
                <td className={KT.td}>
                  <p className="font-semibold text-fg">{p.exam.name}</p>
                  <p className="text-2xs text-muted">{dateTr(p.exam.examDate)}</p>
                </td>
                <td className={KT.tdc}>{p.n}</td>
                {subs.map((x) => {
                  const t = netVsKurumTone(p.avgNet[x.key], p.kurumNet[x.key], x.count);
                  return (
                    <td key={x.key} className={cx(KT.tdc, t ? TONE_TEXT[t] : 'text-fg-2')} title={`${x.name}: sınıf ${fmtNet(p.avgNet[x.key])} · kurum ${fmtNet(p.kurumNet[x.key])}`}>
                      {fmtNet(p.avgNet[x.key])}
                    </td>
                  );
                })}
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtNet(p.avgTotalNet)}</td>
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtScore(p.avgScore)}</td>
                <td className={cx(KT.tdc, 'text-muted')}>{fmtScore(p.kurumScore)}</td>
                <td className={KT.tdc}>
                  <DeltaPill v={p.diff} />
                </td>
                <td className={KT.tdc}>
                  {p.rank !== null ? (
                    <span className={cx('inline-flex items-center gap-1 tabular-nums', p.rank === 1 ? 'font-bold text-success-fg' : 'text-fg-2')}>
                      {p.rank === 1 && <Medal className="h-3.5 w-3.5" />}
                      {p.rank} / {p.rankOf}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </KBolum>

      {/* Yükselen / düşen */}
      {(data.risers.length > 0 || data.fallers.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {(
            [
              { key: 'up', title: 'En çok yükselen öğrenciler', list: data.risers, icon: TrendingUp, ikon: 'text-success-fg' },
              { key: 'down', title: 'En çok düşen öğrenciler', list: data.fallers, icon: TrendingDown, ikon: 'text-danger-fg' },
            ] as const
          ).map((g) => (
            <KBolum
              key={g.key}
              baslik={
                <>
                  <g.icon className={cx('h-4 w-4', g.ikon)} /> {g.title}
                </>
              }
              aciklama="ilk → son deneme"
            >
              {g.list.length === 0 ? (
                <p className="text-xs text-muted">{g.key === 'up' ? 'Puanı yükselen öğrenci yok.' : 'Puanı düşen öğrenci yok.'}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {g.list.map((st, i) => (
                    <li key={st.studentId} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="w-5 text-center font-bold text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-fg">{st.name}</span>
                      <span className="tabular-nums text-muted whitespace-nowrap">
                        {fmtScore(st.first)} → <b className="text-fg">{fmtScore(st.last)}</b>
                      </span>
                      <Sparkline values={st.scores} width={64} height={20} />
                      <DeltaPill v={st.change} className="min-w-16 text-right" />
                    </li>
                  ))}
                </ul>
              )}
            </KBolum>
          ))}
        </div>
      )}

      {/* Öğrenci × deneme */}
      <KBolum
        tablo
        baslik="Öğrenci × deneme puan tablosu"
        aciklama="Yeşil: o denemede sınıf ortalamasının en az 20 puan üstü · Kırmızı: en az 20 puan altı · —: denemeye girmedi"
        sag={
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            items={[
              { value: 'ort', label: 'Ortalamaya göre' },
              { value: 'degisim', label: 'Değişime göre' },
              { value: 'ad', label: 'Ada göre' },
            ]}
          />
        }
      >
        <div className="overflow-auto max-h-[32rem]">
          <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line w-10">#</th>
                <th className="sticky top-0 left-10 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-40">Öğrenci</th>
                {exams.map((e, i) => (
                  <th key={e.id} className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-14" title={`${e.name} · ${dateTr(e.examDate)}`}>
                    <span className="block tabular-nums">{i + 1}</span>
                    <span className="mx-auto block max-w-16 truncate text-2xs font-normal normal-case tracking-normal">{etiketler[i].ust}</span>
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Ortalama</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">İlk → son</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Gidiş</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Girdiği</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.studentId} className="group">
                  <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-2 py-1 text-center font-bold tabular-nums border-b border-line/60">{st.rank}</td>
                  <td className="sticky left-10 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1 font-semibold text-fg border-b border-line/60 whitespace-nowrap">{st.name}</td>
                  {st.scores.map((v, i) => {
                    const t = scoreVsClassTone(v, perExam[i].avgScore);
                    return (
                      <td
                        key={i}
                        className={cx('border-b border-line/60 px-1 py-1 text-center tabular-nums', v === null ? 'text-subtle' : t ? TONE_TEXT[t] : 'text-fg')}
                        title={v === null ? `${exams[i].name}: girmedi` : `${exams[i].name}: ${fmtScore(v)} (sınıf ort. ${fmtScore(perExam[i].avgScore)})`}
                      >
                        {v === null ? '—' : fmtScore(v)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center tabular-nums font-bold text-fg border-b border-line/60">{fmtScore(st.avg)}</td>
                  <td className="px-2 py-1 text-center border-b border-line/60">
                    <DeltaPill v={st.change} />
                  </td>
                  <td className="px-2 py-1 text-center border-b border-line/60">
                    <Sparkline values={st.scores} />
                  </td>
                  <td className={cx('px-2 py-1 text-center tabular-nums border-b border-line/60', st.attended < exams.length ? 'text-warning-fg font-semibold' : 'text-muted')}>
                    {st.attended}/{exams.length}
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-fg">
                <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5" />
                <td className="sticky left-10 z-10 bg-surface-2 px-3 py-1.5">Sınıf ortalaması</td>
                {perExam.map((p) => (
                  <td key={p.exam.id} className="bg-surface-2 px-1 py-1.5 text-center tabular-nums">
                    {fmtScore(p.avgScore)}
                  </td>
                ))}
                <td className="bg-surface-2 px-2 py-1.5 text-center tabular-nums">{fmtScore(s.avgScore)}</td>
                <td className="bg-surface-2 px-2 py-1.5 text-center">
                  <DeltaPill v={s.change} />
                </td>
                <td className="bg-surface-2" colSpan={2} />
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-surface px-2 py-1.5" />
                <td className="sticky left-10 z-10 bg-surface px-3 py-1.5 font-semibold text-muted">Kurum ortalaması</td>
                {perExam.map((p) => (
                  <td key={p.exam.id} className="px-1 py-1.5 text-center tabular-nums text-muted">
                    {fmtScore(p.kurumScore)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center tabular-nums text-muted">{fmtScore(s.kurumScore)}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </KBolum>

      {/* Puan dağılımı */}
      <KBolum baslik="Puan dağılımı" aciklama="Her denemede öğrencilerin puan aralıklarına dağılımı">
        <div className="space-y-2">
          {exams.map((e, ei) => {
            const total = data.bands.reduce((a, b) => a + b[ei], 0);
            return (
              <div key={e.id} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-center">
                <p className="text-xs font-semibold text-fg truncate" title={e.name}>
                  {e.name}
                </p>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                  {SCORE_BANDS.map((b, bi) => {
                    const n = data.bands[bi][ei];
                    if (!n || !total) return null;
                    const w = (n / total) * 100;
                    return (
                      <span key={b.label} className="flex h-full items-center justify-center text-3xs font-bold text-white" style={{ width: `${w}%`, background: rgb(BAND_RGB[bi]) }} title={`${b.label}: ${n} öğrenci`}>
                        {w >= 7 ? n : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-fg-2">
            {SCORE_BANDS.map((b, bi) => (
              <span key={b.label} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(BAND_RGB[bi]) }} /> {b.label}
              </span>
            ))}
          </div>
        </div>
      </KBolum>
    </div>
  );
};

// ============================================================================ Kazanım Isı Haritası
const HEAT_MODES: Array<{ value: HeatOptions['mode']; label: string }> = [
  { value: 'basari', label: 'Başarı %' },
  { value: 'fark', label: 'Kuruma göre fark' },
];
const HEAT_SORTS: Array<{ value: HeatOptions['sort']; label: string }> = [
  { value: 'kod', label: 'Müfredat sırası' },
  { value: 'zayif', label: 'En zayıf önce' },
  { value: 'fark', label: 'Sınıflar arası fark' },
];

/** Aşama 272: başarı görünümünde seviye renginde daire (birleştirilmiş karnenin ısı tablosu); fark görünümünde renkli kalın sayı */
const HeatCellView: React.FC<{ c: HeatCell | undefined; k: HeatCell; mode: HeatOptions['mode']; title: string }> = ({ c, k, mode, title }) => {
  if (!c || !c.total) return <IsiDaire v={null} title={`${title}: bu sınıfa bu kazanımdan soru düşmedi`} />;
  const few = c.total < HEAT_MIN_TOTAL;
  const diff = c.rate - k.rate;
  const tone = mode === 'fark' ? diffTone(diff) : null;
  const ipucu = `${title}\n${c.students} öğrenci · D ${c.d} · Y ${c.y} · B ${c.b}\nBaşarı %${c.rate} (kurum %${k.rate}, fark ${diff > 0 ? '+' : ''}${diff})${few ? `\n${HEAT_MIN_TOTAL}'ten az cevap: sonuç kesin değil` : ''}`;
  if (mode === 'fark')
    return (
      <span className={cx('block text-center tabular-nums', few ? 'text-muted' : tone ? TONE_TEXT[tone] : 'text-fg-2')} title={ipucu}>
        {`${diff > 0 ? '+' : ''}${diff}`}
        {few && <sup>*</sup>}
      </span>
    );
  return (
    <span className={cx('relative block', few && 'opacity-60')} title={ipucu}>
      <IsiDaire v={c.rate} title={ipucu} />
      {few && <sup className="absolute -top-0.5 right-1 text-muted">*</sup>}
    </span>
  );
};

export const KazanimIsiHaritasi: React.FC<{ heat: KazHeat | null; options: HeatOptions; onOptions: (o: HeatOptions) => void }> = ({ heat, options: o, onOptions }) => {
  const shown = useMemo(() => (heat ? filterHeat(heat, o) : null), [heat, o]);
  const ins = useMemo(() => (shown ? heatInsights(shown, 5) : null), [shown]);
  if (!heat || !heat.subjects.length) return <p className="text-sm text-muted">Seçilen denemelerde kazanım bilgisi olan sonuç yok.</p>;
  const set = (p: Partial<HeatOptions>) => onOptions({ ...o, ...p });
  const toggleClass = (id: string) => {
    const cur = o.classIds.length ? o.classIds : heat.classes.map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ classIds: next.length === heat.classes.length ? [] : next.length ? next : cur });
  };
  const allOn = !o.classIds.length;

  return (
    <div className="space-y-4" id="kazanim-isi-haritasi">
      {/* Süzgeçler */}
      <div className="ui-card ui-card-pad space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="ui-label" htmlFor="isi-ders">Ders</label>
            <select id="isi-ders" className="ui-input w-auto" value={o.subjectKey} onChange={(e) => set({ subjectKey: e.target.value })}>
              <option value="all">Bütün dersler</option>
              {heat.subjects.map((s) => (
                <option key={s.subject.key} value={s.subject.key}>
                  {s.subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="ui-label">Görünüm</p>
            <Segmented size="sm" value={o.mode} onChange={(v) => set({ mode: v })} items={HEAT_MODES} />
          </div>
          <div>
            <p className="ui-label">Sıralama</p>
            <Segmented size="sm" value={o.sort} onChange={(v) => set({ sort: v })} items={HEAT_SORTS} />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-fg-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 cursor-pointer" checked={o.onlyWeak} onChange={(e) => set({ onlyWeak: e.target.checked })} />
            Yalnızca bir sınıfta %50 altı olanlar
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sınıflar">
          <span className="text-xs font-semibold text-muted mr-1">Sınıflar:</span>
          <button type="button" aria-pressed={allOn} onClick={() => set({ classIds: [] })} className={cx('ui-chip cursor-pointer border', allOn ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line')}>
            Tümü
          </button>
          {heat.classes.map((c) => {
            const on = allOn || o.classIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleClass(c.id)}
                className={cx('ui-chip cursor-pointer border', on ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line opacity-70')}
              >
                {c.name} <span className="opacity-70 tabular-nums">{c.students}</span>
              </button>
            );
          })}
        </div>
        {o.mode === 'basari' ? (
          <SeviyeLejant sorulmadi not={`* ${HEAT_MIN_TOTAL}'ten az cevap · Hücreye gelince ayrıntı görünür`} />
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={TONE_TEXT.success}>+10 ve üstü</span>
            <span className={TONE_TEXT.info}>+5 / +9</span>
            <span className="font-bold text-fg-2">−4 / +4</span>
            <span className={TONE_TEXT.warning}>−5 / −9</span>
            <span className={TONE_TEXT.danger}>−10 ve altı</span>
            <span className="text-muted">* {HEAT_MIN_TOTAL}'ten az cevap · Hücreye gelince ayrıntı görünür</span>
          </div>
        )}
      </div>

      {/* Öne çıkanlar */}
      {ins && (ins.weakest.length > 0 || ins.widest.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-3">
          <KBolum
            baslik={
              <>
                <Flame className="h-4 w-4 text-danger-fg" /> Kurumun en zayıf kazanımları
              </>
            }
          >
            <ul className="divide-y divide-line">
              {ins.weakest.map((w) => (
                <li key={`${w.subject.key}-${w.row.key}`} className="flex items-start gap-2 py-1.5 text-xs" title={w.row.label}>
                  <DersAd ad={w.subject.short} renk={dersRgb(w.subject.key)} className="shrink-0" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-fg">{w.row.short}</span>
                  <Yuzde v={w.row.kurum.rate} className="shrink-0" />
                </li>
              ))}
            </ul>
          </KBolum>
          <KBolum
            baslik={
              <>
                <LayoutGrid className="h-4 w-4 text-warning-fg" /> Sınıflar arası en büyük fark
              </>
            }
          >
            {ins.widest.length === 0 ? (
              <p className="text-xs text-muted">Sınıflar arasında 20 puandan büyük fark yok.</p>
            ) : (
              <ul className="divide-y divide-line">
                {ins.widest.map((w) => (
                  <li key={`${w.subject.key}-${w.row.key}`} className="py-1.5 text-xs" title={w.row.label}>
                    <div className="flex items-start gap-2">
                      <DersAd ad={w.subject.short} renk={dersRgb(w.subject.key)} className="shrink-0" />
                      <span className="line-clamp-2 min-w-0 flex-1 text-fg">{w.row.short}</span>
                      <span className="shrink-0 font-bold text-warning-fg tabular-nums">{w.rate} puan</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{w.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </KBolum>
          <KBolum
            baslik={
              <>
                <Users className="h-4 w-4 text-info-fg" /> Her sınıfın en zayıf kazanımı
              </>
            }
          >
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">
              {ins.perClass.map((p) => (
                <li key={p.cls.id} className="py-1.5 text-xs">
                  <p className="font-bold text-fg">{p.cls.name}</p>
                  {p.items.length === 0 ? (
                    <p className="text-xs text-success-fg">%50 altında kazanım yok</p>
                  ) : (
                    p.items.slice(0, 2).map((it) => (
                      <p key={it.row.key} className="flex items-start gap-1.5 text-xs" title={it.row.label}>
                        <Yuzde v={it.rate} className="w-9 shrink-0" />
                        <span className="line-clamp-1 text-fg-2">
                          <DersAd ad={it.subject.short} renk={dersRgb(it.subject.key)} /> · {it.row.short}
                        </span>
                      </p>
                    ))
                  )}
                </li>
              ))}
            </ul>
          </KBolum>
        </div>
      )}

      {/* Ders ders ısı haritası */}
      {shown && shown.subjects.length === 0 && <p className="text-sm text-muted">Seçime uyan kazanım yok.</p>}
      {shown?.subjects.map((s) => (
        <KBolum
          key={s.subject.key}
          tablo
          baslik={
            <>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(dersRgb(s.subject.key)) }} />
              <DersAd ad={s.subject.name} renk={dersRgb(s.subject.key)} className="font-extrabold" />
            </>
          }
          aciklama={`${s.rows.length} kazanım · kurum başarısı %${s.kurumTotal.rate}`}
        >
          <div className="overflow-auto max-h-[36rem]">
            <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-64">Kazanım</th>
                  {shown.classes.map((c) => (
                    <th key={c.id} className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-16">
                      <span className="block text-fg">{c.name}</span>
                      <span className="block text-2xs font-normal normal-case tracking-normal">{c.students} öğr.</span>
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-16">Kurum</th>
                  <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line" title="Sınıflar arasında en yüksek ile en düşük başarı farkı">
                    Fark
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.key} className="group">
                    <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1 border-b border-line/60" title={r.label}>
                      <span className="line-clamp-2 text-fg">{r.short}</span>
                      <span className="block text-2xs text-muted">
                        {r.questions} soru · {r.examCount} deneme
                      </span>
                    </td>
                    {shown.classes.map((c) => (
                      <td key={c.id} className="border-b border-line/60 px-1 py-1">
                        <HeatCellView c={r.cells[c.id]} k={r.kurum} mode={o.mode} title={`${c.name} · ${r.short}`} />
                      </td>
                    ))}
                    <td className="border-b border-line/60 px-1 py-1 text-center">
                      <Yuzde v={r.kurum.rate} />
                    </td>
                    <td className="px-2 py-1 text-center border-b border-line/60">
                      {r.spread === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className={cx('tabular-nums font-semibold', r.spread >= 20 ? 'text-warning-fg' : 'text-muted')}>{r.spread}</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 text-fg">Ders geneli</td>
                  {shown.classes.map((c) => (
                    <td key={c.id} className="bg-surface-2 px-1 py-1">
                      <HeatCellView c={s.classTotals[c.id]} k={s.kurumTotal} mode={o.mode} title={`${c.name} · ${s.subject.name} geneli`} />
                    </td>
                  ))}
                  <td className="bg-surface-2 px-1 py-1 text-center">
                    <Yuzde v={s.kurumTotal.rate} />
                  </td>
                  <td className="bg-surface-2" />
                </tr>
              </tbody>
            </table>
          </div>
        </KBolum>
      ))}

      <p className="flex items-center gap-1 text-xs text-muted">
        Başarı ve fark nasıl hesaplanır?
        <InfoTip text='Başarı = doğru / soru (sınıfın bütün öğrencilerinin cevapları). "Fark" sütunu sınıflar arasındaki en yüksek ve en düşük başarı arasındaki farktır; 20 ve üstü turuncu gösterilir. Az sayıda cevaba (*) dayanan hücreler fark ve öne çıkanlar hesabına girmez.' />
      </p>
    </div>
  );
};
