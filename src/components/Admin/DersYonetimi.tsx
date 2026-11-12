import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList } from 'lucide-react';
import type { ClassGroup } from '../../types';
import { cx } from '../ui/kit';
import { lazyNamed, PageLoading } from '../../lib/lazyLoad';
import { dataService } from '../../services/dataService';
import { DERS_YONETIM_KEY } from '../../lib/yonetimGecis';
import { GUN_KISA, dersAyarOku, dersCanliDinle, guncelProgram, izinListesi, sinifDersOgretmenleri } from '../../services/dersService';

// ============================================================================
// Aşama 217: Yönetim › Ders programı — kurulum sırası: Ders saatleri → Sınıf öğretmenleri → Program.
// Aşama 231: Ders saatleri bölümünde tatil günleri ve veli bildirim zamanı; Program bölümünde Excel'den yükleme.
// Aşama 232: İzinler bölümü (gün boyu izin / rapor); devamsızlık sınırı Ders saatleri altında; Program'da yazdır.
// Aşama 241: sekmeler yerine adım kartları — her adımın durumu veritabanından okunur ve canlı güncellenir
//            (ders saatleri kayıtlı mı, kaç sınıfın ders öğretmeni var, kaç sınıfın programı var, bugün kaç izinli).
// Yalnız açık bölüm yüklenir. Bütün veriler veritabanından (sql/217) okunur ve canlı güncellenir.
// ============================================================================

const DersSaatleriPanel = lazyNamed(() => import('./DersSaatleriPanel'), 'DersSaatleriPanel');
const SinifOgretmenleriPanel = lazyNamed(() => import('./SinifOgretmenleriPanel'), 'SinifOgretmenleriPanel'); // Aşama 218
const ProgramPanel = lazyNamed(() => import('./ProgramPanel'), 'ProgramPanel'); // Aşama 219
const DersTakvimPanel = lazyNamed(() => import('./DersTakvimPanel'), 'DersTakvimPanel'); // Aşama 231: tatil + veli bildirimi
const DersIzinPanel = lazyNamed(() => import('./DersIzinPanel'), 'DersIzinPanel'); // Aşama 232: gün boyu izin

type Bolum = 'saatler' | 'ogretmenler' | 'program' | 'izinler';

const STORE_KEY = DERS_YONETIM_KEY; // Aşama 245: ana sayfadaki eksik düğmeleri de bu kayıtla doğru adımı açar
const okunan = (): Bolum => {
  try {
    const v = window.sessionStorage.getItem(STORE_KEY);
    return v === 'saatler' || v === 'ogretmenler' || v === 'program' || v === 'izinler' ? v : 'saatler';
  } catch {
    return 'saatler';
  }
};

/** Adım kartlarının durumu (null = okunamadı / henüz yüklenmedi) */
interface Durum {
  saatKayitli: boolean;
  saatOzet: string;
  sinifTanimli: number; // en az bir ders öğretmeni olan sınıf
  eslesme: number;
  sinifProgramli: number; // en az bir saati dolu sınıf
  programSaat: number; // sınıf başına dolu saatlerin toplamı
  bugunIzinli: number | null; // 232 kurulu değilse null
}

/** [1,2,3,4,5] → "Pzt–Cum"; ardışık değilse "Pzt, Çar, Cum" */
const gunAraligi = (gunler: number[]): string => {
  const g = [...gunler].sort((a, b) => a - b);
  if (!g.length) return '';
  const ardisik = g.every((x, i) => i === 0 || x === g[i - 1] + 1);
  return ardisik && g.length > 2 ? `${GUN_KISA[g[0] - 1]}–${GUN_KISA[g[g.length - 1] - 1]}` : g.map((x) => GUN_KISA[x - 1]).join(', ');
};

