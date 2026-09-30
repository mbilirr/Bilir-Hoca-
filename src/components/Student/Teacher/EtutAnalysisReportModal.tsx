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
  Building2,
  MapPin,
  School,
  GraduationCap,
  Check,
  Info,
  HelpCircle,
  BarChart3,
  CalendarDays,
  Target,
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
import {
  MIDDLE_SCHOOL_GRADES,
  HIGH_SCHOOL_GRADES,
  MIDDLE_SCHOOL_SUBJECTS,
  HIGH_SCHOOL_SUBJECTS,
  formatClassDisplayName,
} from '../../constants/schoolConstants';

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
    if (typeof (window as any)?.jspdfAutoTable === 'function') {
      (window as any).jspdfAutoTable(doc, options);
      return;
    }
    console.warn('AutoTable could not be executed directly.');
  } catch (err) {
    console.error('executeAutoTable error:', err);
  }
}

// Turkish character safety helper for jsPDF
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
  // 1. MOD SEÇİMİ: Sınıf Bazlı veya Öğrenci Bazlı Analiz
  const [analysisMode, setAnalysisMode] = useState<'class' | 'student'>(() =>
    preselectedStudentId ? 'student' : 'class'
  );

  // 1.A. Sınıf Seçimi
  const [selectedClassId, setSelectedClassId] = useState<string>(() => classes[0]?.id || '');

  // 1.B. Öğrenci Seçimi
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() =>
    preselectedStudentId || students[0]?.id || ''
  );
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');

  // 2. Ders Seçimi
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  // 3. Etüt Seçimi (Seçili ders için verilen etütler)
  const [selectedEtutId, setSelectedEtutId] = useState<string>('all');

  // 4. Tarih Aralığı Seçimi
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // UI Alt Sekme (Sınıf Analizi için: Öğrenci Katılımı vs Etüt Detayları)
  const [classDetailView, setClassDetailView] = useState<'students' | 'etuts'>('students');

  // Dışa aktarma durumları
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // preselectedStudentId değişirse öğrenci moduna geç
  useEffect(() => {
    if (preselectedStudentId) {
      setAnalysisMode('student');
      setSelectedStudentId(preselectedStudentId);
      const s = students.find((item) => item.id === preselectedStudentId);
      if (s?.classId) {
        setStudentClassFilter(s.classId);
      }
    }
  }, [preselectedStudentId, students]);

  // Seçili sınıf veya öğrenci nesnesi
  const currentClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || classes[0] || null,
    [classes, selectedClassId]
  );

  const currentStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || students[0] || null,
    [students, selectedStudentId]
  );

  // Öğrenci listesi filtresi (Öğrenci seçim kutusu için)
  const selectableStudents = useMemo(() => {
    return students.filter((s) => {
      if (studentClassFilter !== 'all' && s.classId !== studentClassFilter) return false;
      if (studentSearchTerm.trim()) {
        const q = studentSearchTerm.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.studentNumber && s.studentNumber.includes(q))
        );
      }
      return true;
    });
  }, [students, studentClassFilter, studentSearchTerm]);

  // Kademe Tespiti (Ortaokul: 5,6,7,8 | Lise: 9,10,11,12)
  const detectedLevel = useMemo<'Ortaokul' | 'Lise'>(() => {
    let rawGrade = '';

    if (analysisMode === 'class' && currentClass) {
      rawGrade = currentClass.gradeLevel || currentClass.name || '';
    } else if (analysisMode === 'student' && currentStudent) {
      rawGrade =
        currentStudent.gradeLevel ||
        classes.find((c) => c.id === currentStudent.classId)?.gradeLevel ||
        currentStudent.className ||
        '';
    }

    const numMatch = rawGrade.match(/\b(5|6|7|8|9|10|11|12)\b/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num >= 9) return 'Lise';
      return 'Ortaokul';
    }

    const lower = rawGrade.toLowerCase();
    if (lower.includes('lise') || lower.includes('fen lisesi') || lower.includes('anadolu')) {
      return 'Lise';
    }
    return 'Ortaokul';
  }, [analysisMode, currentClass, currentStudent, classes]);

  // Kademeye göre dersler listesi (Kullanıcı Talebi 2)
  // 5.6.7.8 -> Ortaokul dersleri, 9.10.11.12 -> Lise dersleri
  const availableSubjectsForLevel = useMemo(() => {
    const baseSubjects =
      detectedLevel === 'Lise' ? HIGH_SCHOOL_SUBJECTS : MIDDLE_SCHOOL_SUBJECTS;

    // Sistemde kayıtlı etütlerden de mevcut kademeye uygun dersleri ekle
    const extraSubjects = new Set<string>(baseSubjects);
    etuts.forEach((e) => {
      if (e.subject) {
        if (e.schoolLevel === detectedLevel || !e.schoolLevel) {
          extraSubjects.add(e.subject);
        }
      }
    });

    return Array.from(extraSubjects);
  }, [detectedLevel, etuts]);

  // Kademe veya ders listesi değiştiğinde seçili ders uyumsuz ise 'all' yap
  useEffect(() => {
    if (selectedSubject !== 'all' && !availableSubjectsForLevel.includes(selectedSubject)) {
      setSelectedSubject('all');
    }
  }, [availableSubjectsForLevel, selectedSubject]);

  // Kapsama dahil olan etütlerin havuzu (Hedef ve Ders bazlı etütler)
  const poolEtutsForTargetAndSubject = useMemo(() => {
    return etuts.filter((e) => {
      // 1. Hedef Kapsam Filtresi
      if (analysisMode === 'class') {
        if (!currentClass) return false;
        // Etüt sınıf öğrencilerine atanmış mı?
        const classStudentIds = new Set(
          students.filter((s) => s.classId === currentClass.id).map((s) => s.id)
        );
        if (e.assignedStudentIds === 'all') {
          // 'all' atanmışsa sınıfın kademesiyle uyuşuyorsa dahil et
          if (e.schoolLevel && e.schoolLevel !== detectedLevel) return false;
        } else if (Array.isArray(e.assignedStudentIds)) {
          const hasAny = e.assignedStudentIds.some((id) => classStudentIds.has(id));
          if (!hasAny) return false;
        }
      } else {
        // Öğrenci bazlı
        if (!currentStudent) return false;
        if (e.assignedStudentIds !== 'all') {
          if (
            Array.isArray(e.assignedStudentIds) &&
            !e.assignedStudentIds.includes(currentStudent.id)
          ) {
            return false;
          }
        }
      }

      // 2. Ders Filtresi
      if (selectedSubject !== 'all' && e.subject !== selectedSubject) {
        return false;
      }

      return true;
    });
  }, [etuts, analysisMode, currentClass, currentStudent, students, detectedLevel, selectedSubject]);

  // Havuz değiştiğinde seçili etüt artık listede yoksa 'all' yap
  useEffect(() => {
    if (selectedEtutId !== 'all') {
      const exists = poolEtutsForTargetAndSubject.some((e) => e.id === selectedEtutId);
      if (!exists) {
        setSelectedEtutId('all');
      }
    }
  }, [poolEtutsForTargetAndSubject, selectedEtutId]);

  // 4. Tarih Aralığı Filtresi ve Sonuç Etütleri
  const finalFilteredEtuts = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);

    return poolEtutsForTargetAndSubject.filter((e) => {
      // 3. Etüt Seçimi
      if (selectedEtutId !== 'all' && e.id !== selectedEtutId) {
        return false;
      }

      // 4. Tarih Aralığı
      if (dateRangeFilter === 'thisWeek') {
        const d = new Date(todayStr + 'T00:00:00');
        const day = d.getDay();
        const diffToMon = d.getDate() - (day === 0 ? 6 : day - 1);
        const mon = new Date(d.setDate(diffToMon));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        const monStr = mon.toISOString().slice(0, 10);
        const sunStr = sun.toISOString().slice(0, 10);
        if (e.date < monStr || e.date > sunStr) return false;
      } else if (dateRangeFilter === 'thisMonth' || dateRangeFilter === 'month') {
        const curMonth = todayStr.slice(0, 7);
        if (!e.date.startsWith(curMonth)) return false;
      } else if (dateRangeFilter === 'last30' || dateRangeFilter === '30') {
        const d = new Date(todayStr + 'T00:00:00');
        d.setDate(d.getDate() - 30);
        const past30Str = d.toISOString().slice(0, 10);
        if (e.date < past30Str || e.date > todayStr) return false;
      } else if (dateRangeFilter === 'future') {
        if (e.date < todayStr) return false;
      } else if (dateRangeFilter === '7' || dateRangeFilter === '15' || dateRangeFilter === 'term') {
        const days =
          dateRangeFilter === '7'
            ? 7
            : dateRangeFilter === '15'
            ? 15
            : 90;
        const etutMidnight = new Date(e.date + 'T00:00:00').getTime();
        const todayMidnight = new Date(todayStr + 'T00:00:00').getTime();
        const diffDays = Math.round((todayMidnight - etutMidnight) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > days) return false;
      } else if (dateRangeFilter === 'custom') {
        if (customStartDate && e.date < customStartDate) return false;
        if (customEndDate && e.date > customEndDate) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [poolEtutsForTargetAndSubject, selectedEtutId, dateRangeFilter, customStartDate, customEndDate]);

  // Sınıf Öğrencileri (Sınıf modunda)
  const classStudents = useMemo(() => {
    if (!currentClass) return [];
    return students.filter((s) => s.classId === currentClass.id);
  }, [students, currentClass]);

  // --- İSTATİSTİK & ANALİZ HESAPLAMALARI ---
  const analysisStats = useMemo(() => {
    const totalEtuts = finalFilteredEtuts.length;
    let totalMinutes = 0;
    finalFilteredEtuts.forEach((e) => {
      totalMinutes += Number(e.duration) || 40;
    });
    const totalHours = (totalMinutes / 60).toFixed(1);

    if (analysisMode === 'student' && currentStudent) {
      let present = 0;
      let absent = 0;
      let excused = 0;
      let late = 0;
      let upcomingOrUnrecorded = 0;

      const today = new Date().toISOString().slice(0, 10);

      finalFilteredEtuts.forEach((e) => {
        const att = e.studentAttendance?.[currentStudent.id];
        if (!att) {
          if (e.date >= today) upcomingOrUnrecorded++;
          else absent++; // Geçmiş ve yoklama yoksa
        } else if (att.status === 'present') present++;
        else if (att.status === 'absent') absent++;
        else if (att.status === 'excused') excused++;
        else if (att.status === 'late') late++;
        else present++;
      });

      const evaluated = present + absent + excused + late;
      const rate = evaluated > 0 ? Math.round(((present + late) / evaluated) * 100) : 0;

      return {
        totalEtuts,
        totalMinutes,
        totalHours,
        present,
        absent,
        excused,
        late,
        upcomingOrUnrecorded,
        attendanceRate: rate,
      };
    } else {
      // Sınıf Bazlı İstatistikler
      let totalAttendanceEntries = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalExcused = 0;
      let totalLate = 0;

      finalFilteredEtuts.forEach((e) => {
        classStudents.forEach((std) => {
          // Öğrenci bu etüte atanmış mı?
          let isAssigned = false;
          if (e.assignedStudentIds === 'all') isAssigned = true;
          else if (Array.isArray(e.assignedStudentIds)) {
            isAssigned = e.assignedStudentIds.includes(std.id);
          }

          if (isAssigned) {
            totalAttendanceEntries++;
            const att = e.studentAttendance?.[std.id];
            if (!att) {
              // Yoklama yok
            } else if (att.status === 'present') totalPresent++;
            else if (att.status === 'absent') totalAbsent++;
            else if (att.status === 'excused') totalExcused++;
            else if (att.status === 'late') totalLate++;
            else totalPresent++;
          }
        });
      });

      const evaluated = totalPresent + totalAbsent + totalExcused + totalLate;
      const rate = evaluated > 0 ? Math.round(((totalPresent + totalLate) / evaluated) * 100) : 0;

      return {
        totalEtuts,
        totalMinutes,
        totalHours,
        totalStudents: classStudents.length,
        present: totalPresent,
        absent: totalAbsent,
        excused: totalExcused,
        late: totalLate,
        attendanceRate: rate,
      };
    }
  }, [finalFilteredEtuts, analysisMode, currentStudent, classStudents]);

  // Sınıf Öğrencileri Katılım Tablosu Verileri
  const studentParticipationRows = useMemo(() => {
    if (analysisMode !== 'class') return [];

    return classStudents.map((std) => {
      let assignedCount = 0;
      let attendedCount = 0;
      let absentCount = 0;
      let excusedCount = 0;

      finalFilteredEtuts.forEach((e) => {
        let isAssigned = false;
        if (e.assignedStudentIds === 'all') isAssigned = true;
        else if (Array.isArray(e.assignedStudentIds)) {
          isAssigned = e.assignedStudentIds.includes(std.id);
        }

        if (isAssigned) {
          assignedCount++;
          const att = e.studentAttendance?.[std.id];
          if (att?.status === 'present' || att?.status === 'late') {
            attendedCount++;
          } else if (att?.status === 'absent') {
            absentCount++;
          } else if (att?.status === 'excused') {
            excusedCount++;
          }
        }
      });

      const rate = assignedCount > 0 ? Math.round((attendedCount / assignedCount) * 100) : 0;

      return {
        student: std,
        assignedCount,
        attendedCount,
        absentCount,
        excusedCount,
        rate,
      };
    }).sort((a, b) => b.rate - a.rate || a.student.name.localeCompare(b.student.name));
  }, [analysisMode, classStudents, finalFilteredEtuts]);

  if (!isOpen) return null;

  // --- PDF ÇIKTISI OLUŞTURMA (Türkçe Karakter Destekli & Profesyonel) ---
  const handleExportPDF = () => {
    try {
      setIsGeneratingPdf(true);
      setExportFeedback(null);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const reportDate = new Date().toLocaleDateString('tr-TR');
      const targetTitle =
        analysisMode === 'class'
          ? `Sinif Analizi: ${currentClass ? currentClass.name : 'Secili Sinif'}`
          : `Ogrenci Analizi: ${currentStudent ? currentStudent.name : 'Secili Ogrenci'}`;

      // Başlık Banner (Koyu Mavi - Lacivert)
      doc.setFillColor(15, 23, 42);
      doc.rect(14, 12, 182, 26, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(
        toSafePdfText('T.C. MILLI EGITIM BAKANLIGI / OZEL EGITIM KURUMLARI'),
        105,
        19,
        { align: 'center' }
      );

      doc.setFontSize(11);
      doc.setTextColor(199, 210, 254);
      doc.text(
        toSafePdfText('ETUT KATILIM VE DEVAMSIZLIK ANALIZ RAPORU'),
        105,
        26,
        { align: 'center' }
      );

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        toSafePdfText(`Kademe: ${detectedLevel} • Rapor Tarihi: ${reportDate}`),
        105,
        33,
        { align: 'center' }
      );

      // Üst Özet Bilgi Kutusu
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 42, 182, 24, 2, 2, 'FD');

      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(toSafePdfText(targetTitle), 18, 49);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        toSafePdfText(
          `Secili Ders: ${selectedSubject === 'all' ? 'Tum Dersler' : selectedSubject} | Etut Kapsami: ${
            selectedEtutId === 'all' ? `Tum Etutler (${finalFilteredEtuts.length} Adet)` : 'Secili Tek Etut'
          }`
        ),
        18,
        55
      );

      doc.text(
        toSafePdfText(
          `Toplam Etut: ${analysisStats.totalEtuts} Adet | Toplam Sure: ${analysisStats.totalHours} Saat (${analysisStats.totalMinutes} Dk) | Katilim Orani: %${analysisStats.attendanceRate}`
        ),
        18,
        61
      );

      let startY = 70;

      if (analysisMode === 'class') {
        // SINIF BAZLI TABLO (Öğrenciler)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(toSafePdfText('1. SINIF OGRENCILERI ETUT KATILIM VE DEVAMSIZLIK TABLOSU'), 14, startY);

        const tableBody = studentParticipationRows.map((r, idx) => [
          idx + 1,
          toSafePdfText(r.student.studentNumber || '-'),
          toSafePdfText(r.student.name),
          r.assignedCount,
          r.attendedCount,
          r.absentCount,
          `%${r.rate}`,
        ]);

        executeAutoTable(doc, {
          startY: startY + 3,
          head: [[
            toSafePdfText('Sira'),
            toSafePdfText('No'),
            toSafePdfText('Ogrenci Adi Soyadi'),
            toSafePdfText('Atanan'),
            toSafePdfText('Katildi'),
            toSafePdfText('Gelmedi'),
            toSafePdfText('Katilim %'),
          ]],
          body: tableBody.length > 0 ? tableBody : [[toSafePdfText('Kayit bulunamadi'), '-', '-', '-', '-', '-', '-']],
          theme: 'grid',
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontSize: 8,
            fontStyle: 'bold',
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [30, 41, 59],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        });
      } else {
        // ÖĞRENCİ BAZLI TABLO (Öğrencinin Etütleri)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(toSafePdfText('1. OGRENCI DETAYLI ETUT GECMISI VE KATILIM DURUMU'), 14, startY);

        const tableBody = finalFilteredEtuts.map((e) => {
          const att = e.studentAttendance?.[currentStudent?.id || ''];
          let statusText = 'Katilmadi';
          if (att?.status === 'present' || att?.status === 'late') statusText = 'Katildi';
          else if (att?.status === 'excused') statusText = 'Izinli';
          else if (!att && e.date >= new Date().toISOString().slice(0, 10)) statusText = 'Planlandi';

          return [
            toSafePdfText(new Date(e.date).toLocaleDateString('tr-TR')),
            toSafePdfText(e.time || '16:00'),
            toSafePdfText(e.subject),
            toSafePdfText(e.topic || 'Genel Tekrar'),
            toSafePdfText(`${e.duration || 40} Dk`),
            toSafePdfText(statusText),
            toSafePdfText(e.location || 'Derslik'),
          ];
        });

        executeAutoTable(doc, {
          startY: startY + 3,
          head: [[
            toSafePdfText('Tarih'),
            toSafePdfText('Saat'),
            toSafePdfText('Ders'),
            toSafePdfText('Konu / Kazanim'),
            toSafePdfText('Sure'),
            toSafePdfText('Durum'),
            toSafePdfText('Derslik / Yer'),
          ]],
          body: tableBody.length > 0 ? tableBody : [[toSafePdfText('Secilen kriterlere uygun etut bulunamadi'), '-', '-', '-', '-', '-', '-']],
          theme: 'grid',
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: 255,
            fontSize: 8,
            fontStyle: 'bold',
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [30, 41, 59],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        });
      }

      // Alt İmza Alanı
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        toSafePdfText('Brans / Danisman Ogretmen: ______________________'),
        18,
        pageHeight - 12
      );
      doc.text(
        toSafePdfText('Okul Yonetimi Onayi: ______________________'),
        135,
        pageHeight - 12
      );

      const filename = `Etut_Analiz_${toSafePdfText(
        analysisMode === 'class' ? currentClass?.name || 'Sinif' : currentStudent?.name || 'Ogrenci'
      ).replace(/[^a-zA-Z0-9]/g, '_')}_${reportDate.replace(/\./g, '-')}.pdf`;

      doc.save(filename);
      setExportFeedback('✓ PDF başarıyla indirildi.');
      setTimeout(() => setExportFeedback(null), 3000);
    } catch (err) {
      console.error('PDF export error:', err);
      setExportFeedback('PDF oluşturulurken bir hata oluştu.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // --- DOCX ÇIKTISI OLUŞTURMA ---
  const handleExportDOCX = async () => {
    try {
      setIsGeneratingDocx(true);
      setExportFeedback(null);

      const reportDate = new Date().toLocaleDateString('tr-TR');
      const targetTitle =
        analysisMode === 'class'
          ? `Sınıf Analizi: ${currentClass ? currentClass.name : 'Sınıf'}`
          : `Öğrenci Analizi: ${currentStudent ? currentStudent.name : 'Öğrenci'}`;

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: 'T.C. MİLLÎ EĞİTİM BAKANLIĞI / ÖZEL EĞİTİM KURUMLARI',
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                text: 'ETÜT KATILIM VE DEVAMSIZLIK ANALİZ RAPORU',
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                text: `${targetTitle} • Kademe: ${detectedLevel} • Tarih: ${reportDate}`,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({ text: '' }),
              new Paragraph({
                text: `Özet: Toplam ${analysisStats.totalEtuts} etüt | ${analysisStats.totalHours} saat | Katılım Oranı: %${analysisStats.attendanceRate}`,
              }),
              new Paragraph({ text: '' }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Etut_Analiz_${reportDate.replace(/\./g, '-')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportFeedback('✓ Word belgesi (DOCX) başarıyla indirildi.');
      setTimeout(() => setExportFeedback(null), 3000);
    } catch (err) {
      console.error('DOCX export error:', err);
      setExportFeedback('DOCX oluşturulurken bir hata oluştu.');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  // Doğrudan Yazdır
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-2 sm:p-4 md:p-6 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl bg-slate-50 border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ÜST BAŞLIK BARI */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Etüt Analizi</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {detectedLevel}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sınıf ve öğrenci bazlı profesyonel etüt katılım ve konu analizi raporu
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isGeneratingPdf}
              className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="PDF Raporu İndir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportDOCX}
              disabled={isGeneratingDocx}
              className="hidden md:inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Word (DOCX) İndir"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isGeneratingDocx ? 'Hazırlanıyor...' : 'Word İndir'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Yazdır"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BİLDİRİM GERİ BİLDİRİMİ */}
        {exportFeedback && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-between">
            <span>{exportFeedback}</span>
            <button
              type="button"
              onClick={() => setExportFeedback(null)}
              className="text-emerald-600 hover:text-emerald-900"
            >
              ✕
            </button>
          </div>
        )}

        {/* 4 AŞAMALI FİLTRELEME ALANI (KULLANICI TALEBİNE GÖRE DÜZENLENDİ) */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-200/90 shadow-xs space-y-3 shrink-0">
          {/* 1. ADIM: ANALİZ HEDEFİ SEÇİMİ (SINIF VEYA ÖĞRENCİ) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                1. Analiz Kapsamı:
              </span>
              <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAnalysisMode('class')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    analysisMode === 'class'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <School className="w-3.5 h-3.5" />
                  <span>Sınıf Özelinde Analiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode('student')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    analysisMode === 'student'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Öğrenciye Özel Analiz</span>
                </button>
              </div>
            </div>

            {/* Sınıf veya Öğrenci Seçici Açılır Penceresi */}
            <div className="flex-1 max-w-xl">
              {analysisMode === 'class' ? (
                <div className="flex items-center space-x-2">
                  <label htmlFor="select-class-analysis" className="text-xs text-slate-500 font-semibold whitespace-nowrap">
                    Sınıf:
                  </label>
                  <select
                    id="select-class-analysis"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    {classes.map((c) => {
                      const count = students.filter((s) => s.classId === c.id).length;
                      return (
                        <option key={c.id} value={c.id}>
                          {formatClassDisplayName(c.name, c.branch, c.gradeLevel)} — {count} Öğrenci
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Öğrenci Sınıf Filtresi (İsteğe Bağlı) */}
                  <select
                    value={studentClassFilter}
                    onChange={(e) => setStudentClassFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer sm:w-40"
                    title="Öğrenciyi hızlı bulmak için sınıf filtreleyin"
                  >
                    <option value="all">Tüm Sınıflar</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClassDisplayName(c.name, c.branch, c.gradeLevel)}
                      </option>
                    ))}
                  </select>

                  {/* Öğrenci Açılır Penceresi */}
                  <select
                    id="select-student-analysis"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    {selectableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 2, 3 ve 4. ADIMLAR: DERS, ETÜT VE TARİH ARALIĞI AÇILIR PENCERELERİ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
            {/* 2. DERS SEÇİMİ (Kademeye göre Ortaokul veya Lise dersleri açılır) */}
            <div className="space-y-1">
              <label htmlFor="select-subject-analysis" className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span>2. Ders Seçiniz</span>
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                  {detectedLevel}
                </span>
              </label>
              <select
                id="select-subject-analysis"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Dersler</option>
                {availableSubjectsForLevel.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. VERİLEN ETÜT SEÇİMİ (Verilen ders için etütlerin hepsi veya tek etüt) */}
            <div className="space-y-1">
              <label htmlFor="select-etut-analysis" className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span>3. Etüt Seçiniz</span>
                <span className="text-[10px] text-slate-400">
                  {poolEtutsForTargetAndSubject.length} Etüt Mevcut
                </span>
              </label>
              <select
                id="select-etut-analysis"
                value={selectedEtutId}
                onChange={(e) => setSelectedEtutId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">
                  Tüm Etütler (Hepsi — {poolEtutsForTargetAndSubject.length} Etüt)
                </option>
                {poolEtutsForTargetAndSubject.map((e) => (
                  <option key={e.id} value={e.id}>
                    {new Date(e.date).toLocaleDateString('tr-TR')} • {e.subject} ({e.topic || 'Genel Tekrar'})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. TARİH ARALIĞI AÇILIR PENCERESİ */}
            <div className="space-y-1">
              <label htmlFor="select-date-range-analysis" className="text-[11px] font-bold text-slate-600 block">
                4. Tarih Aralığı
              </label>
              <select
                id="select-date-range-analysis"
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Tarihler (Tüm Zamanlar)</option>
                <option value="thisWeek">Bu Hafta (Pzt - Paz)</option>
                <option value="thisMonth">Bu Ay</option>
                <option value="last30">Son 30 Gün</option>
                <option value="future">Gelecek Planlanan Etütler</option>
                <option value="custom">Özel Tarih Aralığı Seç...</option>
              </select>
            </div>
          </div>

          {/* Özel Tarih Seçicileri (custom seçildiğinde açılır) */}
          {dateRangeFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <span className="text-slate-500 font-semibold">Tarih Aralığı:</span>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="text-[11px] text-indigo-600 hover:underline"
                >
                  Tarihi Temizle
                </button>
              )}
            </div>
          )}
        </div>

        {/* RAPOR İÇERİĞİ ALANI (SADE, ŞIK, BEYAZ VE ANLAŞILIR) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-100/50">
          {/* RAPOR BAŞLIĞI VE ÖZET BİLGİ KARTI */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Resmi Etüt Analiz Raporu
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  {analysisMode === 'class'
                    ? `${currentClass ? formatClassDisplayName(currentClass.name, currentClass.branch, currentClass.gradeLevel) : 'Sınıf'} — Etüt Katılım ve Başarı Analizi`
                    : `${currentStudent ? currentStudent.name : 'Öğrenci'} — Bireysel Etüt Katılım Raporu`}
                </h2>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Rapor Tarihi: {new Date().toLocaleDateString('tr-TR')}</span>
              </div>
            </div>

            {/* AKTİF FİLTRELER ROZETLERİ */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400">Filtre Özeti:</span>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold">
                {analysisMode === 'class'
                  ? `🏫 Sınıf: ${currentClass ? formatClassDisplayName(currentClass.name, currentClass.branch, currentClass.gradeLevel) : ''}`
                  : `👤 Öğrenci: ${currentStudent?.name}`}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                {detectedLevel}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                📚 {selectedSubject === 'all' ? 'Tüm Dersler' : selectedSubject}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                🎯 {selectedEtutId === 'all' ? `Tüm Etütler (${finalFilteredEtuts.length})` : 'Özel Etüt'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                📅 {dateRangeFilter === 'all' ? 'Tüm Zamanlar' : `Filtreli Tarih`}
              </span>
            </div>

            {/* KPI İSTATİSTİK KARTLARI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                  Toplam Etüt
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
                  {analysisStats.totalEtuts} <span className="text-xs font-normal text-slate-500">adet</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                  Toplam Süre
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
                  {analysisStats.totalHours} <span className="text-xs font-normal text-slate-500">saat</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide block">
                  Katılım Oranı
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 block">
                  %{analysisStats.attendanceRate}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                  {analysisMode === 'class' ? 'Kayıtlı Öğrenci' : 'Katılım Detayı'}
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {analysisMode === 'class'
                    ? `${classStudents.length} Öğrenci`
                    : `✓ ${analysisStats.present} Geldi • ✕ ${analysisStats.absent} Gelmedi`}
                </span>
              </div>
            </div>
          </div>

          {/* DETAYLI ANALİZ TABLOSU */}
          {analysisMode === 'class' ? (
            /* SINIF BAZLI ANALİZ */
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm space-y-3 p-4 sm:p-5">
              {/* Sekme Değiştirici: Öğrenci Katılım Çizelgesi vs Etüt Listesi */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setClassDetailView('students')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      classDetailView === 'students'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Öğrenci Katılım Çizelgesi ({classStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassDetailView('etuts')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      classDetailView === 'etuts'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Etüt Detay Listesi ({finalFilteredEtuts.length})
                  </button>
                </div>

                <span className="text-xs text-slate-400">
                  {classDetailView === 'students'
                    ? 'Sınıftaki öğrencilerin bireysel etüt devam durumu'
                    : 'Seçili kriterlere göre işlenen etütler'}
                </span>
              </div>

              {classDetailView === 'students' ? (
                /* Öğrenci Katılım Tablosu */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Sıra</th>
                        <th className="px-4 py-3">No</th>
                        <th className="px-4 py-3">Öğrenci</th>
                        <th className="px-4 py-3">Atanan Etüt</th>
                        <th className="px-4 py-3">Katıldı</th>
                        <th className="px-4 py-3">Gelmedi</th>
                        <th className="px-4 py-3">Katılım Oranı</th>
                        <th className="px-4 py-3 text-right">Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentParticipationRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                            Bu sınıfta kayıtlı öğrenci bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        studentParticipationRows.map((row, idx) => (
                          <tr key={row.student.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3 font-mono font-bold text-indigo-700">
                              #{row.student.studentNumber || '-'}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {row.student.name}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{row.assignedCount}</td>
                            <td className="px-4 py-3 font-bold text-emerald-700">{row.attendedCount}</td>
                            <td className="px-4 py-3 font-bold text-rose-700">{row.absentCount}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-2">
                                <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: `${row.rate}%` }}
                                  />
                                </div>
                                <span className="font-bold text-slate-800">%{row.rate}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  row.rate >= 80
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : row.rate >= 50
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {row.rate >= 80 ? 'Düzenli' : row.rate >= 50 ? 'Orta' : 'Düşük'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Etüt Detay Listesi */
                <div className="divide-y divide-slate-100">
                  {finalFilteredEtuts.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Seçilen kriterlere uygun etüt kaydı bulunamadı.
                    </div>
                  ) : (
                    finalFilteredEtuts.map((e) => (
                      <div
                        key={e.id}
                        className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 rounded-xl transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {e.subject}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>
                                {new Date(e.date).toLocaleDateString('tr-TR')} • {e.time} ({e.duration || 40} Dk)
                              </span>
                            </span>
                            {e.location && (
                              <span className="text-xs text-slate-400 flex items-center space-x-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span>{e.location}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {e.topic || 'Genel Tekrar / Soru Çözümü'}
                          </h4>
                          {e.teacherFeedback && (
                            <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/60 p-1.5 rounded-md mt-1 italic">
                              <strong className="font-semibold not-italic">Öğretmen Görüş ve Değerlendirmesi:</strong> "{e.teacherFeedback}"
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 flex items-center space-x-3">
                          <span className="text-xs font-bold text-slate-700">
                            {e.assignedStudentIds === 'all'
                              ? '👥 Tüm Sınıf'
                              : `🎯 ${Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds.length : 0} Öğrenci`}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ÖĞRENCİ BAZLI ANALİZ */
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={
                      currentStudent?.avatar ||
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                        currentStudent?.name || 'student'
                      )}`
                    }
                    alt=""
                    className="w-10 h-10 rounded-full bg-slate-100 object-cover border border-slate-200"
                  />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{currentStudent?.name}</h3>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-500">Katılım Durumu:</span>
                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-bold ${
                      analysisStats.attendanceRate >= 80
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : analysisStats.attendanceRate >= 50
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    %{analysisStats.attendanceRate} Katılım
                  </span>
                </div>
              </div>

              {/* Öğrencinin Katıldığı Etütlerin Kronolojik Tablosu */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-4 py-3">Saat</th>
                      <th className="px-4 py-3">Ders</th>
                      <th className="px-4 py-3">Konu / Odak</th>
                      <th className="px-4 py-3">Süre</th>
                      <th className="px-4 py-3">Yer</th>
                      <th className="px-4 py-3 text-right">Yoklama Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finalFilteredEtuts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          Seçilen kriterlere uygun etüt kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      finalFilteredEtuts.map((e) => {
                        const att = e.studentAttendance?.[currentStudent?.id || ''];
                        let badgeClass = 'bg-slate-50 text-slate-700 border-slate-200';
                        let label = 'Planlandı';

                        if (att?.status === 'present') {
                          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          label = '✓ Katıldı';
                        } else if (att?.status === 'absent') {
                          badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                          label = '✕ Gelmedi';
                        } else if (att?.status === 'excused') {
                          badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
                          label = 'ℹ İzinli';
                        } else if (att?.status === 'late') {
                          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                          label = '⚠ Geç Kaldı';
                        }

                        return (
                          <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {new Date(e.date).toLocaleDateString('tr-TR')}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{e.time || '16:00'}</td>
                            <td className="px-4 py-3 font-bold text-indigo-700">{e.subject}</td>
                            <td className="px-4 py-3 text-slate-800 font-medium">
                              <div>{e.topic || 'Genel Tekrar / Soru Çözümü'}</div>
                              {e.teacherFeedback && (
                                <div
                                  className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded mt-1 italic font-normal inline-block max-w-xs truncate"
                                  title={`Öğretmen Görüşü: ${e.teacherFeedback}`}
                                >
                                  💬 {e.teacherFeedback}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500">{e.duration || 40} Dk</td>
                            <td className="px-4 py-3 text-slate-500">{e.location || 'Derslik'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${badgeClass}`}>
                                {label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DİPNOT & İMZA ÇERÇEVESİ */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-semibold text-slate-700">Rapor Doğrulama Bilgisi:</p>
              <p className="text-[11px] text-slate-400">
                Bu belge okul etüt takip sistemi üzerinden otomatik olarak oluşturulmuştur.
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <span className="block text-[11px] text-slate-400">Branş / Danışman Öğretmen</span>
                <span className="font-semibold text-slate-700 mt-1 block">İmza: ____________</span>
              </div>
              <div className="text-center">
                <span className="block text-[11px] text-slate-400">Okul Yönetimi Onayı</span>
                <span className="font-semibold text-slate-700 mt-1 block">Mühür / İmza</span>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL ALT ÇUBUĞU */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Filtrelenen {finalFilteredEtuts.length} etüt kaydı listeleniyor.
          </span>
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isGeneratingPdf}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'İndiriliyor...' : 'PDF İndir'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
