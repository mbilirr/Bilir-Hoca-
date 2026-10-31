import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, Building2, ChevronRight, FileBarChart, ListOrdered, Pencil, Plus, Save, ShieldCheck, Undo2, Users } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { getExam, isDraftExam, isSetupError, listExams, updateExamInfo, type DenemeExam } from '../../services/denemeService';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
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

// Aşama 111: deneme listesi süzgeçleri (herkese aynı; öğretmende seçenekler yalnız görebildiği denemelerden gelir)
const denemeYear = (e: DenemeExam) => (e.examDate ? currentAcademicYear(new Date(e.examDate + 'T12:00:00')) : '');
const denemeGrade = (e: DenemeExam) => String(parseInt(String(e.grade), 10) || e.grade || '');
const denemeSelectCls = 'h-8 w-full sm:w-36 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500';
const DENEME_PAGE = 15;

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
    () => allExams.filter((e) => !isDraftExam(e) && (!myGrades || myGrades.has(String(parseInt(String(e.grade), 10))))),
    [allExams, myGrades]
  );
  useEffect(() => {
    if (plain && (tab === 'etut' || tab === 'kazanim')) setTab('denemeler', { replace: true });
  }, [plain, tab]);
  const listed = readOnly ? exams : allExams;
  const [fYear, setFYear] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [fPub, setFPub] = useState('');
  const [fQ, setFQ] = useState('');
  const fTerm = useDeferredValue(fQ.trim());
  const listOpts = useMemo(() => {
    const y = new Set<string>();
    const g = new Set<string>();
    const p = new Set<string>();
    listed.forEach((e) => {
      const yy = denemeYear(e);
      if (yy) y.add(yy);
      const gg = denemeGrade(e);
      if (gg) g.add(gg);
      if (e.publisher?.trim()) p.add(e.publisher.trim());
    });
    return {
      years: Array.from(y).sort().reverse(),
      grades: Array.from(g).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)),
      publishers: Array.from(p).sort(turkishCompare),
    };
  }, [listed]);
  const shownExams = useMemo(
    () =>
      listed.filter(
        (e) =>
          (!fYear || denemeYear(e) === fYear) &&
          (!fGrade || denemeGrade(e) === fGrade) &&
          (!fPub || (e.publisher || '').trim() === fPub) &&
          (!fTerm || matchTurkishSearch(e.name, fTerm) || matchTurkishSearch(e.publisher, fTerm))
      ),
    [listed, fYear, fGrade, fPub, fTerm]
  );
  const examFiltersOn = !!(fYear || fGrade || fPub || fTerm);
  const pagedExams = usePagedList(shownExams, `${fYear}|${fGrade}|${fPub}|${fTerm}`, DENEME_PAGE);
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
      description="Optik sonuçları, LGS puanı, kazanım analizi, karneler ve etüt yönlendirme"
      actions={
        tab === 'denemeler' && view.kind === 'list' && !setupMissing && (!readOnly || !plain) ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Aşama 115: ortalama sıralama (Excel) — yalnız yönetici, Müdür / Yrd., Rehberlik, Ölçme Değ. */}
            {!plain && exams.length > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSiralamaOpen(true)} id="deneme-ortalama-siralama">
                <ListOrdered /> Ortalama sıralama
              </button>
            )}
            {!readOnly && isHead && exams.length > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setAktarOpen('aktar')} id="deneme-kurum-aktar">
                <Building2 /> Kuruma aktar
              </button>
            )}
            {!readOnly && gecis && allExams.some((e) => !!e.kurumId) && (
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
        <Segmented
          value={tab}
          onChange={(v) => {
            setTab(v);
            setView({ kind: 'list' });
          }}
          items={[
            { value: 'denemeler', label: 'Denemeler', icon: BarChart3 },
            { value: 'karne', label: 'Karneler', icon: FileBarChart },
            ...(plain ? [] : [{ value: 'etut' as Tab, label: 'Etüt yönlendirme', icon: Users }]),
            ...(readOnly ? [] : [{ value: 'kazanim' as Tab, label: 'Kazanım bankası', icon: BookOpen }]),
          ]}
        />
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
            exams={aktarOpen === 'geri' ? allExams : exams}
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
          <OrtalamaSiralamaModal onClose={() => setSiralamaOpen(false)} exams={exams} students={students} classes={classes} />
        </Suspense>
      )}

      {tab === 'denemeler' && shownView.kind === 'new' && !readOnly && (
        <DenemeWizard
          students={students}
          classes={classes}
          onCancel={() => goBack({ kind: 'list' })}
          onSaved={(id) => {
            void reload();
            // Kaydedilen sihirbaz ekranı geçmişte kalmasın: aynı kayıt sonuç ekranına çevrilir
            setView({ kind: 'detail', id }, { replace: true });
          }}
          onDraftChange={() => void reload()}
        />
      )}
      {tab === 'denemeler' && shownView.kind === 'draft' && !readOnly &&
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
      {tab === 'denemeler' && shownView.kind === 'upload' && uploadExam && !readOnly && (
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
      {tab === 'denemeler' && shownView.kind === 'detail' && (
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

      {tab === 'denemeler' && shownView.kind === 'list' && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-card">
          {loading ? (
            <p className="px-4 py-8 text-sm text-muted text-center">Yükleniyor…</p>
          ) : listed.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Henüz deneme yok"
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
              <select id="deneme-filter-grade" aria-label="Kademe" value={fGrade} onChange={(e) => setFGrade(e.target.value)} className={denemeSelectCls}>
                <option value="">Tüm kademeler</option>
                {listOpts.grades.map((g) => (
                  <option key={g} value={g}>
                    {g}. sınıf
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
                className="h-8 w-full sm:w-48 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {examFiltersOn && (
                <button
                  type="button"
                  id="deneme-filter-clear"
                  className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28"
                  onClick={() => {
                    setFYear('');
                    setFGrade('');
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

      {tab === 'karne' && (exams.length ? <DenemeKarne exams={exams} students={students} classes={classes} limited={plain} /> : <p className="text-sm text-muted">Karne için önce deneme ekleyin.</p>)}
      {tab === 'etut' && !plain && (exams.length ? <DenemeEtut exams={exams} students={students} classes={classes} /> : <p className="text-sm text-muted">Etüt listesi için önce deneme ekleyin.</p>)}
      {tab === 'kazanim' && !readOnly && <KazanimBankasi />}

      <p className="text-[11px] text-muted">
        Mahremiyet: TC kimlik numarası hiçbir yerde saklanmaz ve gösterilmez; eşleştirme için yalnızca geri çevrilemez parmak izi kullanılır. Öğrenciler yalnızca "öğrencilere açık" denemelerdeki kendi sonuçlarını görür; kurum yöneticileri yalnızca kendi kurumlarının denemelerini görür.
      </p>
    </div>
  );
};
