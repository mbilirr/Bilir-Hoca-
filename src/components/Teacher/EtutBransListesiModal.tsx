import React, { useDeferredValue, useMemo, useState } from 'react';
import { FileSpreadsheet, Layers } from 'lucide-react';
import type { ClassGroup, Etut, Student } from '../../types';
import { Modal, Segmented } from '../ui/kit';
import { classLabelOf, shortDate, todayYmd } from '../../lib/etutScheduleExport';
import {
  DONEM_LABEL,
  bransOptions,
  bransScope,
  buildBransRows,
  countBrans,
  donemRange,
  downloadBransExcel,
  scopedEtuts,
  type BransDonem,
  type BransDuzen,
} from '../../lib/etutBransListesi';

// ============================================================================
// Aşama 115: Etütler › "Branş Listesi" — öğrencilerin ders ders etüt listesi (sınıf sınıf ya da toplu),
// konu ve kazanım süzgeciyle Excel. Rehberlik / idare tüm dersleri tek Excel'de (her ders ayrı sayfa) alır;
// Öğretmen ve Zümre Başkanı yalnız kendi branşını. Yalnız açıkken çizilir (tembel yüklenir).
// ============================================================================

const sel = 'h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500';
const lbl = 'block text-xs font-semibold text-muted mb-1';
const DONEMLER: BransDonem[] = ['week', 'month', 'last30', 'year', 'all', 'custom'];

