import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, ClipboardCheck, History, PenLine, RefreshCw, UserRound } from 'lucide-react';
import type { Student } from '../../types';
import { EmptyState, IconBox, Segmented, cx, type Tone } from '../ui/kit';
import { Yukleniyor, YuklemeHatasi } from '../ui/Durum';
import { StudentSearchSelect } from '../Common/StudentSearchSelect';
import { GECMIS_SAYFA, gecmisMetni, islemGecmisiOku, type GecmisSatir, type GecmisTur } from '../../services/islemGecmisi';

// ============================================================================
// Aşama 307: İŞLEM GEÇMİŞİ (Yönetim › İşlem geçmişi; kurum yöneticisi, rol yetkileri açıkken müdür / müdür yrd.)
// Not, günlük yoklama, ders yoklaması ve öğrenci bilgisinde kim neyi ne zaman değiştirdi. Yalnız okunur.
// Süzgeç: tür, öğrenci, süre. Gün gün başlıklar; öğrenci adına basınca o öğrencinin geçmişi süzülür.
// Sayfa 50'şer okunur ("Daha eski kayıtlar").
// ============================================================================

type TurSecim = 'hepsi' | GecmisTur;
const TURLER: Array<{ value: TurSecim; label: string; id: string }> = [
  { value: 'hepsi', label: 'Hepsi', id: 'gecmis-tur-hepsi' },
  { value: 'not', label: 'Notlar', id: 'gecmis-tur-not' },
  { value: 'yoklama', label: 'Yoklama', id: 'gecmis-tur-yoklama' },
  { value: 'ders_yoklama', label: 'Ders yoklaması', id: 'gecmis-tur-ders' },
  { value: 'ogrenci', label: 'Öğrenci bilgisi', id: 'gecmis-tur-ogrenci' },
];
const SURELER = [
  { value: '7', label: '7 gün', id: 'gecmis-sure-7' },
  { value: '30', label: '30 gün', id: 'gecmis-sure-30' },
  { value: '365', label: '1 yıl', id: 'gecmis-sure-365' },
];
// Süzgeç satırındaki kutular sekme grubuyla (Segmented: h-8 + iç boşluk + kenar) aynı boyda ve köşede
const KUTU = 'h-[calc(2.5rem+2px)] rounded-xl';
const IKON: Record<GecmisTur, { icon: React.ComponentType<{ className?: string }>; tone: Tone; ad: string }> = {
  not: { icon: PenLine, tone: 'brand', ad: 'Not' },
  yoklama: { icon: ClipboardCheck, tone: 'info', ad: 'Yoklama' },
  ders_yoklama: { icon: CalendarCheck, tone: 'warning', ad: 'Ders yoklaması' },
  ogrenci: { icon: UserRound, tone: 'success', ad: 'Öğrenci bilgisi' },
};

