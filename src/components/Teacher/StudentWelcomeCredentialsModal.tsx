import React, { useState } from 'react';
import { X, Check, Copy, KeyRound, MessageCircle, Mail, Download, AlertTriangle, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StudentCredential, StudentAccountFailure } from '../../types';

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

// Hesap açıldıktan / şifre belirlendikten sonra giriş bilgilerini gösterir.
// Şifreler sistemde SAKLANMAZ: bu pencere kapanınca tekrar görüntülenemez.
const StudentWelcomeCredentialsContent: React.FC<StudentWelcomeCredentialsModalProps> = ({
  onClose,
  credentials,
  failures = [],
  title,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const markCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      markCopied(key);
    } catch {
      window.prompt('Kopyalamak için metni seçiniz:', text);
    }
  };

  const copyAll = () => copyText(credentials.map(buildCredentialText).join('\n\n----------\n\n'), 'all');

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
  };

  const single = credentials.length === 1 ? credentials[0] : null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-100 relative max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-indigo-900/80 via-slate-900 to-indigo-950/70 px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{title || 'Öğrenci Giriş Bilgileri'}</h3>
              <p className="text-xs text-slate-400">
                {credentials.length > 0
                  ? `${credentials.length} öğrencinin giriş hesabı hazır`
                  : 'Hesap açılamadı'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {credentials.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Şifreler güvenlik nedeniyle sistemde saklanmaz</strong> ve bu pencere kapanınca tekrar
                görüntülenemez. Kapatmadan önce öğrencilere iletin, kopyalayın veya Excel olarak indirin. Şifresini
                unutan öğrenciye listeden yeni şifre belirleyebilirsiniz.
              </span>
            </div>
          )}

          {credentials.length > 0 && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5">Öğrenci</th>
                    <th className="px-3 py-2.5">Öğrenci No</th>
                    <th className="px-3 py-2.5">Şifre</th>
                    <th className="px-3 py-2.5 text-right">İlet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {credentials.map((c) => {
                    const text = buildCredentialText(c);
                    return (
                      <tr key={c.student.id} className="bg-slate-900/60">
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-white">{c.student.name}</div>
                          <div className="text-[11px] text-slate-400">{c.student.className || 'Sınıf atanmadı'}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-indigo-300 select-all">
                          {c.student.studentNumber}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-amber-300 select-all">{c.password}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => copyText(text, c.student.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                              title="Giriş bilgisini kopyala"
                            >
                              {copiedKey === c.student.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={whatsappLink(c.student.phone, text)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white"
                              title="WhatsApp ile gönder"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                            {c.student.email && (
                              <a
                                href={`mailto:${encodeURIComponent(c.student.email)}?subject=${encodeURIComponent('Öğrenci sistemi giriş bilgileriniz')}&body=${encodeURIComponent(text)}`}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-900/60 text-indigo-300 border border-slate-700"
                                title="E-posta programınızla gönderin"
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
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-200 space-y-1.5">
              <div className="flex items-center space-x-2 font-bold text-rose-300">
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

        <div className="bg-slate-950/60 px-5 py-3 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {credentials.length > 0 && (
            <>
              <button
                type="button"
                onClick={copyAll}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700"
              >
                {copiedKey === 'all' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{single ? 'Bilgileri Kopyala' : 'Tümünü Kopyala'}</span>
              </button>
              <button
                type="button"
                onClick={downloadExcel}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold"
              >
                {copiedKey === 'excel' ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                <span>Excel Olarak İndir</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

export const StudentWelcomeCredentialsModal: React.FC<StudentWelcomeCredentialsModalProps> = (props) =>
  props.isOpen ? <StudentWelcomeCredentialsContent {...props} /> : null;
