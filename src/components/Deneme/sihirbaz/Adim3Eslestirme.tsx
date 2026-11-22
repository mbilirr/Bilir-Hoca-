// Deneme sihirbazı › 3. adım: öğrenci eşleştirme (Aşama 363: ayrı parça, yalnız gerekince yüklenir)
import { CheckCircle2, Link2, Users } from 'lucide-react';
import { Panel, Segmented, cx } from '../../ui/kit';
import { InfoTip } from '../../ui/Compact';
import { OgrenciSecici } from '../OgrenciSecici';
import { useSihirbazBaglam } from './useSihirbaz';

export function Adim3Eslestirme() {
  const { students, grade, step, name, matches, manual, matchFilter, setMatchFilter, matchMsg, flashKey, rowRefs, pairs, pairOpen, setPairOpen, left, studentById, sortedStudents, tcNote, setMatch, counts, duplicateIds, pendingCount, confirmSuggestions, shownMatches, otherRowsOf, jumpToTwin, complementary, pair, askMerge } = useSihirbazBaglam();
  return (
    <>
      {step === 3 && (
        <Panel
          title="Öğrenci eşleştirme"
          description={
            <span className="inline-flex items-center gap-1">
              Emin olunamayan eşleşmeleri siz onaylarsınız.
              <InfoTip text="Öğrenciler önce TC ile, TC hatalıysa numarayla, o da yoksa ad soyadla bulunur; sınıf ve şube kontrol edilir." />
            </span>
          }
          icon={Users}
          tone="brand"
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="ui-chip ui-chip-success">{counts.ok} eşleşti</span>
            <span className={cx('ui-chip', counts.check ? 'ui-chip-warning' : 'ui-chip-neutral')}>{counts.check} kontrol</span>
            <span className={cx('ui-chip', counts.none ? 'ui-chip-danger' : 'ui-chip-neutral')}>{counts.none} bulunamadı</span>
            {counts.skip > 0 && <span className="ui-chip ui-chip-neutral">{counts.skip} atlandı</span>}
            <Segmented
              size="sm"
              className="ml-auto"
              value={matchFilter}
              onChange={setMatchFilter}
              items={[
                { value: 'all', label: `Tümü (${matches.length})` },
                { value: 'pending', label: `Onay bekleyenler (${pendingCount})`, id: 'dn-match-pending' },
                { value: 'none', label: `Bulunamayanlar (${counts.none})` },
              ]}
            />
            {counts.check > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={confirmSuggestions} id="dn-match-confirm">
                <CheckCircle2 /> Önerileri onayla
              </button>
            )}
          </div>
          {tcNote && <p className="text-xs font-semibold rounded-xl px-3 py-2 mb-3 bg-info-soft text-info-fg">{tcNote}</p>}
          {pairs.length > 0 && !pairOpen && (
            <div className="flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 mb-3 bg-warning-soft text-warning-fg" id="dn-pair-note">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">{pairs.length} öğrencinin sözel ve sayısal satırları farklı numarayla kodlanmış olabilir.</span>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-28 justify-center" onClick={() => setPairOpen(true)} id="dn-pair-open">
                İncele
              </button>
            </div>
          )}
          {matchMsg && (
            <p role="status" className={cx('text-xs font-semibold rounded-xl px-3 py-2 mb-3', pendingCount ? 'bg-warning-soft text-warning-fg' : 'bg-success-soft text-success-fg')}>
              {matchMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-danger-soft border border-danger/30" /> Tanınmayan öğrenci
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-warning-soft border border-warning/30" /> Kontrol edilmeli
            </span>
          </div>
          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs text-fg-2">
                <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Optikteki bilgi</th>
                    <th className="px-3 py-2 font-semibold">Durum</th>
                    <th className="px-3 py-2 font-semibold min-w-64">Sistemdeki öğrenci</th>
                    <th className="px-3 py-2 font-semibold text-center">Atla</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shownMatches.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-subtle">Bu filtrede satır yok.</td>
                    </tr>
                  ) : (
                    shownMatches.map((m) => {
                      const g = m.group;
                      const dup = !!m.studentId && duplicateIds.has(m.studentId) && !m.skip;
                      const st = m.skip ? 'skip' : dup ? 'check' : m.status;
                      return (
                        <tr
                          key={g.key}
                          ref={(el) => {
                            if (el) rowRefs.current.set(g.key, el);
                            else rowRefs.current.delete(g.key);
                          }}
                          className={cx(
                            'transition-shadow',
                            m.skip && 'opacity-55',
                            !m.skip && st === 'none' && 'bg-danger-soft/60',
                            !m.skip && st === 'check' && 'bg-warning-soft/50',
                            dup && 'border-l-4 border-l-warning',
                            flashKey === g.key && 'ring-2 ring-inset ring-brand'
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <p className="font-semibold text-fg">{g.name || '—'}</p>
                            <p className="text-muted">
                              No {g.number || '—'} · {[g.grade, g.section].filter(Boolean).join('/') || 'sınıf yok'} · {g.booklet || '?'} kitapçığı
                            </p>
                            {g.warnings.map((w) => (
                              <p key={w} className="text-warning-fg">{w}</p>
                            ))}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={cx(
                                'ui-chip',
                                st === 'ok' && 'ui-chip-success',
                                st === 'check' && 'ui-chip-warning',
                                st === 'none' && 'ui-chip-danger',
                                st === 'skip' && 'ui-chip-neutral'
                              )}
                            >
                              {st === 'ok' ? `Eşleşti${m.method ? ` (${manual.has(g.key) ? 'elle' : m.method})` : ''}` : st === 'check' ? 'Kontrol edin' : st === 'none' ? 'Bulunamadı' : 'Atlandı'}
                            </span>
                            {dup && (
                              <button
                                type="button"
                                className="ui-link ui-link-satir block mt-0.5 text-left text-warning-fg"
                                onClick={() => jumpToTwin(m)}
                                title="Aynı öğrencinin seçildiği diğer satıra git"
                              >
                                Aynı öğrenci başka satırda da seçili: {otherRowsOf(m).map((o) => o.group.name || `No ${o.group.number || '—'}`).join(', ')} →
                              </button>
                            )}
                            {dup && otherRowsOf(m).length === 1 && complementary(m, otherRowsOf(m)[0]) && (
                              <button
                                type="button"
                                className="mt-1 ui-btn ui-btn-secondary ui-btn-sm w-28 justify-center"
                                onClick={() => askMerge(m, otherRowsOf(m)[0])}
                                title="Sözel ve sayısal satırları tek öğrencide birleştir"
                              >
                                <Link2 /> Birleştir
                              </button>
                            )}
                            {!dup && m.reason && st !== 'ok' && <p className="text-muted mt-0.5">{m.reason}</p>}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 min-w-56">
                                <OgrenciSecici
                                  students={sortedStudents}
                                  byId={studentById}
                                  candidates={m.candidates}
                                  value={m.studentId}
                                  disabled={m.skip}
                                  onChange={(id) => setMatch(g.key, { studentId: id, status: id ? 'ok' : 'none', method: 'elle' })}
                                />
                              </div>
                              {st === 'check' && m.studentId && !dup && (
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setMatch(g.key, { status: 'ok' })}>
                                  Onayla
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={m.skip} aria-label="Bu satırı atla" onChange={(e) => setMatch(g.key, { skip: e.target.checked }, false)} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted flex items-center gap-1 mt-2">Eşleştirmeler hatırlanır.<InfoTip text="Elle seçtiğiniz ve ad soyadla bulunan eşleştirmeler hatırlanır; sonraki denemelerde otomatik eşleşir." /></p>
        </Panel>
      )}
    </>
  );
}
export default Adim3Eslestirme;
