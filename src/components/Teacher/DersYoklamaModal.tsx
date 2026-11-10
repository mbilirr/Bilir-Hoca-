import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ClipboardCheck, History, RotateCcw, UserCheck, Users } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import {
  YOKLAMA_ETIKET,
  YoklamaAcik,
  YoklamaDurum,
  dersCanliDinle,
  tarihUzun,
  isoGun,
  GUN_ADLARI,
  yoklamaAc,
  yoklamaKaydet,
  vekilAta,
} from '../../services/dersService';
import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 220: DERS YOKLAMASI PENCERESİ — bir sınıfın bir gündeki bir ders saati.
// Liste veritabanından açılır, bütün öğrenciler tek işlemle kaydedilir (yarım kayıt olmaz).
// Ortak derste başka öğretmen kaydederse pencere haber verir (canlı).
// Aşama 232: vekil öğretmen (idare yazar), gün boyu izin rozeti, "veliye bildirildi" rozeti, değişiklik geçmişi.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const DURUMLAR: YoklamaDurum[] = ['present', 'absent', 'late', 'excused'];
const RENK: Record<YoklamaDurum, string> = {
  present: 'bg-success-soft text-success-fg ring-1 ring-success/30',
  absent: 'bg-danger-soft text-danger-fg ring-1 ring-danger/30',
  late: 'bg-warning-soft text-warning-fg ring-1 ring-warning/30',
  excused: 'bg-info-soft text-info-fg ring-1 ring-info/30',
};

export interface DersYoklamaHedef {
  classId: string;
  tarih: string;
  sira: number;
}

