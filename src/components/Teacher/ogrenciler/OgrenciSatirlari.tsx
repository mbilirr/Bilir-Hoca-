// Öğrenciler sayfası › liste satırları (Aşama 354a). memo: bir öğrenci değişince yalnız o satır yeniden çizilir;
// arama kutusuna yazmak, seçim ya da sayfadaki başka bir alan bütün satırları baştan çizdirmez.
import { memo } from 'react';
import { Edit2, Trash2, Key, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import type { Student } from '../../../types';
import { dataService } from '../../../services/dataService';
import { profilResmi } from '../../../lib/profilResmi';
import { canMoveGrantedStudent } from '../../../lib/grantMove';
import { QuickClassSelect, type QuickClassOption } from './ortak';
import type { OgrenciSatirIslemleri, MukerrerBilgi } from './useOgrenciYonetimi';

export const OgrenciKarti = memo(function OgrenciKarti({
  std,
  isSelected,
  dupInfo,
  islem,
}: {
  std: Student;
  isSelected: boolean;
  dupInfo: MukerrerBilgi | undefined;
  islem: OgrenciSatirIslemleri;
}) {
  const suspended = std.isSuspended || std.status === 'suspended';
  return (
    <li className={`px-4 py-3 ${isSelected ? 'bg-brand-soft' : ''}`}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => islem.sec(std.id)}
          className="w-4 h-4 rounded border-line-strong cursor-pointer shrink-0"
          aria-label={`${std.name} seç`}
        />
        <img loading="lazy" decoding="async"
          src={profilResmi(std, 'student')}
          alt=""
          className="w-10 h-10 rounded-full object-cover bg-surface-2 ring-2 ring-line shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{std.name}</p>
          <p className="text-xs text-muted truncate">
            #{std.studentNumber} · {std.className || 'Sınıfı yok'}
          </p>
        </div>
        {dataService.canManageStudent(std) && (
          <>
            <button
              type="button"
              onClick={() => islem.duzenle(std)}
              className="ui-btn ui-btn-ghost ui-btn-icon"
              aria-label="Düzenle"
              title="Düzenle"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            {dataService.canDeleteStudent(std) && (
              <button
                type="button"
                onClick={() => islem.sil(std)}
                className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg"
                aria-label="Öğrenciyi Sil"
                title="Öğrenciyi Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-[4.25rem]">
        {dupInfo && <span className="ui-chip ui-chip-warning">Mükerrer ({dupInfo.colorTheme.label})</span>}
        <span className={`ui-chip ${suspended ? 'ui-chip-danger' : 'ui-chip-success'}`}>{suspended ? 'Askıda' : 'Aktif'}</span>
        {dataService.canManageStudent(std) && (
        <button
          type="button"
          onClick={() => islem.sifre(std)}
          className={`ui-chip cursor-pointer ${std.auth_user_id ? 'ui-chip-neutral' : 'ui-chip-warning'}`}
          title={std.auth_user_id ? 'Yeni şifre belirle' : 'Şifre belirleyip giriş hesabı aç'}
        >
          <Key className="w-3 h-3" />
          {std.auth_user_id ? 'Şifre yenile' : 'Hesap yok · aç'}
        </button>
        )}
      </div>
    </li>
  );
});

export const OgrenciTabloSatiri = memo(function OgrenciTabloSatiri({
  std,
  isSelected,
  dupInfo,
  atanmamis,
  grantMoveOn,
  quickClassOptions,
  grantedQuickOptions,
  islem,
}: {
  std: Student;
  isSelected: boolean;
  dupInfo: MukerrerBilgi | undefined;
  atanmamis: boolean;
  grantMoveOn: boolean;
  quickClassOptions: QuickClassOption[];
  grantedQuickOptions: QuickClassOption[];
  islem: OgrenciSatirIslemleri;
}) {
  const isDuplicate = !!dupInfo;
  return (
    <tr
      className={
        isSelected
          ? 'bg-brand-soft/70 hover:bg-brand-soft/70 transition-colors border-l-4 border-l-brand'
          : isDuplicate && dupInfo
          ? `${dupInfo.colorTheme.rowBg} ${dupInfo.colorTheme.rowHover} transition-colors ${dupInfo.colorTheme.borderLeft}`
          : 'hover:bg-surface-2/80 transition-colors'
      }
    >
      <td className="px-4 py-4 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => islem.sec(std.id)}
          className="w-4 h-4 rounded border-line-strong text-brand-fg focus:ring-brand cursor-pointer"
        />
      </td>

      <td className="px-6 py-4">
        <div className="flex items-center space-x-3">
          <img loading="lazy" decoding="async"
            src={
              profilResmi(std, 'student')
            }
            alt={std.name}
            className={`w-10 h-10 rounded-full object-cover ring-2 ${
              isSelected
                ? 'bg-brand-soft ring-brand shadow-xs'
                : isDuplicate && dupInfo
                ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.ringColor} shadow-xs`
                : 'bg-surface-2 ring-line'
            }`}
          />
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {isDuplicate && dupInfo && (
                <span
                  className={`px-2 py-0.5 rounded-lg text-2xs font-bold uppercase tracking-wider text-white shadow-2xs ${dupInfo.colorTheme.pillBg}`}
                  title={`${dupInfo.colorTheme.label} - Bu öğrenci ile aynı isim, sınıf ve okul numarasına sahip ${dupInfo.groupCount} kayıt bulunmaktadır.`}
                >
                  {dupInfo.colorTheme.label}
                </span>
              )}
              <span
                className={`text-sm ${
                  isSelected
                    ? 'text-brand-fg font-bold'
                    : isDuplicate && dupInfo
                    ? dupInfo.colorTheme.nameColor
                    : 'text-fg font-bold'
                }`}
              >
                {std.name}
              </span>
              {isDuplicate && dupInfo && (
                <span
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-2xs font-bold border ${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Mükerrer ({dupInfo.colorTheme.label} • Aynı İsim, Sınıf ve No)</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      <td className="px-6 py-4">
        {canMoveGrantedStudent(std, grantMoveOn) ? (
        <QuickClassSelect
          value={std.classId || 'unassigned'}
          options={grantedQuickOptions}
          allowNone={false}
          onPick={(v) => islem.sinifDegistir(std, v)}
          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer transition shadow-2xs ${
            isDuplicate && dupInfo
              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`
              : 'bg-brand-soft text-brand-fg border-brand/30 hover:border-brand hover:bg-brand-soft'
          }`}
          title="Genel yöneticinin açtığı sınıflar arasında taşımak için seçiniz"
        />
        ) : !dataService.canManageStudent(std) ? (
          <span className="text-xs font-semibold text-fg-2">{std.className || 'Yok'}</span>
        ) : (
        <QuickClassSelect
          value={std.classId || 'unassigned'}
          options={quickClassOptions}
          onPick={(v) => islem.sinifDegistir(std, v)}
          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer transition shadow-2xs ${
            atanmamis
              ? 'bg-surface-2 text-fg-2 border-line-strong hover:border-line-strong'
              : isDuplicate && dupInfo
              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`
              : 'bg-brand-soft text-brand-fg border-brand/30 hover:border-brand hover:bg-brand-soft'
          }`}
          title="Öğrencinin sınıfını anında değiştirmek için seçiniz"
        />
        )}
      </td>

      <td className="px-6 py-4">
        <span
          className={`font-mono font-semibold text-xs px-2.5 py-1 rounded-lg border ${
            isDuplicate && dupInfo
              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder} ring-1 font-bold`
              : 'text-fg-2 bg-surface-2 border-line'
          }`}
        >
          #{std.studentNumber}
        </span>
      </td>

      <td className="px-6 py-4">
        <div className="flex items-center space-x-2">
          {std.auth_user_id ? (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-success-soft text-success-fg border border-success/30"
              title="Öğrenci, öğrenci numarası ve şifresiyle giriş yapabilir"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Açık</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-warning-soft text-warning-fg border border-warning/30"
              title="Bu öğrencinin giriş hesabı yok. Şifre belirleyerek hesap açabilirsiniz."
            >
              <Lock className="w-3 h-3" />
              <span>Hesap yok</span>
            </span>
          )}
          {dataService.canManageStudent(std) && (
          <button
            type="button"
            onClick={() => islem.sifre(std)}
            className="ui-btn-mini"
            title={std.auth_user_id ? 'Yeni şifre belirle' : 'Şifre belirleyip giriş hesabı aç'}
          >
            <Key className="w-3.5 h-3.5" />
          </button>
          )}
        </div>
      </td>

      <td className="px-6 py-4">
        {isDuplicate && dupInfo ? (
          <span
            className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Mükerrer ({dupInfo.colorTheme.label})</span>
          </span>
        ) : std.isSuspended || std.status === 'suspended' ? (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger-soft text-danger-fg border border-danger/30">
            <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>
            <span>Askıda</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-soft text-success-fg border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            <span>Aktif Öğrenci</span>
          </span>
        )}
      </td>

      <td className="px-6 py-4 text-right">
        {dataService.canManageStudent(std) && (
        <div className="flex items-center justify-end space-x-1.5">
          <button
            type="button"
            onClick={() => islem.duzenle(std)}
            className="ui-btn ui-btn-secondary ui-btn-icon"
            title="Düzenle"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {dataService.canDeleteStudent(std) && (
            <button
              type="button"
              onClick={() => islem.sil(std)}
              className="ui-btn ui-btn-secondary ui-btn-icon hover:bg-danger-soft hover:text-danger-fg"
              title="Öğrenciyi Sil"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        )}
      </td>
    </tr>
  );
});
