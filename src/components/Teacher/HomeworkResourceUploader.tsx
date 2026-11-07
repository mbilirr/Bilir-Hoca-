import React, { useState, useRef, useEffect } from 'react';
import { Video, FileText, Image as ImageIcon, Plus, Trash2, UploadCloud, AlertCircle, Globe } from 'lucide-react';
import { HomeworkResource, HomeworkResourceType } from '../../types';
import { uploadFile, removeStoredFiles, storagePathFromUrl, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, UPLOAD_LIMIT_MESSAGE } from '../../lib/fileStorage';
import { newId } from '../../lib/ids';
import { Segmented, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact'; // Aşama 186

interface HomeworkResourceUploaderProps {
  resources: HomeworkResource[];
  onChange: (resources: HomeworkResource[]) => void;
  // Yazılmış ama "Ekle"ye basılmamış bağlantıyı üst bileşene bildirir; kaydederken kaybolmasın diye eklenir.
  onPendingChange?: (pending: HomeworkResource | null) => void;
  // Verilirse dosyalar bu depo klasörüne yüklenir (ör. "odev/<ödev id>" veya "teslim/<ödev id>/<öğrenci id>").
  // Verilmezse eski yöntemle (kayıt içine, en fazla 1 MB) eklenir.
  storageFolder?: string;
  // Dosya yüklenirken true olur; üst bileşen "Kaydet"i bu sürede kapatır.
  onBusyChange?: (busy: boolean) => void;
}

// Depo klasörü verilmezse (eski yöntem) dosyalar kayıt satırının içinde saklanır; bu durumda en fazla 1 MB.
export const MAX_RESOURCE_FILE_BYTES = 1024 * 1024;
const INLINE_FILE_LIMIT_MESSAGE =
  'Dosya 1 MB sınırını aşıyor. Büyük videoları YouTube, büyük PDF\'leri Google Drive bağlantısı olarak ekleyebilirsiniz.';

const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : 'https://' + url);

