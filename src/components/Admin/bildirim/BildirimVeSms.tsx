// ============================================================================
// Aşama 377: YÖNETİM › BİLDİRİM VE SMS — gönderimler bir arada, düzenli:
//   1) Bugünün dört sayısı (SMS gönderildi / hata, e-posta gönderildi / ulaşmadı); karta basınca ilgili kayıt listesi açılır
//   2) SMS ve E-posta kutuları yan yana, eşit boy (durum, sınama, son 7 gün, kayıtlar)
//   3) Bildirim izinleri (kime, hangi yolla) en altta
// Sayılar ana sayfadakiyle aynı kaynaktan: SMS sunucudan (sms-status), e-posta mail_log'dan (yönetici hepsini görür).
// ============================================================================
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, MailX, MessageSquareText, RefreshCw, List } from 'lucide-react';
import { callMail } from '../../../lib/mailApi';
import { supabase } from '../../../lib/supabase';
import { lazyNamed } from '../../../lib/lazyLoad';
import { StatCard } from '../../ui/kit';
import { NotificationPolicyPanel } from '../NotificationPolicyPanel';
import { SAGLAYICI_AD, SmsKayitlariPenceresi, SmsKutusu, smsTakili, type SmsFiltre, type SmsStatus } from './SmsKutusu';
import type { GidenFiltre } from '../../Teacher/SentCommunicationsModal';

const SentCommunicationsModal = lazyNamed<React.ComponentProps<typeof import('../../Teacher/SentCommunicationsModal').SentCommunicationsModal>>(
  () => import('../../Teacher/SentCommunicationsModal'),
  'SentCommunicationsModal'
);

const gunBasi = (geri = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - geri);
  return d;
};
const saatYazi = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface MailSayi {
  bugun: { sent: number; failed: number };
  hafta: { sent: number; failed: number };
  son: string | null;
  sonHata: string | null;
}

// ---------------------------------------------------------------- e-posta kutusu
const EpostaKutusu: React.FC<{ v: MailSayi | null; err: string | null; loading: boolean; onYenile: () => void; onAc: (f: GidenFiltre) => void }> = ({
  v,
  err,
  loading,
  onYenile,
  onAc,
}) => (
  <section className="ui-card ui-card-pad h-full flex flex-col gap-3" id="admin-mail-status" aria-labelledby="admin-mail-baslik">
    <div className="flex items-center justify-between gap-2">
      <h3 id="admin-mail-baslik" className="text-sm font-bold text-fg flex items-center gap-2">
        <Mail className="w-4 h-4 text-brand-fg" aria-hidden /> E-posta
      </h3>
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-28" onClick={onYenile} disabled={loading}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
      </button>
    </div>
    {err && <p className="text-xs font-semibold text-danger-fg">{err}</p>}
    {!v && !err && <p className="text-xs text-muted">E-posta kaydı okunuyor…</p>}
    {v && (
      <>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted">Bugün</dt>
          <dd className="font-semibold text-fg tabular-nums">
            {v.bugun.sent} gönderildi · <span className={v.bugun.failed ? 'text-danger-fg' : undefined}>{v.bugun.failed} ulaşmadı</span>
          </dd>
          <dt className="text-muted">Son 7 gün</dt>
          <dd className="font-semibold text-fg tabular-nums">
            {v.hafta.sent} gönderildi · <span className={v.hafta.failed ? 'text-danger-fg' : undefined}>{v.hafta.failed} ulaşmadı</span>
          </dd>
          <dt className="text-muted">Son gönderim</dt>
          <dd className="font-semibold text-fg">{v.son ? saatYazi(v.son) : '—'}</dd>
          <dt className="text-muted">Son hata</dt>
          <dd className={v.sonHata ? 'font-semibold text-danger-fg' : 'font-semibold text-fg'}>{v.sonHata ? saatYazi(v.sonHata) : 'yok'}</dd>
        </dl>
        {v.hafta.failed > 0 && (
          <p className="text-xs text-muted flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning-fg" aria-hidden />
            Ulaşmayan e-postada adres hatalı ya da posta kutusu dolu olabilir; nedeni kayıtta yazar.
          </p>
        )}
      </>
    )}
    <div className="mt-auto pt-1 flex flex-wrap items-center gap-2">
      <button type="button" id="admin-mail-giden" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-36" onClick={() => onAc('all')}>
        <List className="w-3.5 h-3.5" /> Giden e-postalar
      </button>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-36" onClick={() => onAc('failed')} disabled={!v || v.hafta.failed === 0}>
        <MailX className="w-3.5 h-3.5" /> Ulaşmayanlar
      </button>
    </div>
  </section>
);

