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
  Copy,
  Check,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { HomeworkResource } from '../../types';
import { getSignedFileUrl, isStoredFileUrl, safeBlobMime, safeHttpUrl, storagePathFromUrl } from '../../lib/fileStorage';
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

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
    const mime = safeBlobMime(header.split(';')[0]);
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
const isFileResource = (res: HomeworkResource) => isInlineFile(res.url) || isStoredFileUrl(res.url);
const resourceFileName = (res: HomeworkResource) =>
  res.fileName || `${res.title || 'dosya'}${res.type === 'pdf' ? '.pdf' : ''}`;

// Gösterilecek adres: depo dosyası için imzalı bağlantı, kayıt içi dosya için geçici blob adresi, diğerleri için kendisi
function useViewableUrl(url?: string): { url: string; error: string | null } {
  const [state, setState] = useState<{ url: string; error: string | null }>(() => ({
    url: url && !isInlineFile(url) && !isStoredFileUrl(url) ? safeHttpUrl(url) || '' : '',
    error: null,
  }));
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ url: '', error: null });
      return;
    }
    const storedPath = storagePathFromUrl(url);
    if (storedPath) {
      setState({ url: '', error: null });
      getSignedFileUrl(storedPath)
        .then((signed) => {
          if (!cancelled) setState({ url: signed, error: null });
        })
        .catch((e) => {
          if (!cancelled) setState({ url: '', error: e?.message || 'Dosya açılamadı.' });
        });
      return () => {
        cancelled = true;
      };
    }
    if (!isInlineFile(url)) {
      setState({ url: safeHttpUrl(url) || '', error: null });
      return;
    }
    const blobUrl = dataUrlToBlobUrl(url);
    setState({ url: blobUrl || url, error: null });
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);
  return state;
}

