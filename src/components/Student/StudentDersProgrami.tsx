import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../ui/kit';
import {
  GUN_ADLARI,
  OgrenciProgram,
  YOKLAMA_ETIKET,
  YoklamaDurum,
  gunEkle,
  haftaBasi,
  isoGun,
  ogrenciProgrami,
  tarihUzun,
  trBugun,
} from '../../services/dersService';

// ============================================================================
// Aşama 231: ÖĞRENCİ — kendi sınıfının haftalık ders programı (salt okunur).
// Veri tek sorguyla gelir (ders_programim; yalnız kendi sınıfı, kendi yoklama durumu). Öğrenci ders tablolarını
// doğrudan okuyamadığı için canlı kanal yok: sekmeye dönünce ve 5 dakikada bir yenilenir.
// Ders programı kullanılmayan kurumda bölüm hiç görünmez.
// ============================================================================

const DURUM_RENK: Record<YoklamaDurum, string> = {
  present: 'text-success-fg',
  absent: 'text-danger-fg',
  late: 'text-warning-fg',
  excused: 'text-info-fg',
};

export const StudentDersProgrami: React.FC = () => {
  const bugun = trBugun(); // Aşama 234: Türkiye günü (sunucu saati)
  const [bas, setBas] = useState(() => haftaBasi(bugun));
  const [v, setV] = useState<OgrenciProgram | null | undefined>(undefined);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      setV(await ogrenciProgrami(bas));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Ders programı okunamadı.');
      setV((cur) => (cur === undefined ? null : cur));
    }
  }, [bas]);

  useEffect(() => {
    void yukle();
    const gorunur = () => document.visibilityState === 'visible' && void yukle();
    document.addEventListener('visibilitychange', gorunur);
    const t = setInterval(() => document.visibilityState === 'visible' && void yukle(), 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', gorunur);
      clearInterval(t);
    };
  }, [yukle]);

  const ayar = v?.ayar || null;
  const tatil = useMemo(() => new Map((v?.tatiller || []).map((t) => [t.tarih, t.aciklama])), [v]);
  const gunler = useMemo(() => [...(ayar?.gunler || [])].sort((a, b) => a - b).map((g) => gunEkle(bas, g - 1)), [ayar, bas]);
  const hucre = useMemo(() => {
    const m = new Map<string, NonNullable<OgrenciProgram>['hucreler']>();
    for (const h of v?.hucreler || []) {
      if (!m.has(h.tarih)) m.set(h.tarih, []);
      m.get(h.tarih)!.push(h);
    }
    return m;
  }, [v]);

  if (v === undefined) return null; // ilk okuma: bölüm sessizce gelir
  if (!v || !ayar?.kayitli) return hata ? <p className="text-xs font-semibold text-danger-fg">{hata}</p> : null;
  if (!v.hucreler.length && !tatil.size && bas === haftaBasi(bugun)) return null; // sınıfın programı yok

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" id="student-ders-programi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-fg" /> Ders programım{v.classAd ? ` · ${v.classAd}` : ''}
        </h3>
        <div className="flex items-center gap-1.5">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setBas(gunEkle(bas, -7))} aria-label="Önceki hafta">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-fg min-w-[8.5rem] text-center tabular-nums">
            {tarihUzun(bas)} – {tarihUzun(gunEkle(bas, 6))}
          </span>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setBas(gunEkle(bas, 7))} aria-label="Sonraki hafta">
            <ChevronRight className="w-4 h-4" />
          </button>
          {bas !== haftaBasi(bugun) && (
            <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => setBas(haftaBasi(bugun))}>
              Bu hafta
            </button>
          )}
        </div>
      </div>
      {hata && <p className="text-xs font-semibold text-danger-fg">{hata}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gunler.map((t) => {
          const hs = hucre.get(t) || [];
          return (
            <div key={t} className={cx('rounded-xl border p-2.5 space-y-1', t === bugun ? 'border-brand bg-brand-soft/40' : 'border-line')}>
              <p className="text-xs font-bold text-fg">
                {GUN_ADLARI[isoGun(t) - 1]} {tarihUzun(t)}
                {t === bugun ? ' · Bugün' : ''}
              </p>
              {tatil.has(t) ? (
                <p className="text-xs text-muted">Tatil{tatil.get(t) ? `: ${tatil.get(t)}` : ''}</p>
              ) : hs.length === 0 ? (
                <p className="text-xs text-subtle">Ders yok</p>
              ) : (
                <ul className="space-y-0.5">
                  {hs.map((h) => (
                    <li key={h.sira} className="flex items-baseline gap-2 text-xs">
                      <span className="w-12 shrink-0 text-fg-2 tabular-nums">
                        {h.sira}. {ayar.saatler[h.sira - 1]?.bas || ''}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        <span className="font-semibold text-fg">{h.ders}</span>
                        {h.teacherAdlari.length > 0 && <span className="text-muted"> · {h.teacherAdlari.join(', ')}</span>}
                      </span>
                      {h.durum && h.durum !== 'present' && (
                        <span className={cx('shrink-0 font-semibold', DURUM_RENK[h.durum])}>{YOKLAMA_ETIKET[h.durum]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