export const DersYonetimi: React.FC<{ kurumId: string; classes: ClassGroup[] }> = ({ kurumId, classes }) => {
  const [bolum, setBolumState] = useState<Bolum>(okunan);
  const setBolum = (b: Bolum) => {
    setBolumState(b);
    try {
      window.sessionStorage.setItem(STORE_KEY, b);
    } catch {
      /* depolama kapalı */
    }
  };

  // Program bölümüyle aynı sınıf listesi (kendi kurumu + yetki verilen sınıflar)
  const siniflar = useMemo(() => {
    const granted = new Set(dataService.getMyKurum().grantedClassIds || []);
    return classes.filter((c) => (c.kurumId || '') === kurumId || granted.has(c.id));
  }, [classes, kurumId]);

  const [durum, setDurum] = useState<Durum | null>(null);
  const yukle = useCallback(async () => {
    try {
      const ayar = await dersAyarOku();
      const bugun = ayar?.bugun || '';
      const [atama, program, izin] = await Promise.all([
        sinifDersOgretmenleri(kurumId),
        guncelProgram(kurumId, bugun),
        bugun ? izinListesi(kurumId, bugun).catch(() => null) : Promise.resolve(null),
      ]);
      const ids = new Set(siniflar.map((c) => c.id));
      const saatler = new Set(program.filter((p) => ids.has(p.classId)).map((p) => `${p.classId}|${p.gun}-${p.sira}`));
      setDurum({
        saatKayitli: !!ayar?.kayitli,
        saatOzet: ayar?.kayitli ? `${ayar.dersSayisi} ders · ${gunAraligi(ayar.gunler)}` : 'Henüz kaydedilmedi',
        sinifTanimli: new Set(atama.filter((a) => ids.has(a.classId)).map((a) => a.classId)).size,
        eslesme: atama.filter((a) => ids.has(a.classId)).length,
        sinifProgramli: new Set(program.filter((p) => ids.has(p.classId)).map((p) => p.classId)).size,
        programSaat: saatler.size,
        bugunIzinli: izin ? new Set(izin.filter((x) => x.tarih === bugun).map((x) => x.studentId)).size : null,
      });
    } catch {
      setDurum(null); // adım kartları yalnız özet; asıl hata bölümün kendisinde gösterilir
    }
  }, [kurumId, siniflar]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['kurum_ders_ayar', 'sinif_ders_ogretmen', 'ders_programi', 'ders_gun_izin'], () => void yukle());
  }, [kurumId, yukle]);

  const n = siniflar.length;
  const d = durum;
  const adimlar: Array<{ value: Bolum; id: string; no: number | null; ad: string; ozet: string; tamam: boolean }> = [
    { value: 'saatler', id: 'ders-yonetim-saatler', no: 1, ad: 'Ders saatleri', ozet: d ? d.saatOzet : '…', tamam: !!d?.saatKayitli },
    {
      value: 'ogretmenler',
      id: 'ders-yonetim-ogretmenler',
      no: 2,
      ad: 'Sınıf öğretmenleri',
      ozet: d ? `${d.sinifTanimli}/${n} sınıf · ${d.eslesme} eşleşme` : '…',
      tamam: !!d && n > 0 && d.sinifTanimli >= n,
    },
    {
      value: 'program',
      id: 'ders-yonetim-program',
      no: 3,
      ad: 'Program',
      ozet: d ? `${d.sinifProgramli}/${n} sınıf dolu · ${d.programSaat} saat` : '…',
      tamam: !!d && n > 0 && d.sinifProgramli >= n,
    },
    {
      value: 'izinler',
      id: 'ders-yonetim-izinler',
      no: null, // kurulum adımı değil, günlük iş
      ad: 'İzinler',
      ozet: !d ? '…' : d.bugunIzinli === null ? 'Gün boyu izin / rapor' : d.bugunIzinli ? `Bugün ${d.bugunIzinli} öğrenci izinli` : 'Bugün izinli yok',
      tamam: false,
    },
  ];

  return (
    <div className="space-y-3" id="ders-yonetimi">
      <div role="tablist" aria-label="Ders programı bölümleri" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {adimlar.map((a) => {
          const acik = bolum === a.value;
          return (
            <button
              key={a.value}
              id={a.id}
              type="button"
              role="tab"
              aria-selected={acik}
              onClick={() => setBolum(a.value)}
              className={cx(
                'flex h-16 min-w-0 items-center gap-3 rounded-xl border bg-surface px-3.5 text-left',
                'transition-[border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.99]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
                acik ? 'border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_14%,transparent)]' : 'border-line hover:border-line-strong'
              )}
            >
              <span
                className={cx(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold transition-colors duration-150',
                  acik ? 'bg-brand text-white' : a.tamam ? 'bg-success-soft text-success-fg' : 'bg-surface-2 text-muted'
                )}
                aria-hidden="true"
              >
                {a.no === null ? <ClipboardList className="h-4 w-4" /> : a.tamam && !acik ? <Check className="h-4 w-4" /> : a.no}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-fg">{a.ad}</span>
                <span className="block truncate text-xs text-muted tabular-nums">
                  {a.ozet}
                </span>
              </span>
              {a.tamam && <span className="sr-only">(tamam)</span>}
            </button>
          );
        })}
      </div>
      <Suspense fallback={<PageLoading />}>
        {bolum === 'saatler' && (
          <div className="space-y-3">
            <DersSaatleriPanel kurumId={kurumId} />
            <DersTakvimPanel kurumId={kurumId} />
          </div>
        )}
        {bolum === 'ogretmenler' && <SinifOgretmenleriPanel kurumId={kurumId} classes={classes} />}
        {bolum === 'program' && <ProgramPanel kurumId={kurumId} classes={classes} />}
        {bolum === 'izinler' && <DersIzinPanel kurumId={kurumId} classes={classes} />}
      </Suspense>
    </div>
  );
};