const clickDownloadLink = (href: string, fileName: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// Dosyayı indirir (depo ve kayıt içi dosyalar dahil). Bağlantılar yeni sekmede açılır.
async function downloadResource(res: HomeworkResource) {
  const fileName = resourceFileName(res);
  const storedPath = storagePathFromUrl(res.url);
  if (storedPath) {
    try {
      clickDownloadLink(await getSignedFileUrl(storedPath, fileName), fileName);
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent('app-file-error', { detail: e?.message || 'Dosya indirilemedi.' }));
    }
    return;
  }
  if (!isInlineFile(res.url)) {
    { const safe = safeHttpUrl(res.url); if (safe) window.open(safe, '_blank', 'noopener,noreferrer'); }
    return;
  }
  const blobUrl = dataUrlToBlobUrl(res.url);
  clickDownloadLink(blobUrl || res.url, fileName);
  if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

// Kaynağı yeni sekmede açar (depo dosyaları imzalı bağlantıyla, kayıt içi dosyalar blob adresiyle)
function openResourceInNewTab(res: HomeworkResource) {
  const storedPath = storagePathFromUrl(res.url);
  if (storedPath) {
    // Açılır pencere engellenmesin diye sekme hemen açılır, adres hazır olunca yönlendirilir
    const win = window.open('', '_blank');
    getSignedFileUrl(storedPath)
      .then((signed) => {
        if (win) {
          win.opener = null;
          win.location.href = signed;
        } else {
          window.location.assign(signed);
        }
      })
      .catch((e) => {
        win?.close();
        window.dispatchEvent(new CustomEvent('app-file-error', { detail: e?.message || 'Dosya açılamadı.' }));
      });
    return;
  }
  if (!isInlineFile(res.url)) {
    { const safe = safeHttpUrl(res.url); if (safe) window.open(safe, '_blank', 'noopener,noreferrer'); }
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

// PDF / fotoğraf önizleme penceresi (sayfanın en üstünde açılır)
const FileViewerModal: React.FC<{ res: HomeworkResource; onClose: () => void }> = ({ res, onClose }) => {
  const { url: viewUrl, error } = useViewableUrl(res.url);
  const isImage = res.type === 'image';
  const isExternal = !isFileResource(res);
  const drivePreview = isExternal ? getDrivePreviewUrl(res.url) : null;
  const frameSrc = drivePreview || (viewUrl ? (isExternal ? `${viewUrl}#toolbar=1` : viewUrl) : '');
  const kindLabel = isImage ? 'Fotoğraf' : 'PDF';
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      yukseklik="tam"
      layerClass="z-(--z-pencere-ust)"
      icon={isImage ? ImageIcon : FileText}
      tone="warning"
      title={res.title}
      description={res.fileSize ? `${kindLabel} · ${res.fileSize}` : kindLabel}
      baslikSag={
        <>
          <button type="button" onClick={() => openResourceInNewTab(res)} className="ui-btn ui-btn-secondary ui-btn-sm hidden sm:inline-flex">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Yeni Sekmede Aç</span>
          </button>
          <button type="button" onClick={() => downloadResource(res)} className="ui-btn ui-btn-warning ui-btn-sm">
            <Download className="w-3.5 h-3.5" />
            <span>{kindLabel} İndir</span>
          </button>
        </>
      }
      govdeClass="bg-canvas p-2 relative flex flex-col"
      footer={
        !isImage ? (
          <p className="w-full text-xs text-muted">PDF burada görünmüyorsa (özellikle telefonda) "PDF İndir" ya da "Yeni Sekmede Aç" ile açabilirsiniz.</p>
        ) : undefined
      }
    >
        <div className="flex-1 relative min-h-0">
          {error ? (
            <div role="alert" className="w-full h-full flex items-center justify-center text-sm text-danger-fg text-center p-6">
              {error}
            </div>
          ) : !frameSrc ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted">Yükleniyor…</div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center overflow-auto">
              <img src={frameSrc} alt={res.title} className="max-w-full max-h-full object-contain rounded-xl" />
            </div>
          ) : (
            <iframe src={frameSrc} title={res.title} className="w-full h-full rounded-xl border border-line bg-surface" />
          )}
        </div>
    </Modal>
  );
};

// Video oynatıcı kaynağı (depo dosyası ise imzalı bağlantı alınır)
const StoredVideo: React.FC<{ res: HomeworkResource }> = ({ res }) => {
  const { url, error } = useViewableUrl(res.url);
  if (error) return <div className="text-sm text-danger-fg p-6 text-center">{error}</div>;
  if (!url) return <div className="text-xs text-muted p-6">Yükleniyor…</div>;
  return (
    <video controls autoPlay className="w-full max-h-[60vh] rounded-xl shadow-lg border border-line" src={url}>
      Tarayıcınız video oynatmayı desteklemiyor.
    </video>
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
        return <Video className="w-4 h-4 text-danger-fg" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-warning-fg" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-success-fg" />;
      case 'link':
      default:
        return <LinkIcon className="w-4 h-4 text-info-fg" />;
    }
  };

  const getResourceBadge = (type: HomeworkResource['type']) => {
    switch (type) {
      case 'video':
        return {
          bg: 'bg-danger/10 border-danger/20 text-danger-fg',
          label: 'Video Ders / Kayıt',
        };
      case 'pdf':
        return {
          bg: 'bg-warning/10 border-warning/20 text-warning-fg',
          label: 'PDF Dokümanı',
        };
      case 'image':
        return {
          bg: 'bg-success/10 border-success/20 text-success-fg',
          label: 'Fotoğraf',
        };
      case 'link':
      default:
        return {
          bg: 'bg-info/10 border-info/20 text-info-fg',
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
              <Modal
                open
                onClose={() => setActiveVideoModal(null)}
                size="lg"
                layerClass="z-(--z-pencere-ust)"
                icon={Video}
                tone="danger"
                title={activeVideoModal.title}
                govdeClass="p-0"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{activeVideoModal.description || 'Ödev video anlatımı'}</span>
                    <button type="button" onClick={() => openResourceInNewTab(activeVideoModal)} className="ui-btn ui-btn-ghost ui-btn-sm">
                      <span>Harici Sekmede Aç</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                }
              >
                  <div className="p-4 bg-black flex items-center justify-center min-h-[300px] max-h-[70vh]">
                    {getYouTubeEmbedUrl(activeVideoModal.url) ? (
                      <iframe
                        src={getYouTubeEmbedUrl(activeVideoModal.url)!}
                        title={activeVideoModal.title}
                        className="w-full aspect-video rounded-xl shadow-lg border border-line"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : getVimeoEmbedUrl(activeVideoModal.url) ? (
                      <iframe
                        src={getVimeoEmbedUrl(activeVideoModal.url)!}
                        title={activeVideoModal.title}
                        className="w-full aspect-video rounded-xl shadow-lg border border-line"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <StoredVideo res={activeVideoModal} />
                    )}
                  </div>

              </Modal>
            )}
            {activePdfModal && <FileViewerModal res={activePdfModal} onClose={() => setActivePdfModal(null)} />}
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
                else if (res.type === 'pdf' || res.type === 'image') setActivePdfModal(res);
                else openResourceInNewTab(res);
              }}
              className={`ui-btn ui-btn-sm border ${badge.bg}`}
              title={res.description || res.title}
            >
              {getResourceIcon(res.type)}
              <span className="max-w-[140px] truncate">{res.title}</span>
              {res.type === 'video' ? (
                <Play className="w-3 h-3 ml-0.5 opacity-80" />
              ) : res.type === 'pdf' || res.type === 'image' ? (
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
        <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1.5">
          <Film className="w-3.5 h-3.5 text-brand-fg" />
          <span>Ödev Materyalleri & Ek Kaynaklar ({allResources.length})</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {allResources.map((res) => {
          const badge = getResourceBadge(res.type);
          return (
            <div
              key={res.id}
              className="p-3 bg-canvas/60 border border-line rounded-xl hover:border-line transition flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`p-2 rounded-lg border ${badge.bg}`}>
                    {getResourceIcon(res.type)}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-fg group-hover:text-brand-fg transition-colors line-clamp-1">
                      {res.title}
                    </h5>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-2xs text-muted font-medium">{badge.label}</span>
                      {res.fileSize && (
                        <span className="text-2xs text-muted font-mono">
                          • {res.fileSize}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!isFileResource(res) && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(res, e)}
                    className="p-1 text-muted hover:text-fg-2 hover:bg-surface-2 rounded transition-colors"
                    title="Bağlantıyı Kopyala"
                  >
                    {copiedId === res.id ? (
                      <Check className="w-3.5 h-3.5 text-success-fg" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {res.description && (
                <p className="text-xs text-muted line-clamp-2 mb-2.5 italic">
                  {res.description}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2 border-t border-line">
                {res.type === 'video' && (
                  <button
                    type="button"
                    onClick={() => setActiveVideoModal(res)}
                    className="ui-btn ui-btn-sm bg-danger/20 hover:bg-danger/30 text-danger-fg border border-danger/30 min-w-24"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Videoyu İzle</span>
                  </button>
                )}

                {(res.type === 'pdf' || res.type === 'image') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActivePdfModal(res)}
                      className="ui-btn ui-btn-sm bg-warning/20 hover:bg-warning/30 text-warning-fg border border-warning/30 min-w-24"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{res.type === 'image' ? 'Fotoğrafı Gör' : 'PDF İncele'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadResource(res)}
                      className="ui-btn ui-btn-secondary ui-btn-icon"
                      title="Dosyayı İndir"
                      aria-label="Dosyayı İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {res.type === 'link' && (
                  <a
                    href={safeHttpUrl(res.url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1 px-2.5 bg-info/20 hover:bg-info/30 text-info-fg border border-info/30 rounded-lg text-xs font-semibold transition inline-flex items-center justify-center space-x-1.5"
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