export const DersYoklamaModal: React.FC<{
  hedef: DersYoklamaHedef | null;
  kurumId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}> = ({ hedef, kurumId, onClose, onSaved }) => {
  const [veri, setVeri] = useState<YoklamaAcik | null>(null);
  const [durum, setDurum] = useState<Record<string, YoklamaDurum>>({});
  const [konu, setKonu] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [kayit, setKayit] = useState(false);
  const [baskasi, setBaskasi] = useState<string | null>(null); // başka öğretmen kaydetti
  const [degisti, setDegisti] = useState(false);
  const yuklenenAt = useRef<string>('');
  const degistiRef = useRef(false);
  degistiRef.current = degisti;
  const benKaydettim = useRef(false);
  const [vekilIs, setVekilIs] = useState(false);
  const [gecmisAcik, setGecmisAcik] = useState(false);

  // İdare için vekil seçimi: kurumun onaylı öğretmenleri (dersin kendi öğretmenleri hariç)
  const vekilAdaylari = useMemo(() => {
    if (!veri?.yonetici || !kurumId) return [];
    const dersinkiler = new Set(veri.teacherAdlari);
    return dataService
      .getAllTeachersInternal()
      .filter((t) => (t.kurumId || '') === kurumId && (t.status || 'approved') === 'approved' && !dersinkiler.has(t.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [veri, kurumId]);

  const vekilDegistir = async (teacherId: string) => {
    if (!hedef || vekilIs) return;
    setVekilIs(true);
    setHata(null);
    try {
      await vekilAta(hedef.classId, hedef.tarih, hedef.sira, teacherId || null);
      const v = await yoklamaAc(hedef.classId, hedef.tarih, hedef.sira);
      // işaretlenmiş yoklama bozulmasın: yalnız vekil bilgisini yenile
      setVeri((cur) => (cur ? { ...cur, vekil: v.vekil } : v));
      onSaved?.();
    } catch (e: any) {
      setHata(e?.message || 'Vekil kaydedilemedi.');
    } finally {
      setVekilIs(false);
    }
  };

  const doldur = (v: YoklamaAcik) => {
    setVeri(v);
    const d: Record<string, YoklamaDurum> = {};
    for (const o of v.ogrenciler) d[o.id] = o.status || 'present';
    setDurum(d);
    setKonu(v.oturum?.konu || '');
    yuklenenAt.current = v.oturum?.alindiAt || '';
    setDegisti(false);
    setBaskasi(null);
  };

  const yukle = useCallback(async () => {
    if (!hedef) return;
    setHata(null);
    try {
      doldur(await yoklamaAc(hedef.classId, hedef.tarih, hedef.sira));
    } catch (e: any) {
      setHata(e?.message || 'Yoklama açılamadı.');
    }
  }, [hedef]);

  useEffect(() => {
    setVeri(null);
    setDurum({});
    setKonu('');
    setGecmisAcik(false);
    if (hedef) void yukle();
  }, [hedef, yukle]);

  // Ortak derste başka biri kaydederse haber ver (kendi kaydımız hariç)
  useEffect(() => {
    if (!hedef || !kurumId) return;
    return dersCanliDinle(kurumId, ['ders_yoklama_oturum'], async () => {
      if (benKaydettim.current) return;
      try {
        const v = await yoklamaAc(hedef.classId, hedef.tarih, hedef.sira);
        const at = v.oturum?.alindiAt || '';
        if (at && at !== yuklenenAt.current) {
          if (!degistiRef.current) doldur(v);
          else setBaskasi(v.oturum?.alanAd || 'Başka bir öğretmen');
        }
      } catch {
        /* sessiz: pencere açık kalır */
      }
    });
  }, [hedef, kurumId]);
  const sayilar = useMemo(() => {
    const s: Record<YoklamaDurum, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const o of veri?.ogrenciler || []) s[durum[o.id] || 'present'] += 1;
    return s;
  }, [veri, durum]);

  const yazabilir = !!veri?.yazabilir;
  const sec = (id: string, d: YoklamaDurum) => {
    if (!yazabilir) return;
    setDurum((cur) => ({ ...cur, [id]: d }));
    setDegisti(true);
  };
  const hepsiGeldi = () => {
    if (!veri || !yazabilir) return;
    const d: Record<string, YoklamaDurum> = {};
    for (const o of veri.ogrenciler) d[o.id] = 'present';
    setDurum(d);
    setDegisti(true);
  };

  const kaydet = async () => {
    if (!veri || !hedef || kayit || !yazabilir) return;
    setKayit(true);
    setHata(null);
    benKaydettim.current = true;
    try {
      await yoklamaKaydet({
        classId: hedef.classId,
        tarih: hedef.tarih,
        sira: hedef.sira,
        konu,
        kayitlar: veri.ogrenciler.map((o) => ({ id: o.id, status: durum[o.id] || 'present', note: o.note })),
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setKayit(false);
      setTimeout(() => {
        benKaydettim.current = false;
      }, 1500);
    }
  };

  const baslik = veri ? `${veri.ders} · ${veri.classAd}` : 'Ders yoklaması';
  const alt = hedef
    ? `${GUN_ADLARI[isoGun(hedef.tarih) - 1]} ${tarihUzun(hedef.tarih)} · ${hedef.sira}. ders${veri?.bas ? ` · ${veri.bas}–${veri.bit || ''}` : ''}`
    : '';

  return (
    <Modal
      open={!!hedef}
      onClose={() => !kayit && onClose()}
      size="md"
      icon={ClipboardCheck}
      tone="success"
      title={baslik}
      description={alt}
      id="ders-yoklama-modal"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[11px] text-muted truncate">
            {veri?.oturum ? `Son kayıt: ${veri.oturum.alanAd || '—'} · ${new Date(veri.oturum.alindiAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Henüz alınmadı'}
          </span>
          <div className="flex gap-2 shrink-0">
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={kayit}>
              {yazabilir ? 'İptal' : 'Kapat'}
            </button>
            {yazabilir && (
              <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={kayit || !veri} id="ders-yoklama-kaydet">
                {kayit ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {!veri && !hata && <p className="text-xs text-muted">Yükleniyor…</p>}
      {veri && (
        <div className="space-y-3">
          {veri.teacherAdlari.length > 1 && (
            <p className="text-[11px] text-muted flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" aria-hidden="true" /> Ortak ders: {veri.teacherAdlari.join(', ')}
            </p>
          )}
          {(veri.vekil || veri.yonetici) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {veri.yonetici ? (
                <>
                  <label htmlFor="ders-yoklama-vekil" className="font-semibold text-fg-2">
                    Vekil öğretmen
                  </label>
                  <select
                    id="ders-yoklama-vekil"
                    className="ui-field h-8 w-52 text-xs"
                    value={veri.vekil?.id || ''}
                    disabled={vekilIs}
                    onChange={(e) => void vekilDegistir(e.target.value)}
                  >
                    <option value="">Vekil yok</option>
                    {veri.vekil && !vekilAdaylari.some((t) => t.id === veri.vekil!.id) && <option value={veri.vekil.id}>{veri.vekil.ad}</option>}
                    {vekilAdaylari.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {vekilIs && <span>Kaydediliyor…</span>}
                </>
              ) : (
                <span>
                  Vekil: <b className="text-fg-2">{veri.vekil?.ad}</b>
                </span>
              )}
            </div>
          )}
          {!yazabilir && <p className="text-xs font-semibold text-warning-fg">İleri tarihli dersin yoklaması alınamaz.</p>}
          {baskasi && (
            <div role="status" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-info-fg">
              {baskasi} bu yoklamayı az önce kaydetti.
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => void yukle()}>
                <RotateCcw className="w-3.5 h-3.5" /> Son hali getir
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label htmlFor="ders-yoklama-konu" className="text-xs font-semibold text-fg-2 shrink-0">
              Konu
            </label>
            <input
              id="ders-yoklama-konu"
              className="ui-field flex-1 min-w-0"
              value={konu}
              maxLength={200}
              disabled={!yazabilir}
              placeholder="İsteğe bağlı"
              onChange={(e) => {
                setKonu(e.target.value);
                setDegisti(true);
              }}
            />
            {yazabilir && (
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 shrink-0" onClick={hepsiGeldi}>
                Hepsi geldi
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2 bg-surface-2 rounded-lg px-3 py-2" aria-live="polite">
            <span>
              <b className="text-success-fg">{sayilar.present}</b> geldi
            </span>
            <span>
              <b className="text-danger-fg">{sayilar.absent}</b> gelmedi
            </span>
            <span>
              <b className="text-warning-fg">{sayilar.late}</b> geç
            </span>
            <span>
              <b className="text-info-fg">{sayilar.excused}</b> izinli
            </span>
          </div>

          {veri.ogrenciler.length === 0 ? (
            <p className="text-xs text-muted">Bu sınıfta öğrenci yok.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line" id="ders-yoklama-liste">
              {veri.ogrenciler.map((o) => {
                const d = durum[o.id] || 'present';
                return (
                  <li key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1.5">
                    <span className="text-xs text-fg min-w-0 truncate">
                      {o.no && <span className="text-subtle tabular-nums mr-2">{o.no}</span>}
                      {o.ad}
                      {o.izin && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-info-soft text-info-fg" title="İdare gün boyu izin yazdı">
                          {o.izin === 'raporlu' ? 'Raporlu' : 'İzinli'} (gün boyu)
                        </span>
                      )}
                      {o.bildirildi && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-muted" title="Veliye ders sonu bildirimi gönderildi">
                          <BellRing className="w-3 h-3" aria-hidden="true" /> Veliye bildirildi
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`${o.ad} yoklama`}>
                      {DURUMLAR.map((x) => (
                        <button
                          key={x}
                          type="button"
                          role="radio"
                          aria-checked={d === x}
                          disabled={!yazabilir}
                          onClick={() => sec(o.id, x)}
                          className={cx(
                            'h-8 min-w-[3.75rem] px-2 rounded-lg text-[11px] font-semibold transition-colors',
                            d === x ? RENK[x] : 'text-muted hover:text-fg hover:bg-surface-2',
                            !yazabilir && 'cursor-default'
                          )}
                        >
                          {YOKLAMA_ETIKET[x]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {veri.gecmis.length > 0 && (
            <div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-fg"
                aria-expanded={gecmisAcik}
                onClick={() => setGecmisAcik((x) => !x)}
                id="ders-yoklama-gecmis"
              >
                <History className="w-3.5 h-3.5" aria-hidden="true" /> Değişiklik geçmişi ({veri.gecmis.length})
              </button>
              {gecmisAcik && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-fg-2">
                  {veri.gecmis.map((g, i) => (
                    <li key={i}>
                      <span className="text-subtle tabular-nums">
                        {new Date(g.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>{' '}
                      {g.ad}: {g.eski ? YOKLAMA_ETIKET[g.eski] : '—'} → <b>{g.yeni ? YOKLAMA_ETIKET[g.yeni] : '—'}</b>
                      {g.kim && <span className="text-muted"> · {g.kim}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {hata && (
        <p role="alert" className="mt-3 text-xs font-semibold text-danger-fg">
          {hata}
        </p>
      )}
    </Modal>
  );
};
