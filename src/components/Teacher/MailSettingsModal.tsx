import React, { useEffect, useState } from 'react';
import { MailCheck, School, User, Send, Unlink, Link2, AlertCircle, CheckCircle2, ExternalLink, BellRing } from 'lucide-react';
import { Modal } from '../ui/kit';
import { callMail, describeMailResult, type MailResult } from '../../lib/mailApi';
import { inputCls, FieldLabel, invalidateMailStatus } from './FormParts';

// ============================================================================
// E-posta Ayarları (Aşama 9)
// Öğretmen kendi Gmail adresini ve Google "uygulama şifresi"ni bağlarsa ödev/etüt e-postaları onun
// adresinden gider. Bağlamazsa okulun ortak hesabından, öğretmenin adıyla gider.
// Uygulama şifresi sunucuda şifrelenerek saklanır ve bir daha tarayıcıya gönderilmez.
// ============================================================================

export const MailSettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [status, setStatus] = useState<MailResult | null>(null);
  const [gmail, setGmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);

  const refresh = async () => {
    const r = await callMail('status');
    setStatus(r);
    invalidateMailStatus();
  };
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setAppPassword('');
    setStatus(null);
    refresh();
  }, [open]);

  const connect = async () => {
    setMessage(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gmail.trim())) return setMessage({ tone: 'danger', text: 'Gmail adresinizi yazın.' });
    if (appPassword.replace(/\s+/g, '').length !== 16) return setMessage({ tone: 'danger', text: 'Uygulama şifresi 16 harften oluşur.' });
    setBusy('connect');
    const r = await callMail('connect-gmail', { gmail: gmail.trim(), appPassword });
    setBusy(null);
    setAppPassword('');
    if (!r.ok) return setMessage({ tone: 'danger', text: r.error || 'Bağlanamadı.' });
    setMessage({ tone: 'success', text: 'Gmail hesabınız bağlandı. Bundan sonra e-postalarınız bu adresten gidecek.' });
    refresh();
  };
  const disconnect = async () => {
    setBusy('disconnect');
    const r = await callMail('disconnect-gmail');
    setBusy(null);
    setMessage(r.ok ? { tone: 'success', text: 'Bağlantı kaldırıldı. E-postalarınız okul hesabından gidecek.' } : { tone: 'danger', text: r.error || 'Kaldırılamadı.' });
    refresh();
  };
  const test = async () => {
    setBusy('test');
    const r = await callMail('test');
    setBusy(null);
    setMessage(r.ok ? { tone: 'success', text: `Deneme e-postası ${r.to} adresine gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.` } : { tone: 'danger', text: r.error || 'Gönderilemedi.' });
  };
  const runReminders = async () => {
    setBusy('reminders');
    const r = await callMail('reminders');
    setBusy(null);
    const d = describeMailResult(r);
    setMessage({ tone: d.tone === 'success' ? 'success' : d.tone === 'warning' ? 'warning' : 'danger', text: r.ok ? `Yarın son günü olan ödevler kontrol edildi. ${d.text}` : d.text });
  };

  const own = status?.own as { gmail: string } | null | undefined;
  const serverDown = status && !status.ok;

  return (
    <Modal
      open={open}
      onClose={onClose}
      id="mail-settings-modal"
      icon={MailCheck}
      tone="brand"
      size="md"
      title="E-posta Ayarları"
      description="Ödev ve etüt e-postaları hangi hesaptan gitsin?"
      footer={
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
          Kapat
        </button>
      }
    >
      <div className="space-y-4">
        {status === null ? (
          <p className="text-xs text-muted">Durum kontrol ediliyor…</p>
        ) : serverDown ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {status?.error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-start gap-3 p-3 rounded-xl border border-line bg-surface-2/50" id="mail-status-own">
              <User className="w-5 h-5 text-brand-fg shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <div className="font-semibold text-fg text-sm">Kendi Gmail hesabım</div>
                {own ? (
                  <div className="text-success-fg font-semibold flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bağlı: {own.gmail} — e-postalarınız bu adresten gider
                  </div>
                ) : (
                  <div className="text-muted mt-0.5">Bağlı değil</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl border border-line bg-surface-2/50" id="mail-status-school">
              <School className="w-5 h-5 text-info-fg shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <div className="font-semibold text-fg text-sm">Okul hesabı</div>
                {status?.schoolConfigured ? (
                  <div className="text-muted mt-0.5">
                    {status.schoolAddress} — kendi Gmail'iniz bağlı değilse e-postalar buradan sizin adınızla gider, yanıtlar size gelir.
                  </div>
                ) : (
                  <div className="text-warning-fg mt-0.5">Ayarlanmamış (yönetici Vercel ayarlarından ekler).</div>
                )}
              </div>
            </div>
          </div>
        )}

        {message && (
          <div
            role="status"
            id="mail-settings-message"
            className={
              message.tone === 'success'
                ? 'p-3 rounded-xl bg-success-soft text-success-fg text-xs font-semibold'
                : message.tone === 'warning'
                  ? 'p-3 rounded-xl bg-warning-soft text-warning-fg text-xs font-semibold'
                  : 'p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold'
            }
          >
            {message.text}
          </div>
        )}

        {!serverDown && status && (
          <>
            {own ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" id="mail-test" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!!busy} onClick={test}>
                  <Send className="w-3.5 h-3.5" />
                  {busy === 'test' ? 'Gönderiliyor…' : 'Deneme e-postası gönder'}
                </button>
                <button type="button" id="mail-disconnect" className="ui-btn ui-btn-danger-soft ui-btn-sm" disabled={!!busy} onClick={disconnect}>
                  <Unlink className="w-3.5 h-3.5" />
                  Bağlantıyı kaldır
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-line p-3 space-y-3">
                <div className="text-sm font-semibold text-fg">Kendi Gmail'imi bağla</div>
                <ol className="list-decimal pl-5 text-xs text-fg-2 space-y-1">
                  <li>Google hesabınızda 2 Adımlı Doğrulama açık olmalı.</li>
                  <li>
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-brand-fg font-semibold hover:underline inline-flex items-center gap-1">
                      Uygulama şifreleri <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    sayfasında bir ad yazın (ör. "Okul Takip") ve "Oluştur"a basın.
                  </li>
                  <li>Çıkan 16 harfli şifreyi aşağıya yapıştırın. Normal Gmail şifreniz çalışmaz.</li>
                </ol>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="mail-gmail">Gmail adresi</FieldLabel>
                    <input id="mail-gmail" type="email" autoComplete="off" value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder="adiniz@gmail.com" className={inputCls} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="mail-app-password">Uygulama şifresi</FieldLabel>
                    <input
                      id="mail-app-password"
                      type="password"
                      autoComplete="new-password"
                      value={appPassword}
                      onChange={(e) => setAppPassword(e.target.value)}
                      placeholder="abcd efgh ijkl mnop"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" id="mail-connect" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!!busy} onClick={connect}>
                    <Link2 className="w-3.5 h-3.5" />
                    {busy === 'connect' ? 'Gmail ile deneniyor…' : 'Bağla'}
                  </button>
                  {status.schoolConfigured && (
                    <button type="button" id="mail-test" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!!busy} onClick={test}>
                      <Send className="w-3.5 h-3.5" />
                      {busy === 'test' ? 'Gönderiliyor…' : 'Okul hesabıyla deneme gönder'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted">Şifreniz sunucuda şifrelenerek saklanır; sizin dahil kimse ekranda geri göremez. İstediğiniz an kaldırabilirsiniz.</p>
              </div>
            )}
            {status.isAdmin && (
              <div className="rounded-xl border border-line p-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-fg-2 flex items-center gap-1.5">
                  <BellRing className="w-4 h-4 text-warning-fg" />
                  Ödev hatırlatmaları her gün 15:07'de otomatik gider.
                </span>
                <button type="button" id="mail-run-reminders" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!!busy} onClick={runReminders}>
                  {busy === 'reminders' ? 'Kontrol ediliyor…' : 'Şimdi çalıştır'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
