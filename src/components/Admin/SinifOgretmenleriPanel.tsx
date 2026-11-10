import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, X } from 'lucide-react';
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
  sinifDersOgretmenEkle,
  sinifDersOgretmenleri,
  trBugun,
} from '../../services/dersService';

// ============================================================================
// Aşama 218: SINIF DERS ÖĞRETMENLERİ — sınıf seçilir; her ders için bir ya da birden fazla öğretmen yazılır.
// Programda (219) bir sınıfa yalnız buradaki öğretmenler atanabilir (veritabanı da denetler).
// Öğretmen ya da ders çıkarılınca programdaki bugün ve sonraki saatleri de kapanır; geçmiş ve yoklamalar kalır.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const STORE_KEY = 'edu_ders_sinif_v1';

const sinifSirala = (a: ClassGroup, b: ClassGroup) => a.name.localeCompare(b.name, 'tr', { numeric: true });

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
  // Derse öğretmen ekleme (satır içi)
  const [ekleDers, setEkleDers] = useState<string | null>(null);
  const [ekleOgretmen, setEkleOgretmen] = useState('');

  const calis = async (is: () => Promise<unknown>) => {
    if (mesgul) return;
    setMesgul(true);
    setHata(null);
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
    void calis(async () => {
      await sinifDersOgretmenEkle(classId, d, yeniOgretmen);
      setYeniDers('');
      setYeniOgretmen('');
      setYeniAcik(false);
    });
  };

  const ogretmenEkle = (ders: string) => {
    if (!classId || !ekleOgretmen) return;
    void calis(async () => {
      await sinifDersOgretmenEkle(classId, ders, ekleOgretmen);
      setEkleDers(null);
      setEkleOgretmen('');
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
          <select className="ui-field w-36" aria-label="Sınıf" value={classId} onChange={(e) => setClassId(e.target.value)} id="sdo-sinif">
            {siniflar.length === 0 && <option value="">Sınıf yok</option>}
            {siniflar.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => setYeniAcik((v) => !v)} disabled={!classId} aria-expanded={yeniAcik} id="sdo-ders-ekle">
            <Plus className="w-3.5 h-3.5" /> Ders ekle
          </button>
        </div>
      }
    >
      <div className="space-y-3">
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
            <div className="flex gap-2">
              <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setYeniAcik(false)}>
                Vazgeç
              </button>
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={dersEkle} disabled={mesgul || !yeniDers.trim() || !yeniOgretmen}>
                Ekle
              </button>
            </div>
          </div>
        )}

        {hata && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
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
              <div key={d.ders} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                <span className="sm:w-48 shrink-0 text-xs font-semibold text-fg">{d.ders}</span>
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  {d.tids.map((tid) => (
                    <span key={tid} className="ui-chip ui-chip-brand inline-flex items-center gap-1 pr-1">
                      {ogretmenAd.get(tid) || 'Bilinmeyen öğretmen'}
                      <button
                        type="button"
                        className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-brand/10"
                        aria-label={`${ogretmenAd.get(tid) || 'Öğretmeni'} dersten çıkar`}
                        onClick={() => void ogretmenCikar(d.ders, tid)}
                        disabled={mesgul}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {ekleDers === d.ders ? (
                    <span className="inline-flex items-center gap-1.5">
                      <select className="ui-field w-48" aria-label="Eklenecek öğretmen" value={ekleOgretmen} onChange={(e) => setEkleOgretmen(e.target.value)}>
                        <option value="">Öğretmen seçin</option>
                        {ogretmenSecenekleri(d.tids)}
                      </select>
                      <button type="button" className="ui-btn ui-btn-sm ui-btn-primary h-8" onClick={() => ogretmenEkle(d.ders)} disabled={mesgul || !ekleOgretmen}>
                        Ekle
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Vazgeç" onClick={() => setEkleDers(null)}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ui-btn ui-btn-sm ui-btn-secondary h-8 border-dashed"
                      onClick={() => {
                        setEkleDers(d.ders);
                        setEkleOgretmen('');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Öğretmen
                    </button>
                  )}
                </div>
                <span className={cx('sm:w-28 shrink-0 text-xs tabular-nums', d.saat ? 'text-fg-2' : 'text-warning-fg font-semibold')}>
                  {d.saat ? `Programda ${d.saat} saat` : 'Programda yok'}
                </span>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-icon self-end sm:self-auto"
                  aria-label={`${d.ders} dersini kaldır`}
                  onClick={() => void dersKaldir(d.ders, d.saat)}
                  disabled={mesgul}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">Bir derse birden fazla öğretmen yazılabilir (ortak ders). Yoklamayı öğretmenlerden biri alır, hepsinde görünür.</p>
      </div>
    </Panel>
  );
};
