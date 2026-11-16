import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, Building2, ChevronDown, ChevronRight, GraduationCap, FileBarChart, ListOrdered, Pencil, Plus, Save, ShieldCheck, Undo2, Users } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Segmented, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact'; // Aşama 189
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { getExam, isDraftExam, isSetupError, listExams, updateExamInfo, type DenemeExam } from '../../services/denemeService';
import { DENEME_SINIFLARI, fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateTr } from '../../lib/deneme/karneModel';
import { DenemeWizard } from './DenemeWizard';
import { DenemeSonuclar } from './DenemeSonuclar';
import { DenemeKarne } from './DenemeKarne';
import { DenemeEtut } from './DenemeEtut';
import { KazanimBankasi } from './KazanimBankasi';
import { hasHistoryValue, useHistoryState } from '../../lib/useHistoryState';
import { gradeOf } from '../../lib/teacherGrades';
import { usePagedList, ShowMoreBar } from '../../lib/listPaging';
import { matchTurkishSearch, turkishCompare } from '../../utils/turkishSearch';
import { currentAcademicYear } from '../../lib/importNormalize';
import { useQuickFocus } from '../../lib/quickFocus';

// Aşama 111: deneme listesi süzgeçleri (herkese aynı; öğretmende seçenekler yalnız görebildiği denemelerden gelir)
const denemeYear = (e: DenemeExam) => (e.examDate ? currentAcademicYear(new Date(e.examDate + 'T12:00:00')) : '');
const denemeGrade = (e: DenemeExam) => String(parseInt(String(e.grade), 10) || e.grade || '');
const denemeSelectCls = 'ui-field w-full sm:w-36 text-xs'; // Aşama 283: ortak açılır liste görünümü
const DENEME_PAGE = 15;

// Aşama 271: sayfa bir sınıf düzeyine göre çalışır ("Sınıf seçiniz"); seçim bu tarayıcıda hatırlanır
const SINIF_KEY = 'deneme.sinif';
const readSinif = (): string => {
  try {
    return window.localStorage.getItem(SINIF_KEY) || '';
  } catch {
    return '';
  }
};
const writeSinif = (v: string) => {
  try {
    if (v) window.localStorage.setItem(SINIF_KEY, v);
    else window.localStorage.removeItem(SINIF_KEY);
  } catch {
    /* tarayıcı saklamaya izin vermiyor: seçim yalnız bu oturumda kalır */
  }
};
const sinifEtiketi = (g: string) => (/^\d+$/.test(g) ? `${g}. sınıf` : g);

// ============================================================================
// DENEME ANALİZİ (Aşama 47) — ana sayfa
// Genel yönetici ve bölümü açılmış kurumların yöneticileri kullanır (dataService.canUseDeneme).
// Sekmeler: Denemeler (yükleme, sonuçlar) · Karneler · Etüt yönlendirme · Kazanım bankası (Aşama 48)
// ============================================================================

// Aşama 92: denemeleri başka kuruma aktarma penceresi (genel yönetici; yalnızca açılınca yüklenir)
const KurumAktarModal = lazy(() => import('./KurumAktarModal').then((m) => ({ default: m.KurumAktarModal })));
// Aşama 115: ortalama sıralama penceresi (Son 3 / Son 5 / seçerek; Excel). Öğretmen / Zümre / Etüt Öğretmeni göremez.
const OrtalamaSiralamaModal = lazy(() => import('./OrtalamaSiralamaModal').then((m) => ({ default: m.OrtalamaSiralamaModal })));

type Tab = 'denemeler' | 'karne' | 'etut' | 'kazanim';
// Aşama 52: görünüm tarayıcı geçmişine yazılır (yalnızca kimlik tutulur; deneme nesnesi bellekte kalır)
// Aşama 90: 'draft' = yarım kalmış yeni deneme (kaldığı adımdan sihirbazda açılır)
type View = { kind: 'list' } | { kind: 'new' } | { kind: 'upload'; id: string } | { kind: 'detail'; id: string } | { kind: 'draft'; id: string };

