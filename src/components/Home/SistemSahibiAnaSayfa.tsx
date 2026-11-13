import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { dataService, KURUM_MODULES } from '../../services/dataService';
import { supabase } from '../../lib/supabase';
import { callMail } from '../../lib/mailApi';
import { setQuickFocus } from '../../lib/quickFocus';
import { BACKUP_REMINDER_DAYS, createFullBackup, getLastBackupDate } from '../../services/maintenanceService';
import type { KurumInfo, Teacher, TeacherTabType } from '../../types';
import { AnaSayfaKabuk, AkSheet, akBasHarf, akSelam, akTarih } from './AnaSayfaKabuk';
import { GozuyleBakSheet } from './GozuyleBakSheet';

// ============================================================================
// Aşama 244: SİSTEM SAHİBİ ANA SAYFASI (yalnız genel yönetici, kendi panelinde; kuruma geçince kurumun sayfası açılır)
// Taslak: sistem-sahibi.html, A · Koyu panel (12 Kasım 2026, Mustafa seçti).
//  Koyu panel : selam, sistem durumu (bağlantı, SMS, e-posta, yedek), bugün giden SMS
//  Kâğıt      : + Yeni kurum / Yönetim, uyarılar (yedek, takılı SMS, ulaşmayan e-posta, SMS ayarı),
//               kurumlar (yönetici, öğretmen, açık bölüm, rol yetkileri, Kuruma geç), bugün giden bildirimler, kısayollar
// Kurum ayrımı: kurumların ÖĞRENCİ bilgisi bu sayfaya inmez (yalnız öğretmen sayısı).
// Veri: kurumlar + kurum_class_grants (listKurumlar), roles_enabled (fetchKurumRows), öğretmenler (dataService),
//       SMS durumu (sunucu: sms-status), bugünkü e-postalar (mail_log), son yedek (backup_log). Yeni tablo / SQL yok.
// Aşama 252: "Gözüyle bak" düğmesi: sorun yaşayan kişinin ekranını şifresiz açar (GozuyleBakSheet, sql/252).
// ============================================================================

const YeniKurumModal = lazy(() => import('../Admin/YeniKurumModal').then((m) => ({ default: m.YeniKurumModal })));
const SentCommunicationsModal = lazy(() => import('../Teacher/SentCommunicationsModal').then((m) => ({ default: m.SentCommunicationsModal })));

interface SmsDurum {
  provider: string | null;
  configured: boolean;
  live: boolean;
  dailyLimit: number;
  today: { sent: number; dry: number; failed: number };
  recent: Array<{ id?: number; created_at: string; status: string }>;
  tableMissing: boolean;
}
type Yuk<T> = { s: 'yukleniyor' } | { s: 'hata'; mesaj: string } | { s: 'tamam'; v: T };

const SAGLAYICI: Record<string, string> = { goldmesaj: 'Gold Mesaj', netgsm: 'Netgsm', iletimerkezi: 'İleti Merkezi' };
const gunFarki = (d: Date) => Math.floor((Date.now() - d.getTime()) / 864e5);
const takili = (r: { status: string; created_at: string }) => r.status === 'sending' && Date.now() - new Date(r.created_at).getTime() > 5 * 60000;
const bugunBasi = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

type YonetimUst = 'kurumlar' | 'bildirim' | 'yedek' | 'kendi';