// ---------------------------------------------------------------- bölüm
export const BildirimVeSms: React.FC = () => {
  const [sms, setSms] = useState<SmsStatus | null>(null);
  const [smsErr, setSmsErr] = useState<string | null>(null);
  const [smsYuk, setSmsYuk] = useState(true);
  const [mail, setMail] = useState<MailSayi | null>(null);
  const [mailErr, setMailErr] = useState<string | null>(null);
  const [mailYuk, setMailYuk] = useState(true);
  const [smsListe, setSmsListe] = useState<SmsFiltre | null>(null);
  const [mailListe, setMailListe] = useState<GidenFiltre | null>(null);

  const smsOku = useCallback(async () => {
    setSmsYuk(true);
    setSmsErr(null);
    const r = await callMail('sms-status').catch((e) => ({ ok: false, error: e?.message } as any));
    if (r.ok && r.sms) setSms(r.sms as SmsStatus);
    else setSmsErr(r.error || 'SMS durumu okunamadı.');
    setSmsYuk(false);
  }, []);
  const mailOku = useCallback(async () => {
    setMailYuk(true);
    setMailErr(null);
    const { data, error } = await supabase
      .from('mail_log')
      .select('status,created_at')
      .gte('created_at', gunBasi(6).toISOString())
      .order('created_at', { ascending: false })
      .limit(10000);
    if (error) {
      setMailErr(/mail_log/.test(error.message || '') ? 'E-posta kaydı tablosu bulunamadı (13 numaralı SQL çalıştırılmalı).' : 'E-posta kaydı okunamadı.');
    } else {
      const rows = (data || []) as Array<{ status: string; created_at: string }>;
      const bugun = gunBasi(0).getTime();
      const v: MailSayi = { bugun: { sent: 0, failed: 0 }, hafta: { sent: 0, failed: 0 }, son: null, sonHata: null };
      for (const r of rows) {
        const k = r.status === 'failed' ? 'failed' : r.status === 'sent' ? 'sent' : null;
        if (!k) continue;
        v.hafta[k]++;
        if (new Date(r.created_at).getTime() >= bugun) v.bugun[k]++;
        if (k === 'sent' && !v.son) v.son = r.created_at;
        if (k === 'failed' && !v.sonHata) v.sonHata = r.created_at;
      }
      setMail(v);
    }
    setMailYuk(false);
  }, []);
  useEffect(() => {
    void smsOku();
    void mailOku();
  }, [smsOku, mailOku]);

  const takili = (sms?.recent || []).filter(smsTakili).length;
  const sayi = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('tr-TR'));

  return (
    <div className="space-y-4" id="admin-bildirim-sms">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Bugün giden bildirimler">
        <StatCard
          id="bs-sms-gonderildi"
          label="SMS gönderildi"
          value={sayi(sms?.today.sent)}
          hint={sms ? `bugün · sınır ${sms.dailyLimit || '—'} · ${SAGLAYICI_AD[sms.provider || ''] || 'sağlayıcı yok'}` : 'bugün'}
          icon={MessageSquareText}
          tone="brand"
          onClick={() => sms && setSmsListe('sent')}
        />
        <StatCard
          id="bs-sms-hata"
          label="SMS hata"
          value={sayi(sms?.today.failed)}
          hint={takili ? `${takili} takılı gönderim` : 'takılı gönderim yok'}
          icon={AlertTriangle}
          tone={sms && (sms.today.failed || takili) ? 'danger' : 'neutral'}
          onClick={() => sms && setSmsListe('failed')}
        />
        <StatCard
          id="bs-mail-gonderildi"
          label="E-posta gönderildi"
          value={sayi(mail?.bugun.sent)}
          hint="bugün"
          icon={CheckCircle2}
          tone="success"
          onClick={() => setMailListe('sent')}
        />
        <StatCard
          id="bs-mail-ulasmadi"
          label="E-posta ulaşmadı"
          value={sayi(mail?.bugun.failed)}
          hint={mail && mail.bugun.failed ? 'adres hatalı olabilir' : 'sorun yok'}
          icon={MailX}
          tone={mail && mail.bugun.failed ? 'danger' : 'neutral'}
          onClick={() => setMailListe('failed')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-stretch">
        <SmsKutusu st={sms} err={smsErr} loading={smsYuk} onYenile={() => void smsOku()} onKayitlar={() => sms && setSmsListe('all')} />
        <EpostaKutusu v={mail} err={mailErr} loading={mailYuk} onYenile={() => void mailOku()} onAc={setMailListe} />
      </div>

      <NotificationPolicyPanel />

      {smsListe && sms && <SmsKayitlariPenceresi st={sms} filtre={smsListe} onClose={() => setSmsListe(null)} onYenile={() => void smsOku()} />}
      {mailListe && (
        <Suspense fallback={null}>
          <SentCommunicationsModal
            isOpen
            filtre={mailListe}
            onClose={() => {
              setMailListe(null);
              void mailOku();
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
export default BildirimVeSms;
