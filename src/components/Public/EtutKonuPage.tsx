import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, NotebookPen, Pencil, Users } from 'lucide-react';
import { cx } from '../ui/kit';

// ============================================================================
// Aşama 423: GİRİŞSİZ ETÜT KONUSU SAYFASI
// Rehberlik öğretmeninin yazdığı etütlerin konusu, sınıfın o dersine giren öğretmene e-postayla sorulur.
// Öğretmen bu sayfada her etüt için "Böyle kalsın" der ya da yeni konuyu yazar; hiçbir şey yapmazsa
// rehberliğin yazdığı konu geçerlidir. Sunucu her istekte bağlantının imzasını denetler.
// ============================================================================

interface KonuEtut {
  id: string;
  ders: string;
  konu: string;
  tarih: string;
  saat: string;
  durum: 'gonderildi' | 'kaldi' | 'degisti';
  yanitAt: string | null;
  acik: boolean;
  ogrenciler: Array<{ ad: string; sinif: string }>;
}
interface KonuData {
  ogretmen: string;
  rehber: string;
  ders: string;
  etutler: KonuEtut[];
}
type Karar = { durum: 'kaldi' | 'degisti'; konu: string };

const KONU_MAX = 200;

async function call(action: 'etut-konu-get' | 'etut-konu-save', payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  } catch {
    throw new Error('İnternet bağlantısı yok gibi görünüyor. Bağlantınızı kontrol edip tekrar deneyin.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'Sunucuya ulaşılamadı. Biraz sonra tekrar deneyin.');
  return data;
}

const tarihYazi = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : ymd;
};

const OGRENCI_ILK = 8;

