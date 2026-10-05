import React, { useState } from 'react';
import { Check, Copy, KeyRound, MessageCircle, Mail, Download, AlertTriangle, ShieldCheck, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StudentCredential, StudentAccountFailure } from '../../types';
import { Modal } from '../ui/kit';

interface StudentWelcomeCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: StudentCredential[];
  failures?: StudentAccountFailure[];
  title?: string;
}

// Öğrenciye iletilecek giriş bilgisi metni
function buildCredentialText(c: StudentCredential): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return [
    `Merhaba ${c.student.name},`,
    'Eğitim & Öğrenci Takip Sistemi giriş bilgileriniz:',
    `Adres: ${origin}`,
    'Giriş ekranında "Öğrenci Portalı" sekmesini seçiniz.',
    `Öğrenci No: ${c.student.studentNumber || '-'}`,
    `Şifre: ${c.password}`,
    'İlk girişinizde şifrenizi değiştirmeniz istenecektir.',
  ].join('\n');
}

function whatsappLink(phone: string | undefined, text: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  const intl = digits ? (digits.startsWith('90') ? digits : digits.startsWith('0') ? `9${digits}` : `90${digits}`) : '';
  return `https://api.whatsapp.com/send?${intl ? `phone=${intl}&` : ''}text=${encodeURIComponent(text)}`;
}

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch);

