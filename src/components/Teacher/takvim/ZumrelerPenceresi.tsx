// Akademik takvim › zümre üyeleri penceresi (Aşama 364: AkademikTakvim.tsx'ten ayrı parça, yalnız açılınca yüklenir)
import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Check, Search, Users } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { Yukleniyor } from '../../ui/Durum'; // Aşama 305
import { SelectBox } from '../FormParts';
import { dataService } from '../../../services/dataService';
import { baslik, buyuk, zumreBransUyar, zumreKaydet, zumreListesi, type ZumreUye } from '../../../services/akademikTakvimService';
import type { Teacher } from '../../../types';
import { BTN } from './ortak';

// ---------------------------------------------------------------------------- Aşama 328: zümre üyeleri (hatırlatma)
const KURALLAR: { ust: string; alt: string }[] = [
  { ust: 'Okul dışı', alt: '12 gün önce' },
  { ust: 'Okul içi', alt: '6 gün önce' },
  { ust: 'Ay içinde', alt: 'önceki ay sonu' },
];
export const ZumrelerPenceresi: React.FC<{
  acik: boolean;
  zumreler: { z: string; n: number }[];
  ilkZumre: string;
  onClose: () => void;
  onBitti: (text: string) => void;
}> = ({ acik, zumreler, ilkZumre, onClose, onBitti }) => {
  const [kayitli, setKayitli] = useState<Record<string, ZumreUye[]> | null>(null);
  const [baskanlar, setBaskanlar] = useState<Set<string>>(new Set());
  const [taslak, setTaslak] = useState<Record<string, ZumreUye[]>>({});
  const [zumre, setZumre] = useState('');
  const [q, setQ] = useState('');
  const [not, setNot] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const ogretmenler: Teacher[] = useMemo(
    () =>
      acik
        ? dataService
            .getTeachers()
            .filter((t) => t.status !== 'pending' && t.status !== 'rejected' && t.status !== 'suspended' && !t.isSuspended)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        : [],
    [acik]
  );

  useEffect(() => {
    if (!acik) return;
    setKayitli(null);
    setTaslak({});
    setQ('');
    setNot(null);
    setHata(null);
    setZumre(ilkZumre || zumreler.find((x) => x.n > 0)?.z || zumreler[0]?.z || '');
    let canli = true;
    zumreListesi()
      .then((r) => {
        if (!canli) return;
        setKayitli(r.uyeler);
        setBaskanlar(new Set(r.baskanlar));
      })
      .catch((e: any) => canli && (setHata(e?.message || 'Zümreler okunamadı.'), setKayitli({})));
    return () => {
      canli = false;
    };
  }, [acik, ilkZumre, zumreler]);

  const uyeler = (z: string): ZumreUye[] => taslak[z] ?? kayitli?.[z] ?? [];
  const secili = uyeler(zumre);
  const seciliMi = (id: string) => secili.some((u) => u.teacherId === id);
  const degisti = Object.keys(taslak);
  const yaz = (list: ZumreUye[]) => {
    setNot(null);
    setTaslak((p) => ({ ...p, [zumre]: list }));
  };
  const degistir = (id: string) => yaz(seciliMi(id) ? secili.filter((u) => u.teacherId !== id) : [...secili, { teacherId: id, baskan: false }]);
  const baskanYap = (id: string) => yaz(secili.map((u) => (u.teacherId === id ? { ...u, baskan: !u.baskan } : u)));
  const oner = () => {
    const yeni = ogretmenler.filter((t) => zumreBransUyar(zumre, t.branch) && !seciliMi(t.id));
    if (!yeni.length) {
      setNot('Bu zümre için branştan yeni öneri çıkmadı; öğretmenleri listeden seçin.');
      return;
    }
    yaz([...secili, ...yeni.map((t) => ({ teacherId: t.id, baskan: baskanlar.has(t.id) }))]);
    setNot(`${yeni.length} öğretmen branşına göre eklendi. Kontrol edip kaydedin.`);
  };
  const kaydet = async () => {
    setMesgul(true);
    setHata(null);
    try {
      for (const z of degisti) await zumreKaydet(z, taslak[z]);
      onBitti(degisti.length === 1 ? `${baslik(degisti[0])} kaydedildi.` : `${degisti.length} zümre kaydedildi.`);
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const gorunen = ogretmenler.filter((t) => !q.trim() || buyuk(`${t.name} ${t.branch || ''}`).includes(buyuk(q)));
  const baskanSay = secili.filter((u) => u.baskan).length;

  return (
    <Modal
      open={acik}
      onClose={onClose}
      size="lg"
      icon={Users}
      title="Zümreler"
      description="Öğretmenler branşlarına göre zümreye kendiliğinden eklenir. Etkinlik yaklaşınca üyelere bir kez e-posta gider."
      id="akt-zumre-pencere"
      footer={
        <>
          <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onClose} disabled={mesgul}>
            Vazgeç
          </button>
          <button type="button" id="akt-zumre-kaydet" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => void kaydet()} disabled={!degisti.length || mesgul}>
            {mesgul ? 'Yazılıyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" aria-label="Hatırlatma zamanı">
          {KURALLAR.map((k) => (
            <div key={k.ust} className="rounded-xl bg-surface-2 border border-line px-3 py-2.5 min-h-[56px] flex flex-col justify-center">
              <span className="text-xs font-semibold text-muted leading-tight">{k.ust}</span>
              <b className="text-xs sm:text-sm font-bold text-fg leading-snug">{k.alt}</b>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <SelectBox id="akt-zumre-sec" aria-label="Zümre" className="ui-field w-full cursor-pointer" value={zumre} onChange={(e) => (setZumre(e.target.value), setNot(null))}>
              {zumreler.map(({ z, n }) => {
                const u = uyeler(z).length;
                return (
                  <option key={z} value={z}>
                    {`${baslik(z)} · ${u ? `${u} üye` : 'üye yok'}${n ? ` · ${n} etkinlik` : ''}`}
                  </option>
                );
              })}
            </SelectBox>
          </div>
          <button type="button" id="akt-zumre-oner" className="ui-btn ui-btn-secondary ui-btn-sm justify-center w-full sm:w-36" onClick={oner} disabled={!kayitli || !zumre}>
            Branşa göre öner
          </button>
        </div>

        {not && <p className="rounded-xl bg-brand-soft text-brand-fg text-xs font-semibold px-3 py-2.5">{not}</p>}
        {hata && <p className="rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}

        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center gap-2 px-3 h-11 border-b border-line bg-surface-2">
            <Search className="w-4 h-4 text-subtle shrink-0" aria-hidden />
            <input
              id="akt-zumre-ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Öğretmen ya da branş ara"
              className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
            <span className="text-xs font-semibold text-muted tabular-nums shrink-0">
              {secili.length} üye{baskanSay ? ` · ${baskanSay} başkan` : ''}
            </span>
          </div>
          {!kayitli ? (
            <div className="p-6">
              <Yukleniyor />
            </div>
          ) : !gorunen.length ? (
            <p className="p-6 text-center text-xs text-muted">{ogretmenler.length ? 'Aramaya uyan öğretmen yok.' : 'Kurumda öğretmen yok.'}</p>
          ) : (
            <ul className="max-h-[44vh] overflow-y-auto divide-y divide-line" role="list">
              {gorunen.map((t) => {
                const on = seciliMi(t.id);
                const uye = secili.find((u) => u.teacherId === t.id);
                const baskan = uye?.baskan || false;
                return (
                  <li key={t.id} className={cx('flex items-center gap-3 px-3 h-14 transition-colors', on ? 'bg-brand-soft/40' : 'hover:bg-surface-2')}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => degistir(t.id)} className="flex-1 min-w-0 flex items-center gap-3 h-full text-left cursor-pointer">
                      <span className={cx('w-5 h-5 shrink-0 rounded-lg border grid place-items-center transition-colors', on ? 'bg-brand border-brand text-white' : 'bg-surface border-line-strong')}>
                        {on && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <b className="block text-sm font-semibold text-fg truncate">{t.name}</b>
                        <span className="block text-xs text-muted truncate">
                          {t.branch || 'Branş yazılı değil'}
                          {baskanlar.has(t.id) ? ' · Zümre başkanı rolü' : ''}
                          {uye?.otomatik ? ' · branşından eklendi' : ''}
                        </span>
                      </span>
                    </button>
                    {on && (
                      <button
                        type="button"
                        aria-pressed={baskan}
                        onClick={() => baskanYap(t.id)}
                        className="ui-secim w-20 shrink-0 rounded-full"
                      >
                        {baskan ? 'Başkan' : 'Üye'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="flex gap-2 text-xs leading-relaxed text-muted">
          <BellRing className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>
            Etkinlik belli sınıflar içinse yalnız o sınıf düzeyinde derse giren üyelere gider; başkana her zaman gider. SMS, sistem sahibi Yönetim › Bildirim ve SMS › Akademik takvim satırından açınca gider.
          </span>
        </p>
      </div>
    </Modal>
  );
};
export default ZumrelerPenceresi;
