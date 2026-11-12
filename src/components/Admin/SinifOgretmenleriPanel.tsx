import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Plus, Trash2, X } from 'lucide-react';
import type { ClassGroup, Teacher } from '../../types';
import { Panel, cx } from '../ui/kit';
import { appConfirm } from '../../lib/appDialog';
import { dataService } from '../../services/dataService';
import { subjectsForLevel } from '../../lib/subjects';
import {
  ProgramSatiri,
  SinifDersOgretmen,
  dersCanliDinle,
  guncelProgram,
  sinifDersOgretmenCikar,
  sinifDersOgretmenTopluEkle,
  sinifDersOgretmenleri,
  trBugun,
} from '../../services/dersService';
import { basHarf, dersKisa } from '../../lib/dersKisa'; // Aşama 240

// ============================================================================
// Aşama 218: SINIF DERS ÖĞRETMENLERİ — sınıf seçilir; her ders için bir ya da birden fazla öğretmen yazılır.
// Programda (219) bir sınıfa yalnız buradaki öğretmenler atanabilir (veritabanı da denetler).
// Öğretmen ya da ders çıkarılınca programdaki bugün ve sonraki saatleri de kapanır; geçmiş ve yoklamalar kalır.
// Aşama 238: ders/öğretmen eklerken aynı öğretmen aynı kademedeki diğer sınıflara da tek seferde yazılabilir
//            (ör. İngilizce öğretmeni bütün 8. sınıflara). Tek işlem; zaten yazılı olan sınıf işaretli ve kilitli görünür.
// Aşama 241: sınıf seçimi açılır liste yerine sınıf düğmeleri (kaç ders tanımlı); ders satırları hizalı ızgara:
//            ad + kısaltma / ortak ders, öğretmen kartları (baş harf), haftalık saat göstergesi.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const STORE_KEY = 'edu_ders_sinif_v1';

/** Sınıf düğmeleri: hepsi aynı en ve boy (simetri), seçili / ders tanımsız hâlleri */
const SINIF_BTN = 'h-8 w-[5.5rem] px-2 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold tabular-nums transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';
const PIP = 8; // haftalık saat göstergesindeki çubuk sayısı
const avatar = (ad: string) => basHarf(ad).replace(/\./g, '').slice(0, 2);

const sinifSirala = (a: ClassGroup, b: ClassGroup) => a.name.localeCompare(b.name, 'tr', { numeric: true });

// ---------------------------------------------------------------- Aşama 238: diğer sınıflar seçimi
/** Sınıfın kademesi: kayıtlı sınıf düzeyi, yoksa adın başındaki sayı ("8/A" → "8") */
const kademe = (c: ClassGroup) => (c.gradeLevel || '').trim() || (c.name.match(/^\s*(\d+)/)?.[1] ?? '');
const dersAnahtar = (d: string) => d.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');

/** Sınıf seçim düğmesi: yazı kadar (kısa sınıf adına uygun), seçili / zaten yazılı / boş hâlleri */
const secimCls = (durum: 'secili' | 'zaten' | 'bos') =>
  cx(
    'h-8 min-w-12 px-2.5 inline-flex items-center justify-center gap-1 rounded-lg border text-xs font-semibold tabular-nums',
    'transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed',
    durum === 'secili' && 'bg-brand border-brand text-white',
    durum === 'zaten' && 'bg-surface-2 border-line text-muted',
    durum === 'bos' && 'bg-surface border-line text-fg-2 hover:border-line-strong hover:bg-surface-2'
  );

