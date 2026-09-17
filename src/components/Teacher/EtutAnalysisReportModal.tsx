import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
} from 'docx';
import { Etut, Student, ClassGroup } from '../../types';

interface EtutAnalysisReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  preselectedStudentId?: string;
}

// jsPDF için Türkçe karakterleri güvenli Latin karakterlere dönüştüren yardımcı fonksiyon
function toSafePdfText(str: string | undefined | null): string {
  if (!str) return '';
  return str
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
    .replace(/Ç/g, 'C');
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
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7' | '30' | '90' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Selected student object if not "all"
  const selectedStudent = useMemo(() => {
    if (selectedStudentId === 'all') return null;
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [selectedStudentId, students]);

  // Helper to check if student is in etut
  const isStudentInEtut = (etut: Etut, stdId: string): boolean => {
    if (etut.assignedStudentIds === 'all') return true;
    if (Array.isArray(etut.assignedStudentIds)) {
      return etut.assignedStudentIds.includes(stdId);
    }
    return false;
  };

  // Helper to get attendance info for an etut
  const getEtutAttendanceInfo = (etut: Etut, stdId: string) => {
    if (!etut.studentAttendance || !etut.studentAttendance[stdId]) {
      const today = new Date().toISOString().slice(0, 10);
      if (etut.date > today) {
        return { label: 'Planlandı', status: 'upcoming', badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600' };
      }
      return { label: 'Yoklama Alınmadı', status: 'unrecorded', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    }

    const rec = etut.studentAttendance[stdId];
    if (rec.status === 'present') {
      return { label: 'Geldi (Katıldı)', status: 'present', note: rec.note, badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    }
    if (rec.status === 'absent') {
      return { label: 'Gelmedi (Devamsız)', status: 'absent', note: rec.note, badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    }
    if (rec.status === 'excused') {
      return { label: 'İzinli / Raporlu', status: 'excused', note: rec.note, badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    }
    if (rec.status === 'late') {
      return { label: 'Geç Kaldı', status: 'late', note: rec.note, badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    return { label: 'Katıldı', status: 'present', note: rec.note, badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  };

  // Filter etuts for selected student & date
  const filteredEtuts = useMemo(() => {
    const now = new Date();
    return etuts
      .filter((e) => {
        // Student filter
        if (selectedStudentId !== 'all') {
          if (!isStudentInEtut(e, selectedStudentId)) return false;
        }

        // Subject filter
        if (selectedSubjectFilter !== 'all' && e.subject !== selectedSubjectFilter) {
          return false;
        }

        // Date range filter
        if (dateRangeFilter === '7') {
          const etutDate = new Date(e.date);
          const diffDays = (now.getTime() - etutDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7 || diffDays < 0) return false;
        } else if (dateRangeFilter === '30') {
          const etutDate = new Date(e.date);
          const diffDays = (now.getTime() - etutDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30 || diffDays < 0) return false;
        } else if (dateRangeFilter === '90') {
          const etutDate = new Date(e.date);
          const diffDays = (now.getTime() - etutDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 90 || diffDays < 0) return false;
        } else if (dateRangeFilter === 'custom') {
          if (customStartDate && e.date < customStartDate) return false;
          if (customEndDate && e.date > customEndDate) return false;
        }

        // Search in topic or notes
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchesTopic = (e.topic || '').toLowerCase().includes(term);
          const matchesSubject = (e.subject || '').toLowerCase().includes(term);
          const matchesTeacher = (e.teacherName || '').toLowerCase().includes(term);
          if (!matchesTopic && !matchesSubject && !matchesTeacher) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [etuts, selectedStudentId, selectedSubjectFilter, dateRangeFilter, customStartDate, customEndDate, searchTerm]);

  // Unique subjects in etuts
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    etuts.forEach((e) => {
      if (e.subject) set.add(e.subject);
    });
    return Array.from(set);
  }, [etuts]);

  // Statistics calculation for selected student / view including attendance
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
      const studentIdsToCheck = selectedStudentId === 'all'
        ? (Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds : students.map((s) => s.id))
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
    const attendanceRate = evaluatedTotal > 0 ? Math.round(((presentCount + lateCount) / evaluatedTotal) * 100) : 100;

    // Subject breakdown
    const subjectCounts: Record<string, { count: number; topics: Set<string>; minutes: number }> = {};
    filteredEtuts.forEach((e) => {
      if (!subjectCounts[e.subject]) {
        subjectCounts[e.subject] = { count: 0, topics: new Set(), minutes: 0 };
      }
      subjectCounts[e.subject].count += 1;
      subjectCounts[e.subject].minutes += e.duration || 45;
      if (e.topic) subjectCounts[e.subject].topics.add(e.topic);
    });

    const subjectBreakdown = Object.entries(subjectCounts).map(([subjectName, data]) => ({
      subject: subjectName,
      count: data.count,
      minutes: data.minutes,
      percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
      topicCount: data.topics.size,
    })).sort((a, b) => b.count - a.count);

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

  // Export to PDF with Safe Characters
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
      const studentClass = selectedStudent ? selectedStudent.className || 'Genel' : 'Tum Siniflar';
      const studentNo = selectedStudent ? selectedStudent.studentNumber || '-' : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');

      // Title & Header Box
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(14, 12, 182, 26, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('OGRENCI ETUT VE DEVAMSIZLIK ANALIZ BELGESI', 105, 22, { align: 'center' });

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text('Egitim ve Ogrenci Takip Portali - Resmi Gelisim ve Katilim Raporu', 105, 30, { align: 'center' });

      // Student Info Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 42, 182, 30, 'FD');

      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('Ogrenci Adi Soyadi:', 18, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentName), 60, 50);

      doc.setFont('helvetica', 'bold');
      doc.text('Sinif / Sube:', 18, 57);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentClass), 60, 57);

      doc.setFont('helvetica', 'bold');
      doc.text('Ogrenci No:', 18, 64);
      doc.setFont('helvetica', 'normal');
      doc.text(toSafePdfText(studentNo), 60, 64);

      doc.setFont('helvetica', 'bold');
      doc.text('Rapor Tarihi:', 120, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(reportDate, 155, 50);

      doc.setFont('helvetica', 'bold');
      doc.text('Toplam Etut / Sure:', 120, 57);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stats.totalCount} Adet (${stats.totalHours} Saat)`, 155, 57);

      doc.setFont('helvetica', 'bold');
      doc.text('Devam Durumu:', 120, 64);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(stats.absentCount > 0 ? 220 : 16, stats.absentCount > 0 ? 38 : 185, stats.absentCount > 0 ? 38 : 129);
      doc.text(
        selectedStudent
          ? `%${stats.attendanceRate} (${stats.presentCount} Geldi, ${stats.absentCount} Gelmedi)`
          : `%${stats.attendanceRate} Katilim`,
        155,
        64
      );

      // Section 1: Ders Bazında Dağılım
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('1. DERS BAZINDA ETUT KATILIM VE DEVAMSIZLIK DAGILIMI', 14, 80);

      const subjectTableRows = stats.subjectBreakdown.map((sb) => [
        toSafePdfText(sb.subject),
        `${sb.count} Kez`,
        `%${sb.percentage}`,
        `${sb.minutes} dk`,
        `${sb.topicCount} Farkli Konu`,
      ]);

      autoTable(doc, {
        startY: 84,
        head: [['Ders Adi', 'Etut Sayisi', 'Oran', 'Toplam Sure', 'Islenen Konu Sayisi']],
        body: subjectTableRows.length > 0 ? subjectTableRows : [['Kayit Bulunamadi', '-', '-', '-', '-']],
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: 51,
        },
        margin: { left: 14, right: 14 },
      });

      // Section 2: Detailed Etut History Table
      const finalY = (doc as any).lastAutoTable?.finalY || 135;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('2. DETAYLI ETUT GECMISI (TARIH, DERS, KONU VE DEVAMSIZLIK)', 14, finalY + 10);

      const detailRows = filteredEtuts.map((e, idx) => {
        let attStatusText = 'Belirtilmedi';
        if (selectedStudentId !== 'all') {
          const info = getEtutAttendanceInfo(e, selectedStudentId);
          attStatusText = toSafePdfText(info.label);
          if (info.note) attStatusText += ` (${toSafePdfText(info.note)})`;
        } else {
          // Genel yoklama özeti
          const totalAssigned = Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds.length : students.length;
          const present = Object.values(e.studentAttendance || {}).filter((a) => a.status === 'present').length;
          const absent = Object.values(e.studentAttendance || {}).filter((a) => a.status === 'absent').length;
          attStatusText = `${present}/${totalAssigned} Geldi, ${absent} Gelmedi`;
        }

        return [
          `${idx + 1}`,
          e.date,
          toSafePdfText(e.subject),
          toSafePdfText(e.topic || 'Genel Soru Cozumu / Tekrar'),
          attStatusText,
          `${e.time} (${e.duration || 45} dk)`,
          toSafePdfText(e.teacherName || 'Ogretmen'),
        ];
      });

      autoTable(doc, {
        startY: finalY + 14,
        head: [['#', 'Tarih', 'Ders', 'Etut Konusu / Odak', 'Yoklama / Devamsizlik', 'Sure', 'Ogretmen']],
        body: detailRows.length > 0 ? detailRows : [['-', '-', '-', 'Etut kaydi bulunmuyor', '-', '-', '-']],
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: 51,
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 22 },
          2: { cellWidth: 26 },
          3: { cellWidth: 46 },
          4: { cellWidth: 36 },
          5: { cellWidth: 22 },
          6: { cellWidth: 22 },
        },
        margin: { left: 14, right: 14 },
      });

      // Bottom Signatures
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Bu belge Egitim & Ogrenci Takip Portali tarafindan resmi rapor olarak uretilmistir.', 14, pageHeight - 10);
      doc.text('Danisman / Brans Ogretmeni Imzasi: _______________________', 115, pageHeight - 10);

      const filename = `Etut_Analiz_${toSafePdfText(studentName).replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

      // Safe download using Blob
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setExportSuccessMessage(`PDF raporu ve devamsızlık analiz belgesi başarıyla indirildi (${filename}).`);
      setTimeout(() => setExportSuccessMessage(null), 5000);
    } catch (err: any) {
      setExportErrorMessage(`PDF oluşturulurken bir hata oluştu: ${err.message || 'Lütfen tekrar deneyin.'}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Export to DOCX
  const handleExportDOCX = async () => {
    try {
      setIsGeneratingDocx(true);
      setExportErrorMessage(null);

      const studentName = selectedStudent ? selectedStudent.name : 'Tüm Öğrenciler Genel Analiz';
      const studentClass = selectedStudent ? selectedStudent.className || 'Genel' : 'Tüm Sınıflar';
      const studentNo = selectedStudent ? selectedStudent.studentNumber || '-' : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');

      const subjectDocxRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ders Adı', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Etüt Sayısı', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Toplam Süre', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'İşlenen Konu Sayısı', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
          ],
        }),
        ...stats.subjectBreakdown.map((sb) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: sb.subject })] }),
              new TableCell({ children: [new Paragraph({ text: `${sb.count} Kez` })] }),
              new TableCell({ children: [new Paragraph({ text: `${sb.minutes} dk` })] }),
              new TableCell({ children: [new Paragraph({ text: `${sb.topicCount} Konu` })] }),
            ],
          })
        ),
      ];

      const historyDocxRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Tarih', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ders', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Etüt Konusu', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Yoklama / Devamsızlık', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Öğretmen', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
          ],
        }),
        ...filteredEtuts.map((e) => {
          let attText = 'Belirtilmedi';
          if (selectedStudentId !== 'all') {
            const info = getEtutAttendanceInfo(e, selectedStudentId);
            attText = info.label;
          } else {
            const present = Object.values(e.studentAttendance || {}).filter((a) => a.status === 'present').length;
            const absent = Object.values(e.studentAttendance || {}).filter((a) => a.status === 'absent').length;
            attText = `${present} Geldi, ${absent} Gelmedi`;
          }

          return new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: e.date })] }),
              new TableCell({ children: [new Paragraph({ text: e.subject })] }),
              new TableCell({ children: [new Paragraph({ text: e.topic || 'Genel Tekrar' })] }),
              new TableCell({ children: [new Paragraph({ text: attText })] }),
              new TableCell({ children: [new Paragraph({ text: e.teacherName || 'Öğretmen' })] }),
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
                text: 'ÖĞRENCİ ETÜT VE DEVAMSIZLIK ANALİZ BELGESİ',
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                text: `Rapor Tarihi: ${reportDate} | Sistem: Eğitim Portalı`,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Öğrenci: ', bold: true }),
                  new TextRun(studentName),
                  new TextRun({ text: ' | Sınıf: ', bold: true }),
                  new TextRun(studentClass),
                  new TextRun({ text: ' | No: ', bold: true }),
                  new TextRun(studentNo),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Katılım Özeti: ', bold: true }),
                  new TextRun({
                    text: `${stats.totalCount} Etüt, ${stats.presentCount} Katılım, ${stats.absentCount} Devamsızlık (%${stats.attendanceRate} Devam Oranı)`,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({ text: '' }),
              new Paragraph({ text: '1. DERS BAZINDA ETÜT DAĞILIMI', heading: HeadingLevel.HEADING_2 }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: subjectDocxRows }),
              new Paragraph({ text: '' }),
              new Paragraph({ text: '2. DETAYLI ETÜT VE DEVAMSIZLIK GEÇMİŞİ', heading: HeadingLevel.HEADING_2 }),
              new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: historyDocxRows }),
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [new TextRun({ text: 'Danışman / Branş Öğretmeni İmzası: ____________________________', italics: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `Etut_Analiz_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportSuccessMessage(`Word (DOCX) belgesi başarıyla oluşturuldu ve indirildi (${filename}).`);
      setTimeout(() => setExportSuccessMessage(null), 5000);
    } catch (err: any) {
      setExportErrorMessage(`DOCX oluşturulurken bir hata oluştu: ${err.message || 'Lütfen tekrar deneyin.'}`);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Öğrenci Etüt Katılım & Devamsızlık Analiz Belgesi</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Resmi Belge Çıktılı
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Geçmiş etütler, seçili tarih aralıkları, ders/konu dağılımı ve devamsızlık durumları raporu.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success alert message */}
        {exportSuccessMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-200 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportSuccessMessage}</span>
          </div>
        )}

        {/* Error alert message */}
        {exportErrorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center space-x-2 text-xs text-rose-200 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{exportErrorMessage}</span>
          </div>
        )}

        {/* Controls Bar: Student Selector, Subject, Date Range, Search */}
        <div className="p-5 bg-slate-950/60 border-b border-slate-800/80 space-y-3 shrink-0">
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
                <option value="all">👥 Tüm Öğrenciler (Genel İcmal)</option>
                {students.map((std) => (
                  <option key={std.id} value={std.id}>
                    {std.name} ({std.className || 'Sınıfsız'}) - No: #{std.studentNumber}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Filter */}
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

            {/* Date Range Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tarih Aralığı</span>
              </label>
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tüm Zamanlar (Geçmiş Dahil)</option>
                <option value="7">Son 7 Gün (Bu Hafta)</option>
                <option value="30">Son 30 Gün (Bu Ay)</option>
                <option value="90">Son 3 Ay (90 Gün)</option>
                <option value="custom">📅 Belirli Tarih Aralığı Seç...</option>
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                <span>Konu veya Öğretmen Ara</span>
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Örn: Paragraf, Matematik, Ali..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              />
            </div>
          </div>

          {/* Custom Date Range Selector (Başlangıç - Bitiş) */}
          {dateRangeFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-900/90 border border-indigo-500/30 rounded-xl">
              <span className="text-xs font-semibold text-indigo-300 flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Özel Tarih Aralığı:</span>
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Başlangıç:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Bitiş:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer"
                >
                  Tarihleri Temizle
                </button>
              )}
            </div>
          )}

          {/* Quick Action Export Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400 flex items-center space-x-2">
              <span>Filtrelenen Etüt:</span>
              <span className="font-bold text-white bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
                {filteredEtuts.length} Adet
              </span>
            </div>

            <div className="flex items-center space-x-2.5">
              {/* Export PDF */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                title="Resmi PDF Raporu ve Devamsızlık Çıktısı İndir"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'PDF Hazırlanıyor...' : 'PDF İndir'}</span>
              </button>

              {/* Export DOCX (Word) */}
              <button
                type="button"
                onClick={handleExportDOCX}
                disabled={isGeneratingDocx}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                title="Microsoft Word (.docx) Raporu İndir"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isGeneratingDocx ? 'DOCX Hazırlanıyor...' : 'Word (DOCX) İndir'}</span>
              </button>

              {/* Print */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                title="Yazdır veya Önizle"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Yazdır</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Report Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Header Card: Selected Student Profile & Key Metrics */}
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
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    {selectedStudent ? 'Bireysel Öğrenci Etüt ve Devam Karnesi' : 'Genel Kurumsal Analiz'}
                  </div>
                  <h4 className="text-xl font-bold text-white mt-0.5">
                    {selectedStudent ? selectedStudent.name : 'Tüm Öğrencilerin Etüt ve Devamsızlık İstatistiği'}
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
                      <span>Toplam {students.length} kayıtlı öğrenci genelinde etüt katılımı</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4 Metric Pills Including Attendance */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-slate-400">Toplam Etüt</div>
                  <div className="text-xl font-black text-indigo-400 mt-0.5">{stats.totalCount}</div>
                  <div className="text-[10px] text-slate-500">{stats.totalHours} Saat</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Katıldı</span>
                  </div>
                  <div className="text-xl font-black text-emerald-400 mt-0.5">{stats.presentCount}</div>
                  <div className="text-[10px] text-slate-500">Etüte Geldi</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-rose-400 flex items-center justify-center space-x-1">
                    <XCircle className="w-3 h-3" />
                    <span>Devamsız</span>
                  </div>
                  <div className="text-xl font-black text-rose-400 mt-0.5">{stats.absentCount}</div>
                  <div className="text-[10px] text-slate-500">Gelmedi</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-amber-300">Devam Oranı</div>
                  <div className="text-xl font-black text-amber-300 mt-0.5">%{stats.attendanceRate}</div>
                  <div className="text-[10px] text-slate-500">Katılım Başarısı</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Ders Dağılımı */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h5 className="text-sm font-bold text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>Ders Bazında Etüt Dağılımı & Analizi</span>
            </h5>

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
                      <span>{item.topicCount} farklı konu</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Detaylı Etüt & Devamsızlık Geçmişi Tablosu */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h5 className="text-sm font-bold text-white flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Kronolojik Etüt & Devamsızlık Listesi</span>
              </h5>
              <div className="text-xs text-slate-400">
                Toplam {filteredEtuts.length} etüt listeleniyor
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tarih & Saat</th>
                    <th className="px-4 py-3 font-semibold">Ders</th>
                    <th className="px-4 py-3 font-semibold">Etüt Konusu / Odak</th>
                    <th className="px-4 py-3 font-semibold">Yoklama / Devamsızlık Durumu</th>
                    <th className="px-4 py-3 font-semibold">Süre & Derslik</th>
                    <th className="px-4 py-3 font-semibold">Öğretmen</th>
                    <th className="px-4 py-3 font-semibold">Notlar</th>
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
                      const attInfo = selectedStudentId !== 'all'
                        ? getEtutAttendanceInfo(etut, selectedStudentId)
                        : null;

                      // Genel görünümde gelen/gelmeyen sayısı
                      const totalAssigned = Array.isArray(etut.assignedStudentIds) ? etut.assignedStudentIds.length : students.length;
                      const presentCount = Object.values(etut.studentAttendance || {}).filter((a) => a.status === 'present').length;
                      const absentCount = Object.values(etut.studentAttendance || {}).filter((a) => a.status === 'absent').length;

                      return (
                        <tr key={etut.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-white">{formatTurkishDate(etut.date)}</div>
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
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${attInfo.badgeClass}`}>
                                  {attInfo.label}
                                </span>
                                {attInfo.note && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 italic">
                                    {attInfo.note}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs font-semibold">
                                <span className="text-emerald-400">{presentCount} Geldi</span>
                                <span className="text-slate-500 mx-1">/</span>
                                <span className="text-rose-400">{absentCount} Gelmedi</span>
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
                            <div className="text-[11px] text-slate-400">{etut.location || 'Derslik'}</div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-medium text-slate-200">
                              {etut.teacherName || 'Danışman Öğretmen'}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate" title={etut.notes || ''}>
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
        </div>
      </div>
    </div>
  );
};
