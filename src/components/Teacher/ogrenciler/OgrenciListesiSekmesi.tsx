// Öğrenciler sayfası › Öğrenciler sekmesi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { ShowMoreBar } from '../../../lib/listPaging';
import { Users, Search, Trash2, AlertTriangle, CheckSquare, ArrowUpDown, ShieldCheck, KeyRound } from 'lucide-react';
import { formatClassDisplayName } from '../../../constants/schoolConstants';
import { useOgrenciBaglam } from './useOgrenciYonetimi';
import { OgrenciKarti, OgrenciTabloSatiri } from './OgrenciSatirlari';

export function OgrenciListesiSekmesi() {
  const { satirIslemleri, students, classes, searchTerm, setSearchTerm, selectedClassFilter, setSelectedClassFilter, sortOrder, setSortOrder, selectedStudentIds, setSelectedStudentIds, setCredSendList, grantMoveOn, credSendStudents, setIsBulkDeleteModalOpen, isAdmin, canAddStudents, genderFilter, setGenderFilter, duplicateStudentGroups, isStudentUnassigned, unassignedStudentsCount, filteredStudents, genderCounts, isPhoneList, quickClassOptions, grantedQuickOptions, classCountMap, pagedStudents, allFilteredSelected, someFilteredSelected, handleToggleSelectAll } = useOgrenciBaglam();
  return (
    <>
      <div className="space-y-4">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-xl bg-brand-soft text-brand-fg text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Size yetki verilen <strong>{classes.length} sınıf</strong> ve öğrencileri görünür. Öğrenci ekleme, çıkarma ve bilgi düzenleme
                yöneticinize aittir; siz ödev, etüt, soru hedefi, not ve yoklama işlemlerini yapabilirsiniz.
              </span>
            </div>
          )}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
          {/* Duplicate Students System Warning Banner */}
          {duplicateStudentGroups.totalDuplicates > 0 && (
            <div className="mx-4 sm:mx-5 mt-4 p-4 rounded-2xl bg-warning-soft border border-warning/30 text-warning-fg flex items-start gap-3 shadow-xs">
              <div className="p-2.5 bg-warning/20 text-warning-fg rounded-xl shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-warning-fg" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-sm text-warning-fg flex items-center gap-1.5">
                    <span>⚠️ Sistem Uyarısı: Aynı İsim, Sınıf ve Numaraya Sahip Öğrenciler Tespit Edildi!</span>
                  </h4>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-warning-soft text-warning-fg font-bold border border-warning/30">
                    {duplicateStudentGroups.totalDuplicates} Kayıt İşaretlendi
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-danger-soft text-danger-fg font-bold border border-danger/30">
                    {Object.keys(duplicateStudentGroups.groups).filter(k => duplicateStudentGroups.groups[k].length > 1).length} Çakışan Grup
                  </span>
                </div>
                <p className="text-xs text-warning-fg/90 mt-1.5 leading-relaxed">
                  {/* Aşama 184: kısaltıldı */}
                  <strong>Aynı ad, sınıf ve numaralı</strong> kayıtlar listede yan yana gösteriliyor (1. kayıt turuncu, 2. kayıt kırmızı).
                </p>
              </div>
            </div>
          )}

          {/* Quick Class Change Feedback Banner */}

          {/* Filter / Search Bar */}
          <div className="p-4 sm:p-5 border-b border-line flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input autoComplete="off"
                type="text"
                placeholder="Öğrenci adı veya numarası ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ui-field w-full pl-10 pr-3"
              />
            </div>

            <div className="grid grid-cols-3 md:flex items-center gap-2 md:gap-3 w-full md:w-auto">
              {/* Sınıf Filtresi (Tanımsız seçeneği dahil) */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden lg:inline text-xs text-muted font-semibold whitespace-nowrap">Sınıf:</span>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="ui-field w-full md:w-auto min-w-0 text-fg-2 font-semibold cursor-pointer"
                >
                  <option value="all">Tüm Sınıflar ({students.length})</option>
                  {duplicateStudentGroups.totalDuplicates > 0 && (
                    <option value="duplicates">⚠️ Mükerrer Kayıtlar ({duplicateStudentGroups.totalDuplicates})</option>
                  )}
                  <option value="unassigned">Yok ({unassignedStudentsCount})</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)} ({classCountMap.get(cls.id) || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Aşama 171: Cinsiyet süzgeci */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden lg:inline text-xs text-muted font-semibold whitespace-nowrap">Cinsiyet:</span>
                <select
                  id="ogrenci-cinsiyet-suzgeci"
                  aria-label="Cinsiyete göre süz"
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as 'all' | 'K' | 'E' | 'none')}
                  className="ui-field w-full md:w-auto min-w-0 text-fg-2 font-semibold cursor-pointer"
                >
                  <option value="all">Tümü ({students.length})</option>
                  <option value="K">Kız ({genderCounts.k})</option>
                  <option value="E">Erkek ({genderCounts.e})</option>
                  <option value="none">Belirtilmemiş ({genderCounts.none})</option>
                </select>
              </div>

              {/* Sırala Açılır Butonu (A-Z / Z-A) */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden lg:flex text-xs text-muted font-semibold whitespace-nowrap items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-subtle" />
                  <span>Sırala:</span>
                </span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="ui-field w-full md:w-auto min-w-0 text-fg-2 font-semibold cursor-pointer"
                >
                  <option value="default">Varsayılan Sıralama</option>
                  <option value="name-asc">Alfabetik (A → Z)</option>
                  <option value="name-desc">Alfabetik (Z → A)</option>
                  <option value="number-asc">Öğrenci No (Küçükten Büyüğe)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Toplu İşlem & Çoklu Silme Barı */}
          {selectedStudentIds.length > 0 && (
            <div className="px-4 sm:px-6 py-3 bg-danger-soft border-b border-danger/30 flex flex-wrap items-center justify-between gap-3 text-fg transition animate-in fade-in duration-200">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-danger text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  {selectedStudentIds.length}
                </div>
                <div>
                  <span className="text-xs font-bold text-danger-fg">
                    {selectedStudentIds.length} Öğrenci Seçildi
                  </span>
                  <span className="text-xs text-danger-fg ml-1.5 hidden sm:inline">
                    (Listelenen {filteredStudents.length} öğrenci arasından)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="ui-btn ui-btn-sm text-fg-2 bg-surface border border-line-strong hover:bg-surface-2 min-w-24"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-brand-fg" />
                  <span>{allFilteredSelected ? 'Tümünün Seçimini Kaldır' : `Tümünü Seç (${filteredStudents.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds([])}
                  className="ui-btn ui-btn-sm text-muted hover:text-fg bg-surface border border-line hover:bg-surface-2 min-w-24"
                >
                  Temizle
                </button>
                {credSendStudents.length > 0 && (
                  <button
                    type="button"
                    id="ogrenci-giris-bilgisi-gonder"
                    onClick={() => setCredSendList(credSendStudents)}
                    className="ui-btn ui-btn-primary ui-btn-sm h-8 justify-center"
                    title="Seçilen öğrencilere ve/veya velilerine giriş bilgisini SMS / e-posta ile gönder"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Giriş Bilgisi Gönder ({credSendStudents.length})</span>
                  </button>
                )}
                {canAddStudents && (
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="ui-btn ui-btn-danger ui-btn-sm min-w-24"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilen Öğrencileri Sil ({selectedStudentIds.length})</span>
                </button>
                )}
              </div>
            </div>
          )}

          {/* Telefon: kart listesi */}
          {/* Aşama 225 (HIZ): satırlarda "ekran dışını çizme" (cv-row) kaldırıldı; liste zaten 50'şer satır. Ölçümde
              kaydırma sırasında her yeni satır için ayrıca yerleşim/boyama yaptırıp telefonda takılmayı artırıyordu. */}
          {isPhoneList && (
          <ul className="md:hidden divide-y divide-line" id="students-mobile-list">
            {filteredStudents.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">Arama kriterlerine uygun öğrenci bulunamadı.</li>
            ) : (
              pagedStudents.visible.map((std) => {
                const dupInfo = duplicateStudentGroups.dupMap.get(std.id);
                const isSelected = selectedStudentIds.includes(std.id);
                const suspended = std.isSuspended || std.status === 'suspended';
                return (
                  <OgrenciKarti
                    key={std.id}
                    std={std}
                    isSelected={isSelected}
                    dupInfo={dupInfo}
                    islem={satirIslemleri}
                  />
                );
              })
            )}
          </ul>
          )}

          {/* Students Table */}
          {!isPhoneList && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-fg-2">
              <thead className="bg-surface-2/90 text-xs uppercase tracking-wider text-muted border-b border-line font-bold">
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={filteredStudents.length > 0 && allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        title={allFilteredSelected ? 'Tümünün Seçimini Kaldır' : 'Hepsini Seç'}
                        className="w-4 h-4 rounded border-line-strong text-brand-fg focus:ring-brand cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci</th>
                  <th className="px-6 py-3.5 font-semibold">Sınıf / Şube</th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci No</th>
                  <th className="px-6 py-3.5 font-semibold">Giriş Hesabı</th>
                  <th className="px-6 py-3.5 font-semibold">Kayıt Durumu</th>
                  <th className="px-6 py-3.5 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-subtle">
                      <Users className="w-8 h-8 mx-auto text-subtle mb-2" />
                      <p className="font-semibold text-sm text-muted">Arama kriterlerine uygun öğrenci bulunamadı.</p>
                      <p className="text-xs text-subtle mt-1">Lütfen arama teriminizi veya sınıf filtresini değiştirip tekrar deneyin.</p>
                    </td>
                  </tr>
                ) : (
                  pagedStudents.visible.map((std) => {
                    const dupInfo = duplicateStudentGroups.dupMap.get(std.id);
                    const isDuplicate = !!dupInfo;
                    const isSelected = selectedStudentIds.includes(std.id);
                    return (
                    <OgrenciTabloSatiri
                      key={std.id}
                      std={std}
                      isSelected={isSelected}
                      dupInfo={dupInfo}
                      atanmamis={isStudentUnassigned(std)}
                      grantMoveOn={grantMoveOn}
                      quickClassOptions={quickClassOptions}
                      grantedQuickOptions={grantedQuickOptions}
                      islem={satirIslemleri}
                    />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
          <ShowMoreBar
            id="students-show-more"
            remaining={pagedStudents.remaining}
            total={pagedStudents.total}
            shown={pagedStudents.visible.length}
            onMore={pagedStudents.showMore}
            onAll={pagedStudents.showAll}
          />
        </div>
      </div>
    </>
  );
}
export default OgrenciListesiSekmesi;