export const EtutBransListesiModal: React.FC<{
  onClose: () => void;
  etuts: Etut[]; // Etütler sayfasının gördüğü etütler (dataService.getVisibleEtuts)
  students: Student[];
  classes: ClassGroup[];
}> = ({ onClose, etuts, students, classes }) => {
  const scope = useMemo(() => bransScope(), []);
  const [donem, setDonem] = useState<BransDonem>('year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(() => todayYmd());
  const [classId, setClassId] = useState('all');
  const [subject, setSubject] = useState('all');
  const [konu, setKonu] = useState('');
  const [kazanim, setKazanim] = useState('');
  const [duzen, setDuzen] = useState<BransDuzen>('sinif');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const range = useMemo(() => donemRange(donem, from, to), [donem, from, to]);
  const inScope = useMemo(() => scopedEtuts(etuts, scope, range.from, range.to), [etuts, scope, range.from, range.to]);
  const opts = useMemo(() => bransOptions(inScope, subject, konu), [inScope, subject, konu]);
  // Seçili değer listeden düştüyse (dönem / ders değişti) "tümü"ne dön
  const subj = subject === 'all' || opts.subjects.includes(subject) ? subject : 'all';
  const konuKey = !konu || opts.konular.some((k) => k.key === konu) ? konu : '';
  const kazKey = !kazanim || opts.kazanimlar.some((k) => k.key === kazanim) ? kazanim : '';
  const classOptions = useMemo(
    () => classes.map((c) => ({ id: c.id, label: classLabelOf(c) })).sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true })),
    [classes]
  );
  // Süzgeç değişince yalnız sayım yapılır (satır kurulmaz, sıralanmaz); sayım ertelenir ki seçim kutusu takılmasın
  const filters = useMemo(() => ({ classId, subject: subj, konu: konuKey, kazanim: kazKey }), [classId, subj, konuKey, kazKey]);
  const lazyFilters = useDeferredValue(filters);
  const lazyList = useDeferredValue(inScope);
  const result = useMemo(() => countBrans(lazyList, students, lazyFilters), [lazyList, students, lazyFilters]);
  const subjectCount = result.subjectCount;

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const classLabel = classId === 'all' ? 'Tüm sınıflar' : classOptions.find((o) => o.id === classId)?.label || '-';
      const donemText = donem === 'all' ? DONEM_LABEL.all : `${DONEM_LABEL[donem]} (${shortDate(range.from)} – ${shortDate(range.to)})`;
      const meta: Array<[string, string]> = [
        ['Sınıf', classLabel],
        ['Dönem', donem === 'custom' && (!from || !to) ? DONEM_LABEL.custom : donemText],
        ['Konu', konuKey ? opts.konular.find((k) => k.key === konuKey)?.label || '-' : 'Tüm konular'],
        ['Kazanım', kazKey ? opts.kazanimlar.find((k) => k.key === kazKey)?.label || '-' : 'Tüm kazanımlar'],
        ['Hazırlanma', new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })],
      ];
      const tag = (subj === 'all' ? 'Tum-Dersler' : subj).replace(/[^\p{L}\p{N}]+/gu, '-');
      const cls = (classId === 'all' ? 'Tum-Siniflar' : classOptions.find((o) => o.id === classId)?.label || 'Sinif').replace(/[^\p{L}\p{N}]+/gu, '-');
      const rows = buildBransRows(inScope, students, classes, filters); // satırlar yalnız indirirken kurulur
      await downloadBransExcel(rows, duzen, meta, `Etut-Brans-Listesi-${tag}-${cls}-${todayYmd()}`);
      setMsg({ ok: true, text: 'Excel indirildi.' });
    } catch (e) {
      console.error('[etüt branş listesi]', e);
      setMsg({ ok: false, text: 'Dosya hazırlanamadı. Lütfen tekrar deneyin.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={Layers}
      tone="info"
      id="etut-brans-modal"
      title="Branş etüt listesi"
      description={scope.all ? 'Tüm dersler; Excel’de her ders ayrı sayfa' : 'Yalnız kendi branşınızın etütleri'}
      footer={
        <>
          {msg && (
            <span role="status" id="etut-brans-msg" className={`mr-auto self-center text-xs font-semibold ${msg.ok ? 'text-success-fg' : 'text-danger-fg'}`}>
              {msg.text}
            </span>
          )}
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            id="etut-brans-excel"
            className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
            disabled={busy || !result.rows}
            onClick={() => void download()}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {busy ? 'Hazırlanıyor' : 'Excel indir'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="etut-brans-class" className={lbl}>Sınıf</label>
            <select id="etut-brans-class" className={sel} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">Tüm sınıflar</option>
              {classOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etut-brans-subject" className={lbl}>Ders</label>
            <select
              id="etut-brans-subject"
              className={sel}
              value={subj}
              onChange={(e) => {
                setSubject(e.target.value);
                setKonu('');
                setKazanim('');
              }}
            >
              <option value="all">{scope.all ? 'Tüm dersler' : 'Branşımın dersleri'}</option>
              {opts.subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className={donem === 'custom' ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
            <label htmlFor="etut-brans-donem" className={lbl}>Dönem</label>
            <select id="etut-brans-donem" className={sel} value={donem} onChange={(e) => setDonem(e.target.value as BransDonem)}>
              {DONEMLER.map((d) => (
                <option key={d} value={d}>
                  {DONEM_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          {donem === 'custom' && (
            <>
              <div>
                <label htmlFor="etut-brans-from" className={lbl}>Başlangıç</label>
                <input id="etut-brans-from" type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="etut-brans-to" className={lbl}>Bitiş</label>
                <input id="etut-brans-to" type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div className={donem === 'custom' ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
            <span className={lbl}>Liste düzeni</span>
            <Segmented<BransDuzen>
              size="sm"
              value={duzen}
              onChange={setDuzen}
              items={[
                { value: 'sinif', label: 'Sınıf sınıf', id: 'etut-brans-duzen-sinif' },
                { value: 'toplu', label: 'Toplu', id: 'etut-brans-duzen-toplu' },
              ]}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="etut-brans-konu" className={lbl}>Konu</label>
            <select
              id="etut-brans-konu"
              className={sel}
              value={konuKey}
              onChange={(e) => {
                setKonu(e.target.value);
                setKazanim('');
              }}
            >
              <option value="">Tüm konular</option>
              {opts.konular.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="etut-brans-kazanim" className={lbl}>Kazanım</label>
            <select id="etut-brans-kazanim" className={sel} value={kazKey} onChange={(e) => setKazanim(e.target.value)} disabled={!opts.kazanimlar.length}>
              <option value="">{opts.kazanimlar.length ? 'Tüm kazanımlar' : 'Kazanımlı etüt yok'}</option>
              {opts.kazanimlar.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p id="etut-brans-summary" className="rounded-lg bg-surface-2 px-3 py-2 text-fg-2">
          <strong>{result.etutCount}</strong> etüt · <strong>{result.studentCount}</strong> öğrenci · <strong>{result.rows}</strong> satır
          {subjectCount > 1 && (
            <>
              {' '}
              · <strong>{subjectCount}</strong> ders (her biri ayrı sayfa)
            </>
          )}
        </p>
        {!result.rows && <p className="text-muted">Bu seçimde etüt yok. Dönemi ya da süzgeçleri değiştirin.</p>}
        <p className="text-[11px] text-muted">
          Kazanım, etüt konusu deneme kazanım listesinden seçildiyse dolar; elle yazılan konularda boş kalır.
          {!scope.all && ' Liste, görebildiğiniz etütlerden yalnız branşınızın derslerini içerir.'}
        </p>
      </div>
    </Modal>
  );
};
