import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpen, ChevronRight, FileBarChart, Pencil, Plus, Save, ShieldCheck, Users } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { isSetupError, listExams, updateExamInfo, type DenemeExam } from '../../services/denemeService';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateTr } from '../../lib/deneme/karneModel';
import { DenemeWizard } from './DenemeWizard';
import { DenemeSonuclar } from './DenemeSonuclar';
import { DenemeKarne } from './DenemeKarne';
import { DenemeEtut } from './DenemeEtut';
import { KazanimBankasi } from './KazanimBankasi';

// ============================================================================
// DENEME ANALİZİ (Aşama 47) — ana sayfa
// Genel yönetici ve bölümü açılmış kurumların yöneticileri kullanır (dataService.canUseDeneme).
// Sekmeler: Denemeler (yükleme, sonuçlar) · Karneler · Etüt yönlendirme · Kazanım bankası (Aşama 48)
// ============================================================================

type Tab = 'denemeler' | 'karne' | 'etut' | 'kazanim';
type View = { kind: 'list' } | { kind: 'new' } | { kind: 'upload'; exam: DenemeExam } | { kind: 'detail'; id: string };

export const DenemeAnalizi: React.FC<{ students: Student[]; classes: ClassGroup[] }> = ({ students, classes }) => {
  const [tab, setTab] = useState<Tab>('denemeler');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [exams, setExams] = useState<DenemeExam[]>([]);
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
      setExams(await listExams());
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
        tab === 'denemeler' && view.kind === 'list' && !setupMissing ? (
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setView({ kind: 'new' })} id="deneme-new">
            <Plus /> Yeni deneme
          </button>
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
            { value: 'etut', label: 'Etüt yönlendirme', icon: Users },
            { value: 'kazanim', label: 'Kazanım bankası', icon: BookOpen },
          ]}
        />
      )}

      {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}

      {tab === 'denemeler' && view.kind === 'new' && (
        <DenemeWizard
          students={students}
          classes={classes}
          onCancel={() => setView({ kind: 'list' })}
          onSaved={(id) => {
            void reload();
            setView({ kind: 'detail', id });
          }}
        />
      )}
      {tab === 'denemeler' && view.kind === 'upload' && (
        <DenemeWizard
          students={students}
          classes={classes}
          existing={view.exam}
          startStep={2}
          onCancel={() => setView({ kind: 'detail', id: view.exam.id })}
          onSaved={(id) => {
            void reload();
            setView({ kind: 'detail', id });
          }}
        />
      )}
      {tab === 'denemeler' && view.kind === 'detail' && (
        <DenemeSonuclar
          examId={view.id}
          onBack={() => {
            void reload();
            setView({ kind: 'list' });
          }}
          onUploadMore={(exam) => setView({ kind: 'upload', exam })}
          onDeleted={() => {
            void reload();
            setView({ kind: 'list' });
          }}
        />
      )}

      {tab === 'denemeler' && view.kind === 'list' && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-card">
          {loading ? (
            <p className="px-4 py-8 text-sm text-muted text-center">Yükleniyor…</p>
          ) : exams.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Henüz deneme yok"
              description="Yeni deneme ekleyin: cevap anahtarı Excel'ini, optik formatını (FMT) ve optik sonuç dosyalarını (TXT) yükleyin."
              action={
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setView({ kind: 'new' })}>
                  <Plus /> Yeni deneme
                </button>
              }
            />
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
                  {exams.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-2/30 transition-colors cursor-pointer" onClick={() => setView({ kind: 'detail', id: e.id })}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-fg">{e.name}</p>
                            <p className="text-[11px] text-muted">{[e.publisher, e.subjects.map((s) => s.short).join(' · ')].filter(Boolean).join(' — ')}</p>
                          </div>
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
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{dateTr(e.examDate)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{e.summary.count ?? 0}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{fmtNet(e.summary.avgTotalNet)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums font-bold text-fg">{fmtScore(e.summary.avgScore)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cx('ui-chip', e.published ? 'ui-chip-success' : 'ui-chip-neutral')}>{e.published ? 'Öğrencilere açık' : 'Kapalı'}</span>
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

      {tab === 'karne' && (exams.length ? <DenemeKarne exams={exams} students={students} classes={classes} /> : <p className="text-sm text-muted">Karne için önce deneme ekleyin.</p>)}
      {tab === 'etut' && (exams.length ? <DenemeEtut exams={exams} students={students} classes={classes} /> : <p className="text-sm text-muted">Etüt listesi için önce deneme ekleyin.</p>)}
      {tab === 'kazanim' && <KazanimBankasi />}

      <p className="text-[11px] text-muted">
        Mahremiyet: TC kimlik numarası hiçbir yerde saklanmaz ve gösterilmez; eşleştirme için yalnızca geri çevrilemez parmak izi kullanılır. Öğrenciler yalnızca "öğrencilere açık" denemelerdeki kendi sonuçlarını görür; kurum yöneticileri yalnızca kendi kurumlarının denemelerini görür.
      </p>
    </div>
  );
};
