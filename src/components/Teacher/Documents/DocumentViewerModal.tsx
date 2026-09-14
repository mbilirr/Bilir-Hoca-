import React, { useState } from 'react';
import {
  X,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  FileCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Search,
  Calendar,
  User,
  Tag,
  BookOpen,
} from 'lucide-react';
import { TeacherDocument } from '../../../types';

interface DocumentViewerModalProps {
  document: TeacherDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: TeacherDocument) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  isOpen,
  onClose,
  onDownload,
}) => {
  if (!isOpen || !document) return null;

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetSearchQuery, setSheetSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const formatConfig = {
    pdf: {
      label: 'PDF Belgesi',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      icon: FileText,
      iconColor: 'text-rose-400',
    },
    docx: {
      label: 'Word Belgesi (.docx)',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: FileText,
      iconColor: 'text-blue-400',
    },
    xlsx: {
      label: 'Excel Çalışma Kitabı (.xlsx)',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: FileSpreadsheet,
      iconColor: 'text-emerald-400',
    },
  }[document.fileFormat] || {
    label: 'Belge',
    badgeColor: 'bg-slate-700 text-slate-300 border-slate-600',
    icon: FileCode,
    iconColor: 'text-slate-400',
  };

  const FormatIcon = formatConfig.icon;

  const handlePrint = () => {
    window.print();
  };

  // Helper for Excel column names (A, B, C...)
  const getColumnLetter = (colIdx: number): string => {
    let temp = '';
    let letter = '';
    while (colIdx >= 0) {
      temp = String.fromCharCode((colIdx % 26) + 65);
      letter = temp + letter;
      colIdx = Math.floor(colIdx / 26) - 1;
    }
    return letter;
  };

  const currentSheet = document.tableSheets?.[activeSheetIndex];
  const filteredRows = currentSheet
    ? currentSheet.rows.filter((row, rIdx) => {
        if (rIdx === 0) return true; // Keep headers
        if (!sheetSearchQuery.trim()) return true;
        return row.some((cell) =>
          String(cell).toLowerCase().includes(sheetSearchQuery.toLowerCase())
        );
      })
    : [];

  return (
    <div
      id="document-viewer-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 md:p-6 flex items-start sm:items-center justify-center animate-in fade-in duration-200"
    >
      <div
        className={`relative my-auto bg-slate-900 border border-slate-700 rounded-2xl flex flex-col shadow-2xl transition-all duration-300 ${
          isFullScreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-6xl max-h-[92vh] h-[90vh]'
        }`}
      >
        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className={`p-2 rounded-xl bg-slate-800/80 border border-slate-700 ${formatConfig.iconColor}`}>
              <FormatIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${formatConfig.badgeColor}`}>
                  {document.fileFormat.toUpperCase()}
                </span>
                <span className="text-xs text-slate-400">
                  {document.subject} • {document.academicYear || '2026-2027'}
                </span>
              </div>
              <h2 className="text-base font-bold text-white truncate max-w-lg sm:max-w-xl">
                {document.title}
              </h2>
            </div>
          </div>

          {/* Actions Toolbar */}
          <div className="flex items-center space-x-2">
            {/* Zoom Controls for PDF / Word */}
            {(document.fileFormat === 'docx' || document.fileFormat === 'pdf') && (
              <div className="hidden sm:flex items-center space-x-1 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700 text-xs text-slate-300">
                <button
                  onClick={() => setZoomLevel((prev) => Math.max(70, prev - 15))}
                  className="p-1 hover:text-white rounded"
                  title="Küçült"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center font-mono font-medium">%{zoomLevel}</span>
                <button
                  onClick={() => setZoomLevel((prev) => Math.min(150, prev + 15))}
                  className="p-1 hover:text-white rounded"
                  title="Büyüt"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors text-xs flex items-center space-x-1.5"
              title="Yazdır"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden md:inline">Yazdır</span>
            </button>

            {/* Download Button */}
            <button
              onClick={() => onDownload(document)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/20"
              title="Orijinal Dosyayı İndir"
            >
              <Download className="w-4 h-4" />
              <span>İndir ({document.fileSize})</span>
            </button>

            {/* FullScreen Toggle */}
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
              title={isFullScreen ? 'Küçült' : 'Tam Ekran'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700 transition-colors"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* METADATA SUB-BAR */}
        <div className="px-5 py-2 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Yükleyen: {document.uploadedBy}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {new Date(document.uploadedAt).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </span>
            {document.gradeLevel && (
              <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px]">
                {document.gradeLevel}
              </span>
            )}
          </div>

          {document.tags && document.tags.length > 0 && (
            <div className="flex items-center space-x-1.5">
              <Tag className="w-3 h-3 text-slate-500" />
              {document.tags.map((tag, i) => (
                <span
                  key={i}
                  className="bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-700/60"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* EXCEL SHEET SELECTOR & SEARCH BAR (if excel) */}
        {document.fileFormat === 'xlsx' && document.tableSheets && document.tableSheets.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Sheet Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <span className="text-xs text-slate-400 font-medium mr-1 flex items-center space-x-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sayfalar:</span>
              </span>
              {document.tableSheets.map((sheet, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => {
                    setActiveSheetIndex(sIdx);
                    setSheetSearchQuery('');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeSheetIndex === sIdx
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>

            {/* Sheet Search Filter */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={sheetSearchQuery}
                onChange={(e) => setSheetSearchQuery(e.target.value)}
                placeholder="Tabloda ara..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* DOCUMENT VIEWPORT CONTENT */}
        <div className="flex-1 overflow-auto bg-slate-950 p-3 sm:p-6 flex justify-center">
          {/* 1. EXCEL TABLE VIEWER */}
          {document.fileFormat === 'xlsx' && (
            <div className="w-full h-full bg-slate-900 rounded-xl border border-slate-800 overflow-auto flex flex-col shadow-inner">
              {currentSheet && filteredRows.length > 0 ? (
                <div className="overflow-auto flex-1">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      {/* Column letters row */}
                      <tr className="bg-slate-950/80 sticky top-0 z-20 border-b border-slate-800 text-slate-500 font-mono text-[10px]">
                        <th className="w-12 text-center py-2 px-2 border-r border-slate-800 bg-slate-950">#</th>
                        {filteredRows[0]?.map((_, colIdx) => (
                          <th
                            key={colIdx}
                            className="py-2 px-3 border-r border-slate-800/80 bg-slate-950 uppercase font-semibold"
                          >
                            {getColumnLetter(colIdx)}
                          </th>
                        ))}
                      </tr>

                      {/* Actual Table Header (First row) */}
                      <tr className="bg-slate-800/90 text-slate-200 font-bold sticky top-7 z-10 border-b-2 border-slate-700 shadow-sm">
                        <th className="py-2.5 px-2 text-center text-slate-400 border-r border-slate-700 font-mono bg-slate-800">
                          1
                        </th>
                        {filteredRows[0]?.map((headerCell, colIdx) => (
                          <th
                            key={colIdx}
                            className="py-2.5 px-3 border-r border-slate-700 whitespace-nowrap text-indigo-300"
                          >
                            {String(headerCell)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {filteredRows.slice(1).map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-indigo-950/20 transition-colors group"
                        >
                          <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-800 font-mono text-[10px] bg-slate-950/40 select-none">
                            {rIdx + 2}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-2 px-3 border-r border-slate-800/60 text-slate-300 group-hover:text-white text-xs align-top"
                            >
                              {cIdx === 3 && String(cell).startsWith('M.') ? (
                                <span className="bg-indigo-500/20 text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-indigo-500/30">
                                  {String(cell)}
                                </span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
                  <FileSpreadsheet className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-sm font-medium">Bu sayfada gösterilecek veri bulunamadı.</p>
                  {sheetSearchQuery && (
                    <button
                      onClick={() => setSheetSearchQuery('')}
                      className="mt-2 text-xs text-indigo-400 hover:underline"
                    >
                      Aramayı Temizle
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. WORD (DOCX) DOCUMENT VIEWER (High fidelity paper page layout) */}
          {document.fileFormat === 'docx' && (
            <div
              className="transition-transform origin-top w-full flex justify-center"
              style={{ transform: `scale(${zoomLevel / 100})` }}
            >
              <div className="w-full max-w-4xl bg-white text-slate-900 rounded-lg shadow-2xl p-8 sm:p-14 border border-slate-200 min-h-[800px] leading-relaxed">
                {document.htmlPreview ? (
                  <div
                    className="prose prose-slate max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: document.htmlPreview }}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="border-b pb-4 text-center">
                      <h1 className="text-xl font-bold text-slate-900">{document.title}</h1>
                      <p className="text-sm text-slate-500">{document.subject} • {document.academicYear}</p>
                    </div>
                    <p className="text-sm text-slate-700">{document.description}</p>
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                      Belge içeriği indirilerek Microsoft Word veya LibreOffice üzerinde tam formatıyla düzenlenebilir.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. PDF DOCUMENT VIEWER */}
          {document.fileFormat === 'pdf' && (
            <div className="w-full h-full flex flex-col items-center">
              {document.fileData && document.fileData.startsWith('data:application/pdf') ? (
                <iframe
                  src={document.fileData}
                  className="w-full h-full rounded-xl border border-slate-800 bg-white"
                  title={document.title}
                />
              ) : document.htmlPreview ? (
                // Pristine high-contrast PDF paper simulation with MEB Header and Question breakdown
                <div
                  className="transition-transform origin-top w-full flex justify-center"
                  style={{ transform: `scale(${zoomLevel / 100})` }}
                >
                  <div className="w-full max-w-4xl bg-white text-slate-900 rounded-lg shadow-2xl p-8 sm:p-12 border border-slate-300 min-h-[850px] relative">
                    <div
                      dangerouslySetInnerHTML={{ __html: document.htmlPreview }}
                    />
                    <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-400">
                      <span>{document.title}</span>
                      <span>Sayfa 1 / 1</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <FileText className="w-16 h-16 text-rose-400 mb-3" />
                  <p className="text-sm font-semibold text-white mb-1">{document.title}</p>
                  <p className="text-xs text-slate-400 mb-4">{document.fileSize} • PDF Formatı</p>
                  <button
                    onClick={() => onDownload(document)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>PDF Olarak İndir</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="hidden sm:inline">Belge Sayfaya Uyumlu Güvenli Önizleme Modunda Açıldı</span>
            <span className="sm:hidden text-white font-medium truncate max-w-[180px]">{document.fileName}</span>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* SAYFA ALTINDA İNDİR BUTONU */}
            <button
              type="button"
              onClick={() => onDownload(document)}
              id="btn-download-doc-modal-footer"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md shadow-indigo-600/30 transition-all cursor-pointer hover:scale-105"
              title="Belgeyi Bilgisayara İndir"
            >
              <Download className="w-4 h-4" />
              <span>Belgeyi İndir ({document.fileFormat.toUpperCase()})</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Pencereyi Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
