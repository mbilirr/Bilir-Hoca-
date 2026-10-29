import React from 'react';
import { Check } from 'lucide-react';
import type { TeacherGrades } from '../../lib/teacherGrades';

// Aşama 102: "Görebileceği kademeler" tikleri — hesap açma ve erişim penceresinde ortak.
// Düğmeler eşit boyda (h-8 w-24), yazıyla aynı büyüklükte.
const tickCls = (on: boolean) =>
  `h-8 w-24 inline-flex items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
    on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-canvas border-line text-fg-2 hover:border-indigo-400'
  }`;

export const GradeTicks: React.FC<{
  id: string;
  options: number[];
  value: TeacherGrades;
  onChange: (v: TeacherGrades) => void;
  disabled?: boolean;
  /** Aşama 107: rolü gereği tüm sınıfları gören kişi — "Tümü" kilitli işaretli, altında bu not */
  roleNote?: string;
}> = ({ id, options, value: own, onChange, disabled: ownDisabled, roleNote }) => {
  const value: TeacherGrades = roleNote ? { all: true, grades: [] } : own;
  const disabled = ownDisabled || !!roleNote;
  const toggle = (g: number) => {
    const has = value.grades.includes(g);
    onChange({ all: false, grades: has ? value.grades.filter((x) => x !== g) : [...value.grades, g].sort((a, b) => a - b) });
  };
  return (
    <div className="space-y-1.5" id={id}>
      <label className="block text-[11px] font-bold text-fg-2">Görebileceği kademeler</label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Görebileceği kademeler">
        <button
          type="button"
          id={`${id}-tumu`}
          aria-pressed={value.all}
          disabled={disabled}
          onClick={() => onChange({ all: !value.all, grades: [] })}
          className={tickCls(value.all)}
        >
          {value.all && <Check className="w-3.5 h-3.5" />}
          Tümü
        </button>
        {options.map((g) => {
          const on = !value.all && value.grades.includes(g);
          return (
            <button
              key={g}
              type="button"
              id={`${id}-${g}`}
              aria-pressed={on}
              disabled={disabled || value.all}
              onClick={() => toggle(g)}
              className={tickCls(on)}
            >
              {on && <Check className="w-3.5 h-3.5" />}
              {g}. Sınıf
            </button>
          );
        })}
      </div>
      {roleNote ? (
        <p className="text-[10px] font-semibold text-info-fg" id={`${id}-rol`}>{roleNote}</p>
      ) : options.length === 0 ? (
        <p className="text-[10px] text-muted">Kurumda henüz sınıf yok; sınıf ekledikten sonra kademe seçilebilir. "Tümü" seçilirse sonradan açılan sınıflar da görünür.</p>
      ) : (
        <p className="text-[10px] text-muted">Seçilen kademedeki bütün şubeler (sonradan açılanlar dahil) görünür. Öğretmen öğrenci ekleyemez, silemez, sınıf değiştiremez.</p>
      )}
    </div>
  );
};