const DigerSiniflar: React.FC<{
  id: string;
  ana: ClassGroup;
  siniflar: ClassGroup[];
  secili: string[];
  onChange: (ids: string[]) => void;
  zaten: (classId: string) => boolean;
}> = ({ id, ana, siniflar, secili, onChange, zaten }) => {
  const [hepsi, setHepsi] = useState(false);
  const k = kademe(ana);
  const digerKademeVar = !!k && siniflar.some((c) => c.id !== ana.id && kademe(c) !== k);
  const aday = siniflar.filter((c) => c.id !== ana.id && (hepsi || !k || kademe(c) === k));
  if (!siniflar.some((c) => c.id !== ana.id)) return null;
  const secilebilir = aday.filter((c) => !zaten(c.id)).map((c) => c.id);
  const tumuOn = secilebilir.length > 0 && secilebilir.every((x) => secili.includes(x));
  const ac = (v: boolean) => {
    setHepsi(v);
    if (!v) onChange(secili.filter((x) => kademe(siniflar.find((c) => c.id === x) || ana) === k));
  };
  return (
    <div className="space-y-1.5 basis-full" id={id}>
      <p className="text-[11px] font-semibold text-fg-2">Aynı öğretmeni şu sınıflara da ekle</p>
      {aday.length === 0 ? (
        <p className="text-[11px] text-muted">Bu kademede başka sınıf yok.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Diğer sınıflar">
          {secilebilir.length > 1 && (
            <button
              type="button"
              aria-pressed={tumuOn}
              className={secimCls(tumuOn ? 'secili' : 'bos')}
              onClick={() => onChange(tumuOn ? secili.filter((x) => !secilebilir.includes(x)) : Array.from(new Set([...secili, ...secilebilir])))}
            >
              {tumuOn && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
              Tümü
            </button>
          )}
          {aday.map((c) => {
            const z = zaten(c.id);
            const on = secili.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={z}
                aria-pressed={z || on}
                title={z ? 'Bu derse zaten yazılı' : undefined}
                className={secimCls(z ? 'zaten' : on ? 'secili' : 'bos')}
                onClick={() => onChange(on ? secili.filter((x) => x !== c.id) : [...secili, c.id])}
              >
                {(z || on) && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      {digerKademeVar && (
        <button type="button" className="text-[11px] font-semibold text-brand-fg hover:underline" onClick={() => ac(!hepsi)}>
          {hepsi ? 'Yalnız bu kademe' : 'Diğer kademeleri de göster'}
        </button>
      )}
    </div>
  );
};

export const SinifOgretmenleriPanel: React.FC<{ kurumId: string; classes: ClassGroup[] }> = ({ kurumId, classes }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);

  // Kurumun sınıfları + kuruma açılmış sınıflar
  const siniflar = useMemo(() => {
    const granted = new Set(dataService.getMyKurum().grantedClassIds || []);
    return classes.filter((c) => (c.kurumId || '') === kurumId || granted.has(c.id)).sort(sinifSirala);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, kurumId, tick]);

  // Kurumun onaylı öğretmenleri
  const ogretmenler = useMemo(
    () =>
      dataService
        .getAllTeachersInternal()
        .filter((t) => (t.kurumId || '') === kurumId && (t.status || 'approved') === 'approved')
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kurumId, tick]
  );
  const ogretmenAd = useMemo(() => new Map(ogretmenler.map((t) => [t.id, t.name])), [ogretmenler]);

  const [classId, setClassIdState] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(STORE_KEY) || '';
    } catch {
      return '';
    }
  });
  const setClassId = (v: string) => {
    setClassIdState(v);
    try {
      window.sessionStorage.setItem(STORE_KEY, v);
    } catch {
      /* depolama kapalı */
    }
  };
  useEffect(() => {
    if (siniflar.length && !siniflar.some((c) => c.id === classId)) setClassIdState(siniflar[0].id);
  }, [siniflar, classId]);

  const [liste, setListe] = useState<SinifDersOgretmen[] | null>(null);
  const [program, setProgram] = useState<ProgramSatiri[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null); // Aşama 238: toplu ekleme sonucu
  const [mesgul, setMesgul] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([sinifDersOgretmenleri(kurumId), guncelProgram(kurumId, trBugun())]);
      setListe(l);
      setProgram(p);
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Liste okunamadı.');
    }
  }, [kurumId]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['sinif_ders_ogretmen', 'ders_programi'], () => void yukle());
  }, [kurumId, yukle]);

  const sinif = siniflar.find((c) => c.id === classId) || null;
  // Aşama 241: sınıf düğmelerinde tanımlı ders sayısı
  const sinifDersSay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of liste || []) {
      if (!m.has(r.classId)) m.set(r.classId, new Set());
      m.get(r.classId)!.add(r.ders);
    }
    return m;
  }, [liste]);

  // Seçili sınıfın dersleri (ders adına göre gruplu)
  const dersler = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of liste || []) {
      if (r.classId !== classId) continue;
      if (!m.has(r.ders)) m.set(r.ders, []);
      m.get(r.ders)!.push(r.teacherId);
    }
    return Array.from(m.entries())
      .map(([ders, tids]) => ({
        ders,
        tids: tids.sort((a, b) => (ogretmenAd.get(a) || '').localeCompare(ogretmenAd.get(b) || '', 'tr')),
        saat: new Set(program.filter((p) => p.classId === classId && p.ders === ders).map((p) => `${p.gun}-${p.sira}`)).size,
      }))
      .sort((a, b) => a.ders.localeCompare(b.ders, 'tr'));
  }, [liste, program, classId, ogretmenAd]);

  const oneriler = useMemo(() => {
    const hazir = new Set(dersler.map((d) => d.ders));
    return subjectsForLevel(sinif?.schoolLevel || null).filter((s) => !hazir.has(s));
  }, [sinif, dersler]);

  // Yeni ders satırı
  const [yeniAcik, setYeniAcik] = useState(false);
  const [yeniDers, setYeniDers] = useState('');
  const [yeniOgretmen, setYeniOgretmen] = useState('');
  const [yeniDiger, setYeniDiger] = useState<string[]>([]); // Aşama 238
  // Derse öğretmen ekleme (satır altında)
  const [ekleDers, setEkleDers] = useState<string | null>(null);
  const [ekleOgretmen, setEkleOgretmen] = useState('');
  const [ekleDiger, setEkleDiger] = useState<string[]>([]); // Aşama 238
  // Sınıf değişince açık formlar ve seçimler sıfırlansın
  useEffect(() => {
    setEkleDers(null);
    setYeniDiger([]);
    setEkleDiger([]);
    setBilgi(null);
  }, [classId]);

  /** Bu öğretmen bu derse o sınıfta zaten yazılı mı */
  const yaziliMi = (cid: string, ders: string, tid: string) =>
    !!tid && !!ders.trim() && (liste || []).some((r) => r.classId === cid && r.teacherId === tid && dersAnahtar(r.ders) === dersAnahtar(ders));
  const sinifAdi = (cid: string) => siniflar.find((c) => c.id === cid)?.name || '';
  const sonucYaz = (tid: string, ids: string[]) => {
    if (ids.length > 1) setBilgi(`${ogretmenAd.get(tid) || 'Öğretmen'} ${ids.length} sınıfa eklendi: ${ids.map(sinifAdi).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })).join(', ')}.`);
  };

  const calis = async (is: () => Promise<unknown>) => {
    if (mesgul) return;
    setMesgul(true);
    setHata(null);
    setBilgi(null);
    try {
      await is();
      await yukle();
    } catch (e: any) {
      setHata(e?.message || 'İşlem yapılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  const dersEkle = () => {
    const d = yeniDers.trim().replace(/\s+/g, ' ');
    if (!classId || !d || !yeniOgretmen) return;
    const ids = [classId, ...yeniDiger.filter((x) => !yaziliMi(x, d, yeniOgretmen))];
    const tid = yeniOgretmen;
    void calis(async () => {
      await sinifDersOgretmenTopluEkle(ids, d, tid);
      setYeniDers('');
      setYeniOgretmen('');
      setYeniDiger([]);
      setYeniAcik(false);
      sonucYaz(tid, ids);
    });
  };

  const ogretmenEkle = (ders: string) => {
    if (!classId || !ekleOgretmen) return;
    const ids = [classId, ...ekleDiger.filter((x) => !yaziliMi(x, ders, ekleOgretmen))];
    const tid = ekleOgretmen;
    void calis(async () => {
      await sinifDersOgretmenTopluEkle(ids, ders, tid);
      setEkleDers(null);
      setEkleOgretmen('');
      setEkleDiger([]);
      sonucYaz(tid, ids);
    });
  };

  const ogretmenCikar = async (ders: string, tid: string) => {
    const saat = new Set(program.filter((p) => p.classId === classId && p.ders === ders && p.teacherId === tid).map((p) => `${p.gun}-${p.sira}`)).size;
    if (saat > 0) {
      const ok = await appConfirm({
        title: 'Öğretmen dersten çıkarılsın mı?',
        message: `${ogretmenAd.get(tid) || 'Öğretmen'} bu derste programda ${saat} saat görünüyor. Bugünden itibaren programdan da çıkar. Geçmiş günler ve alınmış yoklamalar değişmez.`,
        confirmText: 'Çıkar',
        danger: true,
      });
      if (!ok) return;
    }
    void calis(() => sinifDersOgretmenCikar(classId, ders, tid));
  };

  const dersKaldir = async (ders: string, saat: number) => {
    const ok = await appConfirm({
      title: `${ders} kaldırılsın mı?`,
      message:
        saat > 0
          ? `Bu ders programda haftada ${saat} saat. Bütün öğretmenleriyle birlikte bugünden itibaren programdan da çıkar. Geçmiş günler ve alınmış yoklamalar değişmez.`
          : 'Ders bütün öğretmenleriyle birlikte bu sınıftan kaldırılır.',
      confirmText: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    void calis(() => sinifDersOgretmenCikar(classId, ders, null));
  };

  const ekleEtiket = (n: number) => (mesgul ? 'Ekleniyor…' : n > 1 ? `${n} sınıfa ekle` : 'Ekle');

  const ogretmenSecenekleri = (haric: string[]) =>
    ogretmenler
      .filter((t) => !haric.includes(t.id))
      .map((t: Teacher) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.branch ? ` · ${t.branch}` : ''}
        </option>
      ));

  return (
    <Panel
      title="Sınıf ders öğretmenleri"
      icon={BookOpen}
      id="sinif-ders-ogretmenleri"
      description="Programda bir sınıfa yalnız buradaki öğretmenler atanabilir."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cx(BTN, 'ui-btn-primary')}
            onClick={() => {
              setYeniAcik((v) => !v);
              setYeniDiger([]);
            }}
            disabled={!classId}
            aria-expanded={yeniAcik}
            id="sdo-ders-ekle"
          >
            <Plus className="w-3.5 h-3.5" /> Ders ekle
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Aşama 241: sınıf düğmeleri — hepsi aynı ölçü; altta kaç ders tanımlı */}
        {siniflar.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sınıf" id="sdo-sinif">
            {siniflar.map((c) => {
              const on = c.id === classId;
              const n = sinifDersSay.get(c.id)?.size || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setClassId(c.id)}
                  title={`${c.name} · ${n ? `${n} ders tanımlı` : 'ders tanımlı değil'}`}
                  className={cx(
                    SINIF_BTN,
                    on ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-fg-2 hover:border-line-strong hover:bg-surface-2'
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {liste !== null && (
                    <span
                      className={cx(
                        'shrink-0 text-[10px] font-bold',
                        on ? 'text-white/80' : n ? 'text-muted' : 'text-warning-fg'
                      )}
                    >
                      {n || '!'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {yeniAcik && classId && (
          <div className="rounded-xl border border-line bg-surface-2 p-3 flex flex-wrap items-end gap-2" id="sdo-yeni">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 flex-1 min-w-[12rem]">
              Ders
              <input
                list="sdo-ders-onerileri"
                className="ui-field w-full"
                value={yeniDers}
                maxLength={60}
                onChange={(e) => setYeniDers(e.target.value)}
                placeholder="Ör. Fen Bilimleri"
              />
              <datalist id="sdo-ders-onerileri">
                {oneriler.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 flex-1 min-w-[12rem]">
              Öğretmen
              <select className="ui-field w-full" value={yeniOgretmen} onChange={(e) => setYeniOgretmen(e.target.value)}>
                <option value="">Seçin</option>
                {ogretmenSecenekleri([])}
              </select>
            </label>
            {sinif && (
              <DigerSiniflar
                id="sdo-yeni-siniflar"
                ana={sinif}
                siniflar={siniflar}
                secili={yeniDiger}
                onChange={setYeniDiger}
                zaten={(cid) => yaziliMi(cid, yeniDers, yeniOgretmen)}
              />
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setYeniAcik(false)}>
                Vazgeç
              </button>
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={dersEkle} disabled={mesgul || !yeniDers.trim() || !yeniOgretmen}>
                {ekleEtiket(1 + yeniDiger.filter((x) => !yaziliMi(x, yeniDers, yeniOgretmen)).length)}
              </button>
            </div>
          </div>
        )}

        {hata && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        )}
        {bilgi && (
          <p role="status" className="text-xs font-semibold text-success-fg" id="sdo-bilgi">
            {bilgi}
          </p>
        )}

        {liste === null && !hata ? (
          <p className="text-xs text-muted">Yükleniyor…</p>
        ) : siniflar.length === 0 ? (
          <p className="text-xs text-muted">Kurumda sınıf yok. Önce Öğrenciler sayfasından sınıf açın.</p>
        ) : dersler.length === 0 ? (
          <p className="text-xs text-muted">{sinif?.name || 'Bu sınıf'} için henüz ders yazılmadı. "Ders ekle" ile başlayın.</p>
        ) : (
          <div className="divide-y divide-line border-y border-line" id="sdo-liste">
            {dersler.map((d) => (
              <div key={d.ders} className="py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_2rem] sm:grid-cols-[12rem_minmax(0,1fr)_8.5rem_2rem] items-center gap-x-4 gap-y-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-fg" title={d.ders}>
                    {d.ders}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {d.tids.length > 1 ? 'Ortak ders · birlikte girerler' : `Kısaltma: ${dersKisa(d.ders)}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-icon justify-self-end sm:order-last"
                  aria-label={`${d.ders} dersini kaldır`}
                  title="Dersi kaldır"
                  onClick={() => void dersKaldir(d.ders, d.saat)}
                  disabled={mesgul}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-1.5 min-w-0">
                  {d.tids.map((tid) => {
                    const ad = ogretmenAd.get(tid) || 'Bilinmeyen öğretmen';
                    return (
                      <span key={tid} className="inline-flex h-8 max-w-full items-center gap-2 rounded-lg bg-surface-2 pl-1 pr-1 text-xs font-semibold text-fg">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-3 text-[10px] font-bold text-fg-2" aria-hidden="true">
                          {avatar(ad)}
                        </span>
                        <span className="truncate">{ad}</span>
                        <button
                          type="button"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                          aria-label={`${ad} dersten çıkar`}
                          title="Dersten çıkar"
                          onClick={() => void ogretmenCikar(d.ders, tid)}
                          disabled={mesgul}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    className={cx('ui-btn ui-btn-sm ui-btn-secondary h-8 w-28 justify-center border-dashed', ekleDers === d.ders && 'border-brand text-brand-fg')}
                    aria-expanded={ekleDers === d.ders}
                    onClick={() => {
                      setEkleDers(ekleDers === d.ders ? null : d.ders);
                      setEkleOgretmen('');
                      setEkleDiger([]);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Öğretmen
                  </button>
                </div>
                <span className="col-span-2 sm:col-span-1 text-xs tabular-nums" title={d.saat ? `Programda haftada ${d.saat} saat` : 'Programa yazılmamış'}>
                  <span className={cx('font-semibold', d.saat ? 'text-fg-2' : 'text-warning-fg')}>{d.saat ? `Haftada ${d.saat} saat` : 'Programda yok'}</span>
                  <span className="mt-1.5 flex gap-[3px]" aria-hidden="true">
                    {Array.from({ length: PIP }, (_, k) => (
                      <i key={k} className={cx('h-[5px] w-3 rounded-full', k < d.saat ? 'bg-success' : 'bg-surface-3')} />
                    ))}
                  </span>
                </span>
              </div>
              {/* Aşama 238: öğretmen ekleme satırın altında; aynı öğretmen diğer sınıflara da eklenebilir */}
              {ekleDers === d.ders && sinif && (
                <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3 flex flex-wrap items-end gap-3" id="sdo-ogretmen-ekle">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 w-full sm:w-64">
                    {d.ders} öğretmeni
                    <select className="ui-field w-full" value={ekleOgretmen} onChange={(e) => setEkleOgretmen(e.target.value)}>
                      <option value="">Öğretmen seçin</option>
                      {ogretmenSecenekleri(d.tids)}
                    </select>
                  </label>
                  <DigerSiniflar
                    id="sdo-ogretmen-siniflar"
                    ana={sinif}
                    siniflar={siniflar}
                    secili={ekleDiger}
                    onChange={setEkleDiger}
                    zaten={(cid) => yaziliMi(cid, d.ders, ekleOgretmen)}
                  />
                  <div className="flex gap-2 ml-auto">
                    <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setEkleDers(null)}>
                      Vazgeç
                    </button>
                    <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => ogretmenEkle(d.ders)} disabled={mesgul || !ekleOgretmen}>
                      {ekleEtiket(1 + ekleDiger.filter((x) => !yaziliMi(x, d.ders, ekleOgretmen)).length)}
                    </button>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">Bir derse birden fazla öğretmen yazılabilir (ortak ders). Yoklamayı öğretmenlerden biri alır, hepsinde görünür.</p>
      </div>
    </Panel>
  );
};
