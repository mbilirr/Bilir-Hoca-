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
  TrendingUp,
  GraduationCap,
  Sparkles,
  FileSpreadsheet,
  Award,
  Layers,
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
  BorderStyle,
  ShadingType,
} from 'docx';
import { Etut, Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';

interface EtutAnalysisReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  preselectedStudentId?: string;
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
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '30' | '90' | 'this_year'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

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
        if (dateRangeFilter === '30') {
          const etutDate = new Date(e.date);
          const diffDays = (now.getTime() - etutDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30 || diffDays < 0) return false;
        } else if (dateRangeFilter === '90') {
          const etutDate = new Date(e.date);
          const diffDays = (now.getTime() - etutDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 90 || diffDays < 0) return false;
        }

        // Search in topic or notes
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchesTopic = e.topic.toLowerCase().includes(term);
          const matchesSubject = e.subject.toLowerCase().includes(term);
          const matchesTeacher = (e.teacherName || '').toLowerCase().includes(term);
          if (!matchesTopic && !matchesSubject && !matchesTeacher) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [etuts, selectedStudentId, selectedSubjectFilter, dateRangeFilter, searchTerm]);

  // Unique subjects in etuts
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    etuts.forEach((e) => {
      if (e.subject) set.add(e.subject);
    });
    return Array.from(set);
  }, [etuts]);

  // Statistics calculation for selected student / view
  const stats = useMemo(() => {
    const totalCount = filteredEtuts.length;
    const totalMinutes = filteredEtuts.reduce((acc, curr) => acc + (curr.duration || 45), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

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
      subjectBreakdown,
      topSubject,
    };
  }, [filteredEtuts]);

  // Ranking of all students by etut count
  const allStudentsRanking = useMemo(() => {
    return students
      .map((std) => {
        const studentEtuts = etuts.filter((e) => isStudentInEtut(e, std.id));
        const subjects = new Set(studentEtuts.map((e) => e.subject));
        const totalDuration = studentEtuts.reduce((acc, e) => acc + (e.duration || 45), 0);
        return {
          student: std,
          count: studentEtuts.length,
          subjectCount: subjects.size,
          duration: totalDuration,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [students, etuts]);

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

  // Export to PDF
  const handleExportPDF = async () => {
    try {
      setIsGeneratingPdf(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const studentName = selectedStudent ? selectedStudent.name : 'Tüm Öğrenciler Genel Analiz';
      const studentClass = selectedStudent ? selectedStudent.className : '-';
      const studentNo = selectedStudent ? selectedStudent.studentNumber : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');

      // Title & Header Box
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(14, 12, 182, 26, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('OGRENCI BIREYSEL ETUT VE KATILIM ANALIZ RAPORU', 105, 22, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text('Egitim & Ogrenci Takip Portali - Resmi Gelisim Raporu', 105, 30, { align: 'center' });

      // Student Info Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 42, 182, 28, 'FD');

      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`Ogrenci Adi Soyadi:`, 18, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(`${studentName}`, 60, 50);

      doc.setFont('helvetica', 'bold');
      doc.text(`Sinif / Sube:`, 18, 57);
      doc.setFont('helvetica', 'normal');
      doc.text(`${studentClass}`, 60, 57);

      doc.setFont('helvetica', 'bold');
      doc.text(`Ogrenci No:`, 18, 64);
      doc.setFont('helvetica', 'normal');
      doc.text(`${studentNo}`, 60, 64);

      doc.setFont('helvetica', 'bold');
      doc.text(`Rapor Tarihi:`, 120, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(`${reportDate}`, 155, 50);

      doc.setFont('helvetica', 'bold');
      doc.text(`Toplam Etut Sayisi:`, 120, 57);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129); // emerald
      doc.text(`${stats.totalCount} Adet`, 155, 57);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`Toplam Sure:`, 120, 64);
      doc.setFont('helvetica', 'normal');
      doc.text(`${stats.totalMinutes} Dk (${stats.totalHours} Saat)`, 155, 64);

      // Section: Subject Breakdown Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('1. DERS BAZINDA ETUT KATILIM DAGILIMI', 14, 78);

      const subjectTableRows = stats.subjectBreakdown.map((sb) => [
        sb.subject,
        `${sb.count} Kez`,
        `%${sb.percentage}`,
        `${sb.minutes} dk`,
        `${sb.topicCount} Farkli Konu`,
      ]);

      autoTable(doc, {
        startY: 82,
        head: [['Ders Adi', 'Katilim Sayisi', 'Yuzdelik Oran', 'Toplam Sure', 'Islenen Konular']],
        body: subjectTableRows.length > 0 ? subjectTableRows : [['Kayit Bulunamadi', '-', '-', '-', '-']],
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229], // Indigo 600
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: 51,
        },
        margin: { left: 14, right: 14 },
      });

      // Section: Detailed Etut History Table
      const finalY = (doc as any).lastAutoTable?.finalY || 130;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('2. DETAYLI ETUT GECMISI (TARIH, DERS VE KONU ANALIZI)', 14, finalY + 12);

      const detailRows = filteredEtuts.map((e, idx) => [
        `${idx + 1}`,
        e.date,
        e.subject,
        e.topic || 'Genel Tekrar / Soru Cozumu',
        `${e.time} (${e.duration || 45} dk)`,
        e.teacherName || 'Ogretmen',
      ]);

      autoTable(doc, {
        startY: finalY + 16,
        head: [['#', 'Tarih', 'Ders', 'Etut Konusu / Odak', 'Saat & Sure', 'Ogretmen']],
        body: detailRows.length > 0 ? detailRows : [['-', '-', '-', 'Etut kaydi bulunmuyor', '-', '-']],
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42], // Slate 900
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: 51,
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 24 },
          2: { cellWidth: 32 },
          3: { cellWidth: 56 },
          4: { cellWidth: 32 },
          5: { cellWidth: 28 },
        },
        margin: { left: 14, right: 14 },
      });

      // Signatures at the bottom
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Bu belge Egitim & Ogrenci Takip Portali tarafindan otomatik hazirlanmistir.', 14, pageHeight - 12);
      doc.text('Danisman / Brans Ogretmeni Imzasi: _______________________', 115, pageHeight - 12);

      const filename = `Etut_Analiz_Raporu_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      setExportSuccessMessage(`PDF raporu başarıyla oluşturuldu ve indirildi (${filename}).`);
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`PDF oluşturulurken bir hata oluştu: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Export to DOCX (Microsoft Word)
  const handleExportDOCX = async () => {
    try {
      setIsGeneratingDocx(true);
      const studentName = selectedStudent ? selectedStudent.name : 'Tüm Öğrenciler Genel Analiz';
      const studentClass = selectedStudent ? selectedStudent.className : '-';
      const studentNo = selectedStudent ? selectedStudent.studentNumber : '-';
      const reportDate = new Date().toLocaleDateString('tr-TR');

      // Table rows for subject breakdown
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
              children: [new Paragraph({ children: [new TextRun({ text: 'Yüzdelik Pay', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Toplam Süre', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '4F46E5' },
            }),
          ],
        }),
        ...stats.subjectBreakdown.map(
          (sb) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(sb.subject)] }),
                new TableCell({ children: [new Paragraph(`${sb.count} Kez`)] }),
                new TableCell({ children: [new Paragraph(`%${sb.percentage}`)] }),
                new TableCell({ children: [new Paragraph(`${sb.minutes} Dk`)] }),
              ],
            })
        ),
      ];

      // Table rows for detailed history
      const historyDocxRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Tarih', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ders', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Etüt Konusu / Odak', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Saat & Süre', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Öğretmen', bold: true, color: 'FFFFFF' })] })],
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
            }),
          ],
        }),
        ...filteredEtuts.map(
          (e, idx) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(`${idx + 1}`)] }),
                new TableCell({ children: [new Paragraph(e.date)] }),
                new TableCell({ children: [new Paragraph(e.subject)] }),
                new TableCell({ children: [new Paragraph(e.topic || '-')] }),
                new TableCell({ children: [new Paragraph(`${e.time} (${e.duration || 45} dk)`)] }),
                new TableCell({ children: [new Paragraph(e.teacherName || 'Öğretmen')] }),
              ],
            })
        ),
      ];

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: 'T.C. MİLLİ EĞİTİM BAKANLIĞI',
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                text: 'ÖĞRENCİ BİREYSEL ETÜT VE KATILIM ANALİZ RAPORU',
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                text: `Rapor Tarihi: ${reportDate} | Sistem: Eğitim Portalı`,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({ text: '' }),

              // Student details
              new Paragraph({
                children: [
                  new TextRun({ text: 'Öğrenci Adı Soyadı: ', bold: true }),
                  new TextRun(studentName),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Sınıf / Şube: ', bold: true }),
                  new TextRun(studentClass),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Öğrenci Numarası: ', bold: true }),
                  new TextRun(studentNo),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Toplam Alınan Etüt: ', bold: true }),
                  new TextRun({ text: `${stats.totalCount} Kez (${stats.totalHours} Saat)`, bold: true, color: '059669' }),
                ],
              }),
              new Paragraph({ text: '' }),

              // Section 1
              new Paragraph({
                text: '1. DERS BAZINDA ETÜT DAĞILIMI',
                heading: HeadingLevel.HEADING_2,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: subjectDocxRows,
              }),
              new Paragraph({ text: '' }),

              // Section 2
              new Paragraph({
                text: '2. DETAYLI ETÜT GEÇMİŞİ (TARİH VE KONULAR)',
                heading: HeadingLevel.HEADING_2,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: historyDocxRows,
              }),
              new Paragraph({ text: '' }),
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Danışman / Branş Öğretmeni İmzası: ____________________________', italics: true }),
                ],
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
      const filename = `Etut_Analiz_Raporu_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccessMessage(`Word (DOCX) belgesi başarıyla oluşturuldu ve indirildi (${filename}).`);
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`DOCX oluşturulurken bir hata oluştu: ${err.message}`);
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
                <span>Öğrenci Etüt Katılım & Konu Analiz Raporu</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PDF & DOCX Çıktılı
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Hangi öğrencimizin hangi tarihte, hangi dersten ve konudan kaç kez etüt aldığını analiz edin ve resmi belge çıktısı alın.
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

        {/* Controls Bar: Student Selector, Subject, Date, Search */}
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
                <option value="all">Tüm Zamanlar</option>
                <option value="30">Son 30 Gün</option>
                <option value="90">Son 3 Ay (90 Gün)</option>
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                <span>Konuda Ara</span>
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Konu, öğretmen ara..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              />
            </div>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400 flex items-center space-x-2">
              <span>Gösterilen Etüt Sayısı:</span>
              <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-lg">
                {filteredEtuts.length}
              </span>
            </div>

            <div className="flex items-center space-x-2.5">
              {/* Export PDF */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                title="Resmi PDF Raporu Oluştur ve İndir"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'PDF Hazırlanıyor...' : 'PDF Olarak İndir'}</span>
              </button>

              {/* Export DOCX (Word) */}
              <button
                type="button"
                onClick={handleExportDOCX}
                disabled={isGeneratingDocx}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                title="Microsoft Word (.docx) Raporu Oluştur ve İndir"
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
                    {selectedStudent ? 'Bireysel Öğrenci Analizi' : 'Genel Kurumsal Analiz'}
                  </div>
                  <h4 className="text-xl font-bold text-white mt-0.5">
                    {selectedStudent ? selectedStudent.name : 'Tüm Öğrencilerin Etüt İstatistiği'}
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
                      <span>Toplam {students.length} kayıtlı öğrenci genelinde etüt dağılımı</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-slate-400">Toplam Etüt</div>
                  <div className="text-xl font-black text-indigo-400 mt-0.5">{stats.totalCount}</div>
                  <div className="text-[10px] text-slate-500">Seans</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-slate-400">Toplam Süre</div>
                  <div className="text-xl font-black text-emerald-400 mt-0.5">{stats.totalHours}</div>
                  <div className="text-[10px] text-slate-500">Saat ({stats.totalMinutes} dk)</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] font-semibold text-slate-400">Ağırlıklı Ders</div>
                  <div className="text-sm font-bold text-amber-300 mt-1 truncate" title={stats.topSubject}>
                    {stats.topSubject}
                  </div>
                  <div className="text-[10px] text-slate-500">En Çok Alınan</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Ders Dağılımı ve Yüzdelik İlerleme Çubukları */}
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

                    {/* Progress Bar */}
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

          {/* Section 2: Detaylı Etüt Tablosu (Tarih, Konu, Öğretmen, Süre) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h5 className="text-sm font-bold text-white flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Kronolojik Etüt & Konu Detay Listesi</span>
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
                    <th className="px-4 py-3 font-semibold">Süre & Derslik</th>
                    <th className="px-4 py-3 font-semibold">Öğretmen</th>
                    <th className="px-4 py-3 font-semibold">Notlar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEtuts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Bu öğrenci veya arama kriterleri için etüt kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredEtuts.map((etut) => (
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Tüm Öğrenciler İçin Sıralama Tablosu (Genel Bakış) */}
          {selectedStudentId === 'all' && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h5 className="text-sm font-bold text-white flex items-center space-x-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Öğrencilerin Toplam Etüt Katılım Sıralaması</span>
              </h5>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Öğrenci</th>
                      <th className="px-4 py-3 font-semibold">Sınıf</th>
                      <th className="px-4 py-3 font-semibold">Toplam Etüt</th>
                      <th className="px-4 py-3 font-semibold">Farklı Branş</th>
                      <th className="px-4 py-3 font-semibold">Toplam Süre</th>
                      <th className="px-4 py-3 font-semibold text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {allStudentsRanking.map((item) => (
                      <tr key={item.student.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2.5">
                            <img
                              src={
                                item.student.avatar ||
                                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                  item.student.name
                                )}`
                              }
                              alt={item.student.name}
                              className="w-7 h-7 rounded-lg object-cover bg-slate-800"
                            />
                            <div>
                              <div className="font-semibold text-white">{item.student.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                #{item.student.studentNumber}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300">{item.student.className || '-'}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-indigo-400 font-mono">
                          {item.count} Kez
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono">
                          {item.subjectCount} Branş
                        </td>
                        <td className="px-4 py-3 text-emerald-400 font-mono font-medium">
                          {item.duration} dk
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedStudentId(item.student.id)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
                          >
                            Öğrenciyi İncele
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            💡 İpucu: PDF veya Word çıktısı alarak veli görüşmelerinde veya dönem sonu öğrenci gelişim dosyasında kullanabilirsiniz.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
