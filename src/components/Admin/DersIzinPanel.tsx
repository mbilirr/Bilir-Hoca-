import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserX } from 'lucide-react';
import type { ClassGroup } from '../../types';
import { Panel, Segmented, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact';
import { appConfirm } from '../../lib/appDialog';
import { dataService } from '../../services/dataService';
import {
  GunIzin,
  IzinTur,
  dersCanliDinle,
  gunEkle,
  izinEkle,
  izinListesi,
  izinSil,
  tarihUzun,
  trBugun,
} from '../../services/dersService';

// ============================================================================
// Aşama 232: GÜN BOYU İZİN / RAPOR (Yönetim › Ders programı › İzinler)
//  * Seçilen öğrenciler o günlerin bütün derslerinde "İzinli" gelir; öğretmen "Gelmedi" seçse de "İzinli" kaydedilir.
//  * Önceden alınmış "Gelmedi" kayıtları da "İzinli" olur (geçmiş 60 güne kadar). Devamsızlık sınırında sayılmaz.
//  * Yazma yalnız veritabanı işleviyle (sql/232); liste canlı güncellenir.
// Aşama 241: sınıf seçimi açılır liste yerine eşit boy sınıf düğmeleri (bugün izinli sayısı); öğrenciler seçilebilir
//            satırlar (bugün izinli olan işaretli); yazılı izinler türüne göre renkli etiketle. İki panel geniş ekranda yan yana.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
/** Sınıf düğmeleri: hepsi aynı en ve boy (Sınıf öğretmenleri ile aynı ölçü) */
const SINIF_BTN =
  'h-8 w-[5.5rem] px-2 inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold tabular-nums transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';
const TUR_ETIKET: Record<IzinTur, string> = { izinli: 'bg-brand-soft text-brand-fg', raporlu: 'bg-warning-soft text-warning-fg' };

const TUR_SECENEK: Array<{ value: IzinTur; label: string; id: string }> = [
  { value: 'izinli', label: 'İzinli', id: 'izin-tur-izinli' },
  { value: 'raporlu', label: 'Raporlu', id: 'izin-tur-raporlu' },
];

interface Grup {
  studentId: string;
  bas: string;
  bit: string;
  tur: IzinTur;
  aciklama: string;
}

/** Aynı öğrencinin ardışık, aynı türdeki günlerini tek satırda toplar */
function grupla(liste: GunIzin[]): Grup[] {
  const sirali = [...liste].sort((a, b) => (a.studentId === b.studentId ? a.tarih.localeCompare(b.tarih) : a.studentId.localeCompare(b.studentId)));
  const out: Grup[] = [];
  for (const x of sirali) {
    const son = out[out.length - 1];
    if (son && son.studentId === x.studentId && son.tur === x.tur && son.aciklama === x.aciklama && gunEkle(son.bit, 1) === x.tarih) {
      son.bit = x.tarih;
    } else out.push({ studentId: x.studentId, bas: x.tarih, bit: x.tarih, tur: x.tur, aciklama: x.aciklama });
  }
  return out.sort((a, b) => a.bas.localeCompare(b.bas));
}

export const DersIzinPanel: React.FC<{ kurumId: string; classes: ClassGroup[] }> = ({ kurumId, classes }) => {
  const bugun = trBugun(); // Aşama 234: Türkiye günü (sunucu saati)
  const siniflar = useMemo(() => {
    const granted = new Set(dataService.getMyKurum().grantedClassIds || []);
    return classes
      .filter((c) => (c.kurumId || '') === kurumId || granted.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }, [classes, kurumId]);
  const ogrenciler = useMemo(
    () =>
      dataService
        .getAllStudents()
        .filter((s) => (s.kurumId || '') === kurumId || siniflar.some((c) => c.id === s.classId))
        .filter((s) => (s.status || 'active') === 'active'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kurumId, siniflar]
  );
  const ogrAd = useMemo(() => new Map(ogrenciler.map((s) => [s.id, { ad: s.name, sinif: s.className || '' }])), [ogrenciler]);

  const [classId, setClassId] = useState('');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ bas: string; bit: string; tur: IzinTur; aciklama: string }>({ bas: bugun, bit: bugun, tur: 'izinli', aciklama: '' });
  const [liste, setListe] = useState<GunIzin[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    if (!classId && siniflar.length) setClassId(siniflar[0].id);
  }, [siniflar, classId]);
  useEffect(() => setSecili(new Set()), [classId]);

  const sinifOgr = useMemo(
    () =>
      ogrenciler
        .filter((s) => s.classId === classId)
        .sort((a, b) => (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0) || a.name.localeCompare(b.name, 'tr')),
    [ogrenciler, classId]
  );

  const yukle = useCallback(async () => {
    try {
      setListe(await izinListesi(kurumId, gunEkle(trBugun(), -14)));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Okunamadı.');
    }
  }, [kurumId]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['ders_gun_izin'], () => void yukle());
  }, [kurumId, yukle]);

  const gruplar = useMemo(() => grupla(liste || []), [liste]);
  // Aşama 241: bugün izinli / raporlu öğrenciler (sınıf düğmesi sayısı ve öğrenci satırındaki etiket)
  const bugunIzin = useMemo(() => new Map((liste || []).filter((x) => x.tarih === bugun).map((x) => [x.studentId, x.tur] as const)), [liste, bugun]);
  const sinifIzinSay = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ogrenciler) if (bugunIzin.has(s.id) && s.classId) m.set(s.classId, (m.get(s.classId) || 0) + 1);
    return m;
  }, [ogrenciler, bugunIzin]);

  const ekle = async () => {
    if (mesgul) return;
    if (secili.size === 0) {
      setMesaj('Öğrenci seçin.');
      return;
    }
    if (!form.bas || !form.bit || form.bit < form.bas) {
      setMesaj('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    setMesgul(true);
    setMesaj(null);
    try {
      const r = await izinEkle([...secili], form.bas, form.bit, form.tur, form.aciklama);
      setMesaj(`${secili.size} öğrenci için kaydedildi.${r.duzelen ? ` ${r.duzelen} "Gelmedi" kaydı "İzinli" yapıldı.` : ''}`);
      setSecili(new Set());
      setForm((f) => ({ ...f, aciklama: '' }));
      await yukle();
    } catch (e: any) {
      setMesaj(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const sil = async (g: Grup) => {
    const ad = ogrAd.get(g.studentId)?.ad || 'Öğrenci';
    const ok = await appConfirm({
      title: 'İzin kaldırılsın mı?',
      message: `${ad}: ${g.bas === g.bit ? tarihUzun(g.bas) : `${tarihUzun(g.bas)} – ${tarihUzun(g.bit)}`}. Alınmış yoklamalar değişmez.`,
      confirmText: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    setMesgul(true);
    try {
      await izinSil(g.studentId, g.bas, g.bit);
      await yukle();
    } catch (e: any) {
      setMesaj(e?.message || 'Kaldırılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  const tumunuSec = () => setSecili((cur) => (cur.size === sinifOgr.length ? new Set() : new Set(sinifOgr.map((s) => s.id))));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
      <Panel
        title="Gün boyu izin / rapor"
        icon={UserX}
        id="ders-izin"
        description="Seçilen öğrenciler o günlerin bütün derslerinde İzinli sayılır; devamsızlığa ve veli bildirimine girmez."
      >
        {hata ? (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sınıf" id="ders-izin-sinif">
              {siniflar.map((c) => {
                const on = c.id === classId;
                const n = sinifIzinSay.get(c.id) || 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setClassId(c.id)}
                    title={`${c.name}${n ? ` · bugün ${n} öğrenci izinli` : ''}`}
                    className={cx(SINIF_BTN, on ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-fg-2 hover:border-line-strong hover:bg-surface-2')}
                  >
                    <span className="truncate">{c.name}</span>
                    {n > 0 && <span className={cx('shrink-0 text-[10px] font-bold', on ? 'text-white/80' : 'text-brand-fg')}>{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
                Başlangıç
                <input
                  type="date"
                  className="ui-field w-40"
                  value={form.bas}
                  onChange={(e) => setForm((f) => ({ ...f, bas: e.target.value, bit: f.bit < e.target.value ? e.target.value : f.bit }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
                Bitiş
                <input type="date" className="ui-field w-40" value={form.bit} min={form.bas} onChange={(e) => setForm((f) => ({ ...f, bit: e.target.value }))} />
              </label>
              <Segmented size="sm" value={form.tur} onChange={(t) => setForm((f) => ({ ...f, tur: t }))} items={TUR_SECENEK} />
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 flex-1 min-w-[10rem]">
                Açıklama
                <input
                  type="text"
                  maxLength={80}
                  className="ui-field w-full"
                  placeholder="İsteğe bağlı"
                  value={form.aciklama}
                  onChange={(e) => setForm((f) => ({ ...f, aciklama: e.target.value }))}
                />
              </label>
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => void ekle()} disabled={mesgul || secili.size === 0} id="ders-izin-ekle">
                <Plus className="w-3.5 h-3.5" /> Ekle ({secili.size})
              </button>
              <InfoTip text="En çok 60 günlük aralık. Aynı güne yeniden yazarsanız tür ve açıklama güncellenir." />
            </div>

            {sinifOgr.length === 0 ? (
              <p className="text-xs text-muted">Bu sınıfta öğrenci yok.</p>
            ) : (
              <div>
                <button type="button" className="text-[11px] font-semibold text-brand-fg hover:underline mb-1" onClick={tumunuSec}>
                  {secili.size === sinifOgr.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                </button>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1" id="ders-izin-ogrenciler">
                  {sinifOgr.map((s) => {
                    const on = secili.has(s.id);
                    const iz = bugunIzin.get(s.id);
                    return (
                      <li key={s.id}>
                        <label
                          className={cx(
                            'flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 text-xs transition-colors duration-150',
                            on ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-surface-2'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                            checked={on}
                            onChange={(e) =>
                              setSecili((cur) => {
                                const n = new Set(cur);
                                if (e.target.checked) n.add(s.id);
                                else n.delete(s.id);
                                return n;
                              })
                            }
                          />
                          <span className="w-8 shrink-0 text-subtle tabular-nums">{s.studentNumber || ''}</span>
                          <span className={cx('min-w-0 flex-1 truncate font-medium', on ? 'text-brand-fg' : 'text-fg')}>{s.name}</span>
                          {iz && (
                            <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', TUR_ETIKET[iz])}>
                              Bugün {iz === 'raporlu' ? 'raporlu' : 'izinli'}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Yazılı izinler" icon={UserX} id="ders-izin-liste" description="Son 14 gün ve sonrası.">
        {liste === null ? (
          <p className="text-xs text-muted">Yükleniyor…</p>
        ) : gruplar.length === 0 ? (
          <p className="text-xs text-muted">Yazılı izin yok.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {gruplar.map((g) => {
              const o = ogrAd.get(g.studentId);
              return (
                <li key={`${g.studentId}-${g.bas}`} className={cx('flex items-center gap-3 py-2', g.bit < bugun && 'opacity-60')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-fg">
                      {o ? o.ad : 'Öğrenci'}
                      {o?.sinif && <span className="font-normal text-muted"> · {o.sinif}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted tabular-nums">
                      {g.bas === g.bit ? tarihUzun(g.bas) : `${tarihUzun(g.bas)} – ${tarihUzun(g.bit)}`}
                      {g.aciklama && ` · ${g.aciklama}`}
                    </span>
                  </span>
                  <span className={cx('w-16 shrink-0 rounded-md py-0.5 text-center text-[11px] font-bold', TUR_ETIKET[g.tur])}>
                    {g.tur === 'raporlu' ? 'Raporlu' : 'İzinli'}
                  </span>
                  <button
                    type="button"
                    className="ui-btn ui-btn-sm ui-btn-ghost ui-btn-icon hover:text-danger-fg"
                    onClick={() => void sil(g)}
                    disabled={mesgul}
                    aria-label="İzni kaldır"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      </div>

      {mesaj && (
        <p role="status" className="text-xs font-semibold text-fg-2">
          {mesaj}
        </p>
      )}
    </div>
  );
};
