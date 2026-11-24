// ============================================================================
// Aşama 397: Oyunlar › Öğrenciler — öğretmen kendi sınıfında son 7 günün özetini görür (sıralama/yarış yok):
// öğrenci başına çözülen soru, doğru oranı, seri, rozet; sınıfın zorlandığı konular ve "Bu konudan oyun hazırla".
// Özet sunucuda öğretmenin kendi oturumuyla görebildiği sınıftan hesaplanır.
// ============================================================================
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Gamepad2, Plus, Users } from 'lucide-react';
import { lazyNamed } from '../../../lib/lazyLoad';
import { EmptyState, Panel, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { SelectBox } from '../FormParts';
import { dataService } from '../../../services/dataService';
import { sinifGelisimi, type SinifGelisimi } from '../../../services/oyunOturumService';
import type { OyunBaslangic } from './OyunHazirla';

const OyunHazirla = lazyNamed<React.ComponentProps<typeof import('./OyunHazirla').OyunHazirla>>(() => import('./OyunHazirla'), 'OyunHazirla');

/** "Ayşe Nur Demir" → "Ayşe Nur D." (tablo dar kalsın, ad tanınsın) */
const kisaAd = (ad: string) => {
  const p = (ad || '').trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || '—';
  return `${p.slice(0, -1).join(' ')} ${p[p.length - 1][0].toLocaleUpperCase('tr-TR')}.`;
};
const yuzde = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);

export const OgrencilerPaneli: React.FC<{ onOyunHazir: () => void }> = ({ onOyunHazir }) => {
  // sınıflar her çizimde okunur (sayfa açılırken veri henüz gelmemiş olabilir)
  const siniflar = dataService.getClasses();
  const [secilen, setClassId] = useState('');
  const classId = siniflar.some((c) => c.id === secilen) ? secilen : siniflar[0]?.id || '';
  const [veri, setVeri] = useState<SinifGelisimi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [baslangic, setBaslangic] = useState<OyunBaslangic | null>(null);

  const yukle = useCallback(async () => {
    if (!classId) return;
    setVeri(null);
    setHata(null);
    try {
      setVeri(await sinifGelisimi(classId));
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Öğrenci özeti yüklenemedi.');
    }
  }, [classId]);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  if (!siniflar.length) {
    return (
      <Panel title="Öğrenciler">
        <EmptyState icon={Users} title="Sınıfınız yok" description="Ders verdiğiniz sınıflar burada görünür." />
      </Panel>
    );
  }

  const oynayan = veri ? veri.ogrenciler.filter((o) => o.soru > 0).length : 0;
  const ilkZayif = veri?.zayif[0];

  return (
    <>
      <Panel
        id="oyun-ogrenciler"
        title="Öğrenciler"
        description={veri ? `${veri.sinif.ad} · son 7 gün · ${oynayan} / ${veri.ogrenciler.length} öğrenci oynadı` : 'Son 7 gün'}
        actions={
          <SelectBox aria-label="Sınıf" value={classId} onChange={(e) => setClassId(e.target.value)} className="ui-field cursor-pointer w-40">
            {siniflar.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectBox>
        }
      >
        {hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
        {!hata && !veri && <Yukleniyor satir={4} metin="Özet hazırlanıyor…" />}
        {veri &&
          (veri.ogrenciler.length === 0 ? (
            <EmptyState icon={Users} title="Bu sınıfta öğrenci yok" description="Öğrenci eklenince oyun özetleri burada çıkar." />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full text-sm" id="oyun-ogrenci-tablo">
                  <thead>
                    <tr className="border-b border-line text-2xs font-semibold text-subtle">
                      <th className="py-2 pr-2 text-left">Öğrenci</th>
                      <th className="w-16 px-2 py-2 text-right">Soru</th>
                      <th className="w-16 px-2 py-2 text-right">Doğru</th>
                      <th className="w-14 px-2 py-2 text-right">Seri</th>
                      <th className="w-16 py-2 pl-2 text-right">Rozet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {veri.ogrenciler.map((o) => {
                      const y = yuzde(o.dogru, o.soru);
                      return (
                        <tr key={o.id} className={cx(!o.soru && 'text-subtle')}>
                          <td className="max-w-0 truncate py-2 pr-2 font-medium text-fg" title={o.ad}>
                            {kisaAd(o.ad)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{o.soru || '—'}</td>
                          <td className={cx('px-2 py-2 text-right font-semibold tabular-nums', !o.soru ? '' : y < 50 ? 'text-warning-fg' : y >= 80 ? 'text-success-fg' : 'text-fg')}>
                            {o.soru ? `%${y}` : '—'}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{o.seri || '—'}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">{o.rozet || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <aside className="space-y-2.5 lg:border-l lg:border-line lg:pl-5" aria-label="Sınıfın zorlandığı konular">
                <h3 className="text-2xs font-bold uppercase tracking-wider text-brand-fg">Sınıfın zorlandığı konular</h3>
                {veri.zayif.length ? (
                  <>
                    <ul className="space-y-1.5" id="oyun-zayif-konular">
                      {veri.zayif.map((z) => (
                        <li key={`${z.ders}|${z.konu}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            <b className="font-semibold text-fg">{z.konu}</b>
                            <span className="text-muted"> · {z.ders}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-bold tabular-nums text-warning-fg">
                            %{yuzde(z.dogru, z.toplam)} · {z.toplam} cevap
                          </span>
                        </li>
                      ))}
                    </ul>
                    {ilkZayif && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-center"
                        id="oyun-zayif-hazirla"
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => setBaslangic({ ad: `${ilkZayif.konu} tekrarı`, classId, kazanimlar: [], konu: { ders: ilkZayif.ders, konu: ilkZayif.konu } })}
                      >
                        <span className="truncate">{ilkZayif.konu} oyunu hazırla</span>
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Son 7 günde en az 10 cevapta %70'in altında kalınan konu yok.</p>
                )}
                <p className="flex items-start gap-1.5 pt-1 text-2xs text-subtle">
                  <Gamepad2 className="mt-0.5 w-3 h-3 shrink-0" aria-hidden />
                  Öğrencinin kendi oynadıkları ve verdiğiniz oyunlar birlikte sayılır. Sınıf sıralaması yapılmaz.
                </p>
              </aside>
            </div>
          ))}
      </Panel>

      <Suspense fallback={null}>
        {baslangic && (
          <OyunHazirla
            baslangic={baslangic}
            onClose={() => setBaslangic(null)}
            onCreated={() => {
              setBaslangic(null);
              onOyunHazir();
            }}
          />
        )}
      </Suspense>
    </>
  );
};