interface Props {
  currentTeacher: Teacher | null;
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

export const SistemSahibiAnaSayfa: React.FC<Props> = ({ currentTeacher, unreadMessages, onNavigateTab }) => {
  // ---- öğretmenler (kurum başına sayı ve yönetici adı) — canlı
  const [teachers, setTeachers] = useState<Teacher[]>(() => dataService.getAllTeachersInternal());
  const [health, setHealth] = useState(() => dataService.getRealtimeHealth());
  useEffect(
    () =>
      dataService.subscribe(() => {
        setTeachers(dataService.getAllTeachersInternal());
        setHealth(dataService.getRealtimeHealth());
      }),
    []
  );

  // ---- kurumlar
  const [kurumlar, setKurumlar] = useState<Yuk<KurumInfo[]>>({ s: 'yukleniyor' });
  const [rol, setRol] = useState<Record<string, boolean> | null>(null);
  const kurumOku = useCallback(async () => {
    try {
      const list = await dataService.listKurumlar();
      setKurumlar({ s: 'tamam', v: list });
    } catch (e: any) {
      setKurumlar({ s: 'hata', mesaj: e?.message || 'Kurumlar okunamadı.' });
    }
    try {
      const { fetchKurumRows } = await import('../../lib/kurumSettings');
      const rows = await fetchKurumRows();
      setRol(Object.fromEntries(rows.map((r) => [r.id, r.rolesEnabled])));
    } catch {
      setRol(null); // 82 numaralı SQL yoksa rol bilgisi gösterilmez
    }
  }, []);
  const ogretmenAnahtari = useMemo(
    () =>
      teachers
        .map((t) => `${t.id}:${t.kurumId || ''}:${t.isAdmin ? 1 : 0}`)
        .sort()
        .join('|'),
    [teachers]
  );
  useEffect(() => {
    void kurumOku();
  }, [kurumOku, ogretmenAnahtari]);

  // ---- SMS, e-posta, yedek (açılışta, sekmeye dönünce ve dakikada bir)
  const [sms, setSms] = useState<Yuk<SmsDurum>>({ s: 'yukleniyor' });
  const [mail, setMail] = useState<Yuk<{ sent: number; failed: number }>>({ s: 'yukleniyor' });
  const [yedek, setYedek] = useState<Date | null | 'yok' | undefined>(undefined);
  const durumOku = useCallback(async () => {
    const [r, m, y] = await Promise.all([
      callMail('sms-status').catch((e) => ({ ok: false, error: e?.message } as any)),
      supabase.from('mail_log').select('status').gte('created_at', bugunBasi()).limit(5000),
      getLastBackupDate().catch(() => 'unavailable' as const),
    ]);
    setSms(r.ok && r.sms ? { s: 'tamam', v: r.sms as SmsDurum } : { s: 'hata', mesaj: r.error || 'SMS durumu okunamadı.' });
    if (m.error) setMail({ s: 'hata', mesaj: 'E-posta kaydı okunamadı.' });
    else {
      const rows = (m.data || []) as Array<{ status: string }>;
      setMail({ s: 'tamam', v: { sent: rows.filter((x) => x.status === 'sent').length, failed: rows.filter((x) => x.status === 'failed').length } });
    }
    setYedek(y === 'unavailable' ? 'yok' : y);
  }, []);
  useEffect(() => {
    void durumOku();
    const t = setInterval(() => document.visibilityState === 'visible' && void durumOku(), 60_000);
    const onVis = () => document.visibilityState === 'visible' && void durumOku();
    const onBackup = () => setYedek(new Date());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('app-backup-done', onBackup);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('app-backup-done', onBackup);
    };
  }, [durumOku]);

  // ---- türetilenler
  const smsV = sms.s === 'tamam' ? sms.v : null;
  const mailV = mail.s === 'tamam' ? mail.v : null;
  const takilanlar = (smsV?.recent || []).filter(takili);
  const yedekGun = yedek instanceof Date ? gunFarki(yedek) : null;
  const yedekGecikti = yedek === null || (yedekGun !== null && yedekGun >= BACKUP_REMINDER_DAYS);

  const kurumListe = useMemo(() => {
    if (kurumlar.s !== 'tamam') return [];
    const aktif = teachers.filter((t) => t.status !== 'rejected' && t.status !== 'pending');
    return kurumlar.v.map((k) => {
      const kt = aktif.filter((t) => t.kurumId === k.id);
      const yon = kt.filter((t) => t.isAdmin).map((t) => t.name);
      const acik = KURUM_MODULES.map((m) => k.modules?.[m.key] === true);
      return { k, ogretmen: kt.length, yonetici: yon, acik };
    });
  }, [kurumlar, teachers]);
  const toplamOgretmen = kurumListe.reduce((a, x) => a + x.ogretmen, 0);

