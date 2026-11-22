// Etütler › Yoklama görünümü (etüt devamsızlık arayüzü) (Aşama 362: ayrı parça, yalnız gerekince yüklenir)
import React from 'react';
import { normalizeSubject } from '../../../lib/subjects';
import { Plus, CalendarCheck, CheckCircle2, Search, XCircle, AlertCircle, Info, ChevronDown } from 'lucide-react';
import { Etut } from '../../../types';
import { dataService } from '../../../services/dataService';
import { cx } from '../../ui/kit';
import { isEtutEnded, hasEtutAttendance, etutExpectsAttendance } from '../../../lib/etutTiming';
import { InfoTip } from '../../ui/Compact';
import { etutTeacherNames, getEtutStatus } from '../../../lib/etutStatus';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { profilResmi } from '../../../lib/profilResmi';
import { ymdLocal } from './ortak';
import { useEtutBaglam } from './useEtutYonetimi';

export function EtutYoklamaGorunumu() {
  const { students, viewMode, selectedAttendanceEtutId, setSelectedAttendanceEtutId, attendanceSearchQuery, setAttendanceSearchQuery, attPickFilter, setAttPickFilter, attPickQuery, setAttPickQuery, attPickLimit, setAttPickLimit, setAttendanceFeedback, attendanceNotes, canEditEtut, activeEtuts, ackMissing, listEtuts, clearFilters, openEtutForm } = useEtutBaglam();
  return (
    <>
      {viewMode === 'attendance' && (() => {
        // Aşama 40: başka öğretmenin etüdünün yoklaması alınamaz / görülemez
        // Aşama 111: yoklama yalnız düzenleyebildiği etütlerde alınır (Rehberlik başkasınınkini Takip'te görür)
        const attEtuts = listEtuts.filter((e) => canEditEtut(e));
        const currentAttendanceEtut =
          attEtuts.find((e) => e.id === selectedAttendanceEtutId) || null; // Aşama 216: seçilmeden açılmaz

        // Atanan öğrenciler listesi
        const assignedStudents = (() => {
          if (!currentAttendanceEtut) return [];
          if (currentAttendanceEtut.assignedStudentIds === 'all') {
            return students;
          }
          const ids = Array.isArray(currentAttendanceEtut.assignedStudentIds)
            ? currentAttendanceEtut.assignedStudentIds
            : [];
          return students.filter((s) => ids.includes(s.id));
        })();

        // Filtrelenmiş öğrenci listesi
        const displayedStudents = assignedStudents.filter((std) => {
          if (!attendanceSearchQuery.trim()) return true;
          const q = attendanceSearchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
          return (
            matchTurkishSearch(std.name, q) ||
            (std.studentNumber && std.studentNumber.includes(q)) ||
            matchTurkishSearch(std.className, q)
          );
        });

        // Sayaçlar
        let countPresent = 0;
        let countAbsent = 0;
        let countLate = 0;
        let countExcused = 0;

        assignedStudents.forEach((std) => {
          const rec = currentAttendanceEtut?.studentAttendance?.[std.id];
          const st = rec?.status || 'present';
          if (st === 'present') countPresent++;
          else if (st === 'absent') countAbsent++;
          else if (st === 'late') countLate++;
          else if (st === 'excused') countExcused++;
        });

        const handleSingleAttendanceChange = (
          studentId: string,
          studentName: string,
          status: 'present' | 'absent' | 'late' | 'excused'
        ) => {
          if (!currentAttendanceEtut) return;
          const note = attendanceNotes[studentId] || currentAttendanceEtut.studentAttendance?.[studentId]?.note || '';
          dataService.updateEtutAttendance(currentAttendanceEtut.id, {
            [studentId]: {
              ...(currentAttendanceEtut.studentAttendance?.[studentId] || {}),
              studentId,
              studentName,
              status,
              note,
              updatedAt: new Date().toISOString(),
            },
          });
          const label =
            status === 'present'
              ? 'Geldi'
              : status === 'absent'
              ? 'Gelmedi'
              : status === 'late'
              ? 'Geç Kaldı'
              : 'İzinli';
          setAttendanceFeedback(`✓ ${studentName}: "${label}" olarak kaydedildi.`);
        };

        const handleBulkEtutAttendance = (status: 'present' | 'absent' | 'excused') => {
          if (!currentAttendanceEtut || assignedStudents.length === 0) return;
          const map: Record<string, any> = {};
          assignedStudents.forEach((std) => {
            const note = attendanceNotes[std.id] || currentAttendanceEtut.studentAttendance?.[std.id]?.note || '';
            map[std.id] = {
              ...(currentAttendanceEtut.studentAttendance?.[std.id] || {}),
              studentId: std.id,
              studentName: std.name,
              status,
              note,
              updatedAt: new Date().toISOString(),
            };
          });
          dataService.updateEtutAttendance(currentAttendanceEtut.id, map);
          const label = status === 'present' ? 'Geldi' : status === 'absent' ? 'Gelmedi' : 'İzinli';
          setAttendanceFeedback(`✓ Tüm öğrenciler "${label}" olarak güncellendi.`);
        };

        // Aşama 216: yoklama paneli seçili etüt satırının hemen altında çizilir
        const handleSaveAndClose = () => {
          if (!currentAttendanceEtut) return;
          const id = currentAttendanceEtut.id;
          if (assignedStudents.length) {
            const map: Record<string, any> = {};
            assignedStudents.forEach((std) => {
              const prev = currentAttendanceEtut.studentAttendance?.[std.id];
              map[std.id] = {
                ...(prev || {}),
                studentId: std.id,
                studentName: std.name,
                status: prev?.status || 'present',
                note: attendanceNotes[std.id] ?? prev?.note ?? '',
                updatedAt: new Date().toISOString(),
              };
            });
            dataService.updateEtutAttendance(id, map);
          }
          setAttendanceFeedback('✓ Yoklama kaydedildi.');
          setSelectedAttendanceEtutId('');
          requestAnimationFrame(() => document.getElementById(`etut-att-pick-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        };
        const attendancePanel = currentAttendanceEtut ? (
              <div className="border-b border-line bg-surface-2/40 p-3 sm:p-4 space-y-4" id="etut-att-inline">
                {/* Aşama 216: konu ve öğretmen görüşü panelin başında */}
                {(currentAttendanceEtut.topic || currentAttendanceEtut.teacherFeedback) && (
                  <div className="space-y-1 text-xs">
                    {currentAttendanceEtut.topic && <p className="text-fg-2"><span className="font-semibold text-fg">Konu:</span> {currentAttendanceEtut.topic}</p>}
                    {currentAttendanceEtut.teacherFeedback && (
                      <p className="text-fg-2"><span className="font-semibold text-fg">Öğretmen görüşü:</span> {currentAttendanceEtut.teacherFeedback}</p>
                    )}
                  </div>
                )}
                {/* Header & Arama */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-fg">
                        Yoklama
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand/10 text-brand-fg border border-brand/20">
                        {assignedStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={attendanceSearchQuery}
                      onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                      placeholder="Öğrenci ara..."
                      className="ui-field w-full pl-8 pr-3"
                    />
                  </div>
                </div>

                {/* Sayaçlar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="p-2.5 rounded-xl bg-canvas/70 border border-line text-center">
                    <span className="text-2xs uppercase font-bold text-muted block">Toplam</span>
                    <span className="text-base font-bold text-fg">{assignedStudents.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-success/10 border border-success/20 text-center">
                    <span className="text-2xs uppercase font-bold text-success-fg block">Geldi</span>
                    <span className="text-base font-bold text-success-fg">{countPresent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-center">
                    <span className="text-2xs uppercase font-bold text-danger-fg block">Gelmedi</span>
                    <span className="text-base font-bold text-danger-fg">{countAbsent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-warning/10 border border-warning/20 text-center">
                    <span className="text-2xs uppercase font-bold text-warning-fg block">Geç Kaldı</span>
                    <span className="text-base font-bold text-warning-fg">{countLate}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-info/10 border border-info/20 text-center">
                    <span className="text-2xs uppercase font-bold text-info-fg block">İzinli</span>
                    <span className="text-base font-bold text-info-fg">{countExcused}</span>
                  </div>
                </div>

                {/* Toplu İşlem Butonları */}
                <div className="p-3 rounded-xl bg-canvas/60 border border-line flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg-2">
                    Hızlı Toplu Yoklama:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('present')}
                      className="ui-btn ui-btn-sm bg-success/20 hover:bg-success/30 border border-success/30 text-success-fg min-w-24"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tümü geldi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('absent')}
                      className="ui-btn ui-btn-sm bg-danger/20 hover:bg-danger/30 border border-danger/30 text-danger-fg min-w-24"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Tümü gelmedi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('excused')}
                      className="ui-btn ui-btn-sm bg-info/20 hover:bg-info/30 border border-info/30 text-info-fg min-w-24"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Tümü izinli</span>
                    </button>
                  </div>
                </div>

                {/* ALT ALTA SIRALI ÖĞRENCİ LİSTESİ */}
                {assignedStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs bg-canvas/40 rounded-xl border border-line">
                    Bu etüte henüz öğrenci atanmamış. Etütü düzenleyerek öğrenci ekleyebilirsiniz.
                  </div>
                ) : displayedStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs bg-canvas/40 rounded-xl border border-line">
                    "{attendanceSearchQuery}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-canvas/50">
                    {displayedStudents.map((std, idx) => {
                      const att = currentAttendanceEtut.studentAttendance?.[std.id];
                      const currentStatus = att?.status || 'present';
                      return (
                        <div
                          key={std.id}
                          className="p-3 sm:p-3.5 hover:bg-surface-2/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          {/* Öğrenci Bilgisi */}
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 text-center text-xs font-mono text-muted shrink-0">
                              {idx + 1}
                            </span>
                            <img
                              src={profilResmi(std, 'student')}
                              alt={std.name}
                              className="w-8 h-8 rounded-full bg-surface-2 object-cover border border-line shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-fg truncate">{std.name}</h4>
                            </div>
                          </div>

                          {/* 4 Seçenek Butonu: GELDI, GELMEDI, GEÇ KALDI, İZİNLİ */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                            {/* Geldi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'present')}
                              className={`ui-btn ui-btn-sm ${
                                currentStatus === 'present'
                                  ? 'bg-success text-white ring-2 ring-success'
                                  : 'bg-surface hover:bg-success/20 text-fg-2 hover:text-success-fg border border-line hover:border-success/40'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Geldi</span>
                            </button>

                            {/* Gelmedi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'absent')}
                              className={`ui-btn ui-btn-sm ${
                                currentStatus === 'absent'
                                  ? 'bg-danger text-white ring-2 ring-danger'
                                  : 'bg-surface hover:bg-danger/20 text-fg-2 hover:text-danger-fg border border-line hover:border-danger/40'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Gelmedi</span>
                            </button>

                            {/* Geç Kaldı */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'late')}
                              className={`ui-btn ui-btn-sm ${
                                currentStatus === 'late'
                                  ? 'bg-warning text-white ring-2 ring-warning'
                                  : 'bg-surface hover:bg-warning/20 text-fg-2 hover:text-warning-fg border border-line hover:border-warning/40'
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Geç Kaldı</span>
                            </button>

                            {/* İzinli */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'excused')}
                              className={`ui-btn ui-btn-sm ${
                                currentStatus === 'excused'
                                  ? 'bg-info text-white ring-2 ring-info'
                                  : 'bg-surface hover:bg-info/20 text-fg-2 hover:text-info-fg border border-line hover:border-info/40'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>İzinli</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Aşama 216: Kaydet = işaretlenmeyenler "Geldi" sayılarak hepsi yazılır, panel kapanır */}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" id="etut-att-close" className="ui-btn ui-btn-secondary ui-btn-sm w-28" onClick={() => setSelectedAttendanceEtutId('')}>
                    Kapat
                  </button>
                  <button type="button" id="etut-att-save" className="ui-btn ui-btn-primary ui-btn-sm w-28" onClick={handleSaveAndClose} disabled={assignedStudents.length === 0}>
                    Kaydet
                  </button>
                </div>
              </div>
        ) : null;

        if (attEtuts.length === 0 && activeEtuts.length > 0) {
          return (
            <div className="ui-card p-8 text-center text-sm text-muted" id="etut-attendance-empty-filter">
              Bu süzgeçte yoklaması alınacak etüt yok.{' '}
              <button type="button" onClick={clearFilters} className="ui-link ui-link-satir">
                Süzgeçleri temizle
              </button>
            </div>
          );
        }
        if (attEtuts.length === 0) {
          return (
            <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 text-brand-fg flex items-center justify-center mx-auto mb-4">
                <CalendarCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-fg mb-2">Henüz Kayıtlı Etüt Bulunmuyor</h3>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                Yoklama alabilmek için lütfen önce bir etüt oluşturunuz.
              </p>
              <button
                type="button"
                onClick={() => {
                  openEtutForm('create');
                }}
                className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas min-w-24"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>İlk Etütü Planla</span>
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            {/* Bildirim Çubuğu */}

            {/* 1. ETÜT SEÇİMİ — Aşama 204: uzun açılır menü yerine güne göre gruplu kısa liste.
                Her satır: saat · ders · yer · öğretmen · öğrenci sayısı · yoklama durumu. Konu yalnız seçili etüdün satırında. */}
            {(() => {
              const todayYmd = ymdLocal(new Date());
              const yest = new Date();
              yest.setDate(yest.getDate() - 1);
              const yestYmd = ymdLocal(yest);
              const tom = new Date();
              tom.setDate(tom.getDate() + 1);
              const tomYmd = ymdLocal(tom);
              const ymdOf = (e: Etut) => String(e.date || '').trim().slice(0, 10);
              const isMissing = (e: Etut) => isEtutEnded(e) && etutExpectsAttendance(e) && !hasEtutAttendance(e);
              const pending = attEtuts.filter(isMissing);
              const todays = attEtuts.filter((e) => ymdOf(e) === todayYmd);
              const filt = attPickFilter ?? (pending.length > 0 ? 'bekleyen' : 'tumu');
              const q = attPickQuery.trim();
              const base = filt === 'bekleyen' ? pending : filt === 'bugun' ? todays : attEtuts;
              const shown = (q
                ? base.filter(
                    (e) =>
                      matchTurkishSearch(e.subject || '', q) ||
                      matchTurkishSearch(e.topic || '', q) ||
                      matchTurkishSearch(e.location || '', q) ||
                      etutTeacherNames(e).some((n) => matchTurkishSearch(n, q))
                  )
                : base
              )
                .slice()
                .sort((a, b) => ymdOf(b).localeCompare(ymdOf(a)) || String(a.time || '').localeCompare(String(b.time || '')));
              const visible = shown.slice(0, attPickLimit);
              const dayLabel = (ymd: string) => {
                if (ymd === todayYmd) return 'Bugün';
                if (ymd === yestYmd) return 'Dün';
                if (ymd === tomYmd) return 'Yarın';
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
                if (!m) return ymd || 'Tarihsiz';
                return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
              };
              const studentCount = (e: Etut) =>
                e.assignedStudentIds === 'all' ? students.length : Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds.length : 0;
              const statusOf = (e: Etut) => {
                if (hasEtutAttendance(e)) return { label: 'Alındı', cls: 'bg-success-soft text-success-fg' };
                if (isMissing(e)) return { label: 'Alınmadı', cls: 'bg-warning-soft text-warning-fg' };
                const st = getEtutStatus(e);
                if (st === 'live') return { label: 'Sürüyor', cls: 'bg-info-soft text-info-fg' };
                if (st === 'upcoming') return { label: 'Başlamadı', cls: 'bg-surface-2 text-muted' };
                return null;
              };
              const filters: { key: 'bekleyen' | 'bugun' | 'tumu'; label: string; n: number }[] = [
                { key: 'bekleyen', label: 'Bekleyen', n: pending.length },
                { key: 'bugun', label: 'Bugün', n: todays.length },
                { key: 'tumu', label: 'Tümü', n: attEtuts.length },
              ];
              let lastDay = '';
              return (
                <div className="bg-surface border border-line rounded-2xl p-3 sm:p-4 space-y-3" id="etut-att-picker">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 mr-auto">
                      <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-fg">
                        <CalendarCheck className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-fg">Etüt Seçin</h3>
                      <InfoTip text="Yoklamasını almak istediğiniz etüde dokunun. Yoklaması alınmamış geçmiş etütler Bekleyen'de görünür." />
                    </div>
                    <div role="tablist" aria-label="Etüt süzgeci" className="ui-seg">
                      {filters.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          role="tab"
                          id={`etut-att-filter-${f.key}`}
                          aria-selected={filt === f.key}
                          onClick={() => {
                            setAttPickFilter(f.key);
                            setAttPickLimit(15);
                          }}
                          className="ui-seg-btn w-24 gap-1"
                        >
                          {f.label}
                          <span className={cx('tabular-nums', filt === f.key ? 'text-brand-fg' : 'text-subtle')}>{f.n}</span>
                        </button>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-56">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
                      <input
                        id="etut-att-search"
                        type="search"
                        value={attPickQuery}
                        onChange={(e) => {
                          setAttPickQuery(e.target.value);
                          setAttPickLimit(15);
                        }}
                        placeholder="Ders, konu, sınıf, öğretmen"
                        aria-label="Etüt ara"
                        className="ui-field w-full pl-8 pr-2"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-line overflow-hidden" id="etut-att-list">
                    {visible.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted">
                        {q ? `"${q}" ile eşleşen etüt yok.` : filt === 'bekleyen' ? 'Yoklaması bekleyen etüt yok.' : 'Bu süzgeçte etüt yok.'}
                      </div>
                    ) : (
                      (currentAttendanceEtut && !visible.some((x) => x.id === currentAttendanceEtut.id) ? [currentAttendanceEtut, ...visible] : visible).map((e) => {
                        const day = ymdOf(e);
                        const head = day !== lastDay;
                        lastDay = day;
                        const on = currentAttendanceEtut?.id === e.id;
                        const stt = statusOf(e);
                        const teachers = etutTeacherNames(e).join(', ');
                        const n = studentCount(e);
                        return (
                          <React.Fragment key={e.id}>
                            {head && (
                              <div className="px-3 py-1 text-xs font-semibold text-muted bg-surface-2 border-b border-line first:border-t-0">
                                {dayLabel(day)}
                              </div>
                            )}
                            <button
                              type="button"
                              id={`etut-att-pick-${e.id}`}
                              aria-pressed={on}
                              title={e.topic || undefined}
                              aria-expanded={on}
                              onClick={() => {
                                // Aşama 216: aynı satır kapatır, başka satır onu açar (yoklama satırın hemen altında)
                                if (on) {
                                  setSelectedAttendanceEtutId('');
                                  return;
                                }
                                setSelectedAttendanceEtutId(e.id);
                                setAttendanceSearchQuery('');
                                ackMissing([e.id]); // Aşama 33d: eksik etüt seçilince yanıp sönme durur
                                requestAnimationFrame(() =>
                                  document.getElementById(`etut-att-pick-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                );
                              }}
                              className={cx(
                                'w-full flex items-center gap-3 px-3 py-2 text-left border-b border-line last:border-b-0 cursor-pointer transition-colors',
                                on ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]' : 'hover:bg-surface-2'
                              )}
                            >
                              <span className="w-11 shrink-0 text-sm font-bold text-fg tabular-nums">{e.time || '—'}</span>
                              <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                                <span className="text-xs font-semibold text-brand-fg truncate sm:w-32 sm:shrink-0">{normalizeSubject(e.subject) || e.subject || '—'}</span>
                                <span className="text-xs text-muted truncate">
                                  {[e.location, teachers, n ? `${n} öğrenci` : ''].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              {stt && (
                                <span className={cx('shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full', stt.cls)}>{stt.label}</span>
                              )}
                              <ChevronDown className={cx('w-4 h-4 shrink-0 text-muted transition-transform', on && 'rotate-180')} aria-hidden />
                            </button>
                            {on && attendancePanel}
                          </React.Fragment>
                        );
                      })
                    )}
                  </div>
                  {shown.length > visible.length && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        id="etut-att-more"
                        onClick={() => setAttPickLimit((l) => l + 15)}
                        className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28"
                      >
                        Daha fazla
                      </button>
                    </div>
                  )}

                </div>
              );
            })()}

          </div>
        );
      })()}
    </>
  );
}
export default EtutYoklamaGorunumu;