export const EtutKonuPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<KonuData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kararlar, setKararlar] = useState<Record<string, Karar>>({});
  const [acikListe, setAcikListe] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  const yukle = () =>
    call('etut-konu-get', { token })
      .then((d: KonuData) => {
        setData(d);
        setKararlar({});
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    document.title = 'Etüt konuları';
    void yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const secili = useMemo(() => Object.keys(kararlar).length, [kararlar]);
  const yanitli = data ? data.etutler.filter((e) => e.durum !== 'gonderildi').length : 0;

  const sec = (e: KonuEtut, durum: Karar['durum']) => {
    setKaydedildi(false);
    setSaveError(null);
    setKararlar((k) => ({ ...k, [e.id]: { durum, konu: durum === 'degisti' ? k[e.id]?.konu ?? e.konu : e.konu } }));
  };
  const konuYaz = (id: string, konu: string) => setKararlar((k) => ({ ...k, [id]: { durum: 'degisti', konu } }));
  const hepsiKalsin = () => {
    if (!data) return;
    setKaydedildi(false);
    setKararlar(Object.fromEntries(data.etutler.filter((e) => e.acik).map((e) => [e.id, { durum: 'kaldi', konu: e.konu } as Karar])));
  };

  const kaydet = async () => {
    if (!secili || saving) return;
    const bos = Object.entries(kararlar).find(([, k]) => k.durum === 'degisti' && !k.konu.trim());
    if (bos) {
      setSaveError('Değiştirdiğiniz etüdün yeni konusunu yazın.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await call('etut-konu-save', { token, kararlar });
      setKaydedildi(true);
      await yukle();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg" id="etut-konu-page">
      <header className="bg-surface border-b border-line">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center shrink-0">
            <NotebookPen className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-fg">Etüt konuları</h1>
            <p className="text-xs text-muted truncate">{data ? `${data.ders} · ${data.rehber}` : 'biliredu'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-28 space-y-4">
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
            <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
            Etütler yükleniyor…
          </div>
        )}
        {error && (
          <div role="alert" id="etut-konu-error" className="ui-card p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-fg shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-fg">Sayfa açılamadı</p>
              <p className="text-sm text-muted mt-1">{error}</p>
            </div>
          </div>
        )}
        {data && (
          <>
            <section className="ui-card p-4 flex items-start justify-between gap-3" id="etut-konu-ozet">
              <p className="text-sm text-fg-2">
                {data.ogretmen ? `${data.ogretmen}, ` : ''}
                {data.rehber} dersine girdiğiniz sınıflara bu etütleri yazdı. Konuyu değiştirebilir ya da “Böyle kalsın” diyebilirsiniz. Bir şey yapmazsanız
                yazılan konu geçerli olur.
              </p>
              <p className="text-right shrink-0">
                <span className="block text-2xl font-bold tabular-nums" id="etut-konu-sayi">
                  {yanitli}/{data.etutler.length}
                </span>
                <span className="text-xs text-muted">yanıtlandı</span>
              </p>
            </section>

            {data.etutler.some((e) => e.acik) && (
              <div className="flex justify-end">
                <button type="button" id="etut-konu-hepsi" onClick={hepsiKalsin} className="ui-btn ui-btn-secondary ui-btn-sm">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Hepsi böyle kalsın
                </button>
              </div>
            )}

            {data.etutler.map((e) => {
              const k = kararlar[e.id];
              const durum = k?.durum ?? (e.durum === 'gonderildi' ? null : e.durum);
              const liste = acikListe[e.id] ? e.ogrenciler : e.ogrenciler.slice(0, OGRENCI_ILK);
              return (
                <section key={e.id} className={cx('ui-card overflow-hidden', !e.acik && 'opacity-70')} data-etut-konu={e.id}>
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line bg-surface-2/60">
                    <p className="text-sm font-bold text-fg min-w-0 truncate">
                      {tarihYazi(e.tarih)}
                      {e.saat && <span className="font-medium text-muted"> · {e.saat}</span>}
                    </p>
                    {e.durum !== 'gonderildi' && !k && (
                      <span className="text-2xs font-bold uppercase tracking-wide text-success-fg shrink-0">
                        {e.durum === 'degisti' ? 'Değiştirildi' : 'Böyle kalsın'}
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div>
                      <p className="text-xs text-muted">Konu</p>
                      <p className="text-sm font-bold text-fg break-words">{e.konu || '-'}</p>
                    </div>
                    {e.ogrenciler.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {e.ogrenciler.length} öğrenci
                        </p>
                        <p className="text-xs text-fg-2 leading-relaxed">
                          {liste.map((o) => `${o.ad}${o.sinif ? ` (${o.sinif})` : ''}`).join(', ')}
                          {e.ogrenciler.length > OGRENCI_ILK && (
                            <button
                              type="button"
                              data-serbest="metin bağlantısı"
                              onClick={() => setAcikListe((a) => ({ ...a, [e.id]: !a[e.id] }))}
                              className="ml-1 font-semibold text-brand-fg hover:underline cursor-pointer"
                            >
                              {acikListe[e.id] ? 'daha az' : `+${e.ogrenciler.length - OGRENCI_ILK} öğrenci`}
                            </button>
                          )}
                        </p>
                      </div>
                    )}
                    {e.acik ? (
                      <>
                        <div className="ui-seg" role="group" aria-label="Konu kararı">
                          <button type="button" className="ui-seg-btn" aria-pressed={durum === 'kaldi'} onClick={() => sec(e, 'kaldi')} data-karar="kaldi">
                            <CheckCircle2 /> Böyle kalsın
                          </button>
                          <button type="button" className="ui-seg-btn" aria-pressed={durum === 'degisti'} onClick={() => sec(e, 'degisti')} data-karar="degisti">
                            <Pencil /> Konuyu değiştir
                          </button>
                        </div>
                        {k?.durum === 'degisti' && (
                          <div className="space-y-1">
                            <label className="ui-label" htmlFor={`konu-${e.id}`}>
                              Yeni konu
                            </label>
                            <input
                              id={`konu-${e.id}`}
                              className="ui-field w-full"
                              value={k.konu}
                              maxLength={KONU_MAX}
                              autoFocus
                              onChange={(ev) => konuYaz(e.id, ev.target.value)}
                              placeholder="Etütte anlatılacak konu"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Etüt günü geçti; konu değiştirilemez.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
            <p className="text-xs text-muted text-center">Bu bağlantı size özeldir; başkasıyla paylaşmayın.</p>
          </>
        )}
      </main>

      {data && data.etutler.some((e) => e.acik) && (
        <div className="fixed inset-x-0 bottom-0 bg-surface/95 backdrop-blur border-t border-line">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs min-w-0" role="status">
              {saveError ? (
                <span className="font-bold text-danger-fg">{saveError}</span>
              ) : kaydedildi && !secili ? (
                <span className="font-bold text-success-fg">Kaydedildi. Rehberlik öğretmeni değişikliği görür.</span>
              ) : (
                <span className="text-muted">{secili ? `${secili} etüt için seçim yaptınız.` : 'Her etüt için bir seçim yapın.'}</span>
              )}
            </p>
            <button type="button" id="etut-konu-kaydet" onClick={kaydet} disabled={!secili || saving} className="ui-btn ui-btn-primary shrink-0">
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
