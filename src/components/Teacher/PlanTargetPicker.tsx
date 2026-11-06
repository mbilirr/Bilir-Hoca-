import React, { useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { cx } from '../ui/kit';
import { trFold } from '../../lib/importNormalize';

// ============================================================================
// Aşama 164: Haftalık plan gönder / geri çek — "Kime?" seçimi
//  * Tüm sınıflar · Seçtiğim sınıflar · Seçtiğim öğrenciler (üç eşit düğme)
//  * Sınıf yuvarlakları; öğrenci listesinde arama, Tümünü seç / Seçimi kaldır
//  * "gönderildi" etiketi = veritabanındaki gerçek durum (öğretmen ekranında: benim gönderilmiş görevim var)
// ============================================================================

export type PlanTargetScope = 'all' | 'classes' | 'students';

export interface PlanTargetState {
  scope: PlanTargetScope;
  classes: Set<string>;
  students: Set<string>;
}

type ClassRow = { cid: string; name: string; list: Student[] };

export function usePlanTarget(allStudents: Student[], classes: ClassGroup[]) {
  const classRows = useMemo((): ClassRow[] => {
    const m = new Map<string, Student[]>();
    for (const s of allStudents) {
      const k = s.classId || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    const nameOf = (cid: string) => classes.find((c) => c.id === cid)?.name || m.get(cid)?.[0]?.className || 'Sınıfsız';
    return Array.from(m.entries())
      .map(([cid, list]) => ({
        cid,
        name: nameOf(cid),
        list: [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }, [allStudents, classes]);
  // Tek sınıf varsa "Tüm sınıflar" ile aynıdır; birden çok sınıfta öğretmen kendisi seçer (hiçbir şey önceden seçili gelmez)
  const [state, setState] = useState<PlanTargetState>(() => ({
    scope: classRows.length <= 1 ? 'all' : 'classes',
    classes: new Set(),
    students: new Set(),
  }));
  const selected = useMemo(() => {
    if (state.scope === 'all') return allStudents;
    if (state.scope === 'classes') return allStudents.filter((s) => state.classes.has(s.classId || ''));
    return allStudents.filter((s) => state.students.has(s.id));
  }, [state, allStudents]);
  return { classRows, state, setState, selected };
}

export const PlanTargetPicker: React.FC<{
  idPrefix: string;
  question: string;
  classRows: ClassRow[];
  state: PlanTargetState;
  setState: React.Dispatch<React.SetStateAction<PlanTargetState>>;
  /** "gönderildi" etiketi gösterilecek öğrenciler */
  sentSet: Set<string>;
  disabled?: boolean;
}> = ({ idPrefix, question, classRows, state, setState, sentSet, disabled }) => {
  const [query, setQuery] = useState('');
  const multiClass = classRows.length > 1;
  const scopes: Array<[PlanTargetScope, string]> = [
    ['all', 'Tüm sınıflar'],
    ['classes', 'Seçtiğim sınıflar'],
    ['students', 'Seçtiğim öğrenciler'],
  ];
  const toggleClass = (cid: string) =>
    setState((cur) => {
      const n = new Set(cur.classes);
      if (n.has(cid)) n.delete(cid);
      else n.add(cid);
      return { ...cur, classes: n };
    });
  const toggleStudent = (id: string) =>
    setState((cur) => {
      const n = new Set(cur.students);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...cur, students: n };
    });
  // Öğrenci listesinde: sınıf seçildiyse yalnız o sınıflar, seçilmediyse hepsi; arama ad ve numarada (Türkçe harfe duyarsız)
  const q = trFold(query.trim());
  const listRows = useMemo(() => {
    const rows = state.classes.size ? classRows.filter((r) => state.classes.has(r.cid)) : classRows;
    return rows
      .map((r) => ({ ...r, list: q ? r.list.filter((s) => trFold(`${s.name} ${s.studentNumber || ''}`).includes(q)) : r.list }))
      .filter((r) => r.list.length);
  }, [classRows, state.classes, q]);
  const visibleIds = useMemo(() => listRows.flatMap((r) => r.list.map((s) => s.id)), [listRows]);
  const setVisible = (on: boolean) =>
    setState((cur) => {
      const n = new Set(cur.students);
      for (const id of visibleIds) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return { ...cur, students: n };
    });

  return (
    <div className="space-y-2" id={`${idPrefix}-target`}>
      <p className="text-xs font-bold text-fg">{question}</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={question}>
        {scopes.map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-scope={k}
            aria-pressed={state.scope === k}
            disabled={disabled}
            onClick={() => setState((cur) => ({ ...cur, scope: k }))}
            className={cx('ui-btn ui-btn-sm w-full min-w-0 px-1 max-sm:text-[11px]', state.scope === k ? 'ui-btn-primary' : 'ui-btn-secondary')}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      {state.scope !== 'all' && (
        <div className="rounded-xl border border-line bg-surface-2/40 p-2 space-y-2">
          {(multiClass || state.scope === 'classes') && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sınıflar">
              {classRows.map((g) => {
                const on = state.classes.has(g.cid);
                const sentN = g.list.filter((s) => sentSet.has(s.id)).length;
                return (
                  <button
                    key={g.cid || 'none'}
                    type="button"
                    data-target-class={g.cid}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => toggleClass(g.cid)}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer',
                      on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-fg-2 hover:border-brand/50'
                    )}
                  >
                    {on && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {g.name}
                    <span className={cx('text-[10px] font-bold', on ? 'text-white/80' : 'text-muted')}>
                      {g.list.length} öğr.{sentN ? ` · ${sentN} gönderildi` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {state.scope === 'students' && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2" />
                  <input
                    id={`${idPrefix}-search`}
                    className="ui-input h-7 py-0 pl-8 text-xs"
                    placeholder="Öğrenci ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    name={`${idPrefix}-ogrenci-ara`}
                    disabled={disabled}
                  />
                </div>
                <button type="button" id={`${idPrefix}-all`} className="ui-btn ui-btn-secondary ui-btn-sm w-24" disabled={disabled || !visibleIds.length} onClick={() => setVisible(true)}>
                  Tümünü seç
                </button>
                <button type="button" id={`${idPrefix}-none`} className="ui-btn ui-btn-secondary ui-btn-sm w-24" disabled={disabled || !visibleIds.length} onClick={() => setVisible(false)}>
                  Seçimi kaldır
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-line bg-surface divide-y divide-line" id={`${idPrefix}-list`}>
                {listRows.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">Öğrenci bulunamadı.</p>
                ) : (
                  listRows.map((r) => (
                    <div key={r.cid || 'none'}>
                      {listRows.length > 1 && <p className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{r.name}</p>}
                      {r.list.map((s) => (
                        <label key={s.id} className="flex h-7 items-center gap-2 px-2.5 text-xs cursor-pointer hover:bg-surface-2" data-target-student={s.id}>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-[var(--color-brand)]"
                            checked={state.students.has(s.id)}
                            disabled={disabled}
                            onChange={() => toggleStudent(s.id)}
                          />
                          <span className="truncate text-fg">
                            {s.name}
                            {s.studentNumber ? <span className="text-muted"> · No {s.studentNumber}</span> : null}
                          </span>
                          {sentSet.has(s.id) && <span className="ml-auto shrink-0 ui-chip ui-chip-success text-[10px] leading-4">gönderildi</span>}
                        </label>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
