// Ödevler: sayfanın bütün durumu ve işlemleri (Aşama 361). Görünüm parçaları bunu useOdevBaglam() ile okur.
import { createContext, useContext, useState, useRef, useMemo, useDeferredValue } from 'react';
import { usePagedList } from '../../../lib/listPaging';
import confetti from 'canvas-confetti';
import { Homework, HomeworkSubmission, Student, HomeworkResource, HomeworkCheckStatus } from '../../../types';
import { dataService } from '../../../services/dataService';
import { removeStoredFiles, storedPathsOf } from '../../../lib/fileStorage';
import type { HomeworkFormMode, HomeworkFormSaved } from '../HomeworkFormModal';
import { callMail, describeMailResult } from '../../../lib/mailApi';
import { useQuickFocus } from '../../../lib/quickFocus';
import { useHistoryState } from '../../../lib/useHistoryState';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { normalizeSubject } from '../../../lib/subjects';
import { useBildirimKanali } from '../../../lib/bildirim';
import { HOME_SCOPE_KEY, MINE, HomeworkManagementProps } from './ortak';

export function useOdevYonetimi({
  homeworks,
  submissions: propSubmissions,
  students,
  classes,
  onNavigateToEtut,
}: HomeworkManagementProps) {
  // Teslimler her zaman güncel veriden okunur (öğrenci teslim edince öğretmen ekranı kendiliğinden yenilenir)
  const submissions: HomeworkSubmission[] = propSubmissions || dataService.getSubmissions() || [];

  // View Mode: 'tracker' (Ödev Kontrol Çizelgesi) | 'all' (Tüm Oluşturulan Ödevler)
  // Aşama 52: sekme geçmişe yazılır; "Geri" tuşu önceki sekmeye döner
  const [activeTab, setActiveTab] = useHistoryState<'tracker' | 'all' | 'plan'>('hw.tab', 'tracker');

  // Ödev Kontrol Seçimleri
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>(''); // Ödev Kontrol'de açık olan şerit
  const [selectedClassIdForCheck, setSelectedClassIdForCheck] = useState<string>('');
  const [selectedStudentIdForCheck, setSelectedStudentIdForCheck] = useState<string>('');
  const [studentSearchInput, setStudentSearchInput] = useState<string>('');
  const setSaveFeedback = useBildirimKanali(); // Aşama 353: ortak bildirim
  const [isSavingChecks, setIsSavingChecks] = useState(false);
  const showSaveError = (err: any, fallback: string) => setSaveFeedback({ tone: 'danger', text: err?.message || fallback }); // Aşama 353

  // Taslak / Henüz Kaydedilmemiş Ödev Kontrol Durumları (studentId -> status)
  const [draftCheckStatuses, setDraftCheckStatuses] = useState<Record<string, HomeworkCheckStatus>>({});


  // Bir ödevi "Ödev Kontrol" ekranında açar: uygun sınıfı seçer, süzgeçleri temizler
  const focusHomeworkInTracker = (hw: Homework, switchTab = true) => {
    const targetIds = (hw.targetClassIds || []).filter(Boolean);
    const ids =
      Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0
        ? Array.from(new Set(students.filter((s) => (hw.assignedTo as string[]).includes(s.id)).map((s) => s.classId).filter(Boolean) as string[]))
        : targetIds.length > 0
          ? targetIds
          : hw.classId && hw.classId !== 'class-default'
            ? [hw.classId]
            : [];
    setSelectedClassIdForCheck((prev) => {
      if (prev && (ids.length === 0 || ids.includes(prev))) return prev;
      return ids.find((id) => classes.some((c) => c.id === id)) || prev || classes[0]?.id || '';
    });
    setSelectedHomeworkId(hw.id);
    setTrackerSearch('');
    setTrackerFilterSubject('all');
    setStudentSearchInput('');
    setDraftCheckStatuses({});
    if (switchTab) setActiveTab('tracker');
  };

  // Hızlı arama / ana sayfa kısayolu: seçilen ödevi kontrol ekranında aç veya yeni ödev penceresini aç
  useQuickFocus(['homework', 'action', 'teacher'], (f) => {
    if (f.type === 'teacher') {
      // Aşama 98: Kurum Özeti'nden gelen öğretmen süzgeci
      setActiveTab('all');
      setHwFilterTeacher(f.id);
      return;
    }
    if (f.type === 'homework') {
      const hw = homeworks.find((h) => h.id === f.id);
      if (hw) focusHomeworkInTracker(hw);
      else {
        setActiveTab('tracker');
        setSelectedHomeworkId(f.id);
      }
    } else if (f.id === 'homework-create' && canGive) {
      openHomeworkForm('create');
    } else if (f.id === 'plan' || f.id === 'plan-ogrenci') {
      // Aşama 249: rehberlik ana sayfası › "Plan" / öğrenci › "Plan hazırla": Haftalık plan sekmesi (öğrenci seçili)
      setActiveTab('plan');
      if (f.id === 'plan-ogrenci' && f.label) setPlanOdak({ id: f.label, at: Date.now() });
    }
  });
  const [planOdak, setPlanOdak] = useState<{ id: string; at: number } | null>(null);
  const [selectedHwForGrading, setSelectedHwForGrading] = useState<Homework | null>(null);
  const [expandedHwId, setExpandedHwId] = useState<string | null>(null);
  const [homeworkToDelete, setHomeworkToDelete] = useState<Homework | null>(null);
  // Öğretmenin incelediği öğrenci teslimi (ödev + öğrenci). Teslim her zaman güncel listeden okunur.
  const [viewingSubmissionKey, setViewingSubmissionKey] = useState<{ homeworkId: string; studentId: string } | null>(null);
  const [editingResourcesHw, setEditingResourcesHw] = useState<Homework | null>(null);
  const [editingResourcesList, setEditingResourcesList] = useState<HomeworkResource[]>([]);

  // Kolay Ödev Bulma & Filtreleme Açılır Penceresi State'leri
  const [hwSearchQuery, setHwSearchQuery] = useState('');
  const [hwFilterSubject, setHwFilterSubject] = useState('all');
  const [hwFilterClassId, setHwFilterClassId] = useState('all');
  // Aşama 98: öğretmene göre. Aşama 113: ana sayfadaki "Benim / Tümü" seçimiyle aynı kayıt ('__mine__' = benim ödevlerim);
  // ana sayfada görülen ödev sayısı burada da aynen görünür
  const seesOthers = dataService.seesOthersWork();
  const [hwFilterTeacher, setHwFilterTeacherState] = useState(() => {
    if (!seesOthers) return 'all';
    try {
      const v = window.localStorage.getItem(HOME_SCOPE_KEY);
      // kayıt yoksa ana sayfanın varsayılanı: idare tümü, diğerleri kendi ödevleri
      return (v === 'mine' || v === 'all' ? v : dataService.showsKurumOzeti() ? 'all' : 'mine') === 'mine' ? MINE : 'all';
    } catch {
      return 'all';
    }
  });
  const setHwFilterTeacher = (v: string) => {
    setHwFilterTeacherState(v);
    if (!seesOthers || (v !== MINE && v !== 'all')) return;
    try {
      window.localStorage.setItem(HOME_SCOPE_KEY, v === MINE ? 'mine' : 'all');
    } catch {
      /* depolama kapalı */
    }
  };
  const [isHwSearchDropdownOpen, setIsHwSearchDropdownOpen] = useState(false);


  // Tüm Oluşturulan Ödevler Yana Yana Kayan Sayfalar (Slider / Carousel)
  const allHwSliderRef = useRef<HTMLDivElement>(null);
  const [allHwActiveIndex, setAllHwActiveIndex] = useState(0);

  const scrollAllHwSlider = (direction: 'prev' | 'next') => {
    if (!allHwSliderRef.current) return;
    const container = allHwSliderRef.current;
    const cardWidth = container.firstElementChild
      ? (container.firstElementChild as HTMLElement).clientWidth + 20
      : 500;
    const scrollAmount = direction === 'prev' ? -cardWidth : cardWidth;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  // Ödev Kontrol süzgeçleri: arama + ders (sınıf: selectedClassIdForCheck)
  const [trackerSearch, setTrackerSearch] = useState<string>('');
  const [trackerFilterSubject, setTrackerFilterSubject] = useState<string>('all');

  // Sayfanın Hepsi Açılsın Modal State'i (Görüntüle Butonu)
  const [activeViewingHomework, setActiveViewingHomework] = useState<Homework | null>(null);

  const scrollAllHwTrack = (distance: number) => {
    const el = document.getElementById('all-hw-carousel-track');
    if (el) {
      el.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  const formatDueDateTurkish = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Ödev Belgesini Temiz Word / Yazdırma Belgesi Olarak İndirme Fonksiyonu
  const handleDownloadHomeworkDoc = (hw: Homework) => {
    const targetClassNames = (hw.targetClassIds || [])
      .map((cid) => classes.find((c) => c.id === cid)?.name)
      .filter(Boolean);

    const assignedCount = students.filter((std) => dataService.isHomeworkForStudent(hw, std)).length;

    const dueDateFormatted = new Date(hw.dueDate).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const dueTimeFormatted = new Date(hw.dueDate).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${hw.title}</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 15px; margin-bottom: 25px; }
          .header h2 { margin: 0; font-size: 18pt; color: #0f172a; text-transform: uppercase; }
          .header h3 { margin: 5px 0; font-size: 14pt; color: #334155; font-weight: 600; }
          .header h4 { margin: 0; font-size: 12pt; color: #475569; }
          .meta-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
          .meta-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11pt; }
          .section-title { font-size: 13pt; font-weight: bold; color: #4338ca; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px; margin-bottom: 12px; }
          .description-box { font-size: 11pt; line-height: 1.8; background: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; }
          .outcomes-list { padding-left: 20px; margin: 10px 0; }
          .outcomes-list li { margin-bottom: 6px; font-size: 10.5pt; color: #334155; }
          .signature-area { margin-top: 50px; display: flex; justify-content: space-between; }
          .sig-box { text-align: center; width: 220px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>T.C. MİLLÎ EĞİTİM BAKANLIĞI</h2>
          <h3>2026-2027 EĞİTİM-ÖĞRETİM YILI</h3>
          <h4>KAZANIM ODAKLI ÖDEV VE ÇALIŞMA FORMU</h4>
        </div>

        <div class="meta-box">
          <div class="meta-row"><strong>Ödev Başlığı:</strong> ${hw.title}</div>
          <div class="meta-row"><strong>Ders / Kademe:</strong> ${hw.subject} (${hw.schoolLevel || 'Ortaokul / Lise'})</div>
          <div class="meta-row"><strong>Hedef Sınıflar:</strong> ${targetClassNames.join(', ') || 'Tüm Şubeler'}</div>
          <div class="meta-row"><strong>Son Teslim Tarihi:</strong> ${dueDateFormatted} - ${dueTimeFormatted}</div>
          <div class="meta-row"><strong>Hedef Öğrenci Sayısı:</strong> ${assignedCount} Öğrenci</div>
        </div>

        <div class="section-title">ÖDEV YÖNERGESİ VE TALİMATLAR</div>
        <div class="description-box">
          ${(hw.description || 'Belirtilmedi').replace(/\n/g, '<br/>')}
        </div>

        ${
          hw.outcomes && hw.outcomes.length > 0
            ? `
          <div class="section-title">HEDEFLENEN KAZANIMLAR VE ÖĞRENME ALANLARI</div>
          <ul class="outcomes-list">
            ${hw.outcomes.map((o) => `<li>${o}</li>`).join('')}
          </ul>
        `
            : ''
        }

        <div class="signature-area">
          <div class="sig-box">
            <strong>Ders Öğretmeni</strong><br>
            ${String(hw.teacherName || hw.createdByName || '').replace(/[<>&]/g, '') || '&nbsp;'}<br>
            İmza
          </div>
          <div class="sig-box">
            <strong>Zümre Başkanı / Okul İdaresi</strong><br>
            Kontrol & Onay<br>
            İmza
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = hw.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_');
    link.href = url;
    link.download = `${safeTitle}_Odev_Belgesi_2026_2027.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSaveFeedback(`"${hw.title}" ödev belgesi başarıyla indirildi.`);
  };

  // Materyal düzenleme penceresi durumları
  const [editingPendingResource, setEditingPendingResource] = useState<HomeworkResource | null>(null);
  const [isSavingResources, setIsSavingResources] = useState(false);
  const [isEditUploadBusy, setIsEditUploadBusy] = useState(false);

  // Ödev oluştur / kopyala / düzenle penceresi (Aşama 9)
  const [homeworkForm, setHomeworkForm] = useState<{ mode: HomeworkFormMode; source: Homework | null } | null>(null);
  // Aşama 98: idare (ayar kapalıyken) ve ders vermeyen roller yeni ödev açamaz / kopyalayamaz (veritabanı da reddeder)
  const canGive = dataService.canGiveHomework();
  const openHomeworkForm = (mode: HomeworkFormMode, source: Homework | null = null) => {
    if (mode !== 'edit' && !canGive) return;
    setHomeworkForm({ mode, source });
  };
  // Otomatik e-posta sonucu (Aşama 32: 15 sn sonra kendiliğinden kaybolur ya da kapatılır)
  const setMailNotice = useBildirimKanali(); // Aşama 353: ortak bildirim

  const handleHomeworkSaved = ({ homework: hw, mode, sendMail }: HomeworkFormSaved) => {
    setHomeworkForm(null);
    if (mode === 'edit') {
      setSaveFeedback('Ödev güncellendi.');
      return;
    }
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setActiveTab('all');
    setExpandedHwId(hw.id);
    focusHomeworkInTracker(hw, false);
    setSaveFeedback(`"${hw.title}" ödevi kaydedildi.`);
    if (sendMail) {
      setMailNotice({ tone: 'info', text: 'Öğrencilere e-posta gönderiliyor…' });
      callMail('homework-created', { homeworkId: hw.id }).then((r) => setMailNotice(describeMailResult(r)));
    } else {
      setMailNotice(null);
    }
  };


  const closeEditResourcesModal = () => {
    if (isSavingResources) return;
    if (editingResourcesHw) {
      const saved = new Set(storedPathsOf(editingResourcesHw.resources));
      const unsaved = storedPathsOf(editingResourcesList).filter((p) => !saved.has(p));
      if (unsaved.length > 0) removeStoredFiles(unsaved);
    }
    setEditingResourcesHw(null);
    setEditingPendingResource(null);
  };

  const handleOpenEditResources = (hw: Homework) => {
    setEditingResourcesHw(hw);
    setEditingResourcesList(hw.resources || []);
  };

  const handleSaveEditedResources = async () => {
    if (!editingResourcesHw || isSavingResources) return;
    const finalResources = editingPendingResource
      ? [...editingResourcesList, { ...editingPendingResource, id: `res-${Date.now()}` }]
      : editingResourcesList;
    setIsSavingResources(true);
    try {
      await dataService.updateHomework(editingResourcesHw.id, { resources: finalResources });
      setEditingResourcesHw(null);
      setEditingPendingResource(null);
      setSaveFeedback('Ödev materyalleri kaydedildi.');
    } catch (err: any) {
      showSaveError(err, 'Materyaller kaydedilemedi.');
    } finally {
      setIsSavingResources(false);
    }
  };

  // Selected Homework for Tracking
  const selectedHomework =
    homeworks.find((h) => h.id === selectedHomeworkId) || homeworks[0] || null;

  // ---- Ödev Kontrol yardımcıları ----
  // Ödev bu sınıfa verilmiş mi? (öğrenciye özel ödevlerde sınıftan en az bir öğrenci olmalı)
  const homeworkTargetsClass = (hw: Homework, classId: string, classStudents: Student[]): boolean => {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) {
      const ids = hw.assignedTo;
      return classStudents.some((s) => ids.includes(s.id));
    }
    const targetIds = (hw.targetClassIds || []).filter(Boolean);
    if (targetIds.length > 0) return targetIds.includes(classId);
    if (hw.classId && hw.classId !== 'class-default') return hw.classId === classId;
    return true; // hedefi belirtilmemiş eski ödevler tüm sınıflarda görünür
  };

  // Sınıftaki öğrencilerden bu ödevin verildikleri
  const studentsForHomeworkInClass = (hw: Homework, classStudents: Student[]): Student[] => {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) {
      const ids = hw.assignedTo;
      return classStudents.filter((s) => ids.includes(s.id));
    }
    return classStudents;
  };

  // Kayıtlı kontrol durumu (teslim zamanında/geç ise "Yaptı" sayılır)
  const savedCheckStatusOf = (sub?: HomeworkSubmission): HomeworkCheckStatus | '' => {
    if (!sub) return '';
    if (sub.checkStatus) return sub.checkStatus;
    if (sub.status === 'on_time' || sub.status === 'late') return 'yapti';
    return '';
  };

  // Son teslim etiketi: "3 gün kaldı", "Bugün son gün", "Süresi doldu"
  const dueInfoOf = (dueDate?: string): { label: string; cls: string } => {
    const d = dueDate ? new Date(dueDate) : null;
    if (!d || isNaN(d.getTime())) return { label: 'Tarih yok', cls: 'bg-surface-2 text-muted' };
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(d) - startOf(new Date())) / 86400000);
    if (diff < 0) return { label: 'Süresi doldu', cls: 'bg-surface-2 text-muted' };
    if (diff === 0) return { label: 'Bugün son gün', cls: 'bg-danger-soft text-danger-fg' };
    if (diff === 1) return { label: 'Yarın son gün', cls: 'bg-warning-soft text-warning-fg' };
    if (diff <= 3) return { label: `${diff} gün kaldı`, cls: 'bg-warning-soft text-warning-fg' };
    return { label: `${diff} gün kaldı`, cls: 'bg-info-soft text-info-fg' };
  };

  // HIZ (Aşama 84): ödev başına teslimler ve hedef öğrenciler bir kez hesaplanır (her tuş vuruşunda
  // tüm ödevler × tüm öğrenciler yeniden taranmaz). Veri değişince kendiliğinden yenilenir.
  const submissionsByHw = useMemo(() => {
    const m = new Map<string, HomeworkSubmission[]>();
    for (const sub of submissions) {
      const list = m.get(sub.homeworkId);
      if (list) list.push(sub);
      else m.set(sub.homeworkId, [sub]);
    }
    return m;
  }, [submissions]);
  const hwStudentsCache = useMemo(() => new Map<string, Student[]>(), [homeworks, students]);
  const studentsForHw = (hw: Homework): Student[] => {
    let list = hwStudentsCache.get(hw.id);
    if (!list) {
      list = students.filter((std) => dataService.isHomeworkForStudent(hw, std));
      hwStudentsCache.set(hw.id, list);
    }
    return list;
  };
  const deferredHwSearch = useDeferredValue(hwSearchQuery);
  // "Tüm Ödevler" listesi: süzme bir kez yapılır, liste 50'şer çizilir ("Daha fazla göster")
  // Aşama 98: ödevlerin sahibi öğretmenler (birden fazlaysa "Öğretmene göre" süzgeci görünür)
  const ownerOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const hw of homeworks) m.set(hw.id, dataService.homeworkOwner(hw));
    return m;
  }, [homeworks]);
  const ownerOptions = useMemo(() => {
    const m = new Map<string, string>();
    ownerOf.forEach((o) => m.set(o.id, o.name));
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [ownerOf]);
  // Aşama 116: öğrenci → sınıf haritası (sınıf süzgecinde kişiye özel ödevler için; bir kez hazırlanır)
  const classOfStudent = useMemo(() => {
    const m = new Map<string, string>();
    for (const st of students) if (st.classId) m.set(st.id, st.classId);
    return m;
  }, [students]);
  const allTabHomeworks = useMemo(
    () =>
      homeworks.filter((hw) => {
        if (hwFilterTeacher === MINE) {
          if (!dataService.isMine(hw)) return false;
        } else if (hwFilterTeacher !== 'all' && ownerOf.get(hw.id)?.id !== hwFilterTeacher) return false;
        if (hwFilterSubject !== 'all' && normalizeSubject(hw.subject) !== hwFilterSubject) {
          return false;
        }
        if (hwFilterClassId !== 'all') {
          // Aşama 116: Ödev Kontrol'deki kuralla (homeworkTargetsClass) ve veritabanındaki öğrenci kuralıyla aynı:
          // kişiye özel ödev yalnız öğrencilerinden biri o sınıftaysa; sınıfa verilen ödev kendi sınıflarında;
          // hedef bilgisi hiç olmayan eski kayıt eskisi gibi her sınıfta kalır
          const studs = Array.isArray(hw.assignedTo) ? hw.assignedTo : [];
          const cls =
            hw.targetClassIds && hw.targetClassIds.length > 0
              ? hw.targetClassIds
              : hw.classId && hw.classId !== 'class-default'
                ? [hw.classId]
                : [];
          if (studs.length > 0) {
            if (!studs.some((id) => classOfStudent.get(id) === hwFilterClassId)) return false;
          } else if (cls.length > 0 && !cls.includes(hwFilterClassId)) return false;
        }
        if (deferredHwSearch.trim()) {
          // Aşama 116: Türkçe harf duyarsız arama (İ/ı, ş, ğ … aynı sayılır)
          const q = deferredHwSearch;
          const matchTitle = matchTurkishSearch(hw.title, q);
          const matchSubj = matchTurkishSearch(hw.subject, q);
          const matchDesc = matchTurkishSearch(hw.description, q);
          // Aşama 116: kazanımların ikisi de aranır (form alanı + veritabanı sütunu)
          const matchOutcomes =
            hw.outcomes?.some((o) => matchTurkishSearch(o, q)) || hw.learningOutcomes?.some((o) => matchTurkishSearch(o, q));
          if (!matchTitle && !matchSubj && !matchDesc && !matchOutcomes) {
            return false;
          }
        }
        return true;
      }),
    [homeworks, hwFilterSubject, hwFilterClassId, deferredHwSearch, hwFilterTeacher, ownerOf, classOfStudent]
  );
  const pagedAllHw = usePagedList(allTabHomeworks, `${deferredHwSearch}|${hwFilterSubject}|${hwFilterClassId}|${hwFilterTeacher}`);
  // Açık (genişletilmiş) ödev sayfanın dışında kaldıysa yine gösterilir
  const visibleAllHw =
    !expandedHwId || pagedAllHw.visible.some((h) => h.id === expandedHwId)
      ? pagedAllHw.visible
      : [...pagedAllHw.visible, ...allTabHomeworks.filter((h) => h.id === expandedHwId)];

  // Is any class or student selected? (Açılır pencerelerden biri seçilmeden sayfa altında ödev bilgileri çıkmasın)
  const isSelectionActive = Boolean(
    selectedClassIdForCheck || selectedStudentIdForCheck || studentSearchInput.trim()
  );

  // Filter students for the check table based on selection
  const targetStudentsForCheck = students.filter((std) => {
    // If specific single student selected via dropdown
    if (selectedStudentIdForCheck) {
      return std.id === selectedStudentIdForCheck;
    }
    // If student search input is used
    if (studentSearchInput.trim()) {
      const q = studentSearchInput.trim();
      const matchName = matchTurkishSearch(std.name, q);
      const matchNo = std.studentNumber?.toLowerCase().includes(q.toLowerCase()) || false;
      const matchClass = matchTurkishSearch(std.className, q);
      if (!matchName && !matchNo && !matchClass) return false;
      if (selectedClassIdForCheck && std.classId !== selectedClassIdForCheck) return false;
      return true;
    }
    // If class selected
    if (selectedClassIdForCheck) {
      return std.classId === selectedClassIdForCheck;
    }
    return false;
  });

  const getStudentCheckStatus = (studentId: string): HomeworkCheckStatus | '' => {
    if (draftCheckStatuses[studentId] !== undefined) {
      return draftCheckStatuses[studentId];
    }
    if (!selectedHomework) return '';
    const sub = submissions.find(
      (s) => s.homeworkId === selectedHomework.id && s.studentId === studentId
    );
    if (!sub) return '';
    if (sub.checkStatus) return sub.checkStatus;
    if (sub.status === 'on_time' || sub.status === 'late') return 'yapti';
    return '';
  };

  const isStudentStatusDraftModified = (studentId: string): boolean => {
    return draftCheckStatuses[studentId] !== undefined;
  };

  const handleCheckStatusChange = (studentId: string, status: HomeworkCheckStatus) => {
    setDraftCheckStatuses((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    const labels: Record<HomeworkCheckStatus, string> = {
      yapti: 'Yaptı',
      yapmadi: 'Yapmadı',
      eksik: 'Eksik',
      izinli: 'İzinli',
      gelmedi: 'Gelmedi',
    };
    setSaveFeedback(`${labels[status]} seçildi.`);
  };

  const handleBatchStatus = (status: HomeworkCheckStatus) => {
    if (!selectedHomework || targetStudentsForCheck.length === 0) return;
    setDraftCheckStatuses((prev) => {
      const next = { ...prev };
      targetStudentsForCheck.forEach((std) => {
        next[std.id] = status;
      });
      return next;
    });
    const labels: Record<HomeworkCheckStatus, string> = {
      yapti: 'Yaptı',
      yapmadi: 'Yapmadı',
      eksik: 'Eksik',
      izinli: 'İzinli',
      gelmedi: 'Gelmedi',
    };
    setSaveFeedback(`Listedeki tüm öğrenciler "${labels[status]}" olarak seçildi.`);
  };

  const handleSaveAllChecks = async () => {
    if (!selectedHomework) return;
    const modifiedStudentIds = Object.keys(draftCheckStatuses);
    if (modifiedStudentIds.length === 0) {
      setSaveFeedback('Kaydedilecek yeni bir değişiklik bulunmuyor.');
      return;
    }

    if (isSavingChecks) return;
    setIsSavingChecks(true);
    try {
      await dataService.saveHomeworkCheckStatuses(
        selectedHomework.id,
        modifiedStudentIds.map((studentId) => ({ studentId, checkStatus: draftCheckStatuses[studentId] }))
      );
      const count = modifiedStudentIds.length;
      setDraftCheckStatuses({});
      setSaveFeedback(`✓ ${count} öğrencinin ödev kontrol durumu başarıyla sisteme kaydedildi!`);
    } catch (err: any) {
      showSaveError(err, 'Ödev kontrol durumları kaydedilemedi.');
    } finally {
      setIsSavingChecks(false);
    }
  };

  const handleResetDraftChecks = () => {
    setDraftCheckStatuses({});
    setSaveFeedback('Kaydedilmemiş değişiklikler sıfırlandı.');
  };

  const unsavedCount = Object.keys(draftCheckStatuses).length;
  const hasUnsavedChecks = unsavedCount > 0;

  return {
    homeworks,
    propSubmissions,
    students,
    classes,
    onNavigateToEtut,
    submissions,
    activeTab,
    setActiveTab,
    selectedHomeworkId,
    setSelectedHomeworkId,
    selectedClassIdForCheck,
    setSelectedClassIdForCheck,
    selectedStudentIdForCheck,
    setSelectedStudentIdForCheck,
    studentSearchInput,
    setStudentSearchInput,
    setSaveFeedback,
    isSavingChecks,
    setIsSavingChecks,
    showSaveError,
    draftCheckStatuses,
    setDraftCheckStatuses,
    focusHomeworkInTracker,
    planOdak,
    setPlanOdak,
    selectedHwForGrading,
    setSelectedHwForGrading,
    expandedHwId,
    setExpandedHwId,
    homeworkToDelete,
    setHomeworkToDelete,
    viewingSubmissionKey,
    setViewingSubmissionKey,
    editingResourcesHw,
    setEditingResourcesHw,
    editingResourcesList,
    setEditingResourcesList,
    hwSearchQuery,
    setHwSearchQuery,
    hwFilterSubject,
    setHwFilterSubject,
    hwFilterClassId,
    setHwFilterClassId,
    seesOthers,
    hwFilterTeacher,
    setHwFilterTeacherState,
    setHwFilterTeacher,
    isHwSearchDropdownOpen,
    setIsHwSearchDropdownOpen,
    allHwSliderRef,
    allHwActiveIndex,
    setAllHwActiveIndex,
    scrollAllHwSlider,
    trackerSearch,
    setTrackerSearch,
    trackerFilterSubject,
    setTrackerFilterSubject,
    activeViewingHomework,
    setActiveViewingHomework,
    scrollAllHwTrack,
    formatDueDateTurkish,
    handleDownloadHomeworkDoc,
    editingPendingResource,
    setEditingPendingResource,
    isSavingResources,
    setIsSavingResources,
    isEditUploadBusy,
    setIsEditUploadBusy,
    homeworkForm,
    setHomeworkForm,
    canGive,
    openHomeworkForm,
    setMailNotice,
    handleHomeworkSaved,
    closeEditResourcesModal,
    handleOpenEditResources,
    handleSaveEditedResources,
    selectedHomework,
    homeworkTargetsClass,
    studentsForHomeworkInClass,
    savedCheckStatusOf,
    dueInfoOf,
    submissionsByHw,
    hwStudentsCache,
    studentsForHw,
    deferredHwSearch,
    ownerOf,
    ownerOptions,
    classOfStudent,
    allTabHomeworks,
    pagedAllHw,
    visibleAllHw,
    isSelectionActive,
    targetStudentsForCheck,
    getStudentCheckStatus,
    isStudentStatusDraftModified,
    handleCheckStatusChange,
    handleBatchStatus,
    handleSaveAllChecks,
    handleResetDraftChecks,
    unsavedCount,
    hasUnsavedChecks,
  };
}

export type OdevBaglamDegeri = ReturnType<typeof useOdevYonetimi>;
export const OdevBaglam = createContext<OdevBaglamDegeri | null>(null);
export function useOdevBaglam(): OdevBaglamDegeri {
  const d = useContext(OdevBaglam);
  if (!d) throw new Error('OdevBaglam sağlayıcısı yok');
  return d;
}
