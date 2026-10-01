// Yönetici bakım araçları (Aşama 7):
//  1) Tüm verilerin yedeği (Excel + JSON) ve yedek kaydı
//  2) Eski sürümde kayıtların içine gömülmüş dosyaların dosya deposuna taşınması
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { uploadFile, removeStoredFiles, dataUrlToFile } from '../lib/fileStorage';

// ---------------------------------------------------------------------------
// ORTAK: tablodan tüm satırları sayfa sayfa okur (sunucu tek seferde en fazla 1000 satır verir)
// ---------------------------------------------------------------------------
const PAGE_SIZE = 1000;

async function fetchAllRows(table: string, columns = '*', apply?: (q: any) => any): Promise<any[]> {
  const rows: any[] = [];
  let ordered = true;
  for (let from = 0; ; from += PAGE_SIZE) {
    let q: any = supabase.from(table).select(columns);
    if (apply) q = apply(q);
    if (ordered) q = q.order('id', { ascending: true });
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) {
      // "id" sütunu yoksa sırasız dene (tek sefer)
      if (ordered && from === 0 && (error.code === '42703' || /column .*id/i.test(error.message || ''))) {
        ordered = false;
        from = -PAGE_SIZE;
        continue;
      }
      throw error;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 1) YEDEKLEME
// ---------------------------------------------------------------------------
interface BackupTableDef {
  table: string;
  sheet: string;
  columns?: string;
  apply?: (q: any) => any;
}

const BACKUP_TABLES: BackupTableDef[] = [
  { table: 'teachers', sheet: 'Öğretmenler' },
  { table: 'classes', sheet: 'Sınıflar' },
  { table: 'students', sheet: 'Öğrenciler' },
  { table: 'teacher_class_access', sheet: 'Öğretmen-Sınıf Yetkileri' },
  { table: 'teacher_student_access', sheet: 'Öğretmen-Öğrenci Yetkileri' },
  { table: 'homeworks', sheet: 'Ödevler' }, // sistem satırları (__ ile başlayan) aşağıda çıkarılır
  { table: 'homework_submissions', sheet: 'Ödev Teslimleri' },
  { table: 'attendance', sheet: 'Yoklama' },
  { table: 'grades', sheet: 'Notlar' },
  { table: 'etuts', sheet: 'Etütler' },
  { table: 'messages', sheet: 'Mesajlar' },
  { table: 'question_logs', sheet: 'Soru Kayıtları' },
  { table: 'question_targets', sheet: 'Soru Hedefleri' },
  {
    table: 'teacher_documents',
    sheet: 'Arşiv Belgeleri',
    columns:
      'id,title,description,category,file_format,file_name,file_size,storage_path,subject,school_type,grade_level,academic_year,tags,author_name,uploaded_by,owner_auth_id,created_at,updated_at',
  },
  { table: 'student_applications', sheet: 'Kayıt Başvuruları' },
];

const EXCEL_CELL_LIMIT = 32000;

// Excel hücresine yazılacak değer: iç içe veriler metne çevrilir, gömülü dosyalar kısaltılır
function toCell(value: any): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  text = text.replace(/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi, '[gömülü dosya]');
  if (text.length > EXCEL_CELL_LIMIT) text = `${text.slice(0, EXCEL_CELL_LIMIT)}… (kısaltıldı)`;
  return text;
}

export interface BackupResult {
  fileBaseName: string;
  counts: Record<string, number>;
  failedTables: Array<{ table: string; error: string }>;
}

