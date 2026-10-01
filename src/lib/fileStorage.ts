// Dosya deposu (Supabase Storage) yardımcıları — Aşama 5
// Dosyalar artık kayıtların içine gömülmez; gizli depoda saklanır ve gerektiğinde
// kısa süreli (imzalı) bağlantıyla açılır. Kayıtta yalnızca "storage://<yol>" adresi tutulur.
import { supabase } from './supabase';

export const FILE_BUCKET = 'okul-dosyalari';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (depodaki sınırla aynı)
export const MAX_UPLOAD_LABEL = '10 MB';
export const STORAGE_URL_PREFIX = 'storage://';

export const UPLOAD_LIMIT_MESSAGE =
  `Dosya ${MAX_UPLOAD_LABEL} sınırını aşıyor. Büyük videoları YouTube, büyük dosyaları Google Drive bağlantısı olarak ekleyebilirsiniz.`;

export const isStoredFileUrl = (url?: string | null): boolean => !!url && url.startsWith(STORAGE_URL_PREFIX);
export const storagePathFromUrl = (url?: string | null): string | null =>
  isStoredFileUrl(url) ? (url as string).slice(STORAGE_URL_PREFIX.length) : null;
export const toStoredFileUrl = (path: string) => `${STORAGE_URL_PREFIX}${path}`;

// Türkçe karakterleri sadeleştirip depo için güvenli dosya adı üretir (depo yalnız ASCII kabul eder)
export function safeFileName(name: string): string {
  const map: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  const replaced = name.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => map[ch] || ch);
  const ascii = replaced.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dot = ascii.lastIndexOf('.');
  const base = (dot > 0 ? ascii.slice(0, dot) : ascii).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const ext = dot > 0 ? ascii.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').toLowerCase() : '';
  const shortBase = (base || 'dosya').slice(0, 60);
  return ext ? `${shortBase}.${ext}` : shortBase;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// Tarayıcı bazı dosyalarda türü boş bırakır; uzantıdan tamamlanır
export function guessMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] || 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const rand = () => Math.random().toString(36).slice(2, 8);

const friendlyStorageError = (error: any): string => {
  const msg = String(error?.message || error || '');
  const status = String(error?.statusCode || error?.status || '');
  if (status === '413' || /maximum allowed size|too large/i.test(msg)) return UPLOAD_LIMIT_MESSAGE;
  if (status === '415' || /mime type/i.test(msg)) return 'Bu dosya türü desteklenmiyor. PDF, resim, video, Word veya Excel dosyası seçin.';
  if (status === '403' || /row-level security|unauthorized/i.test(msg)) return 'Bu dosyayı yükleme yetkiniz yok.';
  if (/failed to fetch|network/i.test(msg)) return 'Bağlantı sorunu nedeniyle dosya yüklenemedi. İnternetinizi kontrol edip tekrar deneyin.';
  return msg ? `Dosya yüklenemedi: ${msg}` : 'Dosya yüklenemedi.';
};

export interface UploadedFile {
  path: string;
  url: string; // storage://<path>
  fileName: string;
  fileSize: string;
  bytes: number;
  mimeType: string;
}

// Dosyayı verilen klasöre yükler. Hata olursa anlaşılır Türkçe mesajla Error fırlatır.
export async function uploadFile(folder: string, file: File): Promise<UploadedFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_LIMIT_MESSAGE);
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  const path = `${cleanFolder}/${Date.now()}-${rand()}-${safeFileName(file.name)}`;
  const mimeType = guessMimeType(file);
  const body = file.type ? file : new Blob([file], { type: mimeType });
  const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, body, {
    upsert: false,
    contentType: mimeType,
    cacheControl: '3600',
  });
  if (error) throw new Error(friendlyStorageError(error));
  return {
    path,
    url: toStoredFileUrl(path),
    fileName: file.name,
    fileSize: formatBytes(file.size),
    bytes: file.size,
    mimeType,
  };
}

// İmzalı bağlantılar kısa süre önbellekte tutulur (aynı dosya için tekrar tekrar istek atılmaz)
const SIGNED_TTL_SECONDS = 60 * 60;
const signedCache = new Map<string, { url: string; until: number }>();

export async function getSignedFileUrl(path: string, downloadName?: string): Promise<string> {
  const key = `${path}|${downloadName || ''}`;
  const cached = signedCache.get(key);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from(FILE_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) {
    throw new Error('Dosya açılamadı. Silinmiş olabilir ya da görüntüleme yetkiniz yok.');
  }
  signedCache.set(key, { url: data.signedUrl, until: Date.now() + (SIGNED_TTL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

// Depodan dosya siler (en iyi çaba: hata olursa sessizce geçer, kayıt işlemini bozmaz)
export async function removeStoredFiles(paths: Array<string | null | undefined>): Promise<number> {
  const clean = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (clean.length === 0) return 0;
  try {
    const { data, error } = await supabase.storage.from(FILE_BUCKET).remove(clean);
    if (error) {
      console.warn('[Storage] Dosya silinemedi:', error);
      return 0;
    }
    clean.forEach((p) => {
      Array.from(signedCache.keys()).forEach((k) => {
        if (k.startsWith(`${p}|`)) signedCache.delete(k);
      });
    });
    return Array.isArray(data) ? data.length : 0;
  } catch (e) {
    console.warn('[Storage] Dosya silme hatası:', e);
    return 0;
  }
}

// Kaynak listelerindeki depo dosyası yolları
export function storedPathsOf(resources?: Array<{ url?: string } | null | undefined>): string[] {
  return (resources || [])
    .map((r) => storagePathFromUrl(r?.url))
    .filter((p): p is string => !!p);
}

// Eski (kayıt içine gömülü, data:...) dosyayı tarayıcıda açılabilen geçici adrese çevirir
export function dataUrlToBlobUrl(url: string): string | null {
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

// Çıkışta imzalı bağlantı önbelleğini temizler
export function clearSignedUrlCache(): void {
  signedCache.clear();
}

// Eski (data:...) dosyayı yüklenebilir File nesnesine çevirir
export function dataUrlToFile(url: string, fileName: string): File | null {
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
    return new File([bytes], fileName, { type: mime });
  } catch {
    return null;
  }
}
