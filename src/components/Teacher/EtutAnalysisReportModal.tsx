import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileText,
  Download,
  Printer,
  Calendar,
  BookOpen,
  Clock,
  User,
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  FileCheck,
  Building2,
  MapPin,
  ClipboardList,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable, { applyPlugin } from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  ShadingType,
  BorderStyle,
} from 'docx';
import { Etut, Student, ClassGroup } from '../../types';

// Safely register autoTable on jsPDF prototype
try {
  applyPlugin(jsPDF);
} catch (e) {
  // Ignored if already registered
}

interface EtutAnalysisReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  preselectedStudentId?: string;
}

// Infallible autoTable runner for different ESM/CJS build outputs in Vite
function executeAutoTable(doc: any, options: any) {
  try {
    if (typeof doc.autoTable === 'function') {
      doc.autoTable(options);
      return;
    }
    try {
      applyPlugin(jsPDF);
      if (typeof doc.autoTable === 'function') {
        doc.autoTable(options);
        return;
      }
    } catch (e) {}

    if (typeof autoTable === 'function') {
      autoTable(doc, options);
      return;
    }
    if ((autoTable as any)?.default && typeof (autoTable as any).default === 'function') {
      (autoTable as any).default(doc, options);
      return;
    }
    // Fallback: check global window or doc prototype
    if (typeof (window as any)?.jspdfAutoTable === 'function') {
      (window as any).jspdfAutoTable(doc, options);
      return;
    }
    console.warn('AutoTable could not be executed directly.');
  } catch (err) {
    console.error('executeAutoTable error:', err);
  }
}

// jsPDF için Türkçe karakterleri güvenli Latin karakterlere dönüştüren yardımcı fonksiyon
function toSafePdfText(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/â/g, 'a')
    .replace(/Â/g, 'A')
    .replace(/î/g, 'i')
    .replace(/Î/g, 'I')
    .replace(/û/g, 'u')
    .replace(/Û/g, 'U')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7E\n\r]/g, ' ')
    .trim();
}

