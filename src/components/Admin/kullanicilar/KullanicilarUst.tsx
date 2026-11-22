// Kullanıcı yönetimi › başlık, sayı kartları ve yetki penceresi (Aşama 354d: ayrı parça)
import { Users, Crown, GraduationCap, RefreshCw, Ban, School, UserPlus, FileSpreadsheet, Send } from 'lucide-react';
import { YetkilerAcici } from '../YetkilerModal';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function KullanicilarUst() {
  const { embedded, roleSettings, isRefreshing, roleFilter, setRoleFilter, statusFilter, setStatusFilter, yetkiTeacherId, setYetkiTeacherId, setIsCreateTeacherOpen, setIsExcelTeacherOpen, setIsCredSendOpen, showToast, handleRefresh, stats, canManageTeachers } = useKullaniciBaglam();
  return (
    <>
      {yetkiTeacherId && (
        <YetkilerAcici
          teacherId={yetkiTeacherId}
          roleSettings={roleSettings}
          onClose={() => setYetkiTeacherId(null)}
          onSaved={(m) => showToast(m, 'success')}
        />
      )}

      {!embedded && (
        <>
{/* Bölüm başlığı */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-soft text-warning-fg flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg tracking-tight">Kullanıcılar ve Yetkiler</h2>
            <p className="text-xs sm:text-sm text-muted">Öğretmen ve öğrenci hesapları, roller, şifreler ve hesap durumu</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ui-btn ui-btn-secondary ui-btn-icon"
            title="Verileri yeniden yükle"
            aria-label="Verileri yeniden yükle"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsCreateTeacherOpen(true)}
              className="ui-btn ui-btn-primary"
              title="Yeni öğretmen için giriş hesabı aç"
            >
              <UserPlus className="w-4 h-4" />
              <span>Yeni Öğretmen Hesabı</span>
            </button>
          )}
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsExcelTeacherOpen(true)}
              className="ui-btn ui-btn-secondary"
              title="Öğretmenleri Excel dosyasından toplu ekle"
              id="ogretmen-excel-ekle-ust"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel ile Ekle</span>
            </button>
          )}
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsCredSendOpen(true)}
              className="ui-btn ui-btn-secondary"
              title="Öğretmenlere giriş bilgisini SMS / e-postayla gönder"
              id="ogretmen-giris-gonder-ust"
            >
              <Send className="w-4 h-4" />
              <span>Giriş Bilgisi Gönder</span>
            </button>
          )}
        </div>
      </div>
        </>
      )}

      {/* Aşama 284: öğrenci kayıt başvuruları bölümü kaldırıldı (öğrenciyi kurum ekler) */}

      {!embedded && (
        <>
{/* Metric Cards - Clickable Interactive Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Toplam */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter('all');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            roleFilter === 'all' && statusFilter === 'all'
              ? 'border-brand ring-2 ring-brand/50 bg-brand-soft'
              : 'border-line hover:border-line hover:bg-surface-2/50'
          }`}
        >
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-bold">Toplam Kullanıcı</span>
            <Users className="w-4 h-4 text-brand-fg" />
          </div>
          <p className="text-2xl font-bold text-fg">{stats.total}</p>
          <span className="text-2xs text-muted mt-1 block">Tüm kayıtları listele</span>
        </button>

        {/* Yöneticiler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'admin' && statusFilter === 'all' ? 'all' : 'admin');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            roleFilter === 'admin' && statusFilter === 'all'
              ? 'border-warning ring-2 ring-warning/50 bg-warning-soft'
              : 'border-warning/20 hover:border-warning/40 hover:bg-warning-soft'
          }`}
        >
          <div className="flex items-center justify-between text-warning-fg mb-2">
            <span className="text-xs font-bold">Yöneticiler</span>
            <Crown className="w-4 h-4 text-warning-fg" />
          </div>
          <p className="text-2xl font-bold text-fg">{stats.admins}</p>
          <span className="text-2xs text-warning-fg/70 mt-1 block">Tam Yetkili (Admin)</span>
        </button>

        {/* Öğretmenler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'teacher' && statusFilter === 'all' ? 'all' : 'teacher');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            roleFilter === 'teacher' && statusFilter === 'all'
              ? 'border-brand ring-2 ring-brand/50 bg-brand-soft'
              : 'border-brand/20 hover:border-brand/40 hover:bg-brand-soft'
          }`}
        >
          <div className="flex items-center justify-between text-brand-fg mb-2">
            <span className="text-xs font-bold">Öğretmenler</span>
            <GraduationCap className="w-4 h-4 text-brand-fg" />
          </div>
          <p className="text-2xl font-bold text-fg">{stats.teachers}</p>
          <span className="text-2xs text-brand-fg/70 mt-1 block">Aktif Branş Eğitmenleri</span>
        </button>

        {/* Öğrenciler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'student' && statusFilter === 'all' ? 'all' : 'student');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            roleFilter === 'student' && statusFilter === 'all'
              ? 'border-success ring-2 ring-success/50 bg-success-soft'
              : 'border-success/20 hover:border-success/40 hover:bg-success-soft'
          }`}
        >
          <div className="flex items-center justify-between text-success-fg mb-2">
            <span className="text-xs font-bold">Öğrenciler</span>
            <School className="w-4 h-4 text-success-fg" />
          </div>
          <p className="text-2xl font-bold text-fg">{stats.students}</p>
          <span className="text-2xs text-success-fg/70 mt-1 block">Kayıtlı Öğrenci Sayısı</span>
        </button>

        {/* Askıya Alınanlar */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended');
            setRoleFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition cursor-pointer ${
            statusFilter === 'suspended'
              ? 'border-danger ring-2 ring-danger/50 bg-danger-soft'
              : 'border-danger/20 hover:border-danger/40 hover:bg-danger-soft'
          }`}
        >
          <div className="flex items-center justify-between text-danger-fg mb-2">
            <span className="text-xs font-bold">Askıda / Dondurulan</span>
            <Ban className="w-4 h-4 text-danger-fg" />
          </div>
          <p className="text-2xl font-bold text-danger-fg">{stats.suspended}</p>
          <span className="text-2xs text-danger-fg/70 mt-1 block">Girişleri Kapatılmış</span>
        </button>

      </div>
        </>
      )}
    </>
  );
}
export default KullanicilarUst;