const gunAnahtari = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const gunBasligi = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const bugun = new Date();
  const dun = new Date();
  dun.setDate(bugun.getDate() - 1);
  if (gunAnahtari(iso) === gunAnahtari(bugun.toISOString())) return 'Bugün';
  if (gunAnahtari(iso) === gunAnahtari(dun.toISOString())) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', year: d.getFullYear() === bugun.getFullYear() ? undefined : 'numeric' });
};
const saat = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export const IslemGecmisiPanel: React.FC<{ students: Student[] }> = ({ students }) => {
  const [tur, setTur] = useState<TurSecim>('hepsi');
  const [ogrenciId, setOgrenciId] = useState('');
  const [gun, setGun] = useState<number>(30);
  const [rows, setRows] = useState<GecmisSatir[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [devami, setDevami] = useState(false);
  const [dahaOkunuyor, setDahaOkunuyor] = useState(false);
  const sira = useRef(0); // süzgeç hızlı değişirse yalnız son okumanın sonucu yazılır

  const sirali = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name, 'tr')), [students]);
  const suzgec = useMemo(() => ({ tur: tur === 'hepsi' ? null : tur, ogrenciId: ogrenciId || null, gun }), [tur, ogrenciId, gun]);

  const oku = useCallback(async () => {
    const benim = ++sira.current;
    setHata(null);
    try {
      const list = await islemGecmisiOku(suzgec);
      if (benim !== sira.current) return;
      setRows(list);
      setDevami(list.length >= GECMIS_SAYFA);
    } catch (e: any) {
      if (benim !== sira.current) return;
      setRows([]);
      setDevami(false);
      setHata(e?.message || 'İşlem geçmişi okunamadı.');
    }
  }, [suzgec]);
  useEffect(() => {
    setRows(null);
    void oku();
  }, [oku]);

  const daha = async () => {
    const son = rows?.[rows.length - 1];
    if (!son || dahaOkunuyor) return;
    const benim = sira.current;
    setDahaOkunuyor(true);
    try {
      const list = await islemGecmisiOku({ ...suzgec, once: son });
      if (benim !== sira.current) return;
      setRows((r) => [...(r || []), ...list]);
      setDevami(list.length >= GECMIS_SAYFA);
    } catch (e: any) {
      if (benim === sira.current) setHata(e?.message || 'Daha eski kayıtlar okunamadı.');
    } finally {
      setDahaOkunuyor(false);
    }
  };

  // Gün gün gruplar
  const gruplar = useMemo(() => {
    const out: Array<{ anahtar: string; baslik: string; satirlar: GecmisSatir[] }> = [];
    for (const r of rows || []) {
      const k = gunAnahtari(r.zaman);
      const son = out[out.length - 1];
      if (son && son.anahtar === k) son.satirlar.push(r);
      else out.push({ anahtar: k, baslik: gunBasligi(r.zaman), satirlar: [r] });
    }
    return out;
  }, [rows]);

  return (
    <section className="ui-card ui-card-pad space-y-3" id="islem-gecmisi-panel" aria-labelledby="islem-gecmisi-baslik">
      <div className="flex items-start gap-3">
        <IconBox icon={History} tone="brand" />
        <div className="min-w-0">
          <h2 id="islem-gecmisi-baslik" className="text-base font-bold text-fg">
            İşlem geçmişi
          </h2>
          <p className="text-xs text-muted">
            Not, yoklama ve öğrenci bilgisinde kim neyi ne zaman değiştirdi. Telefon, e-posta, veli ve TC'nin kendisi yazılmaz; kayıtlar 2 yıl saklanır.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <Segmented size="sm" value={tur} onChange={setTur} items={TURLER} />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <StudentSearchSelect
            id="gecmis-ogrenci"
            students={sirali}
            value={ogrenciId}
            onChange={setOgrenciId}
            placeholder="Bütün öğrenciler"
            clearLabel="Bütün öğrenciler"
            ariaLabel="Öğrenci"
            className={cx('ui-field cursor-pointer w-full sm:w-60', KUTU)}
          />
          <Segmented size="sm" value={String(gun)} onChange={(v) => setGun(Number(v))} items={SURELER} className="shrink-0" />
          <button
            type="button"
            className={cx('ui-btn ui-btn-secondary ui-btn-sm w-[calc(2.5rem+2px)] !px-0 justify-center shrink-0', KUTU)}
            onClick={() => {
              setRows(null);
              void oku();
            }}
            aria-label="Yenile"
            title="Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hata && <YuklemeHatasi mesaj={hata} onTekrar={oku} />}

      {rows === null ? (
        <Yukleniyor metin="Okunuyor…" className="py-4" />
      ) : rows.length === 0 ? (
        !hata && (
          <EmptyState
            icon={History}
            title="Bu sürede kayıt yok"
            description="Kayıt, işlem geçmişi kurulduktan sonra yapılan değişikliklerle başlar."
            className="py-8"
          />
        )
      ) : (
        <div className="space-y-3">
          {gruplar.map((g) => (
            <div key={g.anahtar}>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted px-1 pb-1.5">{g.baslik}</h3>
              <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                {g.satirlar.map((r) => {
                  const ik = IKON[r.tur] || IKON.not;
                  const ad = r.ogrenciAd || r.sinifAd || '—';
                  return (
                    <li key={`${r.kaynak}-${r.kid}`} className="flex items-start gap-3 px-3 py-2.5 bg-surface">
                      <time dateTime={r.zaman} className="w-10 shrink-0 pt-1 text-xs tabular-nums text-muted">
                        {saat(r.zaman)}
                      </time>
                      <span title={ik.ad} className="pt-0.5">
                        <IconBox icon={ik.icon} tone={r.islem === 'sil' ? 'danger' : ik.tone} size="sm" className="!w-7 !h-7" />
                        <span className="sr-only">{ik.ad}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg leading-snug">
                          {r.ogrenciId && !ogrenciId ? (
                            <button
                              type="button"
                              className="font-semibold hover:underline underline-offset-2 focus-visible:underline text-left"
                              onClick={() => setOgrenciId(r.ogrenciId || '')}
                              title="Bu öğrencinin geçmişi"
                            >
                              {ad}
                            </button>
                          ) : (
                            <span className="font-semibold">{ad}</span>
                          )}
                          {r.ogrenciAd && r.sinifAd && <span className="text-muted"> · {r.sinifAd}</span>}
                        </p>
                        <p className="text-xs text-fg-2 mt-0.5 break-words">{gecmisMetni(r)}</p>
                        <p className="text-xs text-muted mt-0.5 sm:hidden truncate">{r.kimAd}</p>
                      </div>
                      <span className="hidden sm:block shrink-0 max-w-[14rem] truncate pt-1 text-xs text-muted" title={r.kimAd}>
                        {r.kimAd}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {devami && (
            <div className="flex justify-center">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-44 justify-center" onClick={() => void daha()} disabled={dahaOkunuyor} aria-busy={dahaOkunuyor}>
                {dahaOkunuyor ? 'Okunuyor…' : 'Daha eski kayıtlar'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
