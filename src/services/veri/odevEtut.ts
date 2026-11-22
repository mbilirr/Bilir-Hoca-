// ============================================================================
// Aşama 360: ÖDEV VE ETÜT: ödevler, teslimler, kontrol durumları, etütler, etüt yoklaması yazımı, etüt öğretmenleri
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → iletisim → odevEtut → soruTakibi → dataService
// ============================================================================
import {
  Student,
  Teacher,
  Homework,
  HomeworkSubmission,
  HomeworkResource,
  HomeworkCheckStatus,
  Etut,
  EtutStudentAttendance,
} from '../../types';
import { supabase } from '../../lib/supabase';
import { removeStoredFiles, storedPathsOf } from '../../lib/fileStorage';
import { subjectsForBranch, normalizeSubject } from '../../lib/subjects';
import { newId } from '../../lib/ids';
import { notifyPush } from '../../lib/push';
import { STORAGE_KEYS, appStorage, saveData } from '../depo';
import { assertInlineResourcesFit, homeworkTargets, homeworkToRow } from '../satirDonusumleri';
import { isEtutYoklamaMissing, isEtutCommentColumnMissing } from '../hataMetinleri';
import { deleteRowsVerified, writeEtutComments } from '../bulutIslemleri';
import { redactEtut, defaultCheckNote } from '../kayitKurallari';
import { EsitlemeKatmani } from './esitleme';
import { IletisimKatmani } from './iletisim';
import { ETUT_COMMENT_KEYS, type EtutTeacherOption, type EtutTeacherRow, type EtutPushOpts } from './ortak';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class OdevEtutKatmani extends IletisimKatmani {

  public async pushEtutToSupabase(etut: Etut, opts: EtutPushOpts = {}): Promise<boolean> {
    try {
      // 1. RLS Güvencesi: Yalnızca Supabase Auth ile doğrulanmış aktif bir oturum varsa buluta yaz
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user;
      if (!authUser) {
        // Oturum açılmamışsa (anon) RLS yazma işlemine izin vermez; sessizce yerel state korunur
        return false;
      }

      // Öğrenciler etüt ekleme veya güncelleme yetkisine sahip değildir
      const userRole = authUser.app_metadata?.role;
      if (userRole === 'student') {
        return false;
      }

      // Aşama 179: yoklama ve yorumlar ayrı yerde (sql/178).
      // Aşama 196: eski yol (yoklama ve yorumları notes içine yazmak) kaldırıldı. Yoklama yalnız etut_yoklama
      // tablosuna, yorumlar yalnız kendi sütunlarına yazılır; tablo / sütun yoksa yazma başarısız sayılır.
      if (opts.commentsOnly) {
        // yalnız yorum değişti: yalnız o sütun yazılır, etüt tanımı yeniden gönderilmez
        return (await writeEtutComments(etut, opts.comments || [])) === 'ok';
      }
      if (opts.attendanceOnly) {
        // yalnız yoklama değişti: yalnız değişen öğrencilerin satırı yazılır
        return (await this.writeEtutYoklama(etut.id, opts.attendance || {})) === 'ok';
      }

      const attendanceStudentIds = Object.keys(etut.studentAttendance || {});
      let finalAssigned: string[] = [];
      if (Array.isArray(etut.assignedStudentIds)) {
        finalAssigned = Array.from(new Set([...etut.assignedStudentIds, ...attendanceStudentIds]));
      } else if (attendanceStudentIds.length > 0) {
        finalAssigned = attendanceStudentIds;
      }

      // Aşama 179: notes yalnız etüt tanımını taşır; gönderilmeyen yoklama / yorum anahtarlarını sunucu korur
      // Aşama 196: yoklama ve yorum anahtarları notes'a hiç yazılmaz (eski yol kaldırıldı)
      const meta = JSON.stringify({
        __etut_meta__: true,
        teacherId: etut.teacherId,
        teacherName: etut.teacherName,
        teacherIds: etut.teacherIds && etut.teacherIds.length > 1 ? etut.teacherIds : undefined,
        teacherNames: etut.teacherIds && etut.teacherIds.length > 1 ? etut.teacherNames : undefined,
        teacherBranch: etut.teacherBranch || '',
        lessonPeriod: etut.lessonPeriod || 'Ders',
        duration: Number(etut.duration) || 45,
        gradeLevel: etut.gradeLevel,
        schoolLevel: etut.schoolLevel,
        assignedStudentIds: etut.assignedStudentIds,
        createdById: etut.createdById || null,
        createdByName: etut.createdByName || null,
        recurrenceGroupId: etut.recurrenceGroupId || null,
        mailMode: etut.mailMode || undefined,
      });

      const cleanDate = etut.date ? etut.date.trim().split('T')[0] : '';

      const row: Record<string, any> = {
        id: etut.id,
        subject: etut.subject,
        topic: etut.topic,
        date: cleanDate,
        time: etut.time,
        duration: Number(etut.duration) || 45,
        location: etut.location || '',
        assigned_student_ids: finalAssigned,
        notes: meta,
      };
      const c = opts.comments || [];
      if (c.includes('teacherFeedback')) row.teacher_feedback = etut.teacherFeedback || '';
      if (c.includes('notes')) row.user_notes = etut.notes || '';
      if (c.includes('attendanceTakenBy')) row.attendance_taken_by = etut.attendanceTakenBy || null;
      // Aşama 9: etüde atanan öğretmen ayrı sütunda (13 numaralı SQL). SQL henüz çalıştırılmadıysa sütunsuz kaydet.
      if (OdevEtutKatmani.etutTeacherColumnAvailable) row.etut_teacher_id = etut.teacherId || null;
      // Aşama 14: birden çok öğretmen (15 numaralı SQL). Sütun yoksa yalnızca bu alan çıkarılır.
      if (OdevEtutKatmani.etutTeacherIdsColumnAvailable && OdevEtutKatmani.etutTeacherColumnAvailable)
        row.etut_teacher_ids = etut.teacherIds && etut.teacherIds.length ? etut.teacherIds : etut.teacherId ? [etut.teacherId] : null;
      let { error } = await supabase.from('etuts').upsert(row);
      for (let attempt = 0; attempt < 2 && error; attempt++) {
        const msg = error.message || '';
        // Aşama 116: yalnız gerçekten "sütun yok" hatasında (kod / şema mesajı) sütunsuz yola geçilir;
        // yetki ya da tetik hatası etüt öğretmenini oturum boyunca silmez
        const missingCol = /42703|PGRST204/.test(String(error.code || '')) || /column|schema cache/i.test(msg);
        if (!missingCol) break;
        if (isEtutCommentColumnMissing(error)) {
          // Aşama 196: sql/178 kurulmamış; eski yola düşülmez, kayıt başarısız sayılır
          console.warn('[EtutSync] Etüt yorum sütunları bulunamadı (sql/178 gerekli):', msg);
          return false;
        }
        if (row.etut_teacher_ids !== undefined && /etut_teacher_ids/.test(msg)) {
          OdevEtutKatmani.etutTeacherIdsColumnAvailable = false;
          delete row.etut_teacher_ids;
        } else if (row.etut_teacher_id !== undefined && /etut_teacher_id/.test(msg)) {
          OdevEtutKatmani.etutTeacherColumnAvailable = false;
          delete row.etut_teacher_id;
          delete row.etut_teacher_ids;
        } else break;
        ({ error } = await supabase.from('etuts').upsert(row));
      }

      if (error) {
        if (error.code === '42501' || error.message?.includes('violates row-level security policy')) {
          console.warn('[EtutSync] Etüt senkronizasyonu RLS yetki sınırına takıldı (bu kayıt için yetki yok):', error.message);
        } else {
          console.warn('[EtutSync] Etüt buluta yüklenemedi:', error.message);
        }
        return false;
      }
      // Aşama 179: etüt satırı yazıldıktan sonra (yeni öğrenci etüde eklenmiş olur) yoklama yazılır
      if (opts.attendance && Object.keys(opts.attendance).length) {
        if ((await this.writeEtutYoklama(etut.id, opts.attendance)) !== 'ok') return false;
      }
      return true;
    } catch (err: any) {
      console.warn('[EtutSync] Etüt senkronizasyon istisnası:', err?.message || err);
      return false;
    }
  } // Aşama 317: satirDonusumleri.ts'te
  public static etutTeacherColumnAvailable = true;
  protected static readonly ETUT_STATUSES = new Set<string>(['present', 'absent', 'excused', 'late']);

  /** Yalnız verilen öğrencilerin yoklaması yazılır; başka öğrencinin kaydına dokunulmaz */
  protected async writeEtutYoklama(etutId: string, entries: Record<string, EtutStudentAttendance>): Promise<'ok' | 'fail'> {
    const now = new Date().toISOString();
    const valid = Object.entries(entries || {}).filter(([, a]) => a && OdevEtutKatmani.ETUT_STATUSES.has(a.status));
    if (!valid.length) return 'ok';
    const rows = valid.map(([sid, a]) => ({
      etut_id: etutId,
      student_id: sid,
      student_name: a.studentName || null,
      status: a.status,
      note: a.note || '',
      topic: a.topic || '',
      marked_by: a.markedBy || null,
      marked_at: a.markedAt || null,
      changed_at: a.updatedAt || a.markedAt || now,
    }));
    const { error } = await supabase.from('etut_yoklama').upsert(rows, { onConflict: 'etut_id,student_id' });
    if (error) {
      // Aşama 196: tablo yoksa eski yola (notes) düşülmez
      if (isEtutYoklamaMissing(error)) EsitlemeKatmani.etutYoklamaTable = 'no';
      console.warn('[EtutYoklama] Yoklama buluta yazılamadı:', error.message);
      return 'fail';
    }
    EsitlemeKatmani.etutYoklamaTable = 'yes';
    const cur = { ...(this.etutYoklama.get(etutId) || {}) };
    for (const [sid, a] of valid) cur[sid] = { ...a, updatedAt: a.updatedAt || a.markedAt || now };
    this.etutYoklama.set(etutId, cur);
    return 'ok';
  }

  public static etutTeacherIdsColumnAvailable = true;

  // Etüt formu için öğretmen listesi (veritabanı yönetici olmayana yalnızca kendi branşını döndürür)
  public async getEtutTeacherOptions(): Promise<EtutTeacherOption[]> {
    const me = this.getCurrentTeacher();
    try {
      const { data, error } = await supabase.rpc('etut_teacher_options');
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
          id: String(r.option_id),
          name: String(r.name || ''),
          subjects: Array.isArray(r.subjects) ? r.subjects.map((x: any) => normalizeSubject(String(x))) : [],
          kind: r.kind === 'external' ? 'external' : 'system',
          hasEmail: !!r.has_email,
          rowId: r.row_id || null,
          isMe: !!r.is_me,
        }));
      }
    } catch {}
    // 13 numaralı SQL henüz çalıştırılmadıysa: yalnızca kendisi (ve yöneticiyse bildiği öğretmenler)
    const list: EtutTeacherOption[] = [];
    const seen = new Set<string>();
    const pushTeacher = (t: Teacher, isMe: boolean) => {
      if (!t?.id || seen.has(t.id) || t.status === 'pending' || t.status === 'rejected') return;
      seen.add(t.id);
      list.push({ id: t.id, name: t.name, subjects: subjectsForBranch(t.branch), kind: 'system', hasEmail: !!t.email, rowId: null, isMe });
    };
    if (me) pushTeacher(me, true);
    if (this.isCurrentUserAdmin()) this.teachers.forEach((t) => pushTeacher(t, false));
    return list;
  }

  // Yönetici: etüt öğretmenleri listesi (dış öğretmenler ve kayıtlı öğretmenlere ek dersler)
  public async listEtutTeacherRows(): Promise<EtutTeacherRow[]> {
    const { data, error } = await supabase.from('etut_teachers').select('*').order('name');
    if (error) throw new Error(error.message?.includes('etut_teachers') ? 'Etüt öğretmenleri tablosu bulunamadı (13 numaralı SQL çalıştırılmalı).' : error.message);
    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      subjects: Array.isArray(r.subjects) ? r.subjects : [],
      email: r.email || '',
      phone: r.phone || '',
      teacherId: r.teacher_id || null,
      active: r.active !== false,
    }));
  }

  public async saveEtutTeacherRow(row: Partial<EtutTeacherRow> & { name: string; subjects: string[] }): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const payload: Record<string, any> = {
      name: row.name.trim(),
      subjects: row.subjects,
      email: (row.email || '').trim() || null,
      phone: (row.phone || '').trim() || null,
      teacher_id: row.teacherId || null,
      active: row.active !== false,
    };
    const q = row.id
      ? supabase.from('etut_teachers').update(payload).eq('id', row.id)
      : supabase.from('etut_teachers').insert(payload);
    const { error } = await q;
    if (error) {
      if (error.code === '23505') throw new Error('Bu öğretmen için zaten bir kayıt var.');
      if (error.code === '23514') throw new Error('E-posta adresi geçersiz veya ad çok kısa.');
      throw new Error(error.message);
    }
  }

  public async deleteEtutTeacherRow(id: string): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const { error } = await supabase.from('etut_teachers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- HOMEWORK ---
  // Ödev kimliği yeni ödev penceresi açılırken üretilir; böylece dosyalar kaydetmeden önce
  // doğru klasöre ("odev/<kimlik>") yüklenebilir.
  public newHomeworkId(): string {
    return `hw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  public async createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'> & { id?: string }): Promise<Homework> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const requestedId = typeof homeworkData.id === 'string' && /^hw-[\w-]{4,80}$/.test(homeworkData.id) ? homeworkData.id : null;
    const newHw: Homework = {
      ...homeworkData,
      id: requestedId && !this.homeworks.some((h) => h.id === requestedId) ? requestedId : this.newHomeworkId(),
      createdAt: nowIso,
      assignedDate: homeworkData.assignedDate || nowIso,
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      teacherName: homeworkData.teacherName || currentTeacher?.name,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
      isGlobalForNewStudents: false,
      submissions: undefined,
    };
    const { classIds, studentIds } = homeworkTargets(newHw);
    newHw.targetClassIds = classIds;
    newHw.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    newHw.classId = classIds[0] || newHw.classId;

    let row: ReturnType<typeof homeworkToRow>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = homeworkToRow(newHw);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    try {
      const { data: authData } = await supabase.auth.getSession();
      newHw.teacherAuthId = authData?.session?.user?.id;
    } catch {}

    const prevHomeworks = [...this.homeworks];
    this.homeworks = [newHw, ...this.homeworks];
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      () => supabase.from('homeworks').insert({ id: newHw.id, ...row }),
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev kaydedilemedi'
    );

    // Bildirimler yalnızca ödev gerçekten kaydedildikten sonra hazırlanır
    this.dispatchHomeworkNotificationsAndEmails(newHw);
    // Aşama 34: öğrencilerin telefonuna "Yeni ödev" bildirimi (alıcıları sunucu bulur)
    notifyPush('homework-created', { homeworkId: newHw.id });
    this.notify();
    return newHw;
  }

  public async updateHomework(id: string, updates: Partial<Homework>): Promise<void> {
    const existing = this.homeworks.find((h) => h.id === id);
    if (!existing) {
      const msg = 'Ödev bulunamadı (silinmiş olabilir). Sayfayı yenileyip tekrar deneyin.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(msg);
    }
    this.assertHomeworkEditable(existing);
    const merged: Homework = { ...existing, ...updates };
    const { classIds, studentIds } = homeworkTargets(merged);
    merged.targetClassIds = classIds;
    merged.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    merged.classId = classIds[0] || merged.classId;

    let row: ReturnType<typeof homeworkToRow>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = homeworkToRow(merged);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const prevHomeworks = [...this.homeworks];
    this.homeworks = this.homeworks.map((h) => (h.id === id ? merged : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase.from('homeworks').update(row).eq('id', id).select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Ödevi yalnızca oluşturan öğretmen veya yönetici değiştirebilir' } };
        }
        return { error: null };
      },
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev güncellenemedi'
    );

    // Ödevden çıkarılan depo dosyaları silinir (kayıt başarılı olduktan sonra)
    if (updates.resources !== undefined) {
      const kept = new Set(storedPathsOf(merged.resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
  }

  public async deleteHomework(id: string): Promise<void> {
    const target = this.homeworks.find((h) => h.id === id);
    if (target) this.assertHomeworkEditable(target);
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevDeletedHomeworkIds = new Set(this.deletedHomeworkIds);

    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Teslim dosyaları ödev kaydı silinmeden ÖNCE silinir (öğretmenin yetkisi ödev kaydı varken geçerlidir).
    // En güncel liste veritabanından okunur (başka cihazdan yapılmış güncellemeler dahil).
    const submissionFiles = new Set(
      (prevSubmissions as HomeworkSubmission[]).filter((sb) => sb.homeworkId === id).flatMap((sb) => storedPathsOf(sb.resources))
    );
    try {
      const { data: subRows } = await supabase.from('homework_submissions').select('resources').eq('homework_id', id);
      (subRows || []).forEach((r: any) => storedPathsOf(Array.isArray(r.resources) ? r.resources : []).forEach((p) => submissionFiles.add(p)));
    } catch {}
    if (submissionFiles.size > 0) await removeStoredFiles(Array.from(submissionFiles));

    try {
      const { error } = await deleteRowsVerified('homeworks', [id]);
      if (error) {
        throw error;
      }
      // Ödevin kendi dosyaları kayıt silindikten sonra temizlenir (en iyi çaba)
      const hwFiles = storedPathsOf(prevHomeworks.find((h: Homework) => h.id === id)?.resources);
      if (hwFiles.length > 0) removeStoredFiles(hwFiles);
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.homeworks = prevHomeworks;
      this.submissions = prevSubmissions;
      this.deletedHomeworkIds = prevDeletedHomeworkIds;
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Ödev silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Ödev bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteHomework] Ödev silinemedi: ${errMsg}`);
    }
  }

  // --- SUBMISSIONS ---
  // Öğrenci teslimi: varsa kendi satırını günceller, yoksa yeni satır açar.
  // Puan, geri bildirim ve öğretmen kontrol durumu öğrenci tarafından değiştirilemez (veritabanı kuralı).
  public async submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): Promise<HomeworkSubmission> {
    this.assertNotPreview(); // Aşama 107
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);
    try {
      assertInlineResourcesFit(resources);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const nowIso = new Date().toISOString();
    const isLate = homework ? Date.now() > new Date(homework.dueDate).getTime() : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';
    const studentName = student?.name || 'Öğrenci';

    const payload: Record<string, any> = {
      student_name: studentName,
      status,
      notes: notes || '',
      attachment_link: attachmentLink || null,
      submitted_at: nowIso,
    };
    if (resources !== undefined) payload.resources = resources;

    const existing = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const optimistic: HomeworkSubmission = {
      ...(existing || {}),
      id: existing?.id || newId('sub-local'),
      homeworkId,
      studentId,
      studentName,
      submittedAt: nowIso,
      status,
      notes: notes || '',
      attachmentLink: attachmentLink || undefined,
      resources: resources !== undefined ? resources : existing?.resources || [],
      score: existing?.score ?? null,
      feedback: existing?.feedback,
      checkStatus: existing?.checkStatus,
    };

    const prevSubmissions = [...this.submissions];
    this.submissions = [
      optimistic,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    let savedRow: any = null;
    const updateOwn = () =>
      supabase
        .from('homework_submissions')
        .update(payload)
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .select('*');

    await this.runCloudWrite(
      async () => {
        const upd = await updateOwn();
        if (upd.error) return { error: upd.error };
        if (upd.data && upd.data.length > 0) {
          savedRow = upd.data[0];
          return { error: null };
        }
        const ins = await supabase
          .from('homework_submissions')
          .insert({ homework_id: homeworkId, student_id: studentId, resources: [], ...payload })
          .select('*');
        if (ins.error?.code === '23505') {
          // Aynı anda başka cihazdan açılmış satır: güncelle
          const retry = await updateOwn();
          if (retry.error) return { error: retry.error };
          savedRow = retry.data?.[0] || null;
          return { error: null };
        }
        if (ins.error) return { error: ins.error };
        savedRow = ins.data?.[0] || null;
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev teslimi kaydedilemedi'
    );

    const saved = savedRow ? this.submissionFromRow(savedRow) : optimistic;
    this.submissions = [
      saved,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Öğrencinin yeni teslimde çıkardığı eski dosyalar depodan silinir
    if (resources !== undefined && existing) {
      const kept = new Set(storedPathsOf(resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
    return saved;
  }

  public async gradeSubmission(submissionId: string, score: number, feedback: string): Promise<void> {
    const prevSubmissions = [...this.submissions];
    this.submissions = this.submissions.map((s) => (s.id === submissionId ? { ...s, score, feedback } : s));
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase
          .from('homework_submissions')
          .update({ score, feedback })
          .eq('id', submissionId)
          .select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Teslim bulunamadı veya puanlama yetkiniz yok' } };
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Puan kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  // Öğretmenin "Yaptı / Yapmadı / Eksik / İzinli / Gelmedi" işaretleri — tek seferde, birden çok öğrenci için.
  // Öğrencinin kendi teslim notu ve dosyaları korunur; yalnızca kontrol durumu yazılır.
  public async saveHomeworkCheckStatuses(
    homeworkId: string,
    entries: { studentId: string; checkStatus: HomeworkCheckStatus }[]
  ): Promise<void> {
    const byStudent = new Map<string, HomeworkCheckStatus>();
    entries.forEach((e) => {
      if (e?.studentId && e.checkStatus) byStudent.set(e.studentId, e.checkStatus);
    });
    if (byStudent.size === 0) return;

    const prevSubmissions = [...this.submissions];
    const nowIso = new Date().toISOString();
    const updatedLocal = new Map<string, HomeworkSubmission>();
    this.submissions.forEach((s) => {
      if (s.homeworkId === homeworkId && byStudent.has(s.studentId)) {
        const checkStatus = byStudent.get(s.studentId)!;
        updatedLocal.set(s.studentId, {
          ...s,
          checkStatus,
          status: checkStatus === 'yapti' && s.status === 'not_submitted' ? 'on_time' : s.status,
        });
      }
    });
    byStudent.forEach((checkStatus, studentId) => {
      if (updatedLocal.has(studentId)) return;
      updatedLocal.set(studentId, {
        id: newId(`sub-local-${studentId}`),
        homeworkId,
        studentId,
        studentName: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
        submittedAt: nowIso,
        status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
        checkStatus,
        notes: defaultCheckNote(checkStatus),
      });
    });
    this.submissions = [
      ...Array.from(updatedLocal.values()),
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && byStudent.has(s.studentId))),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        // 1) Satırı olmayan öğrenciler için kayıt aç (var olan teslimlere dokunmaz)
        const baseRows = Array.from(byStudent.entries()).map(([studentId, checkStatus]) => ({
          homework_id: homeworkId,
          student_id: studentId,
          student_name: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
          status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
          notes: defaultCheckNote(checkStatus),
          check_status: checkStatus,
        }));
        const ins = await supabase
          .from('homework_submissions')
          .upsert(baseRows, { onConflict: 'homework_id,student_id', ignoreDuplicates: true });
        if (ins.error) return { error: ins.error };

        // 2) Kontrol durumlarını durum grubuna göre yaz
        const groups = new Map<HomeworkCheckStatus, string[]>();
        byStudent.forEach((checkStatus, studentId) => {
          groups.set(checkStatus, [...(groups.get(checkStatus) || []), studentId]);
        });
        for (const [checkStatus, ids] of groups) {
          const upd = await supabase
            .from('homework_submissions')
            .update({ check_status: checkStatus })
            .eq('homework_id', homeworkId)
            .in('student_id', ids)
            .select('student_id');
          if (upd.error) return { error: upd.error };
          if ((upd.data?.length || 0) < ids.length) {
            return { error: { code: '42501', message: 'Bazı öğrencilerin kontrol durumu kaydedilemedi' } };
          }
          if (checkStatus === 'yapti') {
            const st = await supabase
              .from('homework_submissions')
              .update({ status: 'on_time' })
              .eq('homework_id', homeworkId)
              .in('student_id', ids)
              .eq('status', 'not_submitted');
            if (st.error) return { error: st.error };
          }
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev kontrol durumu kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );

    // Aşama 343: kayıt cihazda bekliyorsa sunucudan okunmaz (okunan liste bekleyen işaretleri ekrandan silerdi)
    if (!this.gidenKutusu.length) await this.refreshSubmissionsForHomework(homeworkId);
  }

  public async updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus
  ): Promise<HomeworkSubmission | undefined> {
    await this.saveHomeworkCheckStatuses(homeworkId, [{ studentId, checkStatus }]);
    return this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
  }

  // --- ETUTS ---
  public async createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Promise<Etut> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowIso,
      createdById: etutData.createdById || currentTeacher?.id,
      createdByName: etutData.createdByName || currentTeacher?.name,
      lessonPeriod: etutData.lessonPeriod || 'Ders',
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
      teacherBranch: etutData.teacherBranch || currentTeacher?.branch || etutData.subject,
      duration: Number(etutData.duration) || 45,
    };
    // Rollback için önceki durumun yedeğini al
    const prevEtutsOnCreate = JSON.parse(JSON.stringify(this.etuts));

    this.etuts = [newEtut, ...this.etuts];
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Öğretmen ismini bu ders için kalıcı olarak kaydet
    if (newEtut.subject && newEtut.teacherName && newEtut.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(newEtut.subject, newEtut.teacherName);
      this.setLastTeacherForSubject(newEtut.subject, newEtut.teacherName);
    }

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);
    this.notify();

    // Supabase anında bulut senkronizasyonu ile sunucu yanıtını doğrula
    // Aşama 179: yeni etütte yorumlar ve (varsa) yoklama da yazılır
    const pushed = await this.pushEtutToSupabase(newEtut, {
      comments: ETUT_COMMENT_KEYS,
      attendance: newEtut.studentAttendance || undefined,
    });

    if (!pushed) {
      // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
      this.etuts = prevEtutsOnCreate;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt buluta kaydedilemedi (yetki veya bağlantı sorunu). Değişiklikler geri alındı.'
      );
      throw new Error('[createEtut] Etüt buluta kaydedilemedi.');
    }

    return newEtut;
  }

  public async updateEtut(id: string, updates: Partial<Etut>): Promise<void> {
    this.assertEtutEditable(id); // Aşama 40
    const prevEtutsOnUpdate = JSON.parse(JSON.stringify(this.etuts));
    const before = this.etuts.find((e) => e.id === id);

    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    const updated = this.etuts.find((e) => e.id === id);
    if (updated?.subject && updated?.teacherName && updated.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(updated.subject, updated.teacherName);
      this.setLastTeacherForSubject(updated.subject, updated.teacherName);
    }

    this.notify();

    // Push to Supabase with await + hata kontrolü
    if (updated) {
      // Aşama 179: yalnız gerçekten değişen yorum alanı ve değişen öğrencilerin yoklaması yazılır
      // (formdaki değişmemiş not başka cihazın yeni notunu ezmez)
      const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const comments = ETUT_COMMENT_KEYS.filter((k) => k in updates && !same((before as any)?.[k], (updated as any)[k]));
      let attendance: Record<string, EtutStudentAttendance> | undefined;
      if (updates.studentAttendance) {
        attendance = {};
        for (const [sid, a] of Object.entries(updated.studentAttendance || {}))
          if (!same(before?.studentAttendance?.[sid], a)) attendance[sid] = a;
      }
      const onlyComments = Object.keys(updates).every((k) => (ETUT_COMMENT_KEYS as string[]).includes(k));
      if (onlyComments && !comments.length) return; // değişen bir şey yok
      const pushed = await this.pushEtutToSupabase(updated, { comments, commentsOnly: onlyComments, attendance });
      if (!pushed) {
        // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
        this.etuts = prevEtutsOnUpdate;
        saveData(STORAGE_KEYS.ETUTS, this.etuts);
        this.notify();

        this.showFloatingErrorToast(
          'Hata: Etüt güncellemesi buluta kaydedilemedi. Değişiklikler geri alındı.'
        );
        throw new Error('[updateEtut] Etüt buluta güncellenemedi.');
      }
    }
  }

  public async updateEtutAttendance(
    etutId: string,
    attendanceData: Record<string, EtutStudentAttendance>
  ): Promise<void> {
    const etutIndex = this.etuts.findIndex((e) => e.id === etutId);
    if (etutIndex === -1) return;
    this.assertEtutEditable(etutId); // Aşama 40

    const prevEtutsOnAttendance = JSON.parse(JSON.stringify(this.etuts));
    const currentEtut = this.etuts[etutIndex];
    const updatedEtut: Etut = {
      ...currentEtut,
      studentAttendance: {
        ...(currentEtut.studentAttendance || {}),
        ...attendanceData,
      },
    };

    this.etuts = this.etuts.map((e, idx) => (idx === etutIndex ? updatedEtut : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Aşama 198: etüt yoklaması yalnız etut_yoklama tablosuna yazılır; eski "attendance" tablosuna "X (Etüt)" kopyası yazılmaz

    this.notify();

    // Supabase push with await + hata kontrolü
    // Aşama 179: yalnız bu işlemdeki öğrencilerin yoklaması yazılır (diğer öğrencilere ve yorumlara dokunulmaz).
    // Etüde yeni bir öğrenci eklendiyse önce etüt satırı yazılır (yoklama yalnız etüde atanmış öğrenciye yazılabilir).
    const assignedNow = Array.isArray(currentEtut.assignedStudentIds) ? currentEtut.assignedStudentIds : [];
    const needsAssign = Object.keys(attendanceData).some((sid) => !assignedNow.includes(sid));
    const pushed = await this.pushEtutToSupabase(updatedEtut, { attendance: attendanceData, attendanceOnly: !needsAssign });
    if (!pushed) {
      // ROLLBACK: Yoklama buluta kaydedilemediyse etüt state'ini eski haline döndür
      this.etuts = prevEtutsOnAttendance;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt yoklaması buluta kaydedilemedi. Değişiklikler geri alındı.'
      );
      throw new Error('[updateEtutAttendance] Yoklama buluta kaydedilemedi.');
    }
  }

  public async deleteEtut(id: string): Promise<void> {
    this.assertEtutEditable(id); // Aşama 40
    const prevEtutsOnDelete = JSON.parse(JSON.stringify(this.etuts));
    const prevDeletedEtutIds = new Set(this.deletedEtutIds);

    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();

    // Supabase delete with await + hata kontrolü
    try {
      const { error } = await deleteRowsVerified('etuts', [id]);
      if (error) throw error;
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.etuts = prevEtutsOnDelete;
      this.deletedEtutIds = prevDeletedEtutIds;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Etüt silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Etüt bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteEtut] Etüt buluttan silinemedi: ${errMsg}`);
    }
  }

  // --- HELPER QUERIES ---
  public getHomeworksForStudent(studentId: string): {
    homework: Homework;
    submission?: HomeworkSubmission;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
    isUrgent: boolean;
  }[] {
    const student = this.students.find((s) => s.id === studentId);
    const now = new Date().getTime();

    // Students can see homework if:
    // 1) assignedTo is 'all'
    // 2) assignedTo array includes studentId
    // 3) isGlobalForNewStudents is true (any student who registers later can see all prior homework)
    // 4) targetClassIds matches student class
    const eligibleHomeworks = this.homeworks.filter((hw) =>
      this.isHomeworkForStudent(hw, { id: studentId, classId: student?.classId })
    );

    return eligibleHomeworks.map((hw) => {
      const submission = this.submissions.find(
        (s) => s.homeworkId === hw.id && s.studentId === studentId
      );

      const dueTime = new Date(hw.dueDate).getTime();
      const hoursRemaining = (dueTime - now) / (1000 * 60 * 60);

      let status: 'on_time' | 'late' | 'not_submitted' | 'due_soon' = 'not_submitted';
      const isUrgent = !submission && hoursRemaining > 0 && hoursRemaining <= 48;

      if (submission) {
        status = submission.status;
      } else if (now > dueTime) {
        status = 'not_submitted'; // overdue
      } else if (hoursRemaining <= 48) {
        status = 'due_soon';
      }

      return {
        homework: hw,
        submission,
        status,
        isUrgent,
      };
    });
  }

  public getEtutsForStudent(studentId: string): Etut[] {
    const student = this.students.find((s) => s.id === studentId);
    const studentGrade = student?.className;

    return this.etuts.filter((etut) => {
      // 1. Genel herkese açık etütler
      if (etut.assignedStudentIds === 'all') return true;
      // 2. Bireysel seçilmiş öğrenci
      if (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.includes(studentId))
        return true;
      // 3. Yoklama listesinde kayıtlı öğrenci
      if (etut.studentAttendance && etut.studentAttendance[studentId])
        return true;
      // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
      if (!etut.assignedStudentIds || (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.length === 0)) {
        if (etut.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(etut.gradeLevel.split('.')[0].toLowerCase())) {
          return true;
        }
        return true; // Kademe genel etüdü
      }
      return false;
    });
  }

  public getHomeworks(forTeacherId?: string): Homework[] {
    const k = this.myKurum;
    return this.memoView('Homeworks:' + (forTeacherId || ''), [this.homeworks, this.teachers, this.classes, this.students], this.viewKey(`${forTeacherId || ''}|${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}`), () => this.computeHomeworks(forTeacherId));
  }
  protected computeHomeworks(forTeacherId?: string): Homework[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Aşama 40: genel yönetici tüm ödevleri görür; kurum yöneticisi kendi ödevlerini ve YALNIZCA kendi kurumuna
      // kayıtlı öğretmenlerin ödevlerini görür (genel yöneticinin öğretmenlerinin ödevleri görünmez)
      if (this.isTeacherAdmin(teacher)) {
        if (!forTeacherId && session?.role === 'teacher' && this.isKurumAdmin()) {
          return this.homeworks.filter((hw) => this.isMyHomework(hw, teacher) || this.ownersInMyKurum(this.homeworkOwnerIds(hw)));
        }
        return [...this.homeworks];
      }

      // Aşama 82: Rehberlik (tüm kurum) ve Zümre Başkanı (zümresi) — veritabanının açtığı ödevler (salt görüntüleme)
      if (!forTeacherId && session?.role === 'teacher' && this.roleSeesOthersWork()) {
        return [...this.homeworks];
      }

      // Normal öğretmen daha önce veya başka öğretmenlerin verdiği ödevleri GÖREMEZ. YALNIZCA KENDİ verdiği ödevleri görebilir.
      return this.homeworks.filter((hw) => {
        return (
          (!!teacher?.auth_user_id && hw.teacherAuthId === teacher.auth_user_id) ||
          hw.teacherId === teacherId ||
          (!!teacher?.name && hw.createdByName === teacher.name)
        );
      });
    }

    if (session?.role === 'student') {
      const sessionStudent = session.user as Student;
      const student = this.students.find((s) => s.id === sessionStudent.id) || sessionStudent;
      return this.homeworks.filter((hw) => this.isHomeworkForStudent(hw, student));
    }

    return [...this.homeworks];
  }

  public getEtuts(forTeacherId?: string): Etut[] {
    const k = this.myKurum;
    return this.memoView('Etuts:' + (forTeacherId || ''), [this.etuts, this.teachers, this.classes, this.students], this.viewKey(`${forTeacherId || ''}|${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}`), () => this.computeEtuts(forTeacherId));
  }
  /**
   * Aşama 111: EKRANLARDA gösterilecek etütler (tek kural, tüm ekranlar bunu kullanır).
   * Ortak takvim satırları (başka öğretmenin, ortak öğrencili etüdü) yalnız çakışma uyarısı içindir; hiçbir
   * listede / sayaçta görünmez. Gerisini veritabanı belirler: öğretmen kendi kaydettiği ve kendisine verilen
   * etütleri, Zümre Başkanı ek olarak zümresini, Rehberlik ve idare kurumun tamamını alır.
   */
  public getVisibleEtuts(): Etut[] {
    const all = this.getEtuts();
    return this.memoView('VisibleEtuts', [all, this.etuts], this.viewKey(), () => {
      // Yalnız sunucudan "ortak takvim" olarak gelen satırlar gizlenir. Ekranda ayrıntısı kapatılan (ör. dış etüt
      // öğretmeninin) ama veritabanının bu kişiye tam verdiği etüt listede kalır (bugünkü gibi ayrıntısız görünür).
      const shared = new Set<string>();
      for (const e of this.etuts) if (e.privacyRedacted) shared.add(e.id);
      if (!shared.size) return all;
      return all.filter((e) => !shared.has(e.id));
    });
  }
  /** Kurumun tüm etütlerini görür (Etütler › "Tüm okul", Takip görünümü): genel yönetici, idare, Rehberlik */
  public seesAllEtuts(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    return this.isHeadAdmin() || this.isCurrentUserAdmin() || this.isKurumAdmin() || this.hasRole('rehberlik');
  }
  /** Başka öğretmene etüt verebilir mi (veritabanı da denetler, sql/111): genel yönetici, idare, Rehberlik */
  public canAssignEtutToOthers(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    if (this.isHeadAdmin() || this.isCurrentUserAdmin() || this.isKurumAdmin()) return true;
    // Aşama 143: kişiye özel "Başka öğretmen adına etüt" izni (etut_teacher_options ile aynı)
    return this.rolesActive() && this.permOr('etut_ata', () => this.hasRole('rehberlik'));
  }
  /** Ekranda düzenle / sil / yoklama düğmeleri açık mı (Rehberlik ve Zümre başkasınınkini yalnız görür) */
  public canEditEtutPublic(e: Etut): boolean {
    if (e.privacyRedacted) return false;
    return this.canEditEtut(e);
  }
  protected computeEtuts(forTeacherId?: string): Etut[] {
    const session = this.getAuthSession();

    // Öğretmen ve Yönetici Görünümü:
    // Bilgisayar, tablet ve telefondan açılan tüm oturumlarda kurumdaki planlı etütlerin eksiksiz görünmesi sağlanır
    if (forTeacherId || session?.role === 'teacher') {
      // Aşama 40: başka öğretmenin etüdünde yalnızca gün / saat / öğretmen / sınıf bilgisi görünür
      if (session?.role === 'teacher' && !this.isHeadAdmin()) {
        // Aşama 82: Zümre Başkanı başkasının etüdünü görür ama öğrenci notlarını / anlatılan konuyu görmez (yetki tablosu)
        const stripNotes = this.hasRole('zumre_baskani') && !this.hasRole('rehberlik') && !this.isKurumAdmin();
        return this.etuts.map((e) => {
          if (e.privacyRedacted) return e;
          if (!this.canSeeEtutDetails(e)) return redactEtut(e);
          if (stripNotes && !this.isMyEtut(e) && e.studentAttendance) {
            const att: Record<string, any> = {};
            Object.entries(e.studentAttendance).forEach(([sid, rec]) => {
              att[sid] = rec ? { ...rec, note: '', topic: '' } : rec;
            });
            return { ...e, studentAttendance: att, teacherFeedback: '' };
          }
          return e;
        });
      }
      return [...this.etuts];
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      const student = this.students.find((s) => s.id === studentId);
      const studentGrade = student?.className;

      // Aşama 40: öğrenci başka öğrencilerin yoklama notlarını almaz (yalnızca kendi satırı)
      const ownOnly = (e: Etut): Etut =>
        e.studentAttendance
          ? { ...e, studentAttendance: e.studentAttendance[studentId] ? { [studentId]: e.studentAttendance[studentId] } : {} }
          : e;
      return this.etuts.map(ownOnly).filter((e) => {
        // 1. Genel herkese açık etütler
        if (e.assignedStudentIds === 'all') return true;
        // 2. Bireysel seçilmiş öğrenci
        if (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.includes(studentId))
          return true;
        // 3. Yoklama listesinde kayıtlı öğrenci
        if (e.studentAttendance && e.studentAttendance[studentId])
          return true;
        // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
        if (!e.assignedStudentIds || (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.length === 0)) {
          if (e.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(e.gradeLevel.split('.')[0].toLowerCase())) {
            return true;
          }
          return true;
        }
        return false;
      });
    }

    return [...this.etuts];
  }

  public getSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    return this.memoView('Submissions:' + (forTeacherId || ''), [this.submissions, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeSubmissions(forTeacherId));
  }
  protected computeSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (this.yoneticiKaydi(teacher)) return [...this.submissions]; // Aşama 243: portal

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.submissions.filter((sub) => visibleStudents.has(sub.studentId));
    }

    if (session?.role === 'student') {
      return this.submissions.filter((sub) => sub.studentId === session.user.id);
    }

    return [...this.submissions];
  }

  public getStudentHomeworkStatus(homeworkId: string, studentId: string): {
    label: string;
    emoji: string;
    badgeClass: string;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
  } {
    const hw = this.homeworks.find((h) => h.id === homeworkId);
    const sub = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const now = new Date().getTime();

    if (sub) {
      if (sub.status === 'on_time') {
        return {
          label: 'Zamanında Teslim Edildi',
          emoji: '🌟',
          badgeClass: 'bg-success-soft text-success-fg border-success/30', // Aşama 288: Odak tokenları (eski sınıflar koyu zemine göreydi; açık temada yazı okunmuyordu)
          status: 'on_time',
        };
      } else {
        return {
          label: 'Gecikmeli Teslim',
          emoji: '⚠️',
          badgeClass: 'bg-warning-soft text-warning-fg border-warning/30',
          status: 'late',
        };
      }
    }

    if (hw) {
      const dueTime = new Date(hw.dueDate).getTime();
      const diffHours = (dueTime - now) / (1000 * 60 * 60);

      if (now > dueTime) {
        return {
          label: 'Teslim Edilmedi (Gecikti)',
          emoji: '🚨',
          badgeClass: 'bg-danger-soft text-danger-fg border-danger/30',
          status: 'not_submitted',
        };
      } else if (diffHours <= 48) {
        return {
          label: 'Yaklaşıyor (Son 48s)',
          emoji: '⏳',
          badgeClass: 'bg-warning-soft text-warning-fg border-warning/30',
          status: 'due_soon',
        };
      }
    }

    return {
      label: 'Bekliyor',
      emoji: '📝',
      badgeClass: 'bg-surface-2 text-fg-2 border-line-strong',
      status: 'not_submitted',
    };
  }

  // =========================================================================
  // DERS BAZLI AÇILIR MENÜ (DROPDOWN) ETÜT ÖĞRETMENLERİ YÖNETİMİ
  // =========================================================================
  protected static readonly AUTO_SEEDED_TEACHER_NAMES = new Set([
    'Gülderen Akgün',
    'Gül Deniz',
    'Tunahan Çetin',
    'Kemal onarıcı',
    'Kemal Onarıcı',
    'Cihan Baysal',
    'Tuğçe Özsoy',
    'Elif Şahin',
    'Zeynep Kaya',
    'Ahmet Yılmaz',
    'Murat Demir',
    'John Miller',
    'Sarah Jenkins',
    'Ali Demir',
    'Mehmet Öztürk',
    'Ayşe Yılmaz',
    'Öğretmen',
    'Sistem Öğretmeni',
    'Etüt Öğretmeni',
  ]);

  public getSubjectTeachersMap(): Record<string, string[]> {
    // Otomatik eklenen sahte ve önceden atanmış etüt öğretmenleri tamamen temizlendi
    const cleanedMap: Record<string, string[]> = {};

    try {
      const stored = localStorage.getItem('etut_subject_teachers_map');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          let wasModified = false;
          for (const [subj, teachers] of Object.entries(parsed)) {
            if (Array.isArray(teachers)) {
              const filtered = teachers.filter(
                (name) =>
                  typeof name === 'string' &&
                  name.trim() !== '' &&
                  !OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(name.trim())
              );
              if (filtered.length !== teachers.length) {
                wasModified = true;
              }
              if (filtered.length > 0) {
                cleanedMap[subj] = Array.from(new Set(filtered));
              }
            }
          }
          if (wasModified) {
            localStorage.setItem('etut_subject_teachers_map', JSON.stringify(cleanedMap));
          }
          return cleanedMap;
        }
      }
    } catch {
      // fallback
    }
    return cleanedMap;
  }

  public getTeachersForSubject(subject: string): string[] {
    const map = this.getSubjectTeachersMap();
    const trLc = (v: string) => v.toLocaleLowerCase('tr-TR'); // Aşama 154: "İNGİLİZCE" = "İngilizce"
    const cleanSub = trLc((subject || '').trim());
    const resultTeachers: string[] = [];

    // 1. Kullanıcının daha önce bu ders için kaydettiği öğretmenler
    if (map[subject] && Array.isArray(map[subject])) {
      resultTeachers.push(...map[subject]);
    }
    const foundKey = Object.keys(map).find(
      (k) =>
        trLc(k) === cleanSub ||
        cleanSub.includes(trLc(k)) ||
        trLc(k).includes(cleanSub)
    );
    if (foundKey && map[foundKey] && Array.isArray(map[foundKey])) {
      resultTeachers.push(...map[foundKey]);
    }

    // 2. Sistemde kayıtlı ve onaylanmış branş öğretmenleri
    if (this.teachers && this.teachers.length > 0) {
      this.teachers.forEach((t) => {
        if (!t.name || t.status === 'pending') return;
        const trimmed = t.name.trim();
        if (OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(trimmed)) return;

        const tb = trLc(t.branch || '');
        if (!tb || tb === cleanSub || tb.includes(cleanSub) || cleanSub.includes(tb)) {
          resultTeachers.push(trimmed);
        }
      });
    }

    // 3. Oturum açmış olan öğretmen
    const session = this.getAuthSession();
    if (session?.role === 'teacher' && session.user?.name) {
      const tName = session.user.name.trim();
      if (!OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(tName)) {
        resultTeachers.push(tName);
      }
    }

    // Tekilleştirme ve temizleme
    return Array.from(new Set(resultTeachers.filter((t) => t && !OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(t))));
  }

  public getLastTeacherForSubject(subject: string): string {
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      const stored = localStorage.getItem(`etut_last_teacher_${cleanSub}`);
      if (stored && typeof stored === 'string') {
        const clean = stored.trim();
        if (clean && !OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(clean)) {
          return clean;
        } else {
          localStorage.removeItem(`etut_last_teacher_${cleanSub}`);
        }
      }
    } catch {}
    const list = this.getTeachersForSubject(subject);
    return list.length > 0 ? list[0] : '';
  }

  public setLastTeacherForSubject(subject: string, teacherName: string): void {
    const clean = (teacherName || '').trim();
    if (!clean || OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(clean)) return;
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      localStorage.setItem(`etut_last_teacher_${cleanSub}`, clean);
    } catch {}
  }

  public addTeacherToSubject(subject: string, teacherName: string): Record<string, string[]> {
    const cleanName = (teacherName || '').trim();
    if (!cleanName || OdevEtutKatmani.AUTO_SEEDED_TEACHER_NAMES.has(cleanName)) {
      return this.getSubjectTeachersMap();
    }
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    const list = map[targetKey] ? [...map[targetKey]] : [];
    if (!list.includes(cleanName)) {
      list.push(cleanName);
      map[targetKey] = list;
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.setLastTeacherForSubject(targetKey, cleanName);
      this.notify();
    }
    return map;
  }

  public removeTeacherFromSubject(subject: string, teacherName: string): Record<string, string[]> {
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    if (map[targetKey]) {
      map[targetKey] = map[targetKey].filter((t) => t !== teacherName);
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.notify();
    }
    return map;
  }
}