export const HomeworkResourceUploader: React.FC<HomeworkResourceUploaderProps> = ({
  resources,
  onChange,
  onPendingChange,
  storageFolder,
  onBusyChange,
}) => {
  const [activeTab, setActiveTab] = useState<HomeworkResourceType>('video');
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  // Bu pencere açıkken depoya yüklenen dosyalar (kaydetmeden kaldırılırsa depodan da silinir)
  const sessionUploadsRef = useRef<Set<string>>(new Set());
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const maxFileBytes = storageFolder ? MAX_UPLOAD_BYTES : MAX_RESOURCE_FILE_BYTES;
  const maxFileLabel = storageFolder ? MAX_UPLOAD_LABEL : '1 MB';
  const fileLimitMessage = storageFolder ? UPLOAD_LIMIT_MESSAGE : INLINE_FILE_LIMIT_MESSAGE;

  useEffect(() => {
    onBusyChange?.(!!uploadingName);
  }, [uploadingName, onBusyChange]);

  // Dosyayı depoya yükleyip listeye ekler
  const uploadToStorage = async (file: File, type: 'video' | 'pdf' | 'image', title: string, description: string) => {
    if (!storageFolder) return;
    setUploadingName(file.name);
    setErrorMessage(null);
    try {
      const up = await uploadFile(storageFolder, file);
      sessionUploadsRef.current.add(up.path);
      const newResource: HomeworkResource = {
        id: newId('res'),
        type,
        title,
        url: up.url,
        fileSize: up.fileSize,
        fileName: file.name,
        description: description || `${file.name} (${up.fileSize})`,
      };
      // Yükleme sürerken liste değişmiş olabilir: en güncel listeye eklenir
      onChange([...resourcesRef.current, newResource]);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Dosya yüklenemedi.');
    } finally {
      setUploadingName(null);
    }
  };

  // Video Form
  // Aşama 186: kaynak türü seçimi kalktı; bağlantı kutusu ve "Dosya yükle" düğmesi aynı satırda.
  // Yazılıp eklenmemiş bağlantı (pending) her zaman bağlantı kutusundan okunur.
  const videoSourceType = 'url' as 'url' | 'file';
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Link Form
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  // PDF Form
  const pdfSourceType = 'url' as 'file' | 'url';
  const [pdfFileUrl, setPdfFileUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfFileSize, setPdfFileSize] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfDescription, setPdfDescription] = useState('');
  const [pdfOnlineUrl, setPdfOnlineUrl] = useState('');
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Video File Upload Handler
  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('Lütfen geçerli bir video dosyası (MP4, WebM vb.) seçin.');
      return;
    }

    if (file.size > maxFileBytes) {
      setErrorMessage(fileLimitMessage);
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
      return;
    }

    if (storageFolder) {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      const title = videoTitle.trim() || cleanTitle;
      const description = videoDescription.trim();
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
      uploadToStorage(file, 'video', title, description).then(() => {
        setVideoTitle('');
        setVideoDescription('');
        setVideoUrl('');
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const sizeStr = formatBytes(file.size);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

      const newResource: HomeworkResource = {
        id: newId('res'),
        type: 'video',
        title: videoTitle.trim() || cleanTitle,
        url: dataUrl,
        fileSize: sizeStr,
        fileName: file.name,
        description: videoDescription.trim() || `${file.name} (${sizeStr})`,
      };

      onChange([...resources, newResource]);
      setVideoTitle('');
      setVideoDescription('');
      setVideoUrl('');
      setErrorMessage(null);
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  // Add Video from URL
  const handleAddVideoUrl = () => {
    if (!videoUrl.trim()) {
      setErrorMessage('Lütfen bir video linki (YouTube, Vimeo veya doğrudan video URL) girin.');
      return;
    }

    let defaultTitle = 'Ders Anlatım Videosu';
    if (videoUrl.includes('youtube') || videoUrl.includes('youtu.be')) {
      defaultTitle = 'YouTube Konu Anlatımı';
    } else if (videoUrl.includes('vimeo')) {
      defaultTitle = 'Vimeo Video Dersi';
    }

    const newResource: HomeworkResource = {
      id: newId('res'),
      type: 'video',
      title: videoTitle.trim() || defaultTitle,
      url: videoUrl.trim(),
      description: videoDescription.trim() || undefined,
    };

    onChange([...resources, newResource]);
    setVideoUrl('');
    setVideoTitle('');
    setVideoDescription('');
    setErrorMessage(null);
  };

  // Add Internet Link
  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      setErrorMessage('Lütfen geçerli bir internet bağlantı URL adresi girin.');
      return;
    }

    let formattedUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    let cleanTitle = linkTitle.trim();
    if (!cleanTitle) {
      try {
        const domain = new URL(formattedUrl).hostname.replace('www.', '');
        cleanTitle = `${domain} Kaynağı`;
      } catch (e) {
        cleanTitle = 'İnternet Bağlantısı';
      }
    }

    const newResource: HomeworkResource = {
      id: newId('res'),
      type: 'link',
      title: cleanTitle,
      url: formattedUrl,
      description: linkDescription.trim() || undefined,
    };

    onChange([...resources, newResource]);
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setErrorMessage(null);
  };

  // PDF File Upload Handler
  const handlePdfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = !!storageFolder && (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name));
    if (!isImage && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage(
        storageFolder
          ? 'Lütfen PDF (.pdf) ya da fotoğraf (JPG, PNG) seçin.'
          : 'Lütfen sadece PDF formatında (.pdf) bir belge seçin.'
      );
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
      return;
    }

    if (file.size > maxFileBytes) {
      setErrorMessage(fileLimitMessage);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
      return;
    }

    if (storageFolder) {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      const title = pdfTitle.trim() || cleanTitle;
      const description = pdfDescription.trim();
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
      uploadToStorage(file, isImage ? 'image' : 'pdf', title, description).then(() => {
        setPdfTitle('');
        setPdfDescription('');
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const sizeStr = formatBytes(file.size);
      const cleanTitle = file.name.replace(/\.pdf$/i, '');

      const newResource: HomeworkResource = {
        id: newId('res'),
        type: 'pdf',
        title: pdfTitle.trim() || cleanTitle,
        url: dataUrl,
        fileSize: sizeStr,
        fileName: file.name,
        description: pdfDescription.trim() || `${file.name} (${sizeStr})`,
      };

      onChange([...resources, newResource]);
      setPdfTitle('');
      setPdfDescription('');
      setErrorMessage(null);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  // Add Online PDF from URL
  const handleAddPdfUrl = () => {
    if (!pdfOnlineUrl.trim()) {
      setErrorMessage('Lütfen geçerli bir online PDF bağlantısı girin.');
      return;
    }

    let formattedUrl = pdfOnlineUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newResource: HomeworkResource = {
      id: newId('res'),
      type: 'pdf',
      title: pdfTitle.trim() || 'Online PDF Çalışma Fasikülü',
      url: formattedUrl,
      description: pdfDescription.trim() || undefined,
    };

    onChange([...resources, newResource]);
    setPdfOnlineUrl('');
    setPdfTitle('');
    setPdfDescription('');
    setErrorMessage(null);
  };

  const handleRemoveResource = (id: string) => {
    const removed = resources.find((r) => r.id === id);
    onChange(resources.filter((r) => r.id !== id));
    // Bu pencerede yüklenip henüz kaydedilmemiş dosya kaldırılırsa depodan da silinir
    const path = storagePathFromUrl(removed?.url);
    if (path && sessionUploadsRef.current.has(path)) {
      sessionUploadsRef.current.delete(path);
      removeStoredFiles([path]);
    }
  };

  // Kutuya yazılmış ama henüz eklenmemiş bağlantı (kaydet'e basılınca otomatik eklenir)
  useEffect(() => {
    if (!onPendingChange) return;
    let pending: HomeworkResource | null = null;
    if (activeTab === 'video' && videoSourceType === 'url' && videoUrl.trim()) {
      pending = {
        id: `res-pending-video`,
        type: 'video',
        title: videoTitle.trim() || 'Ders Anlatım Videosu',
        url: videoUrl.trim(),
        description: videoDescription.trim() || undefined,
      };
    } else if (activeTab === 'link' && linkUrl.trim()) {
      const url = withProtocol(linkUrl.trim());
      let title = linkTitle.trim();
      if (!title) {
        try {
          title = `${new URL(url).hostname.replace('www.', '')} Kaynağı`;
        } catch {
          title = 'İnternet Bağlantısı';
        }
      }
      pending = { id: `res-pending-link`, type: 'link', title, url, description: linkDescription.trim() || undefined };
    } else if (activeTab === 'pdf' && pdfSourceType === 'url' && pdfOnlineUrl.trim()) {
      pending = {
        id: `res-pending-pdf`,
        type: 'pdf',
        title: pdfTitle.trim() || 'Online PDF Çalışma Fasikülü',
        url: withProtocol(pdfOnlineUrl.trim()),
        description: pdfDescription.trim() || undefined,
      };
    }
    onPendingChange(pending);
  }, [
    onPendingChange, activeTab, videoSourceType, videoUrl, videoTitle, videoDescription,
    linkUrl, linkTitle, linkDescription, pdfSourceType, pdfOnlineUrl, pdfTitle, pdfDescription,
  ]);

  // ===== Aşama 186: sade görünüm. Ekleme / yükleme / kaldırma işleyişi aynen yukarıdaki işlevlerle çalışır. =====
  const fieldCls =
    'h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-xs text-fg placeholder:text-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const tab: 'video' | 'link' | 'pdf' = activeTab === 'video' || activeTab === 'link' ? activeTab : 'pdf';
  const cur =
    tab === 'video'
      ? {
          url: videoUrl, setUrl: setVideoUrl, title: videoTitle, setTitle: setVideoTitle, note: videoDescription, setNote: setVideoDescription,
          add: handleAddVideoUrl, placeholder: 'YouTube ya da video bağlantısı (https://…)', fileLabel: 'Video yükle',
          openFile: () => videoFileInputRef.current?.click(),
          fileInfo: `MP4 ya da WebM, en fazla ${maxFileLabel}. Büyük videolar için YouTube bağlantısı ekleyin.`,
        }
      : tab === 'link'
      ? {
          url: linkUrl, setUrl: setLinkUrl, title: linkTitle, setTitle: setLinkTitle, note: linkDescription, setNote: setLinkDescription,
          add: handleAddLink, placeholder: 'Web sitesi bağlantısı (https://…)', fileLabel: '', openFile: null as null | (() => void), fileInfo: '',
        }
      : {
          url: pdfOnlineUrl, setUrl: setPdfOnlineUrl, title: pdfTitle, setTitle: setPdfTitle, note: pdfDescription, setNote: setPdfDescription,
          add: handleAddPdfUrl, placeholder: 'PDF ya da Google Drive bağlantısı (https://…)',
          fileLabel: storageFolder ? 'PDF / fotoğraf yükle' : 'PDF yükle',
          openFile: () => pdfFileInputRef.current?.click(),
          fileInfo: `${storageFolder ? 'PDF ya da fotoğraf (JPG, PNG)' : 'PDF'}, en fazla ${maxFileLabel}. Büyük dosyalar için Google Drive bağlantısı ekleyin.`,
        };
  const kindOf = (r: HomeworkResource) =>
    r.type === 'video'
      ? { Icon: Video, label: 'Video', tone: 'text-danger-fg' }
      : r.type === 'image'
      ? { Icon: ImageIcon, label: 'Fotoğraf', tone: 'text-warning-fg' }
      : r.type === 'pdf'
      ? { Icon: FileText, label: 'PDF', tone: 'text-warning-fg' }
      : { Icon: Globe, label: 'Bağlantı', tone: 'text-info-fg' };

  return (
    <div className="space-y-2.5">
      {/* Eklenen materyaller */}
      {resources.length > 0 && (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto" aria-label="Eklenen materyaller">
          {resources.map((res, index) => {
            const k = kindOf(res);
            return (
              <li key={res.id || index} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                <k.Icon className={cx('w-4 h-4 shrink-0', k.tone)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-fg truncate">{res.title}</p>
                  {res.description && <p className="text-[11px] text-muted truncate">{res.description}</p>}
                </div>
                <span className="ui-chip ui-chip-neutral shrink-0">
                  {k.label}
                  {res.fileSize ? ` · ${res.fileSize}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveResource(res.id)}
                  className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon shrink-0 hover:text-danger-fg"
                  title="Bu materyali kaldır"
                  aria-label={`${res.title} materyalini kaldır`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft text-danger-fg px-2.5 py-1.5 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0">{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="ui-btn ui-btn-ghost ui-btn-sm shrink-0">
            Tamam
          </button>
        </div>
      )}

      {uploadingName && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-info-soft text-info-fg px-2.5 py-1.5 text-xs">
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="truncate">"{uploadingName}" yükleniyor…</span>
        </div>
      )}

      {/* Ekleme alanı: tür seçimi, tek satırda bağlantı + Ekle + Dosya yükle, altında isteğe bağlı başlık ve not */}
      <div className="rounded-xl border border-line bg-surface-2/40 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={tab}
            onChange={(v) => {
              setActiveTab(v);
              setErrorMessage(null);
            }}
            items={[
              { value: 'video', label: 'Video', icon: Video },
              { value: 'link', label: 'Bağlantı', icon: Globe },
              { value: 'pdf', label: storageFolder ? 'PDF / Fotoğraf' : 'PDF', icon: FileText },
            ]}
          />
          {resources.length > 0 && <span className="ml-auto ui-chip ui-chip-brand">{resources.length} materyal</span>}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input
            type="text"
            inputMode="url"
            aria-label="Bağlantı"
            placeholder={cur.placeholder}
            value={cur.url}
            onChange={(e) => cur.setUrl(e.target.value)}
            onKeyDown={(e) => {
              // Enter formu göndermez; bağlantıyı listeye ekler
              if (e.key === 'Enter') {
                e.preventDefault();
                if (cur.url.trim()) cur.add();
              }
            }}
            className={cx(fieldCls, 'flex-1 basis-full sm:basis-auto')}
          />
          <button type="button" onClick={cur.add} disabled={!cur.url.trim()} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-24 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            Ekle
          </button>
          {cur.openFile && (
            <>
              <span className="text-[11px] text-subtle shrink-0">ya da</span>
              <button
                type="button"
                onClick={cur.openFile}
                disabled={!!uploadingName}
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 shrink-0"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {cur.fileLabel}
              </button>
              <InfoTip text={cur.fileInfo} />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            aria-label="Başlık"
            placeholder="Başlık (isteğe bağlı)"
            value={cur.title}
            onChange={(e) => cur.setTitle(e.target.value)}
            className={fieldCls}
          />
          <input
            type="text"
            aria-label="Not"
            placeholder="Not (isteğe bağlı)"
            value={cur.note}
            onChange={(e) => cur.setNote(e.target.value)}
            className={fieldCls}
          />
        </div>

        {/* Gizli dosya seçicileri (işleyiş aynı) */}
        <input
          type="file"
          ref={videoFileInputRef}
          onChange={handleVideoFileUpload}
          accept="video/mp4,video/webm,video/ogg,video/quicktime"
          className="hidden"
        />
        <input
          type="file"
          ref={pdfFileInputRef}
          onChange={handlePdfFileUpload}
          accept={storageFolder ? 'application/pdf,.pdf,image/*' : 'application/pdf,.pdf'}
          className="hidden"
        />
      </div>
    </div>
  );
};
