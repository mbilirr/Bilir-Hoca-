import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

// Google Drive "görüntüle" bağlantısını sayfa içinde açılabilen önizleme bağlantısına çevirir
function getDrivePreviewUrl(url: string): string | null {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

// Kayıt içinde saklanan dosyalar (data:...) tarayıcıda doğrudan açılamaz; geçici dosya adresine (blob) çevrilir.
function dataUrlToBlobUrl(url: string): string | null {
  try {
    const comma = url.indexOf(',');
    if (!url.startsWith('data:') || comma < 0) return null;
    const header = url.slice(5, comma);
    const mime = header.split(';')[0] || 'application/octet-stream';
    const payload = url.slice(comma + 1);
    let bytes: Uint8Array;
    if (header.includes(';base64')) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}

const isInlineFile = (url?: string) => !!url && url.startsWith('data:');

// Gösterilecek adres: kayıt içi dosyalar için geçici blob adresi, diğerleri için kendisi
function useViewableUrl(url?: string): string {
  const [viewUrl, setViewUrl] = useState<string>(() => (url && !isInlineFile(url) ? url : ''));
  useEffect(() => {
    if (!url) {
      setViewUrl('');
      return;
    }
    if (!isInlineFile(url)) {
      setViewUrl(url);
      return;
    }
    const blobUrl = dataUrlToBlobUrl(url);
    setViewUrl(blobUrl || url);
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);
  return viewUrl;
}

// Dosyayı indirir (kayıt içi dosyalar dahil). Başarısız olursa yeni sekmede açmayı dener.
function downloadResource(res: HomeworkResource) {
  const fileName = res.fileName || `${res.title || 'dosya'}${res.type === 'pdf' ? '.pdf' : ''}`;
  if (!isInlineFile(res.url)) {
    window.open(res.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const blobUrl = dataUrlToBlobUrl(res.url);
  const a = document.createElement('a');
  a.href = blobUrl || res.url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

// Bağlantıyı yeni sekmede açar (kayıt içi dosyalar blob adresiyle açılır)
function openResourceInNewTab(res: HomeworkResource) {
  if (!isInlineFile(res.url)) {
    window.open(res.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const blobUrl = dataUrlToBlobUrl(res.url);
  if (blobUrl) {
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60_000);
  } else {
    downloadResource(res);
  }
}

// PDF önizleme penceresi (sayfanın en üstünde açılır)
const PdfViewerModal: React.FC<{ res: HomeworkResource; onClose: () => void }> = ({ res, onClose }) => {
  const viewUrl = useViewableUrl(res.url);
  const drivePreview = !isInlineFile(res.url) ? getDrivePreviewUrl(res.url) : null;
  const frameSrc = drivePreview || (viewUrl ? (isInlineFile(res.url) ? viewUrl : `${viewUrl}#toolbar=1`) : '');
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-slate-800 bg-slate-900/90 flex-shrink-0">
          <div className="flex items-center space-x-2 text-amber-400 min-w-0">
            <FileText className="w-5 h-5 shrink-0" />
            <h4 className="font-bold text-white text-sm sm:text-base truncate">{res.title}</h4>
            {res.fileSize && <span className="text-xs text-slate-400 font-mono shrink-0">({res.fileSize})</span>}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => openResourceInNewTab(res)}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Yeni Sekmede Aç</span>
            </button>
            <button
              type="button"
              onClick={() => downloadResource(res)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF İndir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-950 p-2 relative">
          {frameSrc ? (
            <iframe src={frameSrc} title={res.title} className="w-full h-full rounded-xl border border-slate-800 bg-white" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Yükleniyor…</div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-800 text-[11px] text-slate-400 flex-shrink-0">
          PDF burada görünmüyorsa (özellikle telefonda) "PDF İndir" ya da "Yeni Sekmede Aç" ile açabilirsiniz.
        </div>
      </div>
    </div>
  );
};

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

  // Video / PDF pencereleri sayfanın en üstünde (body altında) açılır; başka bir pencerenin içinde de doğru görünür.
  const viewerModals =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {activeVideoModal && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
                onClick={() => setActiveVideoModal(null)}
              >
                <div
                  className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
                    <div className="flex items-center space-x-2 text-rose-400 min-w-0">
                      <Video className="w-5 h-5 shrink-0" />
                      <h4 className="font-bold text-white text-sm sm:text-base truncate">{activeVideoModal.title}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveVideoModal(null)}
                      aria-label="Kapat"
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

                  <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{activeVideoModal.description || 'Ödev video anlatımı'}</span>
                    <button
                      type="button"
                      onClick={() => openResourceInNewTab(activeVideoModal)}
                      className="flex items-center space-x-1 text-xs text-indigo-400 hover:underline font-medium shrink-0"
                    >
                      <span>Harici Sekmede Aç</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activePdfModal && <PdfViewerModal res={activePdfModal} onClose={() => setActivePdfModal(null)} />}
          </>,
          document.body
        )
      : null;

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
                else openResourceInNewTab(res);
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
        {viewerModals}
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
                    <button
                      type="button"
                      onClick={() => downloadResource(res)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                      title="PDF Dosyasını İndir"
                      aria-label="PDF Dosyasını İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
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

      {viewerModals}
    </div>
  );
};
