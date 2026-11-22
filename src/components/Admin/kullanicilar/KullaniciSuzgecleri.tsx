// Kullanıcı yönetimi › arama ve süzgeç çubuğu (Aşama 354d: ayrı parça)
import { Crown, GraduationCap, Search, RefreshCw, Ban, X, School, UserPlus, FileSpreadsheet, Send, VenusAndMars } from 'lucide-react';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function KullaniciSuzgecleri() {
  const { kurumLock, roleLock, embedded, isRefreshing, searchQuery, setSearchQuery, roleFilter, setRoleFilter, statusFilter, setStatusFilter, kurumFilter, setKurumFilter, setIsCreateTeacherOpen, setIsExcelTeacherOpen, setIsGenderFillOpen, setIsCredSendOpen, setStuPickOpen, canSendStudentCreds, handleRefresh, stats, isHead, canManageTeachers, kurumOptions } = useKullaniciBaglam();
  return (
    <>
      <div className="bg-surface/95 border border-line rounded-2xl p-4 shadow-md flex flex-col gap-3">
        {/* Aşama 320: arama + süzgeçler bir satır, işlem düğmeleri ayrı ve sarılan satır (önceden hepsi tek satırdaydı, sm+ sarılmadığı için düğmeler ekran dışına kayıyordu) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0 lg:min-w-64">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input autoComplete="off"
              type="text"
              placeholder="İsim, telefon, branş veya sınıf ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-field w-full pl-10 pr-4"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="ui-input-btn right-3"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter */}
            <div className={`w-[calc(50%-0.25rem)] sm:w-auto ${roleLock ? 'hidden' : ''}`}>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="ui-field w-full sm:w-40 text-xs font-semibold"
              >
                <option value="all" className="bg-surface text-fg">Tüm Roller</option>
                <option value="admin" className="bg-surface text-fg">Yöneticiler (Admin)</option>
                <option value="teacher" className="bg-surface text-fg">Öğretmenler</option>
                <option value="student" className="bg-surface text-fg">Öğrenciler</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-[calc(50%-0.25rem)] sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="ui-field w-full sm:w-40 text-xs font-semibold"
              >
                <option value="all" className="bg-surface text-fg">Tüm Durumlar</option>
                <option value="active" className="bg-surface text-fg">Aktif</option>
                <option value="suspended" className="bg-surface text-fg">Askıda (Dondurulmuş)</option>
                <option value="rejected" className="bg-surface text-fg">Reddedilen</option>
              </select>
            </div>

            {/* Kurum Filter (genel yönetici) */}
            {isHead && kurumLock === undefined && kurumOptions.length > 0 && (
              <div className="w-[calc(50%-0.25rem)] sm:w-auto">
                <select
                  id="users-kurum-filter"
                  value={kurumFilter}
                  onChange={(e) => setKurumFilter(e.target.value)}
                  className="ui-field w-full sm:w-40 text-xs font-semibold"
                  aria-label="Kurum"
                >
                  <option value="" className="bg-surface text-fg">Tüm Kurumlar</option>
                  <option value="merkez" className="bg-surface text-fg">Sizin (kurumsuz) kayıtlar</option>
                  {kurumOptions.map((k) => (
                    <option key={k.id} value={k.id} className="bg-surface text-fg">
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || (kurumLock === undefined && kurumFilter)) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                  setStatusFilter('all');
                  setKurumFilter(kurumLock ?? '');
                }}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg min-w-24"
              >
                Temizle
              </button>
            )}
          </div>
        </div>

        {embedded && (
          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-line" role="toolbar" aria-label="Hesap işlemleri">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 px-0 justify-center"
              title="Verileri yeniden yükle"
              aria-label="Verileri yeniden yükle"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {canManageTeachers && roleLock !== 'student' && (
              <button
                type="button"
                onClick={() => setIsCreateTeacherOpen(true)}
                className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
                title="Yeni öğretmen için giriş hesabı aç"
                id="yonetim-yeni-ogretmen"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Öğretmen</span>
              </button>
            )}
            {canManageTeachers && roleLock !== 'student' && (
              <button
                type="button"
                onClick={() => setIsExcelTeacherOpen(true)}
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                title="Öğretmenleri Excel dosyasından toplu ekle"
                id="yonetim-ogretmen-excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel ile</span>
              </button>
            )}
            {canManageTeachers && roleLock !== 'student' && (
              <button
                type="button"
                onClick={() => setIsGenderFillOpen(true)}
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                title="Cinsiyeti boş öğretmenleri adlarından tahmin edip doldur (kaydetmeden önce kontrol edersiniz)"
                id="yonetim-ogretmen-cinsiyet"
              >
                <VenusAndMars className="w-3.5 h-3.5" />
                <span>Cinsiyet</span>
              </button>
            )}
            {canManageTeachers && roleLock !== 'student' && (
              <button
                type="button"
                onClick={() => setIsCredSendOpen(true)}
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                title="Öğretmenlere giriş bilgisini SMS / e-postayla gönder"
                id="yonetim-ogretmen-giris-gonder"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Giriş Bilgisi</span>
              </button>
            )}
            {canSendStudentCreds && roleLock !== 'teacher' && (
              <button
                type="button"
                onClick={() => setStuPickOpen(true)}
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                title="Öğrencilere ve velilerine giriş bilgisini SMS / e-postayla gönder"
                id="yonetim-ogrenci-giris-gonder"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{roleLock === 'student' ? 'Giriş Bilgisi' : 'Öğrenci Girişi'}</span>
              </button>
            )}
          </div>
        )}

        {!embedded && (
          <>
        {/* Quick Role & Status Filter Pill Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
          <span className="text-xs font-bold text-muted">Hızlı Filtre:</span>
          <button
            type="button"
            onClick={() => {
              setRoleFilter('all');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'all' && statusFilter === 'all'
                ? 'bg-brand text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-fg-2'
            }`}
          >
            Tümü ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'admin' && statusFilter === 'all' ? 'all' : 'admin');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'admin' && statusFilter === 'all'
                ? 'bg-warning text-slate-950 shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-warning-fg'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Yöneticiler ({stats.admins})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'teacher' && statusFilter === 'all' ? 'all' : 'teacher');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'teacher' && statusFilter === 'all'
                ? 'bg-brand text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-brand-fg'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Öğretmenler ({stats.teachers})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'student' && statusFilter === 'all' ? 'all' : 'student');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'student' && statusFilter === 'all'
                ? 'bg-success text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-success-fg'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Öğrenciler ({stats.students})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended');
              setRoleFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              statusFilter === 'suspended'
                ? 'bg-danger text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-danger-fg'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Askıda ({stats.suspended})</span>
          </button>
        </div>
          </>
        )}
      </div>
    </>
  );
}
export default KullaniciSuzgecleri;
