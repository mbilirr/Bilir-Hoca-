import React, { useMemo, useState } from 'react';
import { Download, ListChecks } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Student, ClassGroup } from '../../types';
import { cleanParents, MAX_PARENTS } from '../../lib/parents';
import { Modal } from '../ui/kit';
import { SelectBox, inputCls } from './FormParts';

// ============================================================================
// ÖĞRENCİ LİSTESİ AL (Aşama 80)
// Seçilen sınıfın ya da tüm sınıfların öğrenci listesi Excel olarak indirilir. Listede hangi bilgilerin
// olacağı tek tek seçilir. Yalnızca öğretmenin zaten görebildiği öğrenciler listelenir; şifre yazılmaz.
// ============================================================================

type ColKey =
  | 'sira'
  | 'no'
  | 'ad'
  | 'sinif'
  | 'kademe'
  | 'kullanici'
  | 'eposta'
  | 'telefon'
  | 'durum'
  | 'veliYakinlik'
  | 'veliAd'
  | 'veliTelefon'
  | 'veliEposta';

const COLUMNS: Array<{ key: ColKey; label: string; group: 'ogrenci' | 'veli' }> = [
  { key: 'sira', label: 'Sıra No', group: 'ogrenci' },
  { key: 'no', label: 'Okul No', group: 'ogrenci' },
  { key: 'ad', label: 'Ad Soyad', group: 'ogrenci' },
  { key: 'sinif', label: 'Sınıf', group: 'ogrenci' },
  { key: 'kademe', label: 'Kademe', group: 'ogrenci' },
  { key: 'kullanici', label: 'Kullanıcı Adı', group: 'ogrenci' },
  { key: 'eposta', label: 'E-posta', group: 'ogrenci' },
  { key: 'telefon', label: 'Telefon', group: 'ogrenci' },
  { key: 'durum', label: 'Hesap Durumu', group: 'ogrenci' },
  { key: 'veliYakinlik', label: 'Veli Yakınlığı', group: 'veli' },
  { key: 'veliAd', label: 'Veli Adı Soyadı', group: 'veli' },
  { key: 'veliTelefon', label: 'Veli Telefonu', group: 'veli' },
  { key: 'veliEposta', label: 'Veli E-postası', group: 'veli' },
];
const DEFAULT_COLS: ColKey[] = ['sira', 'no', 'ad', 'sinif'];
const STATUS_TEXT: Record<string, string> = { active: 'Aktif', inactive: 'Pasif', suspended: 'Dondurulmuş' };

const SELECT_CLS = `${inputCls} h-10 cursor-pointer`;

const sortStudents = (list: Student[]) =>
  [...list].sort(
    (a, b) =>
      (a.className || '').localeCompare(b.className || '', 'tr', { numeric: true }) ||
      (a.studentNumber || '').localeCompare(b.studentNumber || '', 'tr', { numeric: true }) ||
      a.name.localeCompare(b.name, 'tr')
  );

/** Excel sayfa adı: en çok 31 harf, yasak işaretler yok, aynı ad tekrar etmez */
const sheetName = (raw: string, used: Set<string>) => {
  let base = (raw || 'Liste').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 28) || 'Liste';
  let name = base;
  let i = 2;
  while (used.has(name.toLocaleLowerCase('tr-TR'))) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
};

