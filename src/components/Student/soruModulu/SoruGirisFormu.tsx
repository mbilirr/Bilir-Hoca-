// Öğrenci soru modülü › soru sayısı kaydetme formu (Aşama 354c: ayrı parça, yalnız gerekince yüklenir)
import { Plus, Calendar, CheckCircle2, AlertCircle, Check, Target, ClipboardList, AlertTriangle } from 'lucide-react';
import { formatTurkishDate } from '../../../utils/questionAnalytics';
import { shortSubjectName } from '../../../lib/subjects';
import { InfoTip } from '../../ui/Compact';
import { MAX_QUESTION_COUNT, QUESTION_ENTRY_MAX_PAST_DAYS, parseIsoDate, blockNonDigitKeys, pasteDigitsOnly } from './ortak';
import { useSoruModuluBaglam } from './useSoruModulu';

export function SoruGirisFormu() {
  const { activeTab, todayIso, inputMode, entryDate, setEntryDate, setEntryDateTouched, entryNotes, setEntryNotes, setSaveSuccessMsg, submitAttempted, formError, isSaving, minEntryDate, dateError, activeSubjects, listRows, singleSubject, setSingleSubject, singleCount, setSingleCount, singleCorrect, setSingleCorrect, singleWrong, setSingleWrong, singleTopic, setSingleTopic, singleEntries, singleError, setSingleError, existingLog, isEditMode, rowChecks, rowsWithErrors, formTotal, subjectDayTarget, generalDayTarget, planTaskText, planTasksFor, transferPlanTasks, manualPlanTasks, nextWeekPlan, clearMessages, updateListRow, switchInputMode, handleAddSingleEntry, handleRemoveSingleEntry, handleSaveQuestionLog } = useSoruModuluBaglam();
  return (
    <>
      {activeTab === 'entry' && (
        <div id="question-entry-form" className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">
                {isEditMode ? 'Günlük Soru Kaydını Düzenle' : 'Günlük Soru Sayısı Girişi'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="ui-seg" role="group">
                <button
                  type="button"
                  id="qe-mode-list"
                  onClick={() => switchInputMode('list')}
                  className="ui-seg-btn" aria-pressed={inputMode === 'list'}
                >
                  Ders Listesi Tablosu
                </button>
                <button
                  type="button"
                  id="qe-mode-single"
                  onClick={() => switchInputMode('single')}
                  className="ui-seg-btn" aria-pressed={inputMode === 'single'}
                >
                  Tek Tek Ders Ekle
                </button>
              </div>
            </div>
          </div>


          {/* Tarih Seçimi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label htmlFor="qe-date" className="block text-xs font-bold text-fg-2 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-fg" />
                Soru Çözülen Tarih
              </label>
              <input
                id="qe-date"
                type="date"
                required
                min={minEntryDate}
                max={todayIso}
                value={entryDate}
                aria-invalid={!!dateError}
                onChange={(e) => {
                  setSaveSuccessMsg('');
                  setEntryDateTouched(true);
                  setEntryDate(e.target.value);
                }}
                className={`ui-field w-full font-bold ${
                  dateError ? 'border-danger' : 'border-line-strong'
                }`}
              />
              {dateError ? (
                <p id="qe-date-error" className="mt-1.5 text-xs font-semibold text-danger-fg">
                  {dateError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted">
                  Bugün veya son {QUESTION_ENTRY_MAX_PAST_DAYS} gün içinden bir tarih seçebilirsin.
                </p>
              )}
            </div>

            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label htmlFor="qe-notes" className="block text-xs font-bold text-fg-2 mb-1.5">
                Çalışma Notu veya Deneme Adı (İsteğe Bağlı)
              </label>
              <input
                id="qe-notes"
                type="text"
                maxLength={300}
                placeholder="Örn: Hafta sonu genel tarama testi"
                value={entryNotes}
                onChange={(e) => {
                  clearMessages();
                  setEntryNotes(e.target.value);
                }}
                className="ui-field w-full"
              />
            </div>
          </div>

          {isEditMode && !dateError && (
            <div
              id="qe-edit-notice"
              role="note"
              className="p-3 rounded-xl border border-warning/30 bg-warning-soft text-warning-fg text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bu tarihte kaydın var; değişikliklerin bu kaydı günceller.</p>
                <p className="mt-0.5 opacity-90">
                  {formatTurkishDate(entryDate)} günü kaydettiğin dersler ({existingLog?.totalQuestions ?? 0} soru) forma yüklendi.
                  Sayıları değiştirebilir veya yeni ders ekleyebilirsin.
                </p>
              </div>
            </div>
          )}

          {/* Aşama 52: "Öğretmenin bu gün için aktardığı konular" bilgilendirmesi kaldırıldı; konular ders satırına
              kendiliğinden yazılıyor. */}

          {/* Günlük plandaki görevler: yalnızca öğretmenin OTOMATİK AKTARMADIĞI görevler varsa çıkar; öğrenci isterse elle ekler */}
          {manualPlanTasks.length > 0 && !dateError && (
            <div
              id="qe-plan-tasks"
              className="p-3 rounded-xl border border-brand/30 bg-brand-soft/60 space-y-2"
            >
              <p className="text-xs font-bold text-brand-fg flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" />
                {formatTurkishDate(entryDate)} günlük planındaki görevler
                <span className="font-medium text-brand-fg/80">(isteğe bağlı · tıklayınca konu kutusuna aktarılır)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {manualPlanTasks.map((it) => {
                  const text = planTaskText(it);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      data-testid="qe-plan-chip"
                      disabled={!text}
                      onClick={() => transferPlanTasks(it.subject, [it])}
                      title={text ? 'Konu / Test kutusuna aktar' : 'Bu görevde aktarılacak yazı yok'}
                      className="ui-btn ui-btn-secondary ui-btn-sm max-w-full"
                    >
                      <span className="font-bold text-brand-fg shrink-0">{it.subject}</span>
                      <span className="truncate">{text || '—'}</span>
                      {it.questionCount > 0 && <span className="shrink-0 font-bold text-brand-fg">· {it.questionCount} soru</span>}
                      {it.doneAt && <Check className="w-3 h-3 text-success-fg shrink-0" aria-label="yapıldı" />}
                      <Plus className="w-3 h-3 text-brand-fg shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aşama 53: gelecek hafta hedefi (öğretmenin planından otomatik) */}
          {nextWeekPlan && (
            <div
              id="qe-next-week"
              className="p-3 rounded-xl border border-brand/30 bg-brand-soft/60 space-y-2"
            >
              <p className="text-xs font-bold text-brand-fg flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Gelecek hafta hedefin
                <span className="font-medium text-brand-fg/80">
                  ({formatTurkishDate(nextWeekPlan.start)} – {formatTurkishDate(nextWeekPlan.end)})
                </span>
              </p>
              <div className="grid grid-cols-7 gap-1">
                {nextWeekPlan.days.map((d) => {
                  const dt = parseIsoDate(d.date);
                  const empty = !d.subjects.length && d.general <= 0;
                  return (
                    <div
                      key={d.date}
                      data-testid="qe-next-week-day"
                      className={`min-w-0 rounded-lg border px-1 py-1 text-center ${empty ? 'border-line bg-surface-2/40' : 'border-brand/30 bg-surface'}`}
                      title={d.topics.map((x) => `${x.subject}: ${x.topic}`).join('\n') || undefined}
                    >
                      <span className="block text-2xs font-bold text-fg leading-tight">
                        {dt ? ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][dt.getDay()] : ''}
                      </span>
                      <span className="block text-3xs text-muted leading-tight">{dt ? `${dt.getDate()}.${dt.getMonth() + 1}` : ''}</span>
                      {d.general > 0 && <span className="block text-2xs font-semibold text-brand-fg">Toplam:{d.general}</span>}
                      {d.subjects.map(([s, n]) => (
                        <span key={s} className="block text-2xs leading-tight font-semibold text-brand-fg break-words">
                          {shortSubjectName(s)}:{n}
                        </span>
                      ))}
                      {empty && <span className="block text-2xs text-subtle">—</span>}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted flex items-center gap-1">
                Öğretmenin planından oluşturuldu.
                <InfoTip text="O gün geldiğinde dersin konusu ve hedefi bu formda ilgili dersin satırına kendiliğinden yazılır." />
              </p>
            </div>
          )}

          {/* Seçilen günün genel (tüm dersler) soru hedefi */}
          {generalDayTarget !== null && !dateError && (
            <div
              id="qe-general-target"
              className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-brand/30 bg-brand-soft/60 text-xs"
            >
              <Target className="w-4 h-4 text-brand-fg" />
              <span className="font-bold text-fg">
                {formatTurkishDate(entryDate)} için toplam girmen gereken: {generalDayTarget} soru
              </span>
              <span className="text-muted">· Formdaki toplam: {formTotal}</span>
              {formTotal > 0 && formTotal < generalDayTarget ? (
                <span
                  role="alert"
                  data-testid="qe-general-below-target"
                  className="qe-blink inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger text-white font-bold"
                >
                  <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({generalDayTarget - formTotal} eksik)
                </span>
              ) : formTotal >= generalDayTarget ? (
                <span className="inline-flex items-center gap-1 text-success-fg font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Günlük hedef tamam
                </span>
              ) : null}
            </div>
          )}

          {/* Input Mode: Ders listesi (masaüstünde tablo, telefonda her ders bir kart) */}
          {inputMode === 'list' && (
            <div className="border border-line rounded-xl overflow-hidden" id="qe-list">
              <div className="hidden sm:grid grid-cols-[minmax(110px,1.3fr)_repeat(4,minmax(60px,0.6fr))_minmax(130px,2fr)] gap-3 px-3.5 py-2.5 bg-surface-2 text-fg-2 font-bold text-xs border-b border-line">
                <span>Ders Adı</span>
                <span className="text-center">Çözülen Soru</span>
                <span className="text-center">Doğru</span>
                <span className="text-center">Yanlış</span>
                <span className="text-center">Boş</span>
                <span>Çalışılan Konu / Test</span>
              </div>
              <div className="divide-y divide-line">
                {listRows.map((row, idx) => {
                  const check = rowChecks[idx];
                  const hasError = check.errors.length > 0;
                  const rowTarget = subjectDayTarget(row.subject);
                  const rowEntered = row.questionCount.trim() !== '' && check.count !== null && !hasError;
                  const rowBelow = rowTarget !== null && rowEntered && (check.count || 0) < rowTarget;
                  const rowMet = rowTarget !== null && rowEntered && (check.count || 0) >= rowTarget;
                  const rowPlanTasks = planTasksFor(row.subject);
                  const inputBase =
                    'w-full h-8 bg-surface border rounded-lg px-2 py-0 text-xs text-center focus:outline-none focus:ring-2 focus:ring-brand/20'; // Aşama 212: ortak 32 px
                  return (
                    <div
                      key={row.subject}
                      data-testid="qe-row"
                      data-subject={row.subject}
                      className={`grid grid-cols-2 sm:grid-cols-[minmax(110px,1.3fr)_repeat(4,minmax(60px,0.6fr))_minmax(130px,2fr)] gap-x-3 gap-y-2 px-3.5 py-3 sm:py-2 items-center ${
                        hasError ? 'bg-danger-soft/40' : 'hover:bg-surface-2'
                      }`}
                    >
                      <div className="col-span-2 sm:col-span-1 font-bold text-fg text-xs">{row.subject}</div>
                      <label className="block">
                        <span className="sm:hidden block text-xs font-semibold text-muted mb-1">Soru</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="0"
                          aria-label={`${row.subject} çözülen soru`}
                          aria-invalid={check.invalid.count}
                          data-testid="qe-count"
                          value={row.questionCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'questionCount', v))}
                          onChange={(e) => updateListRow(idx, 'questionCount', e.target.value)}
                          className={`${inputBase} font-bold text-fg ${check.invalid.count ? 'border-danger' : 'border-line-strong focus:border-brand'}`}
                        />
                      </label>
                      <label className="block">
                        <span className="sm:hidden block text-xs font-semibold text-muted mb-1">Doğru</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="—"
                          aria-label={`${row.subject} doğru`}
                          aria-invalid={check.invalid.correct}
                          data-testid="qe-correct"
                          value={row.correctCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'correctCount', v))}
                          onChange={(e) => updateListRow(idx, 'correctCount', e.target.value)}
                          className={`${inputBase} text-success-fg font-semibold ${check.invalid.correct ? 'border-danger' : 'border-line-strong focus:border-success'}`}
                        />
                      </label>
                      <label className="block">
                        <span className="sm:hidden block text-xs font-semibold text-muted mb-1">Yanlış</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="—"
                          aria-label={`${row.subject} yanlış`}
                          aria-invalid={check.invalid.wrong}
                          data-testid="qe-wrong"
                          value={row.wrongCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'wrongCount', v))}
                          onChange={(e) => updateListRow(idx, 'wrongCount', e.target.value)}
                          className={`${inputBase} text-danger-fg font-semibold ${check.invalid.wrong ? 'border-danger' : 'border-line-strong focus:border-danger'}`}
                        />
                      </label>
                      <div>
                        <span className="sm:hidden block text-xs font-semibold text-muted mb-1">Boş (otomatik)</span>
                        <div
                          data-testid="qe-empty"
                          title="Boş = soru − doğru − yanlış"
                          className="w-full rounded-lg px-2 py-1.5 sm:py-1 text-xs text-center text-muted bg-surface-2 border border-dashed border-line"
                        >
                          {check.empty !== null && check.count ? check.empty : '—'}
                        </div>
                      </div>
                      <div className="block col-span-2 sm:col-span-1">
                        <span className="sm:hidden block text-xs font-semibold text-muted mb-1">Konu / Test</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            maxLength={120}
                            placeholder="Konu adı..."
                            aria-label={`${row.subject} konu`}
                            data-testid="qe-topic"
                            value={row.topic}
                            onChange={(e) => updateListRow(idx, 'topic', e.target.value)}
                            className="ui-field w-full min-w-0"
                          />
                          {rowPlanTasks.length > 0 && (
                            <button
                              type="button"
                              data-testid="qe-plan-transfer"
                              onClick={() => transferPlanTasks(row.subject, rowPlanTasks)}
                              title={`Günlük plandaki görevi aktar: ${rowPlanTasks.map(planTaskText).join(', ')}`}
                              aria-label={`${row.subject} için günlük plandaki görevi konu kutusuna aktar`}
                              className="ui-btn ui-btn-secondary ui-btn-sm shrink-0 text-brand-fg"
                            >
                              <ClipboardList className="w-3 h-3" />
                              Plan
                            </button>
                          )}
                        </div>
                      </div>
                      {rowTarget !== null && (
                        <div className="col-span-2 sm:col-span-6 -mt-1 flex flex-wrap items-center gap-2 text-xs" data-testid="qe-row-target">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft border border-brand/30 text-brand-fg font-bold">
                            <Target className="w-3 h-3" /> Bugün girmen gereken: {rowTarget} soru
                          </span>
                          {rowBelow && (
                            <span
                              role="alert"
                              data-testid="qe-row-below-target"
                              className="qe-blink inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger text-white font-bold"
                            >
                              <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({rowTarget - (check.count || 0)} eksik)
                            </span>
                          )}
                          {rowMet && (
                            <span className="inline-flex items-center gap-1 text-success-fg font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Hedef tamam
                            </span>
                          )}
                        </div>
                      )}
                      {hasError && (
                        <p
                          data-testid="qe-row-error"
                          role="alert"
                          className="col-span-2 sm:col-span-6 text-xs font-semibold text-danger-fg"
                        >
                          {check.errors.join(' ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input Mode: Single Form */}
          {inputMode === 'single' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddSingleEntry}
                noValidate
                className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-surface-2 p-4 rounded-xl border border-line"
              >
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="qe-single-subject" className="block text-xs font-bold text-fg-2 mb-1">Ders</label>
                  <select
                    id="qe-single-subject"
                    value={singleSubject}
                    onChange={(e) => setSingleSubject(e.target.value)}
                    className="ui-field w-full font-bold"
                  >
                    {activeSubjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="qe-single-count" className="block text-xs font-bold text-fg-2 mb-1">Soru Sayısı</label>
                  <input
                    id="qe-single-count"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="Soru"
                    value={singleCount}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleCount)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleCount(e.target.value);
                    }}
                    className="ui-field w-full font-bold"
                  />
                  {subjectDayTarget(singleSubject) !== null && (
                    <span className="block mt-1 text-2xs font-bold text-brand-fg" id="qe-single-target-hint">
                      Hedef: {subjectDayTarget(singleSubject)} soru
                    </span>
                  )}
                </div>

                <div>
                  <label htmlFor="qe-single-correct" className="block text-xs font-bold text-fg-2 mb-1">Doğru</label>
                  <input
                    id="qe-single-correct"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="D"
                    value={singleCorrect}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleCorrect)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleCorrect(e.target.value);
                    }}
                    className="ui-field w-full text-success-fg font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="qe-single-wrong" className="block text-xs font-bold text-fg-2 mb-1">Yanlış</label>
                  <input
                    id="qe-single-wrong"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="Y"
                    value={singleWrong}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleWrong)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleWrong(e.target.value);
                    }}
                    className="ui-field w-full text-danger-fg font-semibold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="qe-single-topic" className="block text-xs font-bold text-fg-2 mb-1">Konu / Test</label>
                  <div className="flex items-center gap-1">
                    <input
                      id="qe-single-topic"
                      type="text"
                      maxLength={120}
                      placeholder="Konu adı..."
                      value={singleTopic}
                      onChange={(e) => setSingleTopic(e.target.value)}
                      className="ui-field w-full min-w-0"
                    />
                    {planTasksFor(singleSubject).length > 0 && (
                      <button
                        type="button"
                        id="qe-single-plan-transfer"
                        onClick={() => transferPlanTasks(singleSubject, planTasksFor(singleSubject))}
                        title="Günlük plandaki görevi aktar"
                        aria-label="Günlük plandaki görevi konu kutusuna aktar"
                        className="ui-btn ui-btn-sm shrink-0 border border-brand/30 bg-brand-soft text-brand-fg min-w-24"
                      >
                        <ClipboardList className="w-3 h-3" />
                        Plan
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-end col-span-2 sm:col-span-1">
                  <button
                    type="submit"
                    id="qe-single-add"
                    className="ui-btn ui-btn-sm ui-btn-primary w-full"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ekle
                  </button>
                </div>

                {singleError && (
                  <p id="qe-single-error" role="alert" className="col-span-2 sm:col-span-6 text-xs font-semibold text-danger-fg">
                    {singleError}
                  </p>
                )}
              </form>

              {singleEntries.length > 0 && (
                <div className="border border-line rounded-xl overflow-hidden divide-y divide-line" id="qe-single-list">
                  {singleEntries.map((item, idx) => {
                    const c = item.correctCount ?? 0;
                    const w = item.wrongCount ?? 0;
                    const tgt = subjectDayTarget(item.subject);
                    const below = tgt !== null && item.questionCount < tgt;
                    return (
                      <div key={`${item.subject}-${idx}`} data-testid="qe-single-row" className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs hover:bg-surface-2">
                        <div className="min-w-0">
                          <span className="font-bold text-fg">{item.subject}</span>
                          <span className="ml-2 font-bold text-fg">{item.questionCount} soru</span>
                          <span className="ml-2 text-muted">
                            D {c} · Y {w} · B {Math.max(0, item.questionCount - c - w)}
                          </span>
                          {tgt !== null && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft border border-brand/30 text-brand-fg font-bold text-xs" data-testid="qe-single-row-target">
                              <Target className="w-3 h-3" /> Girmen gereken: {tgt}
                            </span>
                          )}
                          {below && (
                            <span role="alert" className="qe-blink ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger text-white font-bold text-xs" data-testid="qe-single-row-below">
                              <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({(tgt as number) - item.questionCount} eksik)
                            </span>
                          )}
                          {tgt !== null && !below && (
                            <span className="ml-2 inline-flex items-center gap-1 text-success-fg font-bold text-xs">
                              <CheckCircle2 className="w-3 h-3" /> Hedef tamam
                            </span>
                          )}
                          {item.topic && <span className="block text-xs text-muted truncate">Konu: {item.topic}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSingleEntry(idx)}
                          className="ui-link ui-link-danger"
                        >
                          Kaldır
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {submitAttempted && (dateError || formError || (inputMode === 'list' && rowsWithErrors.length > 0)) ? (
            <div
              id="qe-error-summary"
              role="alert"
              className="p-3 rounded-xl border border-danger/30 bg-danger-soft text-danger-fg text-xs space-y-1"
            >
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> Kayıt yapılamadı, lütfen şunları düzelt:
              </p>
              <ul className="list-disc pl-6 space-y-0.5">
                {dateError && <li>{dateError}</li>}
                {inputMode === 'list' && rowsWithErrors.length > 0 && (
                  <li>Hatalı satırlar: {rowsWithErrors.join(', ')}</li>
                )}
                {formError && <li>{formError}</li>}
              </ul>
            </div>
          ) : formError ? (
            <div id="qe-error-summary" role="alert" className="p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-line">
            <span className="text-xs text-muted" id="qe-form-total">
              Formdaki toplam: <strong className="text-fg">{formTotal} soru</strong>
            </span>
            <button
              type="button"
              id="qe-save"
              data-yazma
              onClick={handleSaveQuestionLog}
              disabled={isSaving}
              className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm disabled:opacity-60 disabled:cursor-wait min-w-24"
            >
              <Check className="w-3.5 h-3.5 text-brand-fg" />
              <span>{isSaving ? 'Kaydediliyor…' : isEditMode ? 'Kaydı Güncelle' : 'Soru Kaydını Tamamla ve Gönder'}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export default SoruGirisFormu;
