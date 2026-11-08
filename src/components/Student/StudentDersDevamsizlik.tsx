import React, { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { cx } from '../ui/kit';
import { Devamsizligim, GUN_KISA, YOKLAMA_ETIKET, YoklamaDurum, devamsizligim, isoGun, tarihUzun } from '../../services/dersService';

// ============================================================================
// Aşama 223: ÖĞRENCİ — kendi ders devamsızlığı (ders saati yoklamasından, bu eğitim yılı).
// Veri yalnız bu bölüm açılınca tek sorguyla okunur (ders_devamsizligim; yalnız kendi kayıtları).
// Ders programı kullanılmayan kurumda (hiç ders yoklaması yoksa) bölüm görünmez.
// ============================================================================

const ROWS = 15;
const RENK: Record<YoklamaDurum, string> = {
  present: 'text-success-fg',
  absent: 'text-danger-fg',
  late: 'text-warning-fg',
  excused: 'text-info-fg',
};

export const StudentDersDevamsizlik: React.FC = () => {
  const [v, setV] = useState<Devamsizligim | null | undefined>(undefined);
  const [hata, setHata] = useState<string | null>(null);
  const [tumu, setTumu] = useState(false);

  useEffect(() => {
    let canli = true;
    devamsizligim()
      .then((r) => {
        if (!canli) return;
        setV(r);
      })
      .catch((e) => canli && (setHata(e?.message || 'Devamsızlık okunamadı.'), setV(null)));
    return () => {
      canli = false;
    };
  }, []);

  if (v === undefined) return <p className="text-xs text-muted">Ders devamsızlığı okunuyor…</p>;
  if (hata) return <p className="text-xs font-semibold text-danger-fg">{hata}</p>;
  const s = v?.sayilar || {};
  const toplam = (s.present || 0) + (s.absent || 0) + (s.late || 0) + (s.excused || 0);
  if (!v || toplam === 0) return null;

  const kutular = [
    { label: 'Gelmediğim ders', value: s.absent || 0, cls: 'text-danger-fg' },
    { label: 'Gelmediğim gün', value: v.gun, cls: 'text-danger-fg' },
    { label: 'Geç kaldığım ders', value: s.late || 0, cls: 'text-warning-fg' },
    { label: 'İzinli / raporlu ders', value: s.excused || 0, cls: 'text-info-fg' },
  ];
  const liste = tumu ? v.kayitlar : v.kayitlar.slice(0, ROWS);

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" id="student-ders-devamsizlik">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2">
          <UserX className="w-4 h-4 text-danger-fg" /> Ders devamsızlığım
        </h3>
        <span className="text-[11px] text-muted">
          {tarihUzun(v.bas)} – {tarihUzun(v.bit)} · {toplam} ders saati yoklaması
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {kutular.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <span className="block text-[11px] text-muted">{k.label}</span>
            <span className={cx('block text-xl font-bold tabular-nums', k.cls)}>{k.value}</span>
          </div>
        ))}
      </div>
      {v.kayitlar.length === 0 ? (
        <p className="text-xs text-muted">Bu yıl bütün derslere katıldınız.</p>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {liste.map((k) => (
              <li key={`${k.tarih}-${k.sira}`} className="flex items-center gap-2 py-1.5 text-xs min-w-0">
                <span className="w-24 shrink-0 text-fg-2 tabular-nums">
                  {GUN_KISA[isoGun(k.tarih) - 1]} {tarihUzun(k.tarih)}
                </span>
                <span className="w-14 shrink-0 text-muted">{k.sira}. ders</span>
                <span className="flex-1 min-w-0 truncate text-fg">
                  {k.ders}
                  {k.note && <span className="text-muted"> · {k.note}</span>}
                </span>
                <span className={cx('shrink-0 font-semibold', RENK[k.status])}>{YOKLAMA_ETIKET[k.status]}</span>
              </li>
            ))}
          </ul>
          {v.kayitlar.length > ROWS && (
            <button type="button" onClick={() => setTumu((x) => !x)} className="text-[11px] font-semibold text-brand-fg hover:underline cursor-pointer">
              {tumu ? 'Daralt' : `+${v.kayitlar.length - ROWS} kayıt daha`}
            </button>
          )}
        </>
      )}
    </section>
  );
};