  // ---- uyarılar (işlem yapınca düşer)
  const [busyAlert, setBusyAlert] = useState('');
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen] = useState(false);
  const [yeniOpen, setYeniOpen] = useState(false);
  const [yedekOpen, setYedekOpen] = useState(false);
  const [gozuOpen, setGozuOpen] = useState(false); // Aşama 252
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'hata'; text: string } | null>(null);
  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(() => setMesaj(null), 4000);
    return () => clearTimeout(t);
  }, [mesaj]);

  const yonetimAc = (ust: YonetimUst) => {
    onNavigateTab('user_management');
    window.scrollTo({ top: 0 });
    setTimeout(() => setQuickFocus('yonetim', ust, ''), 0);
  };

  const takiliKapat = async () => {
    if (busyAlert) return;
    setBusyAlert('sms');
    let n = 0;
    for (const r of takilanlar) {
      if (r.id == null) continue;
      const res = await callMail('sms-log', { op: 'close', id: r.id });
      if (res.ok) n += Number(res.changed) || 0;
    }
    setBusyAlert('');
    setGone((g) => new Set(g).add('sms'));
    setMesaj({ ton: 'ok', text: n ? `${n} takılı gönderim kapatıldı.` : 'Gönderimler tamamlanmış görünüyor.' });
    void durumOku();
  };

  type Uyari = { id: string; ico: string; warn?: boolean; t: string; d: string; act: string; on: () => void };
  const uyarilar: Uyari[] = [];
  if (yedekGecikti)
    uyarilar.push({
      id: 'yedek',
      ico: '!',
      warn: true,
      t: yedek === null ? 'Hiç yedek alınmadı' : `Son yedek ${yedekGun} gün önce alındı`,
      d: `${BACKUP_REMINDER_DAYS} günde bir yedek önerilir`,
      act: 'Yedek al',
      on: () => setYedekOpen(true),
    });
  if (smsV && takilanlar.length)
    uyarilar.push({ id: 'sms', ico: String(takilanlar.length), t: 'SMS takılı kaldı', d: '5 dakikadan uzun süredir "Gönderiliyor"', act: busyAlert === 'sms' ? '…' : 'Kapat', on: takiliKapat });
  if (smsV && !smsV.configured)
    uyarilar.push({ id: 'smsayar', ico: '!', warn: true, t: 'SMS sağlayıcısı ayarlı değil', d: 'Vercel ortam değişkenleri eksik', act: 'Ayarlar', on: () => yonetimAc('bildirim') });
  if (mailV && mailV.failed > 0)
    uyarilar.push({ id: 'mail', ico: String(mailV.failed), t: 'E-posta ulaşmadı', d: 'Bugün · adres hatalı olabilir', act: 'Gör', on: () => setMailOpen(true) });
  const gorunen = uyarilar.filter((u) => !gone.has(u.id) || u.id === 'yedek');

  const selam = akSelam(currentTeacher);
  const sinir = smsV?.dailyLimit || 0;
  const smsYuzde = smsV && sinir ? Math.min(100, Math.round((smsV.today.sent / sinir) * 100)) : 0;

  // ---- sistem durumu satırları
  const durum: Array<{ ad: string; deger: string; ton: 'ok' | 'warn' | 'bad' | 'off'; canli?: boolean }> = [
    {
      ad: 'Bağlantı',
      deger: health === 'live' ? 'Canlı' : health === 'offline' ? 'Çevrimdışı' : 'Otomatik kontrol',
      ton: health === 'live' ? 'ok' : health === 'offline' ? 'bad' : 'warn',
      canli: health === 'live',
    },
    sms.s !== 'tamam'
      ? { ad: 'SMS', deger: sms.s === 'hata' ? 'Okunamadı' : '…', ton: sms.s === 'hata' ? 'bad' : 'off' }
      : takilanlar.length
        ? { ad: 'SMS', deger: `${takilanlar.length} takılı`, ton: 'bad' }
        : !sms.v.configured
          ? { ad: 'SMS', deger: 'Ayarlı değil', ton: 'warn' }
          : { ad: 'SMS', deger: sms.v.live ? SAGLAYICI[sms.v.provider || ''] || 'Canlı' : 'Deneme modu', ton: sms.v.live ? 'ok' : 'warn', canli: sms.v.live },
    mail.s !== 'tamam'
      ? { ad: 'E-posta', deger: mail.s === 'hata' ? 'Okunamadı' : '…', ton: mail.s === 'hata' ? 'bad' : 'off' }
      : mail.v.failed
        ? { ad: 'E-posta', deger: `${mail.v.failed} ulaşmadı`, ton: 'bad' }
        : { ad: 'E-posta', deger: 'Sorun yok', ton: 'ok' },
    yedek === undefined
      ? { ad: 'Yedek', deger: '…', ton: 'off' }
      : yedek === 'yok'
        ? { ad: 'Yedek', deger: 'Bilinmiyor', ton: 'off' }
        : yedek === null
          ? { ad: 'Yedek', deger: 'Hiç alınmadı', ton: 'bad' }
          : { ad: 'Yedek', deger: yedekGun === 0 ? 'Bugün' : `${yedekGun} gün önce`, ton: yedekGecikti ? 'warn' : 'ok' },
  ];

  const panel = (
    <>
      <div>
        <span className="eyebrow">{akTarih()}</span>
        <h1>
          {selam.selam}
          {selam.ad ? ',' : ''}
          <br />
          {selam.ad}
        </h1>
      </div>
      <div className="ak-glass">
        <span className="lbl">Sistem durumu</span>
        <div>
          {durum.map((x) => (
            <div className="ak-srow" key={x.ad}>
              <i className={`ak-dot c-${x.ton}${x.canli ? ' live' : ''}`} aria-hidden="true" />
              {x.ad}
              <b>{x.deger}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="ak-glass">
        <span className="lbl">Bugün giden SMS</span>
        <div className="ak-huge">
          <b className="tnum">{smsV ? smsV.today.sent : '—'}</b>
          <span>
            {smsV ? (sinir ? `günlük sınır ${sinir}` : 'günlük sınır yok') : sms.s === 'hata' ? 'okunamadı' : 'okunuyor'}
            {smsV && smsV.today.dry > 0 && (
              <>
                <br />
                {smsV.today.dry} deneme
              </>
            )}
          </span>
        </div>
        <div className="ak-line" aria-hidden="true">
          <i style={{ width: `${smsYuzde}%` }} />
        </div>
      </div>
      <span className="grow" />
      <span className="note">Kurumların öğrenci bilgileri bu panele inmez. Görmek için "Kuruma geç" kullanılır.</span>
    </>
  );

  return (
    <AnaSayfaKabuk
      currentTeacher={currentTeacher}
      unreadMessages={unreadMessages}
      onNavigate={onNavigateTab}
      panelLabel="Sistem durumu"
      panel={panel}
      overlay={
        <>
          <YedekSheet open={yedekOpen} onClose={() => setYedekOpen(false)} sonYedek={yedek} adminName={currentTeacher?.name || 'Yönetici'} />
          <GozuyleBakSheet
            open={gozuOpen}
            onClose={() => setGozuOpen(false)}
            kurumlar={kurumlar.s === 'tamam' ? [...kurumlar.v].sort((a, b) => a.name.localeCompare(b.name, 'tr')) : []}
          />
          {mesaj && (
            <div className={'ak-toast on' + (mesaj.ton === 'hata' ? ' bad' : '')} role="status" aria-live="polite">
              {mesaj.text}
            </div>
          )}
        </>
      }
    >
      <div className="ak-acts">
        <button type="button" className="ak-btn dark w-32" onClick={() => setYeniOpen(true)}>
          + Yeni kurum
        </button>
        <button type="button" className="ak-btn w-32" onClick={() => setGozuOpen(true)} title="Sorun yaşayan kişinin ekranını açın">
          Gözüyle bak
        </button>
        <button type="button" className="ak-btn w-32" onClick={() => yonetimAc('kurumlar')}>
          Yönetim
        </button>
      </div>

      {/* Uyarılar */}
      <section className="ak-decide" aria-labelledby="ss-uyari">
        <div className="n">
          <b className={'tnum' + (gorunen.length ? '' : ' ok')}>{gorunen.length}</b>
          <strong id="ss-uyari">{gorunen.length ? 'uyarı var' : 'uyarı yok'}</strong>
          <span>İşlem yapınca listeden düşer.</span>
        </div>
        <div>
          {gorunen.map((u) => (
            <div className="ak-drow" key={u.id}>
              <span className={'ico tnum' + (u.warn ? ' w' : '')}>{u.ico}</span>
              <span className="t">
                <b>{u.t}</b>
                <span>{u.d}</span>
              </span>
              <button type="button" className="ak-btn w-24" onClick={u.on} disabled={!!busyAlert && u.id === busyAlert}>
                {u.act}
              </button>
            </div>
          ))}
          {!gorunen.length && <div className="ak-allok">Her şey yolunda. Bekleyen uyarı yok.</div>}
        </div>
      </section>

      {/* Kurumlar */}
      <section aria-labelledby="ss-kurum">
        <div className="ak-h2">
          <span id="ss-kurum">Kurumlar</span>
          {kurumlar.s === 'tamam' && (
            <small className="tnum">
              {kurumListe.length} kurum · {toplamOgretmen} öğretmen
            </small>
          )}
        </div>
        {kurumlar.s === 'hata' && <p className="ak-err">{kurumlar.mesaj}</p>}
        {kurumlar.s === 'yukleniyor' && <p className="ak-empty">Kurumlar okunuyor…</p>}
        {kurumlar.s === 'tamam' && !kurumListe.length && <p className="ak-empty">Henüz kurum yok. "+ Yeni kurum" ile ilk kurumu açın.</p>}
        {kurumListe.length > 0 && (
          <div className="ak-kur">
            {kurumListe.map((x) => (
              <KurumKarti key={x.k.id} x={x} rolAcik={rol ? rol[x.k.id] : undefined} onHata={(t) => setMesaj({ ton: 'hata', text: t })} />
            ))}
          </div>
        )}
      </section>

      {/* Bugün giden bildirimler */}
      <section aria-labelledby="ss-bildirim">
        <div className="ak-h2">
          <span id="ss-bildirim">Bugün giden bildirimler</span>
          <button type="button" className="lnk" onClick={() => yonetimAc('bildirim')}>
            Bildirim ve SMS ›
          </button>
        </div>
        <div className="ak-stats">
          <div className="ak-stat">
            <span className="k">SMS gönderildi</span>
            <b className="tnum">{smsV ? smsV.today.sent : '—'}</b>
            <span className="d">{smsV ? `sınır ${sinir || '—'} · ${SAGLAYICI[smsV.provider || ''] || 'sağlayıcı yok'}` : ' '}</span>
          </div>
          <div className="ak-stat">
            <span className="k">SMS hata</span>
            <b className={'tnum' + (smsV && smsV.today.failed ? ' bad' : '')}>{smsV ? smsV.today.failed : '—'}</b>
            <span className="d">{takilanlar.length ? `${takilanlar.length} takılı gönderim` : 'takılı gönderim yok'}</span>
          </div>
          <div className="ak-stat">
            <span className="k">E-posta gönderildi</span>
            <b className="tnum">{mailV ? mailV.sent : '—'}</b>
            <span className="d">bugün</span>
          </div>
          <div className="ak-stat">
            <span className="k">E-posta ulaşmadı</span>
            <b className={'tnum' + (mailV && mailV.failed ? ' bad' : '')}>{mailV ? mailV.failed : '—'}</b>
            <span className="d">{mailV && mailV.failed ? 'adres hatalı olabilir' : 'sorun yok'}</span>
          </div>
        </div>
      </section>

      {/* Kısayollar */}
      <section aria-label="Kısayollar">
        <div className="ak-shelf">
          <button type="button" onClick={() => yonetimAc('bildirim')}>
            Bildirim izinleri<span>Kime, hangi yolla</span>
          </button>
          <button type="button" onClick={() => yonetimAc('bildirim')}>
            Sınama SMS'i<span>Bildirim ve SMS içinde</span>
          </button>
          <button type="button" onClick={() => yonetimAc('yedek')}>
            Yedek ve bakım<span>Yedek, eski dosyalar</span>
          </button>
          <button type="button" onClick={() => yonetimAc('kendi')}>
            Kendi alanım<span>Kurumsuz sınıf ve hesaplar</span>
          </button>
        </div>
      </section>

      <Suspense fallback={null}>
        {yeniOpen && (
          <YeniKurumModal
            open={yeniOpen}
            onClose={() => setYeniOpen(false)}
            onDone={() => {
              setYeniOpen(false);
              void kurumOku();
            }}
          />
        )}
        {mailOpen && (
          <SentCommunicationsModal
            isOpen={mailOpen}
            onClose={() => {
              setMailOpen(false);
              setGone((g) => new Set(g).add('mail'));
            }}
          />
        )}
      </Suspense>
    </AnaSayfaKabuk>
  );
};

// ---------------------------------------------------------------------------
// Kurum kartı
// ---------------------------------------------------------------------------
const KurumKarti: React.FC<{
  x: { k: KurumInfo; ogretmen: number; yonetici: string[]; acik: boolean[] };
  rolAcik: boolean | undefined;
  onHata: (t: string) => void;
}> = ({ x, rolAcik, onHata }) => {
  const [busy, setBusy] = useState(false);
  const acikSay = x.acik.filter(Boolean).length;
  const acikAdlar = KURUM_MODULES.filter((_, i) => x.acik[i]).map((m) => m.title);
  const gec = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { enterKurum } = await import('../../lib/kurumGecis');
      await enterKurum(x.k.id); // sayfa o kurumun oturumuyla yeniden açılır
    } catch (e: any) {
      onHata(e?.message || 'Kuruma geçilemedi.');
      setBusy(false);
    }
  };
  const yon = x.yonetici.length ? x.yonetici[0] + (x.yonetici.length > 1 ? ` +${x.yonetici.length - 1}` : '') : 'atanmadı';
  return (
    <article className="ak-kcard">
      <div className="top">
        <span className="ak-av" aria-hidden="true">
          {akBasHarf(x.k.name)}
        </span>
        <span className="tx">
          <b title={x.k.name}>{x.k.name}</b>
          <span title={x.yonetici.join(', ')}>Yönetici: {yon}</span>
        </span>
      </div>
      <dl>
        <dt>Öğretmen</dt>
        <dd className="tnum">{x.ogretmen}</dd>
        <dt>Açık bölüm</dt>
        <dd className="tnum" title={acikAdlar.join(', ') || 'Açık bölüm yok'}>
          {acikSay}/{KURUM_MODULES.length}
          <span className="ak-mdots" aria-hidden="true">
            {x.acik.map((on, i) => (
              <i key={i} className={on ? '' : 'off'} />
            ))}
          </span>
        </dd>
        {rolAcik !== undefined && (
          <>
            <dt>Rol yetkileri</dt>
            <dd>
              <span className={'ak-tag ' + (rolAcik ? 'on' : 'off')}>{rolAcik ? 'Açık' : 'Kapalı'}</span>
            </dd>
          </>
        )}
      </dl>
      <button type="button" className="ak-btn full" onClick={gec} disabled={busy}>
        {busy ? 'Açılıyor…' : 'Kuruma geç'}
      </button>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Yedek al (sağdan açılan panel; Yönetim › Yedek ve bakım ile aynı işlev)
// ---------------------------------------------------------------------------
const YedekSheet: React.FC<{ open: boolean; onClose: () => void; sonYedek: Date | null | 'yok' | undefined; adminName: string }> = ({
  open,
  onClose,
  sonYedek,
  adminName,
}) => {
  const [busy, setBusy] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ done: number; total: number; label: string } | null>(null);
  const [sonuc, setSonuc] = useState<{ ton: 'ok' | 'bad'; text: string } | null>(null);
  useEffect(() => {
    if (open) {
      setSonuc(null);
      setIlerleme(null);
    }
  }, [open]);
  const al = async () => {
    if (busy) return;
    setBusy(true);
    setSonuc(null);
    try {
      const res = await createFullBackup(adminName, (done, total, label) => setIlerleme({ done, total, label }));
      const toplam = Object.values(res.counts).reduce((a, b) => a + b, 0);
      setSonuc({
        ton: res.failedTables.length ? 'bad' : 'ok',
        text:
          `Yedek indirildi: ${res.fileBaseName}.xlsx ve .json (${toplam} kayıt).` +
          (res.failedTables.length ? ` Okunamayan tablolar: ${res.failedTables.map((f) => f.table).join(', ')}.` : ''),
      });
      window.dispatchEvent(new Event('app-backup-done'));
    } catch (e: any) {
      setSonuc({ ton: 'bad', text: e?.message || 'Yedek alınamadı.' });
    } finally {
      setBusy(false);
    }
  };
  const yuzde = ilerleme ? Math.round((Math.min(ilerleme.done, ilerleme.total) / Math.max(1, ilerleme.total)) * 100) : sonuc?.ton === 'ok' ? 100 : 0;
  const sonYazi =
    sonYedek instanceof Date
      ? `Son yedek ${gunFarki(sonYedek) === 0 ? 'bugün' : `${gunFarki(sonYedek)} gün önce`} alındı (${sonYedek.toLocaleDateString('tr-TR')}).`
      : sonYedek === null
        ? 'Daha önce yedek alınmadı.'
        : '';
  return (
    <AkSheet
      open={open}
      onClose={onClose}
      locked={busy}
      kicker="Yedek ve bakım"
      title="Tüm verileri yedekle"
      desc="Öğrenciler, sınıflar, ödevler, teslimler, notlar, yoklama, etütler, mesajlar."
      footer={
        <>
          <span className="cnt">{busy ? 'Yedek alınırken pencereyi kapatmayın.' : ''}</span>
          <button type="button" className="ak-btn w-24" onClick={onClose} disabled={busy}>
            {sonuc ? 'Kapat' : 'Vazgeç'}
          </button>
          <button type="button" className="ak-btn dark" onClick={al} disabled={busy}>
            {busy ? 'Alınıyor…' : sonuc ? 'Yeniden al' : 'Yedeği al'}
          </button>
        </>
      }
    >
      <div className="ak-bk">
        <span className="big tnum">%{yuzde}</span>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${yuzde}%` }} />
        </div>
        <span className={'tx' + (sonuc ? ' ' + sonuc.ton : '')} role="status" aria-live="polite">
          {sonuc
            ? sonuc.text
            : ilerleme
              ? ilerleme.done < ilerleme.total
                ? `${ilerleme.label} okunuyor (${ilerleme.done + 1}/${ilerleme.total})`
                : ilerleme.label
              : 'Hazır. Yedek dosyası bilgisayarınıza iner.'}
        </span>
      </div>
      <p className="ak-hint">{sonYazi} Yedek yalnız sizin bilgisayarınıza kaydedilir.</p>
    </AkSheet>
  );
};