// Hesap açıldıktan / şifre belirlendikten sonra giriş bilgilerini gösterir.
// Şifreler sistemde SAKLANMAZ: bu pencere kapanınca tekrar görüntülenemez.
const StudentWelcomeCredentialsContent: React.FC<StudentWelcomeCredentialsModalProps> = ({
  onClose,
  credentials,
  failures = [],
  title,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Toplu sonuçta şifreler bir yere aktarıldı mı (kopyalandı / indirildi / yazdırıldı)?
  const [savedAll, setSavedAll] = useState(false);
  const [sharedIds, setSharedIds] = useState<Set<string>>(() => new Set());
  const [confirmClose, setConfirmClose] = useState(false);

  const isBulk = credentials.length > 1;
  const passwordsSaved = savedAll || credentials.every((c) => sharedIds.has(c.student.id));

  const markShared = (id: string) =>
    setSharedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const markCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  const copyText = async (text: string, key: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      markCopied(key);
      return true;
    } catch {
      window.prompt('Kopyalamak için metni seçiniz:', text);
      return true;
    }
  };

  const copyAll = async () => {
    await copyText(credentials.map(buildCredentialText).join('\n\n----------\n\n'), 'all');
    setSavedAll(true);
    setConfirmClose(false);
  };

  const downloadExcel = () => {
    const rows = credentials.map((c) => ({
      'Ad Soyad': c.student.name,
      'Sınıf': c.student.className || '',
      'Öğrenci No (Giriş Adı)': c.student.studentNumber || '',
      'Şifre': c.password,
      'Telefon': c.student.phone || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Giriş Bilgileri');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    XLSX.writeFile(wb, `ogrenci_giris_bilgileri_${stamp}.xlsx`);
    markCopied('excel');
    setSavedAll(true);
    setConfirmClose(false);
  };

  // Giriş kartlarını yazdır (gizli çerçeve: açılır pencere engelleyicisine takılmaz)
  const printCredentials = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const cards = credentials
      .map(
        (c) => `<div class="card"><h3>${escapeHtml(c.student.name)}</h3>
<p>${escapeHtml(c.student.className || '')}</p>
<p>Adres: <b>${escapeHtml(origin)}</b> &middot; "Öğrenci Portalı" sekmesi</p>
<p>Öğrenci No: <b>${escapeHtml(c.student.studentNumber || '-')}</b></p>
<p>Şifre: <b>${escapeHtml(c.password)}</b></p>
<small>İlk girişte şifrenizi değiştirmeniz istenecektir.</small></div>`
      )
      .join('');
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Öğrenci Giriş Bilgileri</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;color:#111}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{border:1px dashed #888;border-radius:8px;padding:10px 12px;break-inside:avoid}h3{margin:0 0 4px;font-size:15px}
p{margin:2px 0;font-size:13px}small{color:#555;font-size:11px}</style></head><body><div class="grid">${cards}</div></body></html>`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    }, 100);
    markCopied('print');
    setSavedAll(true);
    setConfirmClose(false);
  };

  // Toplu sonuçta şifreler hiçbir yere aktarılmadıysa kapatmadan önce uyar
  const requestClose = () => {
    if (isBulk && !passwordsSaved) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const single = credentials.length === 1 ? credentials[0] : null;

  const footer = confirmClose ? (
    <div role="alert" className="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2 text-xs font-semibold">
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {credentials.length} öğrencinin şifresi henüz indirilmedi, kopyalanmadı veya yazdırılmadı. Kapatırsanız tekrar görüntülenemez.
      </span>
      <span className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadExcel} className="ui-btn ui-btn-primary ui-btn-sm">
          <Download className="w-3.5 h-3.5" />
          Excel Olarak İndir
        </button>
        <button type="button" onClick={() => setConfirmClose(false)} className="ui-btn ui-btn-secondary ui-btn-sm">
          Geri Dön
        </button>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-danger ui-btn-sm">
          Yine de Kapat
        </button>
      </span>
    </div>
  ) : (
    <>
      {credentials.length > 0 && (
        <>
          <button type="button" onClick={copyAll} className="ui-btn ui-btn-secondary ui-btn-sm">
            {copiedKey === 'all' ? <Check className="w-4 h-4 text-success-fg" /> : <Copy className="w-4 h-4" />}
            <span>{single ? 'Bilgileri Kopyala' : 'Tümünü Kopyala'}</span>
          </button>
          <button type="button" onClick={printCredentials} className="ui-btn ui-btn-secondary ui-btn-sm">
            {copiedKey === 'print' ? <Check className="w-4 h-4 text-success-fg" /> : <Printer className="w-4 h-4" />}
            <span>Yazdır</span>
          </button>
          <button type="button" onClick={downloadExcel} className="ui-btn ui-btn-success ui-btn-sm">
            {copiedKey === 'excel' ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>Excel Olarak İndir</span>
          </button>
        </>
      )}
      <button type="button" onClick={requestClose} className="ui-btn ui-btn-primary ui-btn-sm">
        Kapat
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={requestClose}
      closeOnBackdrop={false}
      icon={KeyRound}
      tone="brand"
      size="lg"
      title={title || 'Öğrenci Giriş Bilgileri'}
      description={credentials.length > 0 ? `${credentials.length} öğrencinin giriş hesabı hazır` : 'Hesap açılamadı'}
      footer={footer}
    >
      <div className="space-y-4">
        {credentials.length > 0 && (
          <div className="p-3 bg-warning-soft rounded-xl text-xs text-warning-fg flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Şifreler güvenlik nedeniyle sistemde saklanmaz</strong> ve bu pencere kapanınca tekrar
              görüntülenemez. Kapatmadan önce öğrencilere iletin, kopyalayın, yazdırın veya Excel olarak indirin.
              Şifresini unutan öğrenciye listeden yeni şifre belirleyebilirsiniz.
            </span>
          </div>
        )}

        {credentials.length > 0 && (
          <div className="border border-line rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2/80 text-muted uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2.5">Öğrenci</th>
                  <th className="px-3 py-2.5">Öğrenci No</th>
                  <th className="px-3 py-2.5">Şifre</th>
                  <th className="px-3 py-2.5 text-right">İlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {credentials.map((c) => {
                  const text = buildCredentialText(c);
                  return (
                    <tr key={c.student.id} className="bg-surface/60">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-fg">{c.student.name}</div>
                        <div className="text-[11px] text-muted">{c.student.className || 'Sınıf atanmadı'}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-brand-fg select-all">
                        {c.student.studentNumber}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-amber-700 dark:text-amber-300 select-all">{c.password}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await copyText(text, c.student.id);
                              markShared(c.student.id);
                            }}
                            className="ui-btn ui-btn-secondary ui-btn-sm ui-btn-icon"
                            title="Giriş bilgisini kopyala"
                            aria-label={`${c.student.name} giriş bilgisini kopyala`}
                          >
                            {copiedKey === c.student.id ? (
                              <Check className="w-3.5 h-3.5 text-success-fg" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={whatsappLink(c.student.phone, text)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markShared(c.student.id)}
                            className="ui-btn ui-btn-success ui-btn-sm ui-btn-icon"
                            title="WhatsApp ile gönder"
                            aria-label={`${c.student.name} bilgilerini WhatsApp ile gönder`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                          {c.student.email && (
                            <a
                              href={`mailto:${encodeURIComponent(c.student.email)}?subject=${encodeURIComponent('Öğrenci sistemi giriş bilgileriniz')}&body=${encodeURIComponent(text)}`}
                              onClick={() => markShared(c.student.id)}
                              className="ui-btn ui-btn-secondary ui-btn-sm ui-btn-icon"
                              title="E-posta programınızla gönderin"
                              aria-label={`${c.student.name} bilgilerini e-posta ile gönder`}
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {failures.length > 0 && (
          <div className="p-3 bg-danger-soft rounded-xl text-xs text-danger-fg space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>{failures.length} öğrenci eklenemedi (bu öğrenciler için kayıt oluşturulmadı):</span>
            </div>
            <ul className="list-disc pl-6 space-y-0.5 max-h-40 overflow-y-auto">
              {failures.map((f, i) => (
                <li key={`${f.studentNumber}-${i}`}>
                  <strong>{f.name}</strong>
                  {f.studentNumber ? ` (No: ${f.studentNumber})` : ''}: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export const StudentWelcomeCredentialsModal: React.FC<StudentWelcomeCredentialsModalProps> = (props) =>
  props.isOpen ? <StudentWelcomeCredentialsContent {...props} /> : null;