export const EtutAnalysisReportModal: React.FC<EtutAnalysisReportModalProps> = ({
  isOpen,
  onClose,
  etuts,
  students,
  classes,
  preselectedStudentId,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    preselectedStudentId || (students[0]?.id ?? 'all')
  );
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<
    'all' | 'past' | '7' | '15' | '30' | '90' | 'term' | 'custom'
  >('all');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<
    'all' | 'present' | 'absent' | 'late_excused'
  >('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'analytics' | 'document'>('analytics');

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);

  // Sync selectedStudentId when preselectedStudentId changes
  useEffect(() => {
    if (preselectedStudentId) {
      setSelectedStudentId(preselectedStudentId);
    }
  }, [preselectedStudentId]);

  if (!isOpen) return null;

  // Selected student object if not "all"
  const selectedStudent = useMemo(() => {
    if (selectedStudentId === 'all') return null;
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [selectedStudentId, students]);

  // Helper to check if student is assigned to an etut
  const isStudentInEtut = (etut: Etut, stdId: string): boolean => {
    if (etut.assignedStudentIds === 'all') return true;
    if (Array.isArray(etut.assignedStudentIds)) {
      return etut.assignedStudentIds.includes(stdId);
    }
    return false;
  };

  // Helper to get attendance info for an etut
  const getEtutAttendanceInfo = (etut: Etut, stdId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const isPast = etut.date < today;

    if (!etut.studentAttendance || !etut.studentAttendance[stdId]) {
      if (!isPast) {
        return {
          label: 'Planlandı',
          status: 'upcoming',
          badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
          dotClass: 'bg-slate-400',
        };
      }
      return {
        label: 'Yoklama Alınmadı',
        status: 'unrecorded',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        dotClass: 'bg-amber-400',
      };
    }

    const rec = etut.studentAttendance[stdId];
    if (rec.status === 'present') {
      return {
        label: 'Geldi (Katıldı)',
        status: 'present',
        note: rec.note,
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        dotClass: 'bg-emerald-400',
      };
    }
    if (rec.status === 'absent') {
      return {
        label: 'Gelmedi (Devamsız)',
        status: 'absent',
        note: rec.note,
        badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        dotClass: 'bg-rose-400',
      };
    }
    if (rec.status === 'excused') {
      return {
        label: 'İzinli / Raporlu',
        status: 'excused',
        note: rec.note,
        badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        dotClass: 'bg-blue-400',
      };
    }
    if (rec.status === 'late') {
      return {
        label: 'Geç Kaldı',
        status: 'late',
        note: rec.note,
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        dotClass: 'bg-amber-400',
      };
    }
    return {
      label: 'Katıldı',
      status: 'present',
      note: rec.note,
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      dotClass: 'bg-emerald-400',
    };
  };

  // Filter etuts for selected student, date range, attendance status, subject, and search term
  const filteredEtuts = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return etuts
      .filter((e) => {
        // 1. Student filter
        if (selectedStudentId !== 'all') {
          if (!isStudentInEtut(e, selectedStudentId)) return false;
        }

        // 2. Subject filter
        if (selectedSubjectFilter !== 'all' && e.subject !== selectedSubjectFilter) {
          return false;
        }

        // 3. Date range filter
        if (dateRangeFilter === 'past') {
          if (e.date > todayStr) return false;
        } else if (
          dateRangeFilter === '7' ||
          dateRangeFilter === '15' ||
          dateRangeFilter === '30' ||
          dateRangeFilter === '90' ||
          dateRangeFilter === 'term'
        ) {
          const limitDays =
            dateRangeFilter === '7'
              ? 7
              : dateRangeFilter === '15'
              ? 15
              : dateRangeFilter === '30'
              ? 30
              : dateRangeFilter === '90'
              ? 90
              : 180;
          const etutMidnight = new Date(e.date + 'T00:00:00').getTime();
          const todayMidnight = new Date(todayStr + 'T00:00:00').getTime();
          const diffDays = Math.round((todayMidnight - etutMidnight) / (1000 * 60 * 60 * 24));
          if (diffDays < 0 || diffDays > limitDays) return false;
        } else if (dateRangeFilter === 'custom') {
          if (customStartDate && e.date < customStartDate) return false;
          if (customEndDate && e.date > customEndDate) return false;
        }

        // 4. Attendance status filter
        if (attendanceStatusFilter !== 'all') {
          if (selectedStudentId !== 'all') {
            const att = e.studentAttendance?.[selectedStudentId];
            if (attendanceStatusFilter === 'present' && att?.status !== 'present') return false;
            if (attendanceStatusFilter === 'absent' && att?.status !== 'absent') return false;
            if (
              attendanceStatusFilter === 'late_excused' &&
              att?.status !== 'late' &&
              att?.status !== 'excused'
            ) {
              return false;
            }
          } else {
            // For general view, check if etut has this status in any assigned student
            const statuses = Object.values(e.studentAttendance || {}).map((a) => a.status);
            if (attendanceStatusFilter === 'present' && !statuses.includes('present')) return false;
            if (attendanceStatusFilter === 'absent' && !statuses.includes('absent')) return false;
            if (
              attendanceStatusFilter === 'late_excused' &&
              !statuses.includes('late') &&
              !statuses.includes('excused')
            ) {
              return false;
            }
          }
        }

        // 5. Search in topic, subject, teacher name, or notes
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchesTopic = (e.topic || '').toLowerCase().includes(term);
          const matchesSubject = (e.subject || '').toLowerCase().includes(term);
          const matchesTeacher = (e.teacherName || '').toLowerCase().includes(term);
          const matchesNotes = (e.notes || '').toLowerCase().includes(term);
          if (!matchesTopic && !matchesSubject && !matchesTeacher && !matchesNotes) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    etuts,
    selectedStudentId,
    selectedSubjectFilter,
    dateRangeFilter,
    attendanceStatusFilter,
    customStartDate,
    customEndDate,
    searchTerm,
  ]);

  // Unique subjects in all etuts
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    etuts.forEach((e) => {
      if (e.subject) set.add(e.subject);
    });
    return Array.from(set);
  }, [etuts]);

  // Comprehensive statistics calculation for selected student / view including attendance
  const stats = useMemo(() => {
    const totalCount = filteredEtuts.length;
    const totalMinutes = filteredEtuts.reduce((acc, curr) => acc + (curr.duration || 45), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    let presentCount = 0;
    let absentCount = 0;
    let excusedCount = 0;
    let lateCount = 0;
    let unrecordedCount = 0;

    filteredEtuts.forEach((e) => {
      const studentIdsToCheck =
        selectedStudentId === 'all'
          ? Array.isArray(e.assignedStudentIds)
            ? e.assignedStudentIds
            : students.map((s) => s.id)
          : [selectedStudentId];

      studentIdsToCheck.forEach((sId) => {
        const att = e.studentAttendance?.[sId];
        if (!att) {
          unrecordedCount++;
        } else if (att.status === 'present') {
          presentCount++;
        } else if (att.status === 'absent') {
          absentCount++;
        } else if (att.status === 'excused') {
          excusedCount++;
        } else if (att.status === 'late') {
          lateCount++;
        }
      });
    });

    const evaluatedTotal = presentCount + absentCount + lateCount;
    const attendanceRate =
      evaluatedTotal > 0 ? Math.round(((presentCount + lateCount) / evaluatedTotal) * 100) : 100;

    // Subject breakdown with attendance details
    const subjectCounts: Record<
      string,
      {
        count: number;
        topics: Set<string>;
        minutes: number;
        present: number;
        absent: number;
      }
    > = {};

    filteredEtuts.forEach((e) => {
      if (!subjectCounts[e.subject]) {
        subjectCounts[e.subject] = {
          count: 0,
          topics: new Set(),
          minutes: 0,
          present: 0,
          absent: 0,
        };
      }
      subjectCounts[e.subject].count += 1;
      subjectCounts[e.subject].minutes += e.duration || 45;
      if (e.topic) subjectCounts[e.subject].topics.add(e.topic);

      if (selectedStudentId !== 'all') {
        const att = e.studentAttendance?.[selectedStudentId];
        if (att?.status === 'present' || att?.status === 'late') {
          subjectCounts[e.subject].present += 1;
        } else if (att?.status === 'absent') {
          subjectCounts[e.subject].absent += 1;
        }
      }
    });

    const subjectBreakdown = Object.entries(subjectCounts)
      .map(([subjectName, data]) => ({
        subject: subjectName,
        count: data.count,
        minutes: data.minutes,
        percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
        topicCount: data.topics.size,
        present: data.present,
        absent: data.absent,
      }))
      .sort((a, b) => b.count - a.count);

    const topSubject = subjectBreakdown[0]?.subject || 'Kayıt Yok';

    return {
      totalCount,
      totalMinutes,
      totalHours,
      presentCount,
      absentCount,
      excusedCount,
      lateCount,
      unrecordedCount,
      attendanceRate,
      subjectBreakdown,
      topSubject,
    };
  }, [filteredEtuts, selectedStudentId, students]);

  // Format Turkish Date
  const formatTurkishDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Safe file download helper that handles sandboxed environments gracefully
  const triggerDownload = (blob: Blob, filename: string) => {
    try {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return true;
    } catch (e) {
      console.warn('Standard blob download restricted in sandbox:', e);
      return false;
    }
  };

  // 1. Export to PDF with Infallible AutoTable and Turkish Character Safety
  const handleExportPDF = () => {
    try {
      setIsGeneratingPdf(true);
      setExportErrorMessage(null);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const studentName = selectedStudent ? selectedStudent.name : 'Tum Ogrenciler Genel Analiz';
      const studentClass = selectedStudent
        ? selectedStudent.className || 'Genel'
        : 'Tum Siniflar Kurumsal Icmal';
      const studentNo = selectedStudent ? selectedStudent.studentNumber || '-' : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');

      // Header Banner Box (Slate 900)
      doc.setFillColor(15, 23, 42);
      doc.rect(14, 12, 182, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(
        toSafePdfText('T.C. MILLI EGITIM BAKANLIGI / OZEL EGITIM KURUMLARI'),
        105,
        20,
        { align: 'center' }
      );
      doc.setFontSize(11);
      doc.setTextColor(199, 210, 254);
      doc.text(
        toSafePdfText('OGRENCI ETUT KATILIM VE DEVAMSIZLIK ANALIZ BELGESI'),
        105,
        27,
        { align: 'center' }
      );

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        toSafePdfText(
          `Gecmis Etutler, Islenen Ders ve Konular ile Devamsizlik Durumu Cizelgesi • Rapor Tarihi: ${reportDate}`
        ),
        105,
        34,
        { align: 'center' }
      );

      // Student Info Box (Light Slate Card)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.rect(14, 44, 182, 32, 'FD');

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText('Ogrenci Adi Soyadi:'), 18, 51);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentName), 60, 51);

      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText('Sinif / Sube:'), 18, 58);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentClass), 60, 58);

      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText('Ogrenci No:'), 18, 65);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentNo), 60, 65);

      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText('Toplam Etut Sayisi:'), 115, 51);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stats.totalCount} Adet (${stats.totalHours} Saat)`, 155, 51);

      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText('Yoklama Icmali:'), 115, 58);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(
        stats.absentCount > 0 ? 220 : 16,
        stats.absentCount > 0 ? 38 : 185,
        stats.absentCount > 0 ? 38 : 129
      );
      doc.text(
        toSafePdfText(
          `${stats.presentCount} Katildi / ${stats.absentCount} Devamsiz / %${stats.attendanceRate} Devam`
        ),
        155,
        58
      );

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(toSafePdfText('Filtre / Kapsam:'), 115, 65);
      doc.setFont('helvetica', 'normal');
      const filterLabel =
        dateRangeFilter === 'all'
          ? 'Tum Zamanlar (Gecmis Dahil)'
          : dateRangeFilter === 'past'
          ? 'Sadece Gecmis Etutler'
          : dateRangeFilter === 'custom'
          ? `${customStartDate || 'Bastan'} - ${customEndDate || 'Sonuna'}`
          : `Son ${dateRangeFilter} Gunluk Donem`;
      doc.text(toSafePdfText(filterLabel), 155, 65);

      // Section 1: Ders Dağılımı Tablosu
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(toSafePdfText('1. DERS BAZINDA ETUT KATILIMI VE ISLENEN KONU ANALIZI'), 14, 83);

      const subjectTableRows = stats.subjectBreakdown.map((sb) => [
        toSafePdfText(sb.subject),
        `${sb.count} Adet`,
        `%${sb.percentage}`,
        `${sb.minutes} dk (${(sb.minutes / 60).toFixed(1)} sa)`,
        `${sb.topicCount} Farkli Konu`,
        selectedStudentId !== 'all'
          ? `${sb.present} Geldi / ${sb.absent} Devamsiz`
          : 'Genel Yoklama',
      ]);

      executeAutoTable(doc, {
        startY: 86,
        head: [
          [
            toSafePdfText('Ders Adi'),
            toSafePdfText('Etut Adedi'),
            toSafePdfText('Oran'),
            toSafePdfText('Toplam Sure'),
            toSafePdfText('Islenen Konu Sayisi'),
            toSafePdfText('Devam / Devamsizlik'),
          ],
        ],
        body:
          subjectTableRows.length > 0
            ? subjectTableRows
            : [[toSafePdfText('Kriterlere uygun etut kaydi bulunamadi'), '-', '-', '-', '-', '-']],
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: 51,
        },
        margin: { left: 14, right: 14 },
      });

      // Section 2: Detaylı Kronolojik Etüt ve Devamsızlık Listesi (Tarih, Ders, Konu, Devamsızlık)
      const finalY = (doc as any).lastAutoTable?.finalY || 135;
      let section2StartY = finalY + 12;

      // If close to page bottom, cleanly start a new page
      if (finalY > 215) {
        doc.addPage();
        section2StartY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(
        toSafePdfText('2. DETAYLI ETUT GECMISI (TARIH, DERS, ISLENEN KONU VE DEVAMSIZLIK DURUMU)'),
        14,
        section2StartY
      );

      const detailRows = filteredEtuts.map((e, idx) => {
        let attStatusText = 'Belirtilmedi';
        if (selectedStudentId !== 'all') {
          const info = getEtutAttendanceInfo(e, selectedStudentId);
          attStatusText = toSafePdfText(info.label);
          if (info.note) attStatusText += ` (${toSafePdfText(info.note)})`;
        } else {
          const totalAssigned = Array.isArray(e.assignedStudentIds)
            ? e.assignedStudentIds.length
            : students.length;
          const present = Object.values(e.studentAttendance || {}).filter(
            (a) => a.status === 'present'
          ).length;
          const absent = Object.values(e.studentAttendance || {}).filter(
            (a) => a.status === 'absent'
          ).length;
          attStatusText = `${present}/${totalAssigned} Geldi, ${absent} Gelmedi`;
        }

        return [
          `${idx + 1}`,
          e.date,
          toSafePdfText(e.subject),
          toSafePdfText(e.topic || 'Genel Tekrar / Soru Cozumu'),
          attStatusText,
          `${e.time} (${e.duration || 45} dk)`,
          toSafePdfText(e.teacherName || 'Danisman Ogretmen'),
          toSafePdfText(e.notes || '-'),
        ];
      });

      executeAutoTable(doc, {
        startY: section2StartY + 4,
        head: [
          [
            '#',
            toSafePdfText('Tarih'),
            toSafePdfText('Ders'),
            toSafePdfText('Islenen Etut Konusu / Odak'),
            toSafePdfText('Yoklama / Devamsizlik'),
            toSafePdfText('Sure & Saat'),
            toSafePdfText('Ogretmen'),
            toSafePdfText('Notlar / Aciklama'),
          ],
        ],
        body:
          detailRows.length > 0
            ? detailRows
            : [
                [
                  '-',
                  '-',
                  '-',
                  toSafePdfText('Secilen kriterlere uygun etut gecmisi bulunamadi'),
                  '-',
                  '-',
                  '-',
                  '-',
                ],
              ],
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
        bodyStyles: {
          fontSize: 7.2,
          textColor: 51,
        },
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: 19 },
          2: { cellWidth: 22 },
          3: { cellWidth: 42 },
          4: { cellWidth: 32 },
          5: { cellWidth: 20 },
          6: { cellWidth: 22 },
          7: { cellWidth: 18 },
        },
        margin: { left: 14, right: 14 },
      });

      // Bottom Signatures and Official Verification Stamp
      const pageCount = (doc as any).internal?.getNumberOfPages() || 1;
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          toSafePdfText(
            `Bu resmi etut analiz ve devamsizlik belgesi sistem tarafindan dogrulanmistir. (Sayfa ${p} / ${pageCount})`
          ),
          14,
          pageHeight - 12
        );

        if (p === pageCount) {
          doc.text(
            toSafePdfText('Danisman / Brans Ogretmeni: ______________________'),
            70,
            pageHeight - 12
          );
          doc.text(toSafePdfText('Okul Muduru Onayi: ______________________'), 140, pageHeight - 12);
        }
      }

      const filename = `Etut_Analiz_${toSafePdfText(studentName).replace(/[^a-zA-Z0-9]/g, '_')}_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;

      // Safe download with fallback
      const pdfBlob = doc.output('blob');
      const downloaded = triggerDownload(pdfBlob, filename);
      if (!downloaded) {
        doc.save(filename);
      }

      setExportSuccessMessage(
        `PDF raporu ve devamsızlık analiz belgesi başarıyla hazırlandı (${filename}).`
      );
      setTimeout(() => setExportSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error('PDF Generation Error:', err);
      setExportErrorMessage(
        `PDF oluşturulurken bir hata oluştu: ${err.message || 'Lütfen tekrar deneyin.'}`
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2. Export to Word (Dual: DOCX Packer with Infallible HTML-DOC Fallback)
  const handleExportDOCX = async () => {
    try {
      setIsGeneratingDocx(true);
      setExportErrorMessage(null);

      const studentName = selectedStudent ? selectedStudent.name : 'Tüm Öğrenciler Genel Analiz';
      const studentClass = selectedStudent
        ? selectedStudent.className || 'Genel'
        : 'Tüm Sınıflar Kurumsal İcmal';
      const studentNo = selectedStudent ? selectedStudent.studentNumber || '-' : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');
      const filename = `Etut_Analiz_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date()
        .toISOString()
        .slice(0, 10)}.docx`;

      // Try DOCX generator first
      try {
        const subjectDocxRows = [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Ders Adı', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Etüt Sayısı', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Toplam Süre', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'İşlenen Konu Sayısı', bold: true, color: 'FFFFFF' }),
                    ],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Devam / Katılım', bold: true, color: 'FFFFFF' }),
                    ],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
              }),
            ],
          }),
          ...stats.subjectBreakdown.map(
            (sb) =>
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: sb.subject })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: `${sb.count} Adet` })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: `${sb.minutes} dk` })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: `${sb.topicCount} Farklı Konu` })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text:
                          selectedStudentId !== 'all'
                            ? `${sb.present} Geldi / ${sb.absent} Devamsız`
                            : `Genel İcmal`,
                      }),
                    ],
                  }),
                ],
              })
          ),
        ];

        const historyDocxRows = [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Tarih & Saat', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Ders', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'İşlenen Etüt Konusu / Odak', bold: true, color: 'FFFFFF' }),
                    ],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Yoklama / Devamsızlık', bold: true, color: 'FFFFFF' }),
                    ],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Öğretmen', bold: true, color: 'FFFFFF' })],
                  }),
                ],
                shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              }),
            ],
          }),
          ...filteredEtuts.map((e) => {
            let attText = 'Belirtilmedi';
            if (selectedStudentId !== 'all') {
              const info = getEtutAttendanceInfo(e, selectedStudentId);
              attText = info.label;
              if (info.note) attText += ` (${info.note})`;
            } else {
              const present = Object.values(e.studentAttendance || {}).filter(
                (a) => a.status === 'present'
              ).length;
              const absent = Object.values(e.studentAttendance || {}).filter(
                (a) => a.status === 'absent'
              ).length;
              attText = `${present} Geldi, ${absent} Gelmedi`;
            }

            return new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: `${e.date} (${e.time})` })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: e.subject })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: e.topic || 'Genel Soru Çözümü' })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: attText })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: e.teacherName || 'Danışman Öğretmen' })],
                }),
              ],
            });
          }),
        ];

        const doc = new Document({
          sections: [
            {
              properties: {},
              children: [
                new Paragraph({
                  text: 'T.C. MİLLİ EĞİTİM BAKANLIĞI / ÖZEL EĞİTİM KURUMLARI',
                  heading: HeadingLevel.TITLE,
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  text: 'ÖĞRENCİ ETÜT KATILIM VE DEVAMSIZLIK ANALİZ BELGESİ',
                  heading: HeadingLevel.HEADING_1,
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  text: `Rapor Tarihi: ${reportDate} | Kapsam: Eğitim & Öğrenci Takip Portalı`,
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Öğrenci Adı Soyadı: ', bold: true }),
                    new TextRun(studentName),
                    new TextRun({ text: ' | Sınıfı: ', bold: true }),
                    new TextRun(studentClass),
                    new TextRun({ text: ' | Okul No: ', bold: true }),
                    new TextRun(studentNo),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Etüt & Devam Özeti: ', bold: true }),
                    new TextRun({
                      text: `${stats.totalCount} Etüt (${stats.totalHours} Saat) | ${stats.presentCount} Katılım, ${stats.absentCount} Devamsızlık (%${stats.attendanceRate} Devam Oranı)`,
                      bold: true,
                    }),
                  ],
                }),
                new Paragraph({ text: '' }),
                new Paragraph({
                  text: '1. DERS BAZINDA ETÜT DAĞILIMI VE İŞLENEN KONULAR',
                  heading: HeadingLevel.HEADING_2,
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: subjectDocxRows,
                }),
                new Paragraph({ text: '' }),
                new Paragraph({
                  text: '2. DETAYLI ETÜT VE DEVAMSIZLIK GEÇMİŞİ LİSTESİ',
                  heading: HeadingLevel.HEADING_2,
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: historyDocxRows,
                }),
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Danışman / Branş Öğretmeni İmzası: ____________________________        Okul Müdürü Onayı: ____________________________',
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            },
          ],
        });

        const blob = await Packer.toBlob(doc);
        triggerDownload(blob, filename);

        setExportSuccessMessage(
          `Word (DOCX) belgesi başarıyla oluşturuldu ve indirildi (${filename}).`
        );
        setTimeout(() => setExportSuccessMessage(null), 5000);
        return;
      } catch (docxErr) {
        console.warn('Packer.toBlob encountered issue, using HTML-DOC fallback:', docxErr);
      }

      // Infallible Fallback: Microsoft Word-compliant HTML Document
      downloadHtmlDoc(studentName, studentClass, studentNo, reportDate);
    } catch (err: any) {
      console.error('Word Export Error:', err);
      setExportErrorMessage(
        `Word belgesi oluşturulurken bir hata oluştu: ${err.message || 'Lütfen tekrar deneyin.'}`
      );
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  // Standalone HTML-based Word Document (.doc) generator that NEVER fails
  const downloadHtmlDoc = (
    studentName: string,
    studentClass: string,
    studentNo: string,
    reportDate: string
  ) => {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Etüt Analiz ve Devamsızlık Belgesi</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 14pt; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
          .subtitle { font-size: 11pt; font-weight: 600; color: #4338ca; }
          .info-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 10pt; }
          th { background: #1e293b; color: #ffffff; padding: 8px; border: 1px solid #94a3b8; text-align: left; }
          td { padding: 7px; border: 1px solid #cbd5e1; vertical-align: middle; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .badge-present { color: #059669; font-weight: bold; }
          .badge-absent { color: #dc2626; font-weight: bold; }
          .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">T.C. MİLLİ EĞİTİM BAKANLIĞI / ÖZEL EĞİTİM KURUMLARI</div>
          <div class="subtitle">ÖĞRENCİ ETÜT KATILIM VE DEVAMSIZLIK ANALİZ BELGESİ</div>
          <div style="font-size: 9pt; color: #64748b; margin-top: 4px;">Rapor Tarihi: ${reportDate} | Eğitim ve Öğrenci Takip Portalı</div>
        </div>

        <div class="info-box">
          <p><strong>Öğrenci Adı Soyadı:</strong> ${studentName} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Sınıf / Şube:</strong> ${studentClass} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Öğrenci No:</strong> ${studentNo}</p>
          <p><strong>Katılım İcmali:</strong> ${stats.totalCount} Etüt (${stats.totalHours} Saat) &nbsp;|&nbsp; <strong>Devam Durumu:</strong> ${stats.presentCount} Katıldı, ${stats.absentCount} Devamsız (%${stats.attendanceRate} Devam Oranı)</p>
        </div>

        <h3 style="color: #0f172a; font-size: 11pt; margin-bottom: 6px;">1. DERS BAZINDA ETÜT DAĞILIMI VE İŞLENEN KONU SAYISI</h3>
        <table>
          <thead>
            <tr>
              <th>Ders Adı</th>
              <th>Etüt Sayısı</th>
              <th>Oran</th>
              <th>Toplam Süre</th>
              <th>İşlenen Konu Sayısı</th>
              <th>Katılım Durumu</th>
            </tr>
          </thead>
          <tbody>
            ${stats.subjectBreakdown
              .map(
                (sb) => `
              <tr>
                <td><strong>${sb.subject}</strong></td>
                <td>${sb.count} Adet</td>
                <td>%${sb.percentage}</td>
                <td>${sb.minutes} dk</td>
                <td>${sb.topicCount} Farklı Konu</td>
                <td>${
                  selectedStudentId !== 'all'
                    ? `${sb.present} Katıldı / ${sb.absent} Devamsız`
                    : 'Genel İcmal'
                }</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <h3 style="color: #0f172a; font-size: 11pt; margin-bottom: 6px;">2. DETAYLI KRONOLOJİK ETÜT VE DEVAMSIZLIK LİSTESİ</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tarih</th>
              <th>Ders</th>
              <th>İşlenen Etüt Konusu / Odak</th>
              <th>Yoklama / Devamsızlık</th>
              <th>Süre & Saat</th>
              <th>Öğretmen</th>
              <th>Notlar</th>
            </tr>
          </thead>
          <tbody>
            ${filteredEtuts
              .map((e, idx) => {
                let attLabel = 'Belirtilmedi';
                let attClass = '';
                if (selectedStudentId !== 'all') {
                  const info = getEtutAttendanceInfo(e, selectedStudentId);
                  attLabel = info.label;
                  if (info.note) attLabel += ` (${info.note})`;
                  attClass = info.status === 'present' ? 'badge-present' : info.status === 'absent' ? 'badge-absent' : '';
                } else {
                  const present = Object.values(e.studentAttendance || {}).filter(
                    (a) => a.status === 'present'
                  ).length;
                  const absent = Object.values(e.studentAttendance || {}).filter(
                    (a) => a.status === 'absent'
                  ).length;
                  attLabel = `${present} Geldi, ${absent} Gelmedi`;
                }

                return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${e.date}</td>
                  <td><strong>${e.subject}</strong></td>
                  <td>${e.topic || 'Genel Konu Tekrarı / Soru Çözümü'}</td>
                  <td class="${attClass}">${attLabel}</td>
                  <td>${e.time} (${e.duration || 45} dk)</td>
                  <td>${e.teacherName || 'Öğretmen'}</td>
                  <td>${e.notes || '-'}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>

        <div style="margin-top: 40px;">
          <table style="border: none; width: 100%;">
            <tr style="background: transparent;">
              <td style="border: none; width: 50%;">
                <strong>Danışman / Branş Öğretmeni:</strong><br><br>
                İmza: _______________________
              </td>
              <td style="border: none; width: 50%; text-align: right;">
                <strong>Okul Müdürü Onayı:</strong><br><br>
                İmza / Mühür: _______________________
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], {
      type: 'application/msword;charset=utf-8',
    });
    const filename = `Etut_Analiz_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date()
      .toISOString()
      .slice(0, 10)}.doc`;
    triggerDownload(blob, filename);

    setExportSuccessMessage(`Word (.doc) belgesi başarıyla oluşturuldu ve indirildi (${filename}).`);
    setTimeout(() => setExportSuccessMessage(null), 5000);
  };

  // Safe print handler that works gracefully inside sandboxed iframes
  const handleSafePrint = () => {
    try {
      const printableElement = document.getElementById('official-etut-document');
      if (printableElement) {
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Etüt Analiz ve Devamsızlık Belgesi</title>
                <style>
                  @page { size: A4 portrait; margin: 12mm; }
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 12px; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
                  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                  th { background-color: #f1f5f9; font-weight: bold; }
                  .text-center { text-align: center; }
                  .text-rose-700 { color: #b91c1c; font-weight: bold; }
                  .text-emerald-700 { color: #047857; font-weight: bold; }
                  .border-slate-300 { border-color: #cbd5e1; }
                </style>
              </head>
              <body>
                ${printableElement.innerHTML}
              </body>
            </html>
          `);
          frameDoc.close();
          setTimeout(() => {
            try {
              printFrame.contentWindow?.focus();
              printFrame.contentWindow?.print();
              setExportSuccessMessage('Yazdırma iletişim kutusu açıldı.');
            } catch (e) {
              console.warn('Iframe print restricted, triggering PDF export fallback:', e);
              handleExportPDF();
            } finally {
              setTimeout(() => {
                if (document.body.contains(printFrame)) {
                  document.body.removeChild(printFrame);
                }
              }, 4000);
            }
          }, 400);
          return;
        }
      }
    } catch (err) {
      console.warn('Iframe print error, falling back to PDF:', err);
    }

    // Direct fallback
    handleExportPDF();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 md:p-6 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Öğrenci Etüt Katılım & Devamsızlık Analiz Belgesi</span>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Resmi Belge Çıktılı
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Geçmiş etütler, seçili tarih aralıkları, ders/konu dağılımı ve devamsızlık durumları raporu.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Switcher: Analytics vs A4 Official Document */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Analiz & Çizelge</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('document')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'document'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Resmi Belge (A4 Çıktı)</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {exportSuccessMessage && (
          <div className="mx-6 mt-3 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-200 animate-in fade-in shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportSuccessMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {exportErrorMessage && (
          <div className="mx-6 mt-3 p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center space-x-2 text-xs text-rose-200 animate-in fade-in shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{exportErrorMessage}</span>
          </div>
        )}

        {/* Comprehensive Filters Bar */}
        <div className="p-4 sm:p-5 bg-slate-950/60 border-b border-slate-800/80 space-y-3 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Student Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>Analiz Edilecek Öğrenci</span>
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">👥 Tüm Öğrenciler (Genel Kurumsal İcmal)</option>
                {students.map((std) => (
                  <option key={std.id} value={std.id}>
                    {std.name} ({std.className || 'Sınıfsız'}) - No: #{std.studentNumber}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter (Kullanıcının talep ettiği geçmiş ve tarih aralıkları) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tarih Aralığı & Geçmiş</span>
              </label>
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Zamanlar (Tüm Geçmiş Etütler)</option>
                <option value="past">Sadece Geçmişte Yapılan Etütler</option>
                <option value="7">Son 7 Gün (1 Hafta)</option>
                <option value="15">Son 15 Gün (2 Hafta)</option>
                <option value="30">Son 30 Gün (1 Ay)</option>
                <option value="90">Son 3 Ay (90 Gün)</option>
                <option value="term">Bu Eğitim Dönemi (Son 6 Ay)</option>
                <option value="custom">📅 Belirli Tarih Aralığı Seç...</option>
              </select>
            </div>

            {/* Subject Filter (Kullanıcının talep ettiği ders filtrelemesi) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ders Branşı</span>
              </label>
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Dersler</option>
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Attendance Status Filter (Kullanıcının talep ettiği devamsızlık durumu) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
                <span>Yoklama / Devamsızlık Durumu</span>
              </label>
              <select
                value={attendanceStatusFilter}
                onChange={(e) => setAttendanceStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Etütler (Katıldı + Devamsız)</option>
                <option value="present">Sadece Katıldığı (Geldi)</option>
                <option value="absent">Sadece Devamsız Kaldığı (Gelmedi)</option>
                <option value="late_excused">Geç Kaldı / İzinli - Raporlu</option>
              </select>
            </div>
          </div>

          {/* Search Bar & Custom Date Range */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Konu başlığı, öğretmen adı, derslik veya açıklama ara..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              />
            </div>

            {/* Custom Date Inputs if selected */}
            {dateRangeFilter === 'custom' && (
              <div className="flex items-center space-x-2 bg-slate-900 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs">
                <span className="text-slate-400 font-semibold">Tarih:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                />
                {(customStartDate || customEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="text-rose-400 hover:text-rose-300 text-[11px] underline cursor-pointer"
                  >
                    Temizle
                  </button>
                )}
              </div>
            )}

            {/* Document Export Buttons (PDF, Word, Print) */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                title="Resmi PDF Raporu ve Devamsızlık Çıktısı İndir"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'PDF Hazırlanıyor...' : 'PDF İndir'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportDOCX}
                disabled={isGeneratingDocx}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                title="Microsoft Word (.docx) Raporu İndir"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isGeneratingDocx ? 'Word Hazırlanıyor...' : 'Word İndir'}</span>
              </button>

              <button
                type="button"
                onClick={handleSafePrint}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                title="Yazdır veya Resmi Belge Önizlemesi Aç"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Yazdır / Belge</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body: Active Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'analytics' ? (
            /* ANALYTICS & DASHBOARD TAB */
            <>
              {/* Profile Card & 4 KPI Pills */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    {selectedStudent ? (
                      <img
                        src={
                          selectedStudent.avatar ||
                          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                            selectedStudent.name
                          )}`
                        }
                        alt={selectedStudent.name}
                        className="w-14 h-14 rounded-2xl object-cover bg-slate-800 ring-2 ring-indigo-500/30 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                        <Users className="w-7 h-7" />
                      </div>
                    )}
                    <div>
                      <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>
                          {selectedStudent
                            ? 'Bireysel Öğrenci Etüt ve Devam Karnesi'
                            : 'Kurumsal Genel İcmal & Analiz'}
                        </span>
                      </div>
                      <h4 className="text-xl font-bold text-white mt-0.5">
                        {selectedStudent
                          ? selectedStudent.name
                          : 'Tüm Öğrencilerin Etüt ve Devamsızlık İstatistiği'}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-400">
                        {selectedStudent && (
                          <>
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                              #{selectedStudent.studentNumber}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-400">
                              {selectedStudent.className || 'Sınıf Belirtilmedi'}
                            </span>
                            <span>•</span>
                            <span>{selectedStudent.email}</span>
                          </>
                        )}
                        {!selectedStudent && (
                          <span>
                            Toplam {students.length} kayıtlı öğrenci genelinde etüt katılım ve
                            devamsızlık analizi
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* KPI Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                      <div className="text-[11px] font-semibold text-slate-400">Toplam Etüt</div>
                      <div className="text-xl font-black text-indigo-400 mt-0.5">
                        {stats.totalCount}
                      </div>
                      <div className="text-[10px] text-slate-500">{stats.totalHours} Saat</div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                      <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Katıldı</span>
                      </div>
                      <div className="text-xl font-black text-emerald-400 mt-0.5">
                        {stats.presentCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Etüte Geldi</div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                      <div className="text-[11px] font-semibold text-rose-400 flex items-center justify-center space-x-1">
                        <XCircle className="w-3 h-3" />
                        <span>Devamsız</span>
                      </div>
                      <div className="text-xl font-black text-rose-400 mt-0.5">
                        {stats.absentCount}
                      </div>
                      <div className="text-[10px] text-slate-500">Gelmedi</div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                      <div className="text-[11px] font-semibold text-amber-300">Devam Oranı</div>
                      <div className="text-xl font-black text-amber-300 mt-0.5">
                        %{stats.attendanceRate}
                      </div>
                      <div className="text-[10px] text-slate-500">Katılım Başarısı</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 1: Ders Bazında Dağılım & İşlenen Konu Sayısı */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Ders Bazında Etüt Dağılımı & İşlenen Konu Analizi</span>
                  </h5>
                  <span className="text-xs text-slate-400">
                    {stats.subjectBreakdown.length} Farklı Branş
                  </span>
                </div>

                {stats.subjectBreakdown.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    Seçilen kriterlerde kayıtlı bir etüt bulunamadı.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stats.subjectBreakdown.map((item) => (
                      <div
                        key={item.subject}
                        className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 hover:border-indigo-500/40 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{item.subject}</span>
                          <span className="font-mono font-bold text-indigo-400">
                            {item.count} Kez ({item.percentage}%)
                          </span>
                        </div>

                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(item.percentage, 100)}%` }}
                          ></div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>{item.minutes} dk çalışma</span>
                          <span className="text-indigo-300 font-medium">
                            {item.topicCount} farklı konu
                          </span>
                        </div>

                        {selectedStudentId !== 'all' && (
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
                            <span className="text-emerald-400 font-semibold">
                              {item.present} Geldi
                            </span>
                            <span className="text-rose-400 font-semibold">
                              {item.absent} Devamsız
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Kronolojik Etüt ve Devamsızlık Listesi (Ders, Konu, Yoklama) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h5 className="text-sm font-bold text-white flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <span>Kronolojik Etüt & Devamsızlık Geçmişi</span>
                  </h5>
                  <div className="text-xs text-slate-400 flex items-center space-x-2">
                    <span>Listelenen:</span>
                    <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      {filteredEtuts.length} Etüt
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Tarih & Saat</th>
                        <th className="px-4 py-3 font-semibold">Ders</th>
                        <th className="px-4 py-3 font-semibold">İşlenen Etüt Konusu / Odak</th>
                        <th className="px-4 py-3 font-semibold">Yoklama / Devamsızlık Durumu</th>
                        <th className="px-4 py-3 font-semibold">Süre & Derslik</th>
                        <th className="px-4 py-3 font-semibold">Öğretmen</th>
                        <th className="px-4 py-3 font-semibold">Notlar / Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredEtuts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            Bu öğrenci veya filtreleme kriterleri için etüt kaydı bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        filteredEtuts.map((etut) => {
                          const attInfo =
                            selectedStudentId !== 'all'
                              ? getEtutAttendanceInfo(etut, selectedStudentId)
                              : null;

                          const totalAssigned = Array.isArray(etut.assignedStudentIds)
                            ? etut.assignedStudentIds.length
                            : students.length;
                          const presentCount = Object.values(
                            etut.studentAttendance || {}
                          ).filter((a) => a.status === 'present').length;
                          const absentCount = Object.values(
                            etut.studentAttendance || {}
                          ).filter((a) => a.status === 'absent').length;

                          return (
                            <tr
                              key={etut.id}
                              className="hover:bg-slate-800/30 transition-colors"
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-semibold text-white">
                                  {formatTurkishDate(etut.date)}
                                </div>
                                <div className="text-[11px] text-indigo-400 font-mono flex items-center space-x-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{etut.time}</span>
                                </div>
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                  {etut.subject}
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-200">
                                  {etut.topic || 'Genel Konu Tekrarı / Soru Çözümü'}
                                </div>
                                {etut.schoolLevel && (
                                  <div className="text-[10px] text-slate-500">
                                    {etut.schoolLevel} • {etut.gradeLevel || 'Genel'}
                                  </div>
                                )}
                              </td>

                              {/* Yoklama / Devamsızlık Kolonu */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {selectedStudentId !== 'all' && attInfo ? (
                                  <div>
                                    <span
                                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${attInfo.badgeClass}`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${attInfo.dotClass}`}
                                      ></span>
                                      <span>{attInfo.label}</span>
                                    </span>
                                    {attInfo.note && (
                                      <div className="text-[10px] text-slate-400 mt-0.5 italic">
                                        {attInfo.note}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs font-semibold">
                                    <span className="text-emerald-400">
                                      {presentCount} Geldi
                                    </span>
                                    <span className="text-slate-500 mx-1">/</span>
                                    <span className="text-rose-400">
                                      {absentCount} Gelmedi
                                    </span>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      {totalAssigned} Kayıtlı Öğrenci
                                    </div>
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-mono text-emerald-400 font-semibold">
                                  {etut.duration || 45} Dakika
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {etut.location || 'Derslik'}
                                </div>
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-medium text-slate-200">
                                  {etut.teacherName || 'Danışman Öğretmen'}
                                </div>
                              </td>

                              <td
                                className="px-4 py-3 text-slate-400 max-w-xs truncate"
                                title={etut.notes || ''}
                              >
                                {etut.notes || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* OFFICIAL A4 DOCUMENT PRINT PREVIEW TAB */
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* Top Quick Actions Bar for Document */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-lg">
                <div className="flex items-center space-x-2 text-xs text-slate-300 font-medium">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Resmi A4 Çıktı & Belge Önizleme</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSafePrint}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors border border-slate-700 cursor-pointer"
                    title="Yazıcıya gönder veya PDF olarak yazdır"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400" />
                    <span>Yazdır</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    disabled={isGeneratingPdf}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    title="Resmi PDF Belgesini İndir"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isGeneratingPdf ? 'İndiriliyor...' : 'PDF İndir'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDOCX}
                    disabled={isGeneratingDocx}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    title="Microsoft Word Belgesini İndir"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isGeneratingDocx ? 'İndiriliyor...' : 'Word İndir'}</span>
                  </button>
                </div>
              </div>

              <div
                id="official-etut-document"
                className="bg-white text-slate-900 p-8 sm:p-12 rounded-xl shadow-2xl border border-slate-300 font-sans"
              >
              {/* Document Official Header */}
              <div className="text-center border-b-2 border-slate-900 pb-5 mb-6">
                <div className="text-sm font-bold tracking-widest text-slate-800 uppercase">
                  T.C. MİLLİ EĞİTİM BAKANLIĞI / ÖZEL EĞİTİM KURUMLARI
                </div>
                <h2 className="text-xl font-black text-slate-950 mt-1 uppercase">
                  ÖĞRENCİ ETÜT KATILIM VE DEVAMSIZLIK ANALİZ BELGESİ
                </h2>
                <div className="text-xs text-slate-500 mt-1">
                  Eğitim ve Öğrenci Takip Portalı • Resmi İnceleme ve Rehberlik Takip Belgesi
                </div>
              </div>

              {/* Student Bio Grid */}
              <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-600 block">Öğrenci Adı Soyadı:</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {selectedStudent ? selectedStudent.name : 'Tüm Öğrenciler Kurumsal İcmal'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Sınıfı / Şubesi:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedStudent ? selectedStudent.className || 'Genel' : 'Tüm Sınıflar'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Öğrenci Numarası:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedStudent ? `#${selectedStudent.studentNumber}` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Belge Düzenlenme Tarihi:</span>
                    <span className="font-semibold text-slate-900">
                      {new Date().toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 mt-3 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-600 block">Toplam Etüt Sayısı:</span>
                    <span className="font-black text-indigo-700 text-sm">
                      {stats.totalCount} Adet ({stats.totalHours} Saat)
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Katıldığı Etüt (Geldi):</span>
                    <span className="font-black text-emerald-700 text-sm">
                      {stats.presentCount} Etüt
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Devamsız Kaldığı:</span>
                    <span className="font-black text-rose-700 text-sm">
                      {stats.absentCount} Etüt
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600 block">Devam Başarı Oranı:</span>
                    <span className="font-black text-indigo-900 text-sm">
                      %{stats.attendanceRate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Ders Bazında Dağılım Tablosu */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 border-l-4 border-indigo-600 pl-2">
                  1. DERS BAZINDA ETÜT DAĞILIMI VE İŞLENEN FARKLI KONU SAYILARI
                </h4>
                <table className="w-full text-left text-xs border-collapse border border-slate-300">
                  <thead className="bg-slate-100 text-slate-800 font-bold">
                    <tr>
                      <th className="p-2 border border-slate-300">Ders Branşı</th>
                      <th className="p-2 border border-slate-300">Etüt Adedi</th>
                      <th className="p-2 border border-slate-300">Yüzde Payı</th>
                      <th className="p-2 border border-slate-300">Toplam Süre</th>
                      <th className="p-2 border border-slate-300">İşlenen Farklı Konu</th>
                      <th className="p-2 border border-slate-300">Katılım Durumu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.subjectBreakdown.map((sb) => (
                      <tr key={sb.subject} className="even:bg-slate-50">
                        <td className="p-2 border border-slate-300 font-bold">{sb.subject}</td>
                        <td className="p-2 border border-slate-300">{sb.count} Kez</td>
                        <td className="p-2 border border-slate-300">%{sb.percentage}</td>
                        <td className="p-2 border border-slate-300">
                          {sb.minutes} dk ({(sb.minutes / 60).toFixed(1)} sa)
                        </td>
                        <td className="p-2 border border-slate-300">
                          {sb.topicCount} Farklı Konu
                        </td>
                        <td className="p-2 border border-slate-300">
                          {selectedStudentId !== 'all' ? (
                            <span>
                              <strong className="text-emerald-700">{sb.present} Geldi</strong> /{' '}
                              <strong className="text-rose-700">{sb.absent} Gelmedi</strong>
                            </span>
                          ) : (
                            'Genel İcmal'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Section 2: Kronolojik Etüt Listesi */}
              <div className="mb-8">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 border-l-4 border-emerald-600 pl-2">
                  2. KRONOLOJİK ETÜT GEÇMİŞİ (TARİH, DERS, İŞLENEN KONU VE DEVAMSIZLIK)
                </h4>
                <table className="w-full text-left text-xs border-collapse border border-slate-300">
                  <thead className="bg-slate-100 text-slate-800 font-bold">
                    <tr>
                      <th className="p-2 border border-slate-300">#</th>
                      <th className="p-2 border border-slate-300">Tarih</th>
                      <th className="p-2 border border-slate-300">Ders</th>
                      <th className="p-2 border border-slate-300">İşlenen Etüt Konusu / Odak</th>
                      <th className="p-2 border border-slate-300">Yoklama / Devamsızlık</th>
                      <th className="p-2 border border-slate-300">Süre</th>
                      <th className="p-2 border border-slate-300">Öğretmen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEtuts.map((e, idx) => {
                      let attLabel = 'Belirtilmedi';
                      let isAbsent = false;
                      if (selectedStudentId !== 'all') {
                        const info = getEtutAttendanceInfo(e, selectedStudentId);
                        attLabel = info.label;
                        if (info.note) attLabel += ` (${info.note})`;
                        isAbsent = info.status === 'absent';
                      } else {
                        const present = Object.values(e.studentAttendance || {}).filter(
                          (a) => a.status === 'present'
                        ).length;
                        const absent = Object.values(e.studentAttendance || {}).filter(
                          (a) => a.status === 'absent'
                        ).length;
                        attLabel = `${present} Geldi, ${absent} Gelmedi`;
                      }

                      return (
                        <tr
                          key={e.id}
                          className={`even:bg-slate-50 ${isAbsent ? 'bg-rose-50/60' : ''}`}
                        >
                          <td className="p-2 border border-slate-300 text-slate-500 font-mono">
                            {idx + 1}
                          </td>
                          <td className="p-2 border border-slate-300 whitespace-nowrap">
                            <span className="font-semibold">{e.date}</span>
                            <span className="text-slate-500 block text-[10px]">{e.time}</span>
                          </td>
                          <td className="p-2 border border-slate-300 font-bold">{e.subject}</td>
                          <td className="p-2 border border-slate-300 font-medium">
                            {e.topic || 'Genel Konu Tekrarı / Soru Çözümü'}
                          </td>
                          <td
                            className={`p-2 border border-slate-300 font-bold ${
                              isAbsent ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {attLabel}
                          </td>
                          <td className="p-2 border border-slate-300 whitespace-nowrap">
                            {e.duration || 45} dk
                          </td>
                          <td className="p-2 border border-slate-300 whitespace-nowrap">
                            {e.teacherName || 'Öğretmen'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Official Signatures Section */}
              <div className="border-t-2 border-slate-300 pt-6 mt-8">
                <div className="grid grid-cols-3 gap-6 text-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800">Danışman / Branş Öğretmeni</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">İnceleme & Değerlendirme</div>
                    <div className="mt-10 border-b border-dashed border-slate-400 w-36 mx-auto"></div>
                    <div className="text-[10px] text-slate-400 mt-1">İmza</div>
                  </div>

                  <div>
                    <div className="font-bold text-slate-800">Rehberlik & Psikolojik Danışman</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">Akademik Gelişim Onayı</div>
                    <div className="mt-10 border-b border-dashed border-slate-400 w-36 mx-auto"></div>
                    <div className="text-[10px] text-slate-400 mt-1">İmza</div>
                  </div>

                  <div>
                    <div className="font-bold text-slate-800">Okul / Kurum Müdürü</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">Resmi Onay & Mühür</div>
                    <div className="mt-10 border-b border-dashed border-slate-400 w-36 mx-auto"></div>
                    <div className="text-[10px] text-slate-400 mt-1">İmza / Mühür</div>
                  </div>
                </div>

                <div className="text-center text-[10px] text-slate-400 mt-8">
                  Bu resmi belge, Eğitim ve Öğrenci Takip Sistemi veritabanından güvenli olarak
                  alınmıştır. Herhangi bir kazıntı ve silinti durumunda geçersizdir.
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};