const pad = (n: number) => String(n).padStart(2, '0');

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Tüm verileri buluttan okuyup Excel (okunabilir) ve JSON (tam) dosyaları olarak indirir.
export async function createFullBackup(
  adminName: string,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<BackupResult> {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileBaseName = `okul-yedek_${stamp}`;
  const counts: Record<string, number> = {};
  const failedTables: Array<{ table: string; error: string }> = [];
  const json: Record<string, any[]> = {};

  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const def = BACKUP_TABLES[i];
    onProgress?.(i, BACKUP_TABLES.length, def.sheet);
    try {
      let rows = await fetchAllRows(def.table, def.columns || '*', def.apply);
      if (def.table === 'homeworks') rows = rows.filter((r) => !String(r.id || '').startsWith('__'));
      json[def.table] = rows;
      counts[def.table] = rows.length;
    } catch (e: any) {
      // Tablo yoksa (ör. eski kurulumda) yedeğin geri kalanı yine alınır
      failedTables.push({ table: def.table, error: e?.message || String(e) });
    }
  }
  onProgress?.(BACKUP_TABLES.length, BACKUP_TABLES.length, 'Dosyalar hazırlanıyor');

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  if (totalRows === 0 && failedTables.length > 0) {
    throw new Error('Veriler okunamadı. Yönetici olarak giriş yaptığınızdan ve internet bağlantınızdan emin olun.');
  }

  // Excel: her tablo ayrı sayfa + "Bilgi" sayfası
  const wb = XLSX.utils.book_new();
  const info: Array<Array<string | number>> = [
    ['Eğitim & Öğrenci Takip Sistemi — Tam Yedek'],
    ['Yedek tarihi', now.toLocaleString('tr-TR')],
    ['Yedeği alan', adminName],
    [],
    ['Tablo', 'Satır sayısı'],
    ...BACKUP_TABLES.map((d) => [d.sheet, counts[d.table] ?? 'okunamadı']),
    [],
    ['Not', 'PDF, fotoğraf ve video dosyaları bu yedeğe dahil değildir; dosya deposunda güvenle durur.'],
    ['Not', 'Gömülü dosyalar Excel\'de "[gömülü dosya]" olarak gösterilir. Tam yedek için .json dosyasını da saklayın.'],
  ];
  if (failedTables.length > 0) {
    info.push([], ['Okunamayan tablolar'], ...failedTables.map((f) => [f.table, f.error]));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Bilgi');

  BACKUP_TABLES.forEach((def) => {
    const rows = json[def.table];
    if (!rows) return;
    const colSet = new Set<string>();
    rows.forEach((r) => Object.keys(r || {}).forEach((k) => colSet.add(k)));
    const columns: string[] = Array.from(colSet);
    const aoa = [columns, ...rows.map((r) => columns.map((c) => toCell(r[c])))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.length > 1 ? aoa : [columns.length ? columns : ['(boş)']]), def.sheet.slice(0, 31));
  });

  const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBaseName}.xlsx`);
  const jsonBlob = new Blob(
    [JSON.stringify({ format: 'okul-yedek', version: 1, createdAt: now.toISOString(), createdBy: adminName, counts, tables: json }, null, 1)],
    { type: 'application/json' }
  );
  downloadBlob(jsonBlob, `${fileBaseName}.json`);

  // Yedek kaydı (hatırlatma için). Tablo henüz kurulmadıysa sessizce geçilir.
  try {
    await supabase.from('backup_log').insert({ created_by_name: adminName, table_counts: counts });
  } catch {}

  return { fileBaseName, counts, failedTables };
}

// Son yedeğin tarihi (yoksa null). Tablo yoksa 'unavailable'.
export async function getLastBackupDate(): Promise<Date | null | 'unavailable'> {
  const { data, error } = await supabase
    .from('backup_log')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return 'unavailable';
  return data && data.length > 0 ? new Date(data[0].created_at) : null;
}

// ---------------------------------------------------------------------------
// 2) ESKİ GÖMÜLÜ DOSYALARI DEPOYA TAŞIMA
// ---------------------------------------------------------------------------
const isDataUrl = (v: any): v is string => typeof v === 'string' && v.startsWith('data:');
const approxBytes = (dataUrl: string) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

export interface LegacyScanResult {
  homeworks: Array<{ id: string; title: string; files: number }>;
  submissions: Array<{ id: string; homeworkId: string; studentId: string; files: number }>;
  documents: Array<{ id: string; title: string; ownerAuthId: string | null }>;
  totalFiles: number;
  approxBytes: number;
}

export async function scanLegacyInlineFiles(): Promise<LegacyScanResult> {
  const result: LegacyScanResult = { homeworks: [], submissions: [], documents: [], totalFiles: 0, approxBytes: 0 };

  const hwRows = (await fetchAllRows('homeworks', 'id,title,meta')).filter((r) => !String(r.id || '').startsWith('__'));
  hwRows.forEach((r) => {
    const meta = r.meta || {};
    const files = (Array.isArray(meta.resources) ? meta.resources : []).filter((x: any) => isDataUrl(x?.url));
    const extra = isDataUrl(meta.attachmentUrl) ? 1 : 0;
    if (files.length + extra > 0) {
      result.homeworks.push({ id: r.id, title: r.title, files: files.length + extra });
      result.totalFiles += files.length + extra;
      files.forEach((f: any) => (result.approxBytes += approxBytes(f.url)));
      if (extra) result.approxBytes += approxBytes(meta.attachmentUrl);
    }
  });

  const subRows = await fetchAllRows('homework_submissions', 'id,homework_id,student_id,resources,attachment_link');
  subRows.forEach((r) => {
    const files = (Array.isArray(r.resources) ? r.resources : []).filter((x: any) => isDataUrl(x?.url));
    const extra = isDataUrl(r.attachment_link) ? 1 : 0;
    if (files.length + extra > 0) {
      result.submissions.push({ id: r.id, homeworkId: r.homework_id, studentId: r.student_id, files: files.length + extra });
      result.totalFiles += files.length + extra;
      files.forEach((f: any) => (result.approxBytes += approxBytes(f.url)));
      if (extra) result.approxBytes += approxBytes(r.attachment_link);
    }
  });

  const docRows = await fetchAllRows('teacher_documents', 'id,title,owner_auth_id', (q) => q.not('legacy_file_data', 'is', null));
  docRows.forEach((r) => {
    result.documents.push({ id: r.id, title: r.title, ownerAuthId: r.owner_auth_id || null });
    result.totalFiles += 1;
  });
  return result;
}

export interface LegacyMigrationResult {
  moved: number;
  failed: Array<{ where: string; error: string }>;
}

const extFromMime = (mime: string) => {
  const map: Record<string, string> = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return map[mime] || 'bin';
};

// Gömülü dosyayı depoya yükler ve yeni kaynak adresini döndürür
async function moveOne(folder: string, dataUrl: string, preferredName: string, uploaded: string[]): Promise<{ url: string; fileSize: string }> {
  const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream';
  const name = /\.[a-z0-9]{2,5}$/i.test(preferredName) ? preferredName : `${preferredName || 'dosya'}.${extFromMime(mime)}`;
  const file = dataUrlToFile(dataUrl, name);
  if (!file) throw new Error('Gömülü dosya okunamadı (bozuk veri).');
  const up = await uploadFile(folder, file);
  uploaded.push(up.path);
  return { url: up.url, fileSize: up.fileSize };
}

export async function migrateLegacyInlineFiles(
  scan: LegacyScanResult,
  adminAuthUid: string,
  onProgress?: (done: number, total: number) => void
): Promise<LegacyMigrationResult> {
  const result: LegacyMigrationResult = { moved: 0, failed: [] };
  let done = 0;
  const total = scan.totalFiles;
  const tick = (n = 1) => { done += n; onProgress?.(done, total); };

  // a) Ödev materyalleri
  for (const hw of scan.homeworks) {
    const uploaded: string[] = [];
    try {
      const { data: row, error } = await supabase.from('homeworks').select('id,meta').eq('id', hw.id).single();
      if (error || !row) throw error || new Error('Ödev bulunamadı');
      const meta = { ...(row.meta || {}) };
      const resources = Array.isArray(meta.resources) ? [...meta.resources] : [];
      for (let i = 0; i < resources.length; i++) {
        const r = resources[i];
        if (!isDataUrl(r?.url)) continue;
        const moved = await moveOne(`odev/${hw.id}`, r.url, r.fileName || r.title || 'dosya', uploaded);
        resources[i] = { ...r, url: moved.url, fileSize: r.fileSize || moved.fileSize };
      }
      meta.resources = resources;
      if (isDataUrl(meta.attachmentUrl)) {
        const moved = await moveOne(`odev/${hw.id}`, meta.attachmentUrl, 'ek-dosya', uploaded);
        meta.resources = [...meta.resources, { id: `res-legacy-${Date.now()}`, type: 'pdf', title: 'Ek Dosya', url: moved.url, fileSize: moved.fileSize }];
        meta.attachmentUrl = null;
      }
      const { data: upd, error: updErr } = await supabase.from('homeworks').update({ meta }).eq('id', hw.id).select('id');
      if (updErr || !upd || upd.length === 0) throw updErr || new Error('Ödev güncellenemedi (yetki)');
      result.moved += uploaded.length;
    } catch (e: any) {
      if (uploaded.length) await removeStoredFiles(uploaded);
      result.failed.push({ where: `Ödev: ${hw.title}`, error: e?.message || String(e) });
    }
    tick(hw.files);
  }

  // b) Öğrenci teslimleri
  for (const sub of scan.submissions) {
    const uploaded: string[] = [];
    try {
      const { data: row, error } = await supabase.from('homework_submissions').select('id,resources,attachment_link').eq('id', sub.id).single();
      if (error || !row) throw error || new Error('Teslim bulunamadı');
      const resources = Array.isArray(row.resources) ? [...row.resources] : [];
      const folder = `teslim/${sub.homeworkId}/${sub.studentId}`;
      for (let i = 0; i < resources.length; i++) {
        const r = resources[i];
        if (!isDataUrl(r?.url)) continue;
        const moved = await moveOne(folder, r.url, r.fileName || r.title || 'cozum', uploaded);
        resources[i] = { ...r, url: moved.url, fileSize: r.fileSize || moved.fileSize };
      }
      const patch: Record<string, any> = { resources };
      if (isDataUrl(row.attachment_link)) {
        const moved = await moveOne(folder, row.attachment_link, 'ek-dosya', uploaded);
        patch.resources = [...resources, { id: `res-legacy-${Date.now()}`, type: 'pdf', title: 'Ek Dosya', url: moved.url, fileSize: moved.fileSize }];
        patch.attachment_link = null;
      }
      const { data: upd, error: updErr } = await supabase.from('homework_submissions').update(patch).eq('id', sub.id).select('id');
      if (updErr || !upd || upd.length === 0) throw updErr || new Error('Teslim güncellenemedi (yetki)');
      result.moved += uploaded.length;
    } catch (e: any) {
      if (uploaded.length) await removeStoredFiles(uploaded);
      result.failed.push({ where: `Teslim: ${sub.studentId}`, error: e?.message || String(e) });
    }
    tick(sub.files);
  }

  // c) Arşiv belgeleri (dosya, yükleyen öğretmenin klasörüne konur; böylece öğretmen silebilir)
  for (const doc of scan.documents) {
    const uploaded: string[] = [];
    try {
      const { data: row, error } = await supabase
        .from('teacher_documents')
        .select('id,file_name,legacy_file_data')
        .eq('id', doc.id)
        .single();
      if (error || !row) throw error || new Error('Belge bulunamadı');
      if (!isDataUrl(row.legacy_file_data)) {
        tick();
        continue;
      }
      const moved = await moveOne(`belge/${doc.ownerAuthId || adminAuthUid}`, row.legacy_file_data, row.file_name || doc.title, uploaded);
      const path = moved.url.replace(/^storage:\/\//, '');
      const { data: upd, error: updErr } = await supabase
        .from('teacher_documents')
        .update({ storage_path: path, legacy_file_data: null, file_size: moved.fileSize })
        .eq('id', doc.id)
        .select('id');
      if (updErr || !upd || upd.length === 0) throw updErr || new Error('Belge güncellenemedi (yetki)');
      result.moved += uploaded.length;
    } catch (e: any) {
      if (uploaded.length) await removeStoredFiles(uploaded);
      result.failed.push({ where: `Belge: ${doc.title}`, error: e?.message || String(e) });
    }
    tick();
  }
  return result;
}
