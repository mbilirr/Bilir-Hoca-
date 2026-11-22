// Etütler › sayfa başlığı, görünüm seçimi, takip görünümü ve süzgeç çubuğu (Aşama 362: ayrı parça)
import { Suspense } from 'react';
import { CalendarDays, LayoutGrid, Plus, CalendarCheck, Mail, BarChart3, ListChecks, ClipboardList } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { PageHeader, Segmented } from '../../ui/kit';
import { MoreMenu } from '../../ui/MoreMenu';
import { EtutStatusLegend } from '../EtutStatusLegend';
import { EtutTakipView, DatePreset, DATE_PRESETS, TeacherPicker } from './ortak';
import { useEtutBaglam } from './useEtutYonetimi';

export function EtutlerUst() {
  const { etuts, students, classes, viewMode, setViewMode, setViewEtut, setIsSentCommunicationsOpen, setIsReportModalOpen, setIsScheduleExportOpen, setReportSelectedStudentId, isAdminView, wideView, scopeFilter, setScopeFilter, scope, myEtuts, activeEtuts, setListSubject, listSubjects, effectiveListSubject, setListTeacher, subjectScopedEtuts, listTeachers, effectiveListTeacher, missingEtutIdsByTeacher, missingAttendanceByTeacher, ackMissing, blinkingTeachers, datePreset, setDatePreset, rangeFrom, setRangeFrom, rangeTo, setRangeTo, listEtuts, setListTime, timeFilterOn, timeSource, listTimes, effectiveListTime, cardEtuts, calendarEtuts, filtersOn, clearFilters, openEtutForm } = useEtutBaglam();
  return (
    <>
      {/* Sayfa başlığı */}
      <PageHeader
        icon={CalendarDays}
        tone="info"
        title="Etütler"
        description="Etüt ve birebir çalışma planı, yoklama ve analiz"
        actions={
          <>
            {/* Aşama 207: seyrek işlemler "Diğer" menüsünde; yalnız Yeni etüt açıkta */}
            <MoreMenu
              id="btn-etut-more"
              label="Diğer"
              sheetTitle="Etüt"
              items={[
                {
                  id: 'btn-etut-schedule-export',
                  label: 'Etüt listesi indir',
                  icon: ListChecks,
                  title: 'Sınıfa göre günlük / haftalık etüt listesini Excel veya PDF olarak indir',
                  onClick: () => setIsScheduleExportOpen(true),
                },
                {
                  id: 'btn-etut-analysis',
                  label: 'Etüt analizi',
                  icon: BarChart3,
                  title: 'Sınıf ve öğrenci bazlı etüt analizi ve raporu',
                  onClick: () => {
                    setReportSelectedStudentId(undefined);
                    setIsReportModalOpen(true);
                  },
                },
                {
                  id: 'btn-etut-sent',
                  label: 'Gönderilenler',
                  icon: Mail,
                  title: 'Giden e-posta ve bildirimler',
                  onClick: () => setIsSentCommunicationsOpen(true),
                },
              ]}
            />
            {dataService.canPlanEtut() && (
              <button
                type="button"
                id="btn-create-etut"
                onClick={() => {
                  openEtutForm('create');
                }}
                className="ui-btn ui-btn-primary w-28"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni etüt</span>
              </button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {viewMode === 'takip' && isAdminView ? (
          /* Aşama 111: Takip her zaman kurumun tamamını gösterir (Benim / Tümü seçimi burada geçerli değil) */
          <span className="ui-chip ui-chip-neutral" id="etut-scope-takip" title="Takip görünümü kurumun bütün etütlerini gösterir">
            Tüm Okul ({etuts.length})
          </span>
        ) : wideView ? (
          <Segmented
            value={scopeFilter}
            onChange={(v) => setScopeFilter(v)}
            items={[
              { value: 'all', label: `${isAdminView ? 'Tüm Okul' : 'Zümrem'} (${etuts.length})`, id: 'etut-scope-all' },
              { value: 'mine', label: `Benim Etütlerim (${myEtuts.length})`, id: 'etut-scope-mine' },
            ]}
          />
        ) : (
          <span className="ui-chip ui-chip-neutral" id="etut-scope-mine-only" title="Oluşturduğunuz ve etüt öğretmeni olarak atandığınız etütler">
            Etütlerim ({myEtuts.length})
          </span>
        )}
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v)}
          items={[
            { value: 'calendar', label: 'Haftalık Takvim', icon: CalendarDays },
            { value: 'cards', label: `Liste (${activeEtuts.length})`, icon: LayoutGrid },
            { value: 'attendance', label: 'Yoklama', icon: CalendarCheck },
            ...(isAdminView ? [{ value: 'takip' as const, label: 'Takip', icon: ClipboardList, id: 'etut-view-takip' }] : []),
          ]}
        />
      </div>

      {/* Süzgeç çubuğu: Ders + Öğretmen açılır listeleri (Aşama 28) her görünümde; tarih süzgeci yalnız Liste ve Yoklama'da.
          Haftalık Takvim'in kendi hafta okları olduğu için orada tarih süzgeci gösterilmez. */}
      {viewMode === 'takip' && isAdminView && (
        <Suspense fallback={<div className="ui-card p-8 text-center text-sm text-muted">Yükleniyor…</div>}>
          <EtutTakipView etuts={etuts} students={students} classes={classes} onOpenEtut={setViewEtut} />
        </Suspense>
      )}

      {viewMode !== 'takip' && (
      <div className="ui-card p-3 sm:p-4 space-y-3" id="etut-filter-bar">
        {/* Aşama 33: Ders, Öğretmen, Ders saati ve Tarih aynı yükseklikte, aynı sırada, simetrik ızgarada.
            Aşama 33b: geniş ekranda kutular sayfayı doldurmaz; hepsi EŞİT genişlikte ve bu genişlik EN UZUN yazı kadardır
            (width: max-content + eşit 1fr sütunlar: her sütun en geniş içeriğe göre ölçülür; sığmazsa eşit küçülür). Telefon/tablette tam genişlik. */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end w-full lg:w-max lg:max-w-full lg:grid-cols-none lg:grid-flow-col lg:[grid-auto-columns:1fr]"
          id="etut-filter-grid"
        >
          <div className="min-w-0">
            <label htmlFor="etut-list-subject" className="block text-xs font-semibold text-muted mb-1">
              Ders
            </label>
            <select
              id="etut-list-subject"
              value={effectiveListSubject}
              onChange={(e) => setListSubject(e.target.value)}
              className="ui-field w-full"
            >
              <option value="all">Tüm dersler ({activeEtuts.length})</option>
              {listSubjects.map(([s, n]) => (
                <option key={s} value={s}>
                  {s} ({n})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <span id="etut-list-teacher-label" className="block text-xs font-semibold text-muted mb-1">
              Öğretmen
            </span>
            {/* Aşama 32: düz <select> yanıp sönemediği için özel açılır liste. Yoklama görünümünde yoklama almayan
                öğretmenler kırmızı yan-sön ile ve "N yoklama eksik" yazısıyla gösterilir. */}
            <TeacherPicker
              value={effectiveListTeacher}
              onChange={setListTeacher}
              allLabel={
                effectiveListSubject === 'all'
                  ? `Tüm öğretmenler (${activeEtuts.length})`
                  : `${effectiveListSubject} öğretmenleri (${subjectScopedEtuts.length})`
              }
              options={listTeachers}
              missing={missingAttendanceByTeacher}
              blinking={blinkingTeachers}
              onAcknowledge={(t) => ackMissing(missingEtutIdsByTeacher.get(t) || [])}
              blink={viewMode === 'attendance'}
            />
          </div>
          {timeFilterOn && (
            <div className={`min-w-0 ${viewMode === 'calendar' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
              <label htmlFor="etut-list-time" className="block text-xs font-semibold text-muted mb-1">
                Ders saati
              </label>
              <select
                id="etut-list-time"
                value={effectiveListTime}
                onChange={(e) => setListTime(e.target.value)}
                className="ui-field w-full"
              >
                <option value="all">Tüm saatler ({timeSource.length})</option>
                {listTimes.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({v.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Aşama 33c: Tarih süzgeci de aynı sırada, aynı biçimde (açılır liste). Haftalık Takvim'in kendi hafta okları var. */}
          {viewMode !== 'calendar' && (
            <div className="min-w-0">
              <label htmlFor="etut-list-date" className="block text-xs font-semibold text-muted mb-1">
                Tarih
              </label>
              <select
                id="etut-list-date"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="ui-field w-full"
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {viewMode !== 'calendar' && datePreset === 'range' && (
          <div className="flex flex-wrap items-end gap-2" id="etut-date-range-fields">
            <label className="text-xs text-muted">
              <span className="block font-semibold mb-1">Başlangıç</span>
              <input type="date" id="etut-date-from" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="ui-field w-auto" />
            </label>
            <label className="text-xs text-muted">
              <span className="block font-semibold mb-1">Bitiş</span>
              <input type="date" id="etut-date-to" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="ui-field w-auto" />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted" id="etut-list-count">
            {`${viewMode === 'calendar' ? calendarEtuts.length : viewMode === 'cards' ? cardEtuts.length : listEtuts.length} etüt listeleniyor`}
            {!wideView && ' · yalnız sizin etütleriniz'}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            {viewMode === 'cards' && <EtutStatusLegend />}
            {filtersOn && (
              <button type="button" id="etut-filter-clear" onClick={clearFilters} className="ui-link">
                Süzgeçleri temizle
              </button>
            )}
          </div>
        </div>
      </div>

      )}
    </>
  );
}
export default EtutlerUst;