export const StudentListExportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  students: Student[];
  classes: ClassGroup[];
}> = ({ open, onClose, students, classes }) => {
  const [scope, setScope] = useState(''); // '' = seçilmedi, 'all' = tüm sınıflar, yoksa sınıf kimliği
  const [separateSheets, setSeparateSheets] = useState(true);
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [error, setError] = useState<string | null>(null);

  // Öğrencisi olan sınıflar (ad sırasıyla)
  const classOptions = useMemo(() => {
    const count = new Map<string, number>();
    students.forEach((s) => count.set(s.classId, (count.get(s.classId) || 0) + 1));
    const known = classes.filter((c) => (count.get(c.id) || 0) > 0).map((c) => ({ id: c.id, name: c.name, n: count.get(c.id) || 0 }));
    // Sınıf listesinde olmayan (ör. sınıfsız) öğrenciler için
    const knownIds = new Set(known.map((k) => k.id));
    const extra = new Map<string, { id: string; name: string; n: number }>();
    students.forEach((s) => {
      if (knownIds.has(s.classId)) return;
      const cur = extra.get(s.classId) || { id: s.classId, name: s.className || 'Sınıfsız', n: 0 };
      cur.n++;
      extra.set(s.classId, cur);
    });
    return [...known, ...extra.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }, [students, classes]);

  const selected = useMemo(() => (scope === 'all' ? students : scope ? students.filter((s) => s.classId === scope) : []), [scope, students]);
  const hasVeliCols = cols.some((c) => COLUMNS.find((x) => x.key === c)?.group === 'veli');
  const parentSlots = useMemo(() => {
    if (!hasVeliCols) return 0;
    let max = 1;
    selected.forEach((s) => (max = Math.max(max, cleanParents(s.parents).length)));
    return Math.min(MAX_PARENTS, max);
  }, [selected, hasVeliCols]);

  const toggle = (k: ColKey) => setCols((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const ordered = COLUMNS.filter((c) => cols.includes(c.key));

  const buildRows = (list: Student[]) => {
    // Veli sütunları veli sırasına göre yan yana: 1. veli (yakınlık, ad, tel, e-posta), 2. veli …
    const veliCols = ordered.filter((c) => c.group === 'veli');
    const studentCols = ordered.filter((c) => c.group === 'ogrenci');
    const head = [...studentCols.map((c) => c.label)];
    for (let i = 0; i < parentSlots; i++) veliCols.forEach((c) => head.push(parentSlots > 1 ? `${i + 1}. ${c.label}` : c.label));
    const rows: Array<Array<string | number>> = [head];
    sortStudents(list).forEach((s, idx) => {
      const r: Array<string | number> = [];
      studentCols.forEach((c) => {
        switch (c.key) {
          case 'sira':
            r.push(idx + 1);
            break;
          case 'no':
            r.push(s.studentNumber || '');
            break;
          case 'ad':
            r.push(s.name || '');
            break;
          case 'sinif':
            r.push(s.className || '');
            break;
          case 'kademe':
            r.push(s.schoolLevel || '');
            break;
          case 'kullanici':
            r.push(s.username || '');
            break;
          case 'eposta':
            r.push(s.email && !/@okul\.internal\.net$/i.test(s.email) ? s.email : '');
            break;
          case 'telefon':
            r.push(s.phone || '');
            break;
          case 'durum':
            r.push(s.isSuspended ? 'Dondurulmuş' : STATUS_TEXT[s.status] || s.status || '');
            break;
          default:
            r.push('');
        }
      });
      const ps = cleanParents(s.parents);
      for (let i = 0; i < parentSlots; i++) {
        const p = ps[i];
        veliCols.forEach((c) => {
          if (!p) return r.push('');
          if (c.key === 'veliYakinlik') r.push(p.relation || '');
          else if (c.key === 'veliAd') r.push(p.name || '');
          else if (c.key === 'veliTelefon') r.push(p.phone || '');
          else if (c.key === 'veliEposta') r.push(p.email || '');
        });
      }
      rows.push(r);
    });
    return rows;
  };

  const handleDownload = () => {
    setError(null);
    if (!scope) return setError('Lütfen sınıf seçiniz.');
    if (!ordered.length) return setError('Listede yer alacak en az bir bilgi seçin.');
    if (!selected.length) return setError('Seçilen sınıfta öğrenci yok.');
    try {
      const wb = XLSX.utils.book_new();
      const used = new Set<string>();
      const addSheet = (name: string, list: Student[]) => {
        const rows = buildRows(list);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = rows[0].map((h) => ({ wch: Math.min(40, Math.max(8, String(h).length + 4)) }));
        XLSX.utils.book_append_sheet(wb, ws, sheetName(name, used));
      };
      if (scope === 'all' && separateSheets) {
        classOptions.forEach((c) => {
          const list = students.filter((s) => s.classId === c.id);
          if (list.length) addSheet(c.name, list);
        });
      } else {
        addSheet(scope === 'all' ? 'Tüm Öğrenciler' : classOptions.find((c) => c.id === scope)?.name || 'Sınıf', selected);
      }
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = scope === 'all' ? 'Tum-Siniflar' : (classOptions.find((c) => c.id === scope)?.name || 'Sinif').replace(/[^\p{L}\p{N}]+/gu, '-');
      XLSX.writeFile(wb, `Ogrenci-Listesi-${label}-${stamp}.xlsx`);
    } catch (e: any) {
      setError(e?.message || 'Liste oluşturulamadı.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      title="Öğrenci Listesi Al"
      description="Sınıf ya da tüm sınıflar için Excel listesi; listede hangi bilgilerin olacağını seçin"
      size="md"
      id="student-list-export-modal"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary h-10">
            Kapat
          </button>
          <button type="button" onClick={handleDownload} disabled={!scope || !ordered.length} className="ui-btn ui-btn-primary h-10" id="student-list-download">
            <Download className="w-4 h-4" />
            <span>Excel Olarak İndir</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="list-scope" className="ui-label">
            Sınıf *
          </label>
          <SelectBox id="list-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={SELECT_CLS}>
            <option value="">Sınıf seçiniz</option>
            <option value="all">Tüm sınıflar (toplu liste) · {students.length} öğrenci</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.n} öğrenci
              </option>
            ))}
          </SelectBox>
          {scope === 'all' && (
            <label className="mt-2 flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
              <input type="checkbox" checked={separateSheets} onChange={(e) => setSeparateSheets(e.target.checked)} className="accent-indigo-600" />
              Her sınıf Excel'de ayrı sayfada olsun (işaretli değilse tek liste)
            </label>
          )}
        </div>

        {(['ogrenci', 'veli'] as const).map((g) => (
          <fieldset key={g} className="space-y-2">
            <legend className="ui-label">{g === 'ogrenci' ? 'Listede olacak öğrenci bilgileri' : 'Listede olacak veli bilgileri'}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COLUMNS.filter((c) => c.group === g).map((c) => {
                const on = cols.includes(c.key);
                return (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 h-10 px-3 rounded-xl border text-sm cursor-pointer transition-colors ${
                      on ? 'border-indigo-500 bg-indigo-500/10 text-fg' : 'border-line bg-surface text-fg-2 hover:bg-surface-2'
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(c.key)} className="accent-indigo-600" />
                    <span className="truncate">{c.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="text-xs text-muted">
          {scope ? `${selected.length} öğrenci listelenecek.` : 'Önce sınıf seçiniz.'} Şifreler listeye yazılmaz. Listede kişisel bilgiler bulunur; yalnızca yetkili kişilerle paylaşın.
        </p>
        {error && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