export const DenemeAnalizi: React.FC<{ students: Student[]; classes: ClassGroup[] }> = ({ students, classes }) => {
  // Aşama 82: Rehberlik / Öğretmen / Zümre Başkanı denemeleri yalnızca görür (ekleme, düzenleme, silme yok)
  const readOnly = !dataService.canManageDeneme();
  const [tab, setTab] = useHistoryState<Tab>('deneme.tab', 'denemeler');
  const [view, setView] = useHistoryState<View>('deneme.view', { kind: 'list' });
  const [uploadExam, setUploadExam] = useState<DenemeExam | null>(null);
  // Sayfadaki "Denemelere dön / Vazgeç" düğmeleri: bu görünüme ileri gelindiyse tarayıcıdaki geri ile aynı işi yapar
  // (geçmişte fazladan kayıt birikmez); sayfa doğrudan açıldıysa hedef görünüme geçer.
  const goBack = (fallback: View) => {
    if (hasHistoryValue('deneme.view')) window.history.back();
    else setView(fallback, { replace: true });
  };
  // Yükleme görünümüne geri/ileri ile gelinip deneme bellekte yoksa sonuçlar gösterilir
  const shownView: View = view.kind === 'upload' && uploadExam?.id !== view.id ? { kind: 'detail', id: view.id } : view;
  const [allExams, setExams] = useState<DenemeExam[]>([]);
  // Aşama 90: taslaklar yalnızca listede (yöneticiye) görünür; karne ve etüt yalnızca sonuçlu denemeleri kullanır
  // Aşama 102: öğretmen (yönetici / Ölçme / Rehberlik değil) yalnızca gördüğü sınıfların kademesindeki denemeleri görür;
  // Etüt yönlendirme sekmesi ona kapalıdır
  const plain = dataService.isPlainDenemeViewer();
  const myGrades = useMemo(() => {
    if (!plain) return null;
    const set = new Set<string>();
    for (const c of classes) {
      const g = gradeOf(c);
      if (g !== null) set.add(String(g));
    }
    return set;
  }, [plain, classes]);
  const exams = useMemo(
    // Aşama 116: kademesi sayı olmayan deneme (ör. "Mezun") düz görüntüleyicide, adı bu yazıyı taşıyan bir sınıfı varsa görünür
    () =>
      allExams.filter((e) => {
        if (isDraftExam(e)) return false;
        if (!myGrades) return true;
        const n = parseInt(String(e.grade), 10);
        if (!Number.isNaN(n)) return myGrades.has(String(n));
        const label = String(e.grade || '').trim();
        return !!label && classes.some((c) => matchTurkishSearch(`${c.name} ${c.gradeLevel || ''}`, label));
      }),
    [allExams, myGrades, classes]
  );
  // Aşama 271: sınıf düzeyi. Seçenekler 5-8 (düz görüntüleyicide yalnız kendi kademeleri) ve sayı olmayan
  // kademeli denemeler (ör. "Mezun"). Sınıf seçilmeden hiçbir işlem yapılmaz; seçilince bütün sayfa o sınıfa göre.
  const sinifSecenekleri = useMemo(() => {
    const base: string[] = DENEME_SINIFLARI.filter((g) => !myGrades || myGrades.has(g));
    const extra = new Set<string>();
    for (const e of readOnly ? exams : allExams) {
      const g = denemeGrade(e);
      if (g && !/^\d+$/.test(g)) extra.add(g);
      else if (g && !base.includes(g) && (!myGrades || myGrades.has(g))) extra.add(g);
    }
    return [...base, ...Array.from(extra).sort((a, b) => (parseInt(a, 10) || 99) - (parseInt(b, 10) || 99) || turkishCompare(a, b))];
  }, [myGrades, exams, allExams, readOnly]);
  const [sinifRaw, setSinifRaw] = useState<string>(readSinif);
  const sinif = sinifSecenekleri.includes(sinifRaw) ? sinifRaw : '';
  const setSinif = (v: string) => {
    setSinifRaw(v);
    writeSinif(v);
    setFYear('');
    setFPub('');
    setFQ('');
    setView({ kind: 'list' });
  };
  const sinifExams = useMemo(() => exams.filter((e) => denemeGrade(e) === sinif), [exams, sinif]);
  const sinifAllExams = useMemo(() => allExams.filter((e) => denemeGrade(e) === sinif), [allExams, sinif]);
  const sinifClasses = useMemo(
    () =>
      classes.filter((c) => {
        const g = gradeOf(c);
        if (/^\d+$/.test(sinif)) return g !== null && String(g) === sinif;
        return !!sinif && matchTurkishSearch(`${c.name} ${c.gradeLevel || ''}`, sinif);
      }),
    [classes, sinif]
  );
  const sinifStudents = useMemo(() => {
    const ids = new Set(sinifClasses.map((c) => c.id));
    return students.filter((st) => ids.has(st.classId));
  }, [students, sinifClasses]);

  // Aşama 115: Etüt yönlendirme Öğretmen / Zümre Başkanı'na da açık (yalnız kendi branşının dersleri);
  // yalnız Etüt Öğretmeni rolü olana kapalı. Kazanım bankası öğretmene kapalı kalır.
  const etutTabOk = !plain || !dataService.roleEtutOnly();
  useEffect(() => {
    if (plain && ((tab === 'etut' && !etutTabOk) || tab === 'kazanim')) setTab('denemeler', { replace: true });
  }, [plain, tab, etutTabOk]);
  const listed = readOnly ? sinifExams : sinifAllExams;
  const [fYear, setFYear] = useState('');
  const [fPub, setFPub] = useState('');
  const [fQ, setFQ] = useState('');
  const fTerm = useDeferredValue(fQ.trim());
  const listOpts = useMemo(() => {
    const y = new Set<string>();
    const p = new Set<string>();
    listed.forEach((e) => {
      const yy = denemeYear(e);
      if (yy) y.add(yy);
      if (e.publisher?.trim()) p.add(e.publisher.trim());
    });
    return {
      years: Array.from(y).sort().reverse(),
      publishers: Array.from(p).sort(turkishCompare),
    };
  }, [listed]);
  const shownExams = useMemo(
    () =>
      listed.filter(
        (e) =>
          (!fYear || denemeYear(e) === fYear) &&
          (!fPub || (e.publisher || '').trim() === fPub) &&
          (!fTerm || matchTurkishSearch(e.name, fTerm) || matchTurkishSearch(e.publisher, fTerm))
      ),
    [listed, fYear, fPub, fTerm]
  );
  const examFiltersOn = !!(fYear || fPub || fTerm);
  const pagedExams = usePagedList(shownExams, `${sinif}|${fYear}|${fPub}|${fTerm}`, DENEME_PAGE);
  const [aktarOpen, setAktarOpen] = useState<false | 'aktar' | 'geri'>(false);
  const [siralamaOpen, setSiralamaOpen] = useState(false); // Aşama 115
  const gecis = dataService.isKurumGecis(); // Aşama 98: genel yönetici kuruma geçmiş
  const [aktarMsg, setAktarMsg] = useState<string | null>(null);
  const isHead = dataService.isHeadAdmin();
  const [draftExam, setDraftExam] = useState<DenemeExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  // Aşama 50: deneme genel bilgilerini düzenleme (kalem düğmesi)
  const [editExam, setEditExam] = useState<DenemeExam | null>(null);
  const [editForm, setEditForm] = useState({ name: '', publisher: '', examDate: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const openEdit = (e: DenemeExam) => {
    setEditExam(e);
    setEditForm({ name: e.name, publisher: e.publisher || '', examDate: e.examDate || '' });
    setEditError(null);
  };
  const saveEdit = async () => {
    if (!editExam) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await updateExamInfo(editExam.id, editForm);
      setEditExam(null);
      await reload();
    } catch (e: any) {
      setEditError(e?.message || 'Kaydedilemedi.');
    } finally {
      setEditBusy(false);
    }
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setExams(await listExams({ drafts: !readOnly }));
      setSetupMissing(false);
    } catch (e: any) {
      if (isSetupError(e)) setSetupMissing(true);
      else setError(e?.message || 'Denemeler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, []);

  // Aşama 253: ölçme ana sayfasındaki kısayollar (Yeni deneme, Karneler, deneme sonuçları, yarım kalan taslak)
  useQuickFocus(['deneme'], (f) => {
    if (f.id === 'karne') {
      setTab('karne');
      setView({ kind: 'list' });
      return;
    }
    setTab('denemeler');
    if (f.id === 'yeni' && !readOnly) setView({ kind: 'new' });
    else if (f.id === 'detay' && f.label) setView({ kind: 'detail', id: f.label });
    else if (f.id === 'taslak' && f.label && !readOnly) setView({ kind: 'draft', id: f.label });
  });

  // Aşama 271: bir deneme doğrudan açıldıysa (ana sayfa kısayolu, tarayıcı geçmişi) sayfa o denemenin sınıfına geçer
  const viewExamId = view.kind === 'list' || view.kind === 'new' ? '' : view.id;
  useEffect(() => {
    if (!viewExamId) return;
    const e = allExams.find((x) => x.id === viewExamId);
    const g = e ? denemeGrade(e) : '';
    if (g && g !== sinif && sinifSecenekleri.includes(g)) {
      setSinifRaw(g);
      writeSinif(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewExamId, allExams]);

  // Aşama 90: taslak açılınca tam hâli (cevap anahtarı + optik verisi) okunur
  const draftViewId = view.kind === 'draft' ? view.id : '';
  useEffect(() => {
    if (!draftViewId || draftExam?.id === draftViewId) return;
    let alive = true;
    setDraftExam(null);
    getExam(draftViewId)
      .then((e) => {
        if (!alive) return;
        if (isDraftExam(e)) setDraftExam(e);
        else setView({ kind: 'detail', id: e.id }, { replace: true }); // taslak kesinleşmiş
      })
      .catch((e) => alive && setError(e?.message || 'Taslak açılamadı.'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftViewId]);

  // Sayfa değişince yukarı kaydır (diğer modüllerdeki geçişlerle aynı)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view.kind, tab]);

  if (!dataService.canUseDeneme()) {
    return (
      <div className="ui-card p-8 text-center space-y-3 max-w-xl mx-auto">
        <ShieldCheck className="w-8 h-8 mx-auto text-warning-fg" />
        <h2 className="text-lg font-bold text-fg">Bu bölüm size kapalı</h2>
        <p className="text-sm text-muted">Deneme Analizi yalnızca genel yönetici ve izin verilen kurum yöneticileri tarafından kullanılabilir.</p>
      </div>
    );
  }

  const header = (
    <PageHeader
      icon={BarChart3}
      tone="brand"
      title="Deneme Analizi"
      description={sinif ? `${sinifEtiketi(sinif)}: optik sonuçları, puan, kazanım analizi, karneler ve etüt yönlendirme` : "5-8. sınıf optik sonuçları, puan, kazanım analizi, karneler ve etüt yönlendirme"}
      actions={
        sinif && tab === 'denemeler' && view.kind === 'list' && !setupMissing && (!readOnly || !plain) ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Aşama 115: ortalama sıralama (Excel) — yalnız yönetici, Müdür / Yrd., Rehberlik, Ölçme Değ. */}
            {!plain && sinifExams.length > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSiralamaOpen(true)} id="deneme-ortalama-siralama">
                <ListOrdered /> Ortalama sıralama
              </button>
            )}
            {!readOnly && isHead && sinifExams.length > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setAktarOpen('aktar')} id="deneme-kurum-aktar">
                <Building2 /> Kuruma aktar
              </button>
            )}
            {!readOnly && gecis && sinifAllExams.some((e) => !!e.kurumId) && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setAktarOpen('geri')} id="deneme-geri-tasi">
                <Undo2 /> Genel yöneticiye geri taşı
              </button>
            )}
            {!readOnly && (
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setView({ kind: 'new' })} id="deneme-new">
                <Plus /> Yeni deneme
              </button>
            )}
          </div>
        ) : undefined
      }
    />
  );

  if (setupMissing) {
    return (
      <div className="space-y-6 mb-6">
        {header}
        <div className="ui-card ui-card-pad">
          <EmptyState
            icon={ShieldCheck}
            title="Kurulum gerekiyor"
            description="Deneme Analizi için 38 numaralı SQL dosyasının (38_deneme_analizi.sql) Supabase'te çalıştırılması gerekiyor."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 mb-6" id="deneme-analizi">
      {header}
      {(view.kind === 'list' || tab !== 'denemeler') && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center" id="deneme-ust-satir">
          <div className="relative w-full sm:w-44 shrink-0">
            <GraduationCap className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" aria-hidden />
            <select
              id="deneme-sinif"
              aria-label="Sınıf"
              className={cx('ui-input cursor-pointer appearance-none pl-8 pr-8 font-semibold', !sinif && 'text-muted')}
              value={sinif}
              onChange={(e) => setSinif(e.target.value)}
            >
              <option value="" disabled>
                Sınıf seçiniz
              </option>
              {sinifSecenekleri.map((g) => (
                <option key={g} value={g}>
                  {sinifEtiketi(g)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" aria-hidden />
          </div>
          {sinif && (
        <Segmented
          value={tab}
          onChange={(v) => {
            setTab(v);
            setView({ kind: 'list' });
          }}
          items={[
            { value: 'denemeler', label: 'Denemeler', icon: BarChart3 },
            { value: 'karne', label: 'Karneler', icon: FileBarChart },
            ...(etutTabOk ? [{ value: 'etut' as Tab, label: 'Etüt yönlendirme', icon: Users }] : []),
            ...(readOnly ? [] : [{ value: 'kazanim' as Tab, label: 'Kazanım bankası', icon: BookOpen }]),
          ]}
        />
          )}
        </div>
      )}

      {!sinif && !setupMissing && (
        <div className="ui-card ui-card-pad" id="deneme-sinif-bos">
          <EmptyState
            icon={GraduationCap}
            title="Sınıf seçiniz"
            description="Denemeler, karneler, etüt yönlendirme ve kazanım bankası seçtiğiniz sınıfa göre açılır. Seçiminiz hatırlanır."
          />
        </div>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}
      {aktarMsg && tab === 'denemeler' && view.kind === 'list' && (
        <p role="status" className="text-xs font-semibold text-success-fg bg-success-soft rounded-xl px-3 py-2" id="kurum-aktar-sonuc">
          {aktarMsg}
        </p>
      )}
      {aktarOpen && (
        <Suspense fallback={null}>
          <KurumAktarModal
            open
            geri={aktarOpen === 'geri'}
            exams={aktarOpen === 'geri' ? sinifAllExams : sinifExams}
            onClose={() => setAktarOpen(false)}
            onDone={(text) => {
              setAktarMsg(text);
              void reload();
            }}
          />
        </Suspense>
      )}

      {siralamaOpen && !plain && (
        <Suspense fallback={null}>
          <OrtalamaSiralamaModal onClose={() => setSiralamaOpen(false)} exams={sinifExams} students={sinifStudents} classes={sinifClasses} />
        </Suspense>
      )}

      {sinif && tab === 'denemeler' && shownView.kind === 'new' && !readOnly && (
        <DenemeWizard
          students={students}
          classes={classes}
          grade={sinif}
          onCancel={() => goBack({ kind: 'list' })}
          onSaved={(id) => {
            void reload();
            // Kaydedilen sihirbaz ekranı geçmişte kalmasın: aynı kayıt sonuç ekranına çevrilir
            setView({ kind: 'detail', id }, { replace: true });
          }}
          onDraftChange={() => void reload()}
        />
      )}
      {sinif && tab === 'denemeler' && shownView.kind === 'draft' && !readOnly &&
        (draftExam && draftExam.id === shownView.id ? (
          <DenemeWizard
            key={draftExam.id}
            students={students}
            classes={classes}
            draft={draftExam}
            onCancel={() => {
              setDraftExam(null);
              goBack({ kind: 'list' });
            }}
            onSaved={(id) => {
              setDraftExam(null);
              void reload();
              setView({ kind: 'detail', id }, { replace: true });
            }}
            onDraftChange={() => void reload()}
          />
        ) : (
          !error && <p className="text-sm text-muted">Taslak açılıyor…</p>
        ))}
      {sinif && tab === 'denemeler' && shownView.kind === 'upload' && uploadExam && !readOnly && (
        <DenemeWizard
          students={students}
          classes={classes}
          existing={uploadExam}
          startStep={2}
          onCancel={() => goBack({ kind: 'detail', id: uploadExam.id })}
          onSaved={() => {
            void reload();
            // Sonuç ekranından gelindi: geri giderek aynı ekrana dönülür (geçmişte çift kayıt oluşmaz)
            goBack({ kind: 'detail', id: uploadExam.id });
          }}
        />
      )}
      {sinif && tab === 'denemeler' && shownView.kind === 'detail' && (
        <DenemeSonuclar
          readOnly={readOnly}
          limited={plain}
          examId={shownView.id}
          onBack={() => {
            void reload();
            goBack({ kind: 'list' });
          }}
          onUploadMore={(exam) => {
            setUploadExam(exam);
            setView({ kind: 'upload', id: exam.id });
          }}
          onDeleted={() => {
            void reload();
            setView({ kind: 'list' }, { replace: true });
          }}
        />
      )}

      {sinif && tab === 'denemeler' && shownView.kind === 'list' && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-card">
          {loading ? (
            <p className="px-4 py-8 text-sm text-muted text-center">Yükleniyor…</p>
          ) : listed.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={`${sinifEtiketi(sinif)} için henüz deneme yok`}
              description="Yeni deneme ekleyin: cevap anahtarı Excel'ini, optik formatını (FMT) ve optik sonuç dosyalarını (TXT) yükleyin."
              action={
                readOnly ? undefined : (
                  <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setView({ kind: 'new' })}>
                    <Plus /> Yeni deneme
                  </button>
                )
              }
            />
          ) : (
            <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line" id="deneme-list-filters">
              <select id="deneme-filter-year" aria-label="Eğitim yılı" value={fYear} onChange={(e) => setFYear(e.target.value)} className={denemeSelectCls}>
                <option value="">Tüm yıllar</option>
                {listOpts.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select id="deneme-filter-publisher" aria-label="Yayınevi" value={fPub} onChange={(e) => setFPub(e.target.value)} className={denemeSelectCls}>
                <option value="">Tüm yayınevleri</option>
                {listOpts.publishers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="search"
                id="deneme-filter-search"
                value={fQ}
                onChange={(e) => setFQ(e.target.value)}
                placeholder="Deneme ara…"
                className="h-8 w-full sm:w-48 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {examFiltersOn && (
                <button
                  type="button"
                  id="deneme-filter-clear"
                  className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28"
                  onClick={() => {
                    setFYear('');
                    setFPub('');
                    setFQ('');
                  }}
                >
                  Temizle
                </button>
              )}
              <span className="text-xs text-muted sm:ml-auto">{shownExams.length} deneme</span>
            </div>
            {shownExams.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted text-center">Seçili süzgeçlere uygun deneme yok.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-fg-2">
                <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Deneme</th>
                    <th className="px-3 py-3 font-semibold">Tarih</th>
                    <th className="px-3 py-3 font-semibold text-center">Öğrenci</th>
                    <th className="px-3 py-3 font-semibold text-center">Ort. net</th>
                    <th className="px-3 py-3 font-semibold text-center">Ort. puan</th>
                    <th className="px-3 py-3 font-semibold">Durum</th>
                    <th className="px-4 py-3 font-semibold text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagedExams.visible.map((e) => (
                    <tr
                      key={e.id}
                      className="hover:bg-surface-2/30 transition-colors cursor-pointer"
                      onClick={() => setView(isDraftExam(e) ? { kind: 'draft', id: e.id } : { kind: 'detail', id: e.id })}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-fg">{e.name}</p>
                            <p className="text-[11px] text-muted">{[e.publisher, e.subjects.map((s) => s.short).join(' · ')].filter(Boolean).join(' — ')}</p>
                            {isDraftExam(e) && <span className="ui-chip ui-chip-warning mt-1 sm:hidden">Taslak · {e.draftInfo!.step}. adım</span>}
                          </div>
                          {!readOnly && (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-icon shrink-0 -my-1"
                            aria-label={`${e.name} bilgilerini düzenle`}
                            title="Deneme adını, tarihini ve yayınevini düzenle"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEdit(e);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{dateTr(e.examDate)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{e.summary.count ?? 0}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{fmtNet(e.summary.avgTotalNet)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums font-bold text-fg">{fmtScore(e.summary.avgScore)}</td>
                      <td className="px-3 py-2.5">
                        {isDraftExam(e) ? (
                          <span className="ui-chip ui-chip-warning" title="Sonuçları henüz kaydedilmedi; açınca kaldığı adımdan devam eder">
                            Taslak · {e.draftInfo!.step}. adım
                          </span>
                        ) : (
                          <span className={cx('ui-chip', e.published ? 'ui-chip-success' : 'ui-chip-neutral')}>{e.published ? 'Öğrencilere açık' : 'Kapalı'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ChevronRight className="w-4 h-4 inline text-subtle" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            <ShowMoreBar
              id="deneme-list-more"
              remaining={pagedExams.remaining}
              total={pagedExams.total}
              shown={pagedExams.visible.length}
              onMore={pagedExams.showMore}
              onAll={pagedExams.showAll}
              step={DENEME_PAGE}
            />
            </>
          )}
        </div>
      )}

      <Modal
        open={!!editExam}
        onClose={() => !editBusy && setEditExam(null)}
        icon={Pencil}
        tone="brand"
        size="md"
        title="Deneme bilgilerini düzenle"
        description="Ad, tarih ve yayınevi değişir; cevap anahtarı, sonuçlar ve puanlar değişmez."
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={editBusy} onClick={() => setEditExam(null)}>
              İptal
            </button>
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={editBusy || !editForm.name.trim()} onClick={() => void saveEdit()}>
              <Save /> {editBusy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="ui-label" htmlFor="dn-edit-name">Deneme adı</label>
            <input id="dn-edit-name" className="ui-input" value={editForm.name} maxLength={200} onChange={(ev) => setEditForm((f) => ({ ...f, name: ev.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ui-label" htmlFor="dn-edit-date">Tarih</label>
              <input id="dn-edit-date" type="date" className="ui-input" value={editForm.examDate} onChange={(ev) => setEditForm((f) => ({ ...f, examDate: ev.target.value }))} />
            </div>
            <div>
              <label className="ui-label" htmlFor="dn-edit-pub">Yayınevi</label>
              <input id="dn-edit-pub" className="ui-input" value={editForm.publisher} maxLength={120} onChange={(ev) => setEditForm((f) => ({ ...f, publisher: ev.target.value }))} />
            </div>
          </div>
          <p className="text-[11px] text-muted">Cevap anahtarını ve kazanımları düzenlemek için denemeyi açın.</p>
          {editError && <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{editError}</p>}
        </div>
      </Modal>

      {sinif && tab === 'karne' && (sinifExams.length ? <DenemeKarne key={sinif} exams={sinifExams} students={sinifStudents} classes={sinifClasses} limited={plain} /> : <p className="text-sm text-muted">Karne için önce {sinifEtiketi(sinif)} denemesi ekleyin.</p>)}
      {sinif && tab === 'etut' && etutTabOk && (sinifExams.length ? <DenemeEtut key={sinif} exams={sinifExams} students={sinifStudents} classes={sinifClasses} branchOnly={plain} /> : <p className="text-sm text-muted">Etüt listesi için önce {sinifEtiketi(sinif)} denemesi ekleyin.</p>)}
      {sinif && tab === 'kazanim' && !readOnly && <KazanimBankasi key={sinif} grade={sinif} />}

      <p className="text-[11px] text-muted flex items-center gap-1">
        TC kimlik numarası saklanmaz ve gösterilmez.
        <InfoTip
          label="Mahremiyet"
          text={'Eşleştirme için yalnızca geri çevrilemez parmak izi kullanılır. Öğrenciler yalnızca "öğrencilere açık" denemelerdeki kendi sonuçlarını görür; kurum yöneticileri yalnızca kendi kurumlarının denemelerini görür.'}
        />
      </p>
    </div>
  );
};
