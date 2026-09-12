import React, { useState } from 'react';
import {
  Video,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  Download,
  Play,
  Eye,
  X,
  Copy,
  Check,
  Film,
  FileSpreadsheet,
} from 'lucide-react';
import { HomeworkResource } from '../../types';

interface HomeworkResourceViewerProps {
  resources?: HomeworkResource[];
  legacyAttachmentUrl?: string;
  isCompact?: boolean;
}

// Utility to parse YouTube Embed URL
function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;
  }
  return null;
}

// Utility to parse Vimeo Embed URL
function getVimeoEmbedUrl(url: string): string | null {
  if (!url) return null;
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  }
  return null;
}

export const HomeworkResourceViewer: React.FC<HomeworkResourceViewerProps> = ({
  resources = [],
  legacyAttachmentUrl,
  isCompact = false,
}) => {
  const [activeVideoModal, setActiveVideoModal] = useState<HomeworkResource | null>(null);
  const [activePdfModal, setActivePdfModal] = useState<HomeworkResource | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Normalize list with legacy attachment if present
  const allResources: HomeworkResource[] = [...resources];
  if (legacyAttachmentUrl && !allResources.some((r) => r.url === legacyAttachmentUrl)) {
    const isPdf = legacyAttachmentUrl.toLowerCase().includes('.pdf');
    allResources.unshift({
      id: 'legacy-att',
      type: isPdf ? 'pdf' : 'link',
      title: isPdf ? 'Ek PDF Dokümanı' : 'Ödev Bağlantısı',
      url: legacyAttachmentUrl,
    });
  }

  if (allResources.length === 0) {
    return null;
  }

  const handleCopy = (res: HomeworkResource, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(res.url);
    setCopiedId(res.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getResourceIcon = (type: HomeworkResource['type']) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4 text-rose-400" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'link':
      default:
        return <LinkIcon className="w-4 h-4 text-blue-400" />;
    }
  };

  const getResourceBadge = (type: HomeworkResource['type']) => {
    switch (type) {
      case 'video':
        return {
          bg: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
          label: 'Video Ders / Kayıt',
        };
      case 'pdf':
        return {
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
          label: 'PDF Dokümanı',
        };
      case 'link':
      default:
        return {
          bg: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
          label: 'Web Linki',
        };
    }
  };

  if (isCompact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {allResources.map((res) => {
          const badge = getResourceBadge(res.type);
          return (
            <button
              key={res.id}
              type="button"
              onClick={() => {
                if (res.type === 'video') setActiveVideoModal(res);
                else if (res.type === 'pdf') setActivePdfModal(res);
                else window.open(res.url, '_blank', 'noopener,noreferrer');
              }}
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all hover:scale-[1.02] ${badge.bg}`}
              title={res.description || res.title}
            >
              {getResourceIcon(res.type)}
              <span className="max-w-[140px] truncate">{res.title}</span>
              {res.type === 'video' ? (
                <Play className="w-3 h-3 ml-0.5 opacity-80" />
              ) : res.type === 'pdf' ? (
                <Eye className="w-3 h-3 ml-0.5 opacity-80" />
              ) : (
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Film className="w-3.5 h-3.5 text-indigo-400" />
          <span>Ödev Materyalleri & Ek Kaynaklar ({allResources.length})</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {allResources.map((res) => {
          const badge = getResourceBadge(res.type);
          return (
            <div
              key={res.id}
              className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-slate-700 transition-all flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`p-2 rounded-lg border ${badge.bg}`}>
                    {getResourceIcon(res.type)}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {res.title}
                    </h5>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">{badge.label}</span>
                      {res.fileSize && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          • {res.fileSize}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleCopy(res, e)}
                  className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
                  title="Bağlantıyı Kopyala"
                >
                  {copiedId === res.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {res.description && (
                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2.5 italic">
                  {res.description}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2 border-t border-slate-800/80">
                {res.type === 'video' && (
                  <button
                    type="button"
                    onClick={() => setActiveVideoModal(res)}
                    className="flex-1 py-1.5 px-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Videoyu İzle</span>
                  </button>
                )}

                {res.type === 'pdf' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActivePdfModal(res)}
                      className="flex-1 py-1.5 px-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>PDF İncele</span>
                    </button>
                    <a
                      href={res.url}
                      download={res.fileName || `${res.title}.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                      title="PDF Dosyasını İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </>
                )}

                {res.type === 'link' && (
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Bağlantıyı Aç</span>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* VIDEO PLAYER MODAL */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
              <div className="flex items-center space-x-2 text-rose-400">
                <Video className="w-5 h-5" />
                <h4 className="font-bold text-white text-sm sm:text-base line-clamp-1">
                  {activeVideoModal.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-black flex items-center justify-center min-h-[300px] max-h-[70vh]">
              {getYouTubeEmbedUrl(activeVideoModal.url) ? (
                <iframe
                  src={getYouTubeEmbedUrl(activeVideoModal.url)!}
                  title={activeVideoModal.title}
                  className="w-full aspect-video rounded-xl shadow-lg border border-slate-800"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : getVimeoEmbedUrl(activeVideoModal.url) ? (
                <iframe
                  src={getVimeoEmbedUrl(activeVideoModal.url)!}
                  title={activeVideoModal.title}
                  className="w-full aspect-video rounded-xl shadow-lg border border-slate-800"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  controls
                  autoPlay
                  className="w-full max-h-[60vh] rounded-xl shadow-lg border border-slate-800"
                  src={activeVideoModal.url}
                >
                  Tarayıcınız video oynatmayı desteklemiyor.
                </video>
              )}
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">{activeVideoModal.description || 'Ödev video anlatımı'}</span>
              <a
                href={activeVideoModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:underline font-medium"
              >
                <span>Harici Sekmede Aç</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PDF VIEWER MODAL */}
      {activePdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="relative w-full max-w-4xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90 flex-shrink-0">
              <div className="flex items-center space-x-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <h4 className="font-bold text-white text-sm sm:text-base line-clamp-1">
                  {activePdfModal.title}
                </h4>
                {activePdfModal.fileSize && (
                  <span className="text-xs text-slate-400 font-mono">({activePdfModal.fileSize})</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={activePdfModal.url}
                  download={activePdfModal.fileName || `${activePdfModal.title}.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF İndir</span>
                </a>
                <button
                  type="button"
                  onClick={() => setActivePdfModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 p-2 relative">
              <iframe
                src={`${activePdfModal.url}#toolbar=1`}
                title={activePdfModal.title}
                className="w-full h-full rounded-xl border border-slate-800 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
