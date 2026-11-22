// Öğrenciler sayfası: sayfanın ortak yardımcıları (Aşama 354a, StudentManagement.tsx bölündü)
import React, { useState } from 'react';
import { Student, ClassGroup } from '../../../types';
import { lazyNamed } from '../../../lib/lazyLoad';
import { inputCls } from '../FormParts';
import { cx } from '../../ui/kit';

 // Aşama 161
// Aşama 124: Excel pencereleri (ve xlsx kütüphanesi) yalnız açılınca indirilir
export const ExcelStudentUploadModal = lazyNamed(() => import('../ExcelStudentUploadModal'), 'ExcelStudentUploadModal');

export const ExcelStudentUpdateModal = lazyNamed(() => import('../ExcelStudentUpdateModal'), 'ExcelStudentUpdateModal');

export const ExcelClassUploadModal = lazyNamed(() => import('../ExcelClassUploadModal'), 'ExcelClassUploadModal');

export const StudentListExportModal = lazyNamed(() => import('../StudentListExportModal'), 'StudentListExportModal');

// Aşama 171: cinsiyeti addan doldur (ad listesi yalnız açılınca iner)
export const CinsiyetDoldurModal = lazyNamed(() => import('../../Admin/CinsiyetDoldurModal'), 'CinsiyetDoldurModal');

export const StudentWelcomeCredentialsModal = lazyNamed(() => import('../StudentWelcomeCredentialsModal'), 'StudentWelcomeCredentialsModal');

// Aşama 142: seçilen öğrencilere giriş bilgisi SMS / e-posta (pencere ilk tıklamada yüklenir)
export const CredentialSendModal = lazyNamed(() => import('../../Common/CredentialSendModal'), 'CredentialSendModal');

// Aşama 151: sayfa başlığındaki "Giriş Bilgisi" düğmesi (sınıf seç → öğrencileri işaretle → gönder)
export const StudentCredentialPickModal = lazyNamed(() => import('../../Admin/StudentCredentialPickModal'), 'StudentCredentialPickModal');

 // Aşama 334

export interface StudentManagementProps {
  students: Student[];
  classes: ClassGroup[];
  onSelectStudentForHomework?: (student: Student) => void;
}

/** Aşama 72: öğrenci bilgileri penceresindeki kutular küçük ve sıkı (pencere dikdörtgen kalır) */
export const SF = 'h-8 text-xs px-2.5 py-1 rounded-lg';

// Aşama 202: Sınıf Ekle / Düzenle penceresi; alanlar aynı boy, düğmeler aynı en ve boy (h-8 w-24, kısa yazı)
export const classLabelCls = 'block text-xs font-semibold text-fg-2 mb-1';

export const classCtrlCls = inputCls;

 // Aşama 205: ortak 32 px
export const classBtnCls = (variant: string, extra?: string) =>
  cx('ui-btn ui-btn-sm h-8 w-24 min-w-0 px-2 py-0 justify-center', variant, extra);

// HIZ (Aşama 84): tablo satırındaki "sınıf değiştir" kutusu, kişi kutuya dokunana / tıklayana kadar yalnızca
// mevcut sınıfı içerir; seçenekler o anda eklenir. 50 satır × tüm sınıflar yüzlerce gereksiz öğe demekti
// (sayfanın ilk açılışını yavaşlatıyordu). Görünüm ve kullanım aynıdır.
export type QuickClassOption = { id: string; label: string; manageable: boolean };

export const QuickClassSelect: React.FC<{
  value: string;
  options: QuickClassOption[];
  className: string;
  title: string;
  onPick: (classId: string) => void;
  /** Aşama 161: açılan sınıf öğrencisinde "Yok" seçeneği yoktur (öğrenci sınıfsız bırakılamaz) */
  allowNone?: boolean;
}> = ({ value, options, className, title, onPick, allowNone = true }) => {
  const [armed, setArmed] = useState(false);
  const arm = () => {
    if (!armed) setArmed(true);
  };
  const current = options.find((o) => o.id === value);
  return (
    <select
      value={value}
      onChange={(e) => onPick(e.target.value)}
      onPointerDown={arm}
      onMouseDown={arm}
      onTouchStart={arm}
      onFocus={arm}
      onKeyDown={arm}
      className={className}
      title={title}
    >
      {armed ? (
        <>
          {allowNone && <option value="unassigned">Yok</option>}
          {options
            .filter((o) => o.id === value || o.manageable)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </>
      ) : (
        <option value={value}>{current ? current.label : 'Yok'}</option>
      )}
    </select>
  );
};

// Aşama 274: sınıf ayrıntısı ızgarası için sıralama. Okul no sayısal (no'suz olanlar sonda, kendi içinde alfabetik);
// alfabetik Türkçe kurallarıyla (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde).
export function siraliSinifOgrencileri(list: Student[], sira: 'no' | 'ad'): Student[] {
  const adKarsilastir = (a: Student, b: Student) =>
    (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
  if (sira === 'ad') return [...list].sort(adKarsilastir);
  const no = (s: Student) => {
    const n = parseInt(String(s.studentNumber || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  return [...list].sort((a, b) => {
    const na = no(a);
    const nb = no(b);
    if (na !== nb) return na < nb ? -1 : 1;
    return adKarsilastir(a, b);
  });
}
