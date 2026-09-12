import React, { useState, useRef } from 'react';
import {
  Video,
  FileText,
  Link as LinkIcon,
  Plus,
  Trash2,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Film,
  Globe,
  Sparkles,
  FileUp,
} from 'lucide-react';
import { HomeworkResource, HomeworkResourceType } from '../../types';

interface HomeworkResourceUploaderProps {
  resources: HomeworkResource[];
  onChange: (resources: HomeworkResource[]) => void;
}

export const HomeworkResourceUploader: React.FC<HomeworkResourceUploaderProps> = ({
  resources,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<HomeworkResourceType>('video');

  // Video Form
  const [videoSourceType, setVideoSourceType] = useState<'url' | 'file'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Link Form
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  // PDF Form
  const [pdfSourceType, setPdfSourceType] = useState<'file' | 'url'>('file');
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

  // Helper for quick presets
  const handleApplyPresetLink = (preset: { title: string; url: string; desc: string }) => {
    setLinkTitle(preset.title);
    setLinkUrl(preset.url);
    setLinkDescription(preset.desc);
  };

  // Video File Upload Handler
  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('Lütfen geçerli bir video dosyası (MP4, WebM vb.) seçin.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('Video dosya boyutu 50MB sınırını aşamaz. Büyük videolar için YouTube bağlantısı ekleyebilirsiniz.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const sizeStr = formatBytes(file.size);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

      const newResource: HomeworkResource = {
        id: `res-${Date.now()}`,
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
      id: `res-${Date.now()}`,
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
      id: `res-${Date.now()}`,
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

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Lütfen sadece PDF formatında (.pdf) bir belge seçin.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('PDF dosya boyutu 25MB sınırını aşamaz.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const sizeStr = formatBytes(file.size);
      const cleanTitle = file.name.replace(/\.pdf$/i, '');

      const newResource: HomeworkResource = {
        id: `res-${Date.now()}`,
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
      id: `res-${Date.now()}`,
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
    onChange(resources.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
            <Film className="w-4 h-4 text-indigo-400" />
            <span>Ödev Materyalleri (Video, Link, PDF)</span>
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Öğrencilerin ödevi yaparken faydalanacağı video dersleri, kaynak linkleri ve PDF testlerini ekleyin.
          </p>
        </div>

        {resources.length > 0 && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {resources.length} Materyal Eklendi
          </span>
        )}
      </div>

      {/* Error notification if any */}
      {errorMessage && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-rose-400 hover:text-rose-200"
          >
            Tamam
          </button>
        </div>
      )}

      {/* Type Tabs */}
      <div className="flex space-x-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setActiveTab('video');
            setErrorMessage(null);
          }}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
            activeTab === 'video'
              ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>1. Video Ekle</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('link');
            setErrorMessage(null);
          }}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
            activeTab === 'link'
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>2. İnternet Linki</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('pdf');
            setErrorMessage(null);
          }}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
            activeTab === 'pdf'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>3. PDF Yükle</span>
        </button>
      </div>

      {/* TAB CONTENT 1: VIDEO */}
      {activeTab === 'video' && (
        <div className="space-y-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400">Video Kaynağı:</span>
            <button
              type="button"
              onClick={() => setVideoSourceType('url')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                videoSourceType === 'url'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              YouTube / Web Video Linki
            </button>
            <button
              type="button"
              onClick={() => setVideoSourceType('file')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                videoSourceType === 'file'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Bilgisayardan Video Yükle
            </button>
          </div>

          {videoSourceType === 'url' ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Video Başlığı (örn: Türev Kuralları Konu Anlatımı)"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500"
                />
                <input
                  type="text"
                  placeholder="Açıklama / Not (opsiyonel)"
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  placeholder="YouTube, Vimeo veya Video Linki (https://www.youtube.com/watch?v=...)"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500"
                />
                <button
                  type="button"
                  onClick={handleAddVideoUrl}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Videoyu Ekle</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Video Başlığı (opsiyonel)"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500"
                />
                <input
                  type="text"
                  placeholder="Açıklama (opsiyonel)"
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div
                onClick={() => videoFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-rose-500/50 bg-slate-800/40 rounded-xl p-4 text-center cursor-pointer transition-colors"
              >
                <input
                  type="file"
                  ref={videoFileInputRef}
                  onChange={handleVideoFileUpload}
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  className="hidden"
                />
                <UploadCloud className="w-6 h-6 text-rose-400 mx-auto mb-1.5" />
                <span className="text-xs font-semibold text-white block">
                  Video Seçmek veya Sürüklemek İçin Tıklayın
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Desteklenen Formatlar: MP4, WebM (Maksimum 50MB)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: WEB LINK */}
      {activeTab === 'link' && (
        <div className="space-y-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
            <span>Hızlı Şablonlar:</span>
            <button
              type="button"
              onClick={() =>
                handleApplyPresetLink({
                  title: 'MEB Ölçme & Değerlendirme Kazanım Testleri',
                  url: 'https://odsgm.meb.gov.tr/kurslar/',
                  desc: 'Milli Eğitim Bakanlığı resmi kazanım kavrama testleri havuzu',
                })
              }
              className="px-2 py-0.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-500/30 rounded transition-colors"
            >
              MEB Kazanım Testleri
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyPresetLink({
                  title: 'EBA Eğitim Bilişim Ağı Ders İçeriği',
                  url: 'https://www.eba.gov.tr',
                  desc: 'EBA interaktif konu anlatım ve soru havuzu',
                })
              }
              className="px-2 py-0.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-500/30 rounded transition-colors"
            >
              EBA
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyPresetLink({
                  title: 'GeoGebra İnteraktif Matematik & Geometri',
                  url: 'https://www.geogebra.org/calculator',
                  desc: 'Fonksiyon grafiği çizimi ve dinamik matematik simülasyonu',
                })
              }
              className="px-2 py-0.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-500/30 rounded transition-colors"
            >
              GeoGebra
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyPresetLink({
                  title: 'PhET İnteraktif Fizik/Kimya Simülasyonu',
                  url: 'https://phet.colorado.edu/tr/',
                  desc: 'Deney simülasyonları ve interaktif görselleştirme laboratuvarı',
                })
              }
              className="px-2 py-0.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-500/30 rounded transition-colors"
            >
              PhET Simülasyon
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Bağlantı Başlığı (örn: GeoGebra Türev Simülatörü)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Açıklama / Talimat (opsiyonel)"
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="url"
              placeholder="Web Sitesi veya İnternet Linki (https://...)"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleAddLink}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Linki Ekle</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: PDF */}
      {activeTab === 'pdf' && (
        <div className="space-y-3 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400">PDF Ekleme Yöntemi:</span>
            <button
              type="button"
              onClick={() => setPdfSourceType('file')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                pdfSourceType === 'file'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Bilgisayardan PDF Yükle
            </button>
            <button
              type="button"
              onClick={() => setPdfSourceType('url')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                pdfSourceType === 'url'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Online PDF / Drive Bağlantısı
            </button>
          </div>

          {pdfSourceType === 'file' ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="PDF Başlığı (opsiyonel - boş bırakılırsa dosya adı alınır)"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="Açıklama (opsiyonel)"
                  value={pdfDescription}
                  onChange={(e) => setPdfDescription(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div
                onClick={() => pdfFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-800/40 rounded-xl p-4 text-center cursor-pointer transition-colors"
              >
                <input
                  type="file"
                  ref={pdfFileInputRef}
                  onChange={handlePdfFileUpload}
                  accept="application/pdf,.pdf"
                  className="hidden"
                />
                <FileUp className="w-6 h-6 text-amber-400 mx-auto mb-1.5" />
                <span className="text-xs font-semibold text-white block">
                  PDF Dosyası Seçmek veya Sürüklemek İçin Tıklayın
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Örn: Çalışma yaprağı, ÖSYM çıkmış sorular fasikülü, test PDF (Maksimum 25MB)
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="PDF Başlığı (örn: YKS Türev Çıkmış Sorular Fasikülü)"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="Açıklama (opsiyonel)"
                  value={pdfDescription}
                  onChange={(e) => setPdfDescription(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  placeholder="Online PDF veya Google Drive PDF Linki (https://...)"
                  value={pdfOnlineUrl}
                  onChange={(e) => setPdfOnlineUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddPdfUrl}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>PDF Linki Ekle</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST OF CURRENTLY ATTACHED RESOURCES */}
      {resources.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Ödeve Eklenen Materyaller:
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {resources.map((res, index) => {
              const isVideo = res.type === 'video';
              const isPdf = res.type === 'pdf';
              return (
                <div
                  key={res.id || index}
                  className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                    <span
                      className={`p-1.5 rounded-lg text-xs ${
                        isVideo
                          ? 'bg-rose-500/20 text-rose-300'
                          : isPdf
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}
                    >
                      {isVideo ? (
                        <Video className="w-4 h-4" />
                      ) : isPdf ? (
                        <FileText className="w-4 h-4" />
                      ) : (
                        <Globe className="w-4 h-4" />
                      )}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {res.title}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            isVideo
                              ? 'bg-rose-500/10 text-rose-300'
                              : isPdf
                              ? 'bg-amber-500/10 text-amber-300'
                              : 'bg-blue-500/10 text-blue-300'
                          }`}
                        >
                          {isVideo ? 'VIDEO' : isPdf ? 'PDF' : 'LINK'}
                        </span>
                        {res.fileSize && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {res.fileSize}
                          </span>
                        )}
                      </div>
                      {res.description && (
                        <span className="text-[10px] text-slate-400 truncate block">
                          {res.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveResource(res.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Bu materyali kaldır"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
