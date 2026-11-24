// ============================================================================
// Aşama 360: SORU TAKİBİ: soru kayıtları, plan görevi soruları, haftalık soru hedefleri
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → iletisim → odevEtut → soruTakibi → dataService
// ============================================================================
import { Student, StudentQuestionLog, QuestionLogPlanPart, QuestionLogSubjectEntry, WeeklyQuestionTarget } from '../../types';
import { supabase } from '../../lib/supabase';
import { getStudentQuestionSubjects } from '../../constants/schoolConstants';
import {
  normalizeSubject,
  targetSubjectList,
  targetSubjectMatcher,
  sameTargetSubjects,
  sameSubjectName,
} from '../../lib/subjects';
import { isPendingPlanTarget, isPlanTopicRecord } from '../../utils/targetDays';
import { STORAGE_KEYS, appStorage, saveData } from '../depo';
import { questionLogToRow, questionLogFromRow, isClassQuestionTarget, questionTargetToRow } from '../satirDonusumleri';
import { questionLogDbError } from '../hataMetinleri';
import { deleteRowsVerified, hasCloudSession } from '../bulutIslemleri';
import { newQuestionTargetId, questionTargetOwnerKey } from '../kayitKurallari';
import { OdevEtutKatmani } from './odevEtut';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class SoruTakibiKatmani extends OdevEtutKatmani {

  // --- QUESTION LOGS (SORU SAYISI TAKİP) ---
  public getQuestionLogs(): StudentQuestionLog[] {
    return this.memoView('QuestionLogs', [this.questionLogs, this.teachers, this.classes, this.students], this.viewKey(), () => this.computeQuestionLogs());
  }
  protected computeQuestionLogs(): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      return this.questionLogs.filter((q) => q.studentId === session.user.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.questionLogs];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      return this.questionLogs.filter((q) => visibleStudentIds.has(q.studentId));
    }
    return [...this.questionLogs];
  }

  public getQuestionLogsByStudent(studentId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student' && session.user.id !== studentId) {
      return [];
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        if (!visibleStudentIds.has(studentId)) {
          return [];
        }
      }
    }
    return this.questionLogs.filter((q) => q.studentId === studentId);
  }

  public getQuestionLogsByClass(classId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      const student = session.user as Student;
      if (student.classId !== classId) return [];
      return this.questionLogs.filter((q) => q.studentId === student.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleClassIds = new Set(this.getClasses(teacher?.id).map((c) => c.id));
        if (!visibleClassIds.has(classId)) {
          return [];
        }
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        return this.questionLogs.filter((q) => q.classId === classId && visibleStudentIds.has(q.studentId));
      }
    }
    return this.questionLogs.filter((q) => q.classId === classId);
  }

  public async saveQuestionLog(
    logData: Omit<StudentQuestionLog, 'id' | 'createdAt' | 'totalQuestions'> & {
      id?: string;
      totalQuestions?: number;
    }
  ): Promise<StudentQuestionLog> {
    this.assertNotPreview(); // Aşama 107
    // Girilen değerler doğrulanır; geçersiz kayıt hiç yazılmaz (Türkçe hata fırlatılır)
    const MAX_COUNT = 1000;
    const date = String(logData.date || '').trim();
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const dateObj = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : null;
    if (!dm || !dateObj || dateObj.getDate() !== +dm[3] || dateObj.getMonth() !== +dm[2] - 1) {
      throw new Error('Geçerli bir tarih seçmelisin.');
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date > todayStr) {
      throw new Error('İleri bir tarihe soru kaydı girilemez.');
    }
    const toCount = (v: unknown, label: string, subject: string): number => {
      if (v === undefined || v === null || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT || !/^\d+$/.test(String(v).trim())) {
        throw new Error(`${subject}: ${label} 0 ile ${MAX_COUNT} arasında bir tam sayı olmalı.`);
      }
      return n;
    };

    // Aynı ders birden fazla kez girildiyse sayılar toplanır
    const merged = new Map<
      string,
      { subject: string; questionCount: number; correctCount: number; wrongCount: number; topics: string[]; planParts: QuestionLogPlanPart[]; planGiven: boolean }
    >();
    for (const e of logData.entries || []) {
      const subject = String(e.subject || '').trim();
      if (!subject) throw new Error('Ders adı boş olamaz.');
      const qc = toCount(e.questionCount, 'soru sayısı', subject);
      const c = toCount(e.correctCount, 'doğru sayısı', subject);
      const w = toCount(e.wrongCount, 'yanlış sayısı', subject);
      if (c + w > qc) throw new Error(`${subject}: doğru + yanlış, soru sayısından fazla olamaz.`);
      if (qc === 0) continue;
      const cur = merged.get(subject) || { subject, questionCount: 0, correctCount: 0, wrongCount: 0, topics: [], planParts: [], planGiven: false };
      cur.questionCount += qc;
      cur.correctCount += c;
      cur.wrongCount += w;
      const topic = String(e.topic || '').trim();
      if (topic && !cur.topics.includes(topic)) cur.topics.push(topic);
      // Aşama 46: plan görevlerinden aktarılan pay (varsa) korunur
      if (Array.isArray(e.planItems)) {
        cur.planGiven = true;
        for (const p of e.planItems) {
          const pid = String(p?.id || '').trim();
          const n = Math.max(0, Math.round(Number(p?.count) || 0));
          if (!pid || n <= 0) continue;
          const ex = cur.planParts.find((x) => x.id === pid);
          if (ex) ex.count += n;
          else cur.planParts.push({ id: pid, count: n });
        }
      }
      merged.set(subject, cur);
    }
    // Aşama 46: Soru Kaydet formu plan payını bilmez; formdan gelen kayıtta o günün önceki kaydındaki
    // plan payları aynı derse taşınır. Pay, dersin soru sayısını hiçbir zaman aşmaz.
    const prevSameDay = logData.id
      ? this.questionLogs.find((q) => q.id === logData.id)
      : this.questionLogs.find((q) => q.studentId === logData.studentId && q.date === date);
    for (const m of merged.values()) {
      if (!m.planGiven && prevSameDay) {
        for (const pe of prevSameDay.entries || []) {
          if (!sameSubjectName(pe.subject, m.subject) || !Array.isArray(pe.planItems)) continue;
          for (const p of pe.planItems) {
            const n = Math.max(0, Math.round(Number(p?.count) || 0));
            if (p?.id && n > 0 && !m.planParts.some((x) => x.id === p.id)) m.planParts.push({ id: String(p.id), count: n });
          }
        }
      }
      let room = m.questionCount;
      m.planParts = m.planParts
        .map((p) => {
          const n = Math.min(p.count, room);
          room -= n;
          return { id: p.id, count: n };
        })
        .filter((p) => p.count > 0);
    }
    for (const m of merged.values()) {
      if (m.questionCount > MAX_COUNT) throw new Error(`${m.subject}: bir günde en fazla ${MAX_COUNT} soru girilebilir.`);
    }
    if (merged.size === 0) {
      throw new Error('En az bir ders için soru sayısı girmelisin.');
    }

    let calculatedTotal = 0;
    let calculatedCorrect = 0;
    let calculatedWrong = 0;
    let calculatedEmpty = 0;
    const cleanEntries = Array.from(merged.values()).map((m) => {
      const emp = Math.max(0, m.questionCount - m.correctCount - m.wrongCount);
      calculatedTotal += m.questionCount;
      calculatedCorrect += m.correctCount;
      calculatedWrong += m.wrongCount;
      calculatedEmpty += emp;
      return {
        subject: m.subject,
        questionCount: m.questionCount,
        correctCount: m.correctCount,
        wrongCount: m.wrongCount,
        emptyCount: emp,
        topic: m.topics.join(', ').slice(0, 200),
        ...(m.planParts.length ? { planItems: m.planParts } : {}),
      };
    });

    // Toplamlar her zaman derslerden hesaplanır (tutarsız toplam yazılmaz)
    const finalTotal = calculatedTotal;
    const finalCorrect = calculatedCorrect;
    const finalWrong = calculatedWrong;
    const finalEmpty = calculatedEmpty;
    const notes = String(logData.notes || '').trim().slice(0, 300);

    // Aynı öğrenci + aynı tarih için kayıt varsa o kayıt güncellenir (form o günün tüm derslerini içerir)
    const existingIdx = logData.id
      ? this.questionLogs.findIndex((q) => q.id === logData.id)
      : this.questionLogs.findIndex(
          (q) => q.studentId === logData.studentId && q.date === date
        );

    const prevLogs = [...this.questionLogs];
    let saved: StudentQuestionLog;
    if (existingIdx !== -1) {
      saved = {
        ...this.questionLogs[existingIdx],
        ...logData,
        date,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes,
      } as StudentQuestionLog;
      const target = saved;
      // Aynı gün için yerelde kalmış kopyalar (eski sürümler) çift sayılmasın
      this.questionLogs = this.questionLogs
        .map((q, i) => (i === existingIdx ? target : q))
        .filter((q) => q.id === target.id || !(q.studentId === target.studentId && q.date === target.date));
    } else {
      saved = {
        id: logData.id || `qlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId: logData.studentId,
        studentName: logData.studentName,
        classId: logData.classId,
        className: logData.className,
        date,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes,
        createdAt: new Date().toISOString(),
      };
      this.questionLogs = [saved, ...this.questionLogs];
    }
    this.persistQuestionLogsLocal();
    this.notify();

    await this.runCloudWrite(
      async () => {
        this.noteQuestionLogWrite(saved);
        let res = await supabase.from('question_logs').upsert(questionLogToRow(saved), { onConflict: 'id' });
        if (res.error?.code === '23505') {
          // Aynı gün için başka bir cihazdan açılmış kayıt var: o kayıt güncellenir
          const { data: other } = await supabase
            .from('question_logs')
            .select('id')
            .eq('student_id', saved.studentId)
            .eq('date', saved.date)
            .maybeSingle();
          if (other?.id) {
            const oldId = saved.id;
            saved = { ...saved, id: other.id };
            const merged = saved;
            this.questionLogs = this.questionLogs
              .filter((q) => q.id !== other.id)
              .map((q) => (q.id === oldId ? merged : q));
            this.noteQuestionLogWrite(saved);
            res = await supabase.from('question_logs').upsert(questionLogToRow(saved), { onConflict: 'id' });
          }
        }
        if (res.error) this.recentQuestionLogWrites.delete(saved.id);
        return { error: questionLogDbError(res.error) };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );

    this.persistQuestionLogsLocal();
    this.notify();
    return saved;
  }

  public async deleteQuestionLog(id: string): Promise<void> {
    this.assertNotPreview(); // Aşama 107
    const prevLogs = [...this.questionLogs];
    const wasTombstoned = this.deletedQuestionLogIds.has(id);
    this.deletedQuestionLogIds.add(id);
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    this.persistQuestionLogsLocal();

    // Eski sürüm yerel yedeklerde kalan kopyalar da temizlenir (geri dirilmesin)
    [
      'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4', 'edu_sys_question_logs_v3',
      'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1', 'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ].forEach((legacyKey) => {
      try {
        const val = localStorage.getItem(legacyKey);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            localStorage.setItem(legacyKey, JSON.stringify(parsed.filter((q: any) => q.id !== id)));
          }
        }
      } catch {}
    });
    this.notify();

    await this.runCloudWrite(
      async () => {
        const res = await deleteRowsVerified('question_logs', [id]);
        return { error: questionLogDbError(res.error) };
      },
      () => {
        this.questionLogs = prevLogs;
        if (!wasTombstoned) this.deletedQuestionLogIds.delete(id);
        saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı silinemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  // ---------------------------------------------------------------------------
  // Aşama 46: Günlük plan görevi "yaptım" işaretlenince görevin soru sayısı soru kaydına aktarılır.
  // Her görevin payı, o dersin kaydında görev kimliğiyle tutulur; böylece işaret kaldırılınca
  // yalnızca o pay geri alınır, öğrenci fazladan çözdüyse payı güncelleyebilir.
  // ---------------------------------------------------------------------------
  protected planQuestionQueue: Promise<unknown> = Promise.resolve();

  /** Görevin soru kaydına aktarılmış payı (aktarılmamışsa null). Yalnızca öğrenci oturumunda. */
  public getPlanTaskQuestionShare(itemId: string): { date: string; subject: string; count: number } | null {
    const session = this.getAuthSession();
    if (session?.role !== 'student' || !itemId) return null;
    for (const log of this.questionLogs) {
      if (log.studentId !== session.user.id) continue;
      for (const e of log.entries || []) {
        const p = (e.planItems || []).find((x) => x.id === itemId);
        if (p) return { date: log.date, subject: e.subject, count: Number(p.count) || 0 };
      }
    }
    return null;
  }

  /**
   * Görevin soru kaydındaki payını `count` yapar (0 = payı kaldırır). Görev daha önce aktarıldıysa
   * aynı gün ve derste güncellenir; aktarılmadıysa görevin gününe (ileri tarihse bugüne) eklenir.
   * Çağrılar sırayla çalışır (art arda işaretlemede kayıtlar birbirini ezmez).
   */
  public setPlanTaskQuestions(opts: { itemId: string; subject: string; date: string; count: number }): Promise<{ date: string; subject: string; count: number; subjectTotal: number }> {
    if (this.isStudentPreview()) return Promise.reject(new Error('Önizleme: öğrenci adına işlem yapılamaz.')); // Aşama 107
    const run = this.planQuestionQueue.then(
      () => this.setPlanTaskQuestionsNow(opts),
      () => this.setPlanTaskQuestionsNow(opts)
    );
    this.planQuestionQueue = run.catch(() => undefined);
    return run;
  }

  protected async setPlanTaskQuestionsNow(opts: { itemId: string; subject: string; date: string; count: number }): Promise<{ date: string; subject: string; count: number; subjectTotal: number }> {
    const session = this.getAuthSession();
    if (session?.role !== 'student') throw new Error('Soru kaydı yalnızca öğrenci hesabıyla güncellenebilir.');
    const student = session.user as Student;
    const itemId = String(opts.itemId || '').trim();
    if (!itemId) throw new Error('Görev bulunamadı.');
    const want = Number(opts.count);
    if (!Number.isInteger(want) || want < 0 || want > 1000) throw new Error('Soru sayısı 0 ile 1000 arasında bir tam sayı olmalı.');

    const pad = (n: number) => String(n).padStart(2, '0');
    const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const todayStr = dstr(now);

    // Buluttaki güncel kayıtlar okunur: başka cihazdan girilmiş sayılar eski yerel veriyle ezilmesin
    if (await hasCloudSession()) {
      const from = dstr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21));
      const { data, error } = await supabase.from('question_logs').select('*').eq('student_id', student.id).gte('date', from);
      if (error || !Array.isArray(data)) throw new Error('Soru kayıtların okunamadı. Bağlantını kontrol edip tekrar dene.');
      this.mergeQuestionLogs(
        data.map((r: any) => questionLogFromRow(r)),
        null
      );
    }

    const mine = this.questionLogs.filter((q) => q.studentId === student.id);
    const hasShare = (q: StudentQuestionLog) => (q.entries || []).some((e) => (e.planItems || []).some((p) => p.id === itemId));
    let log = mine.find(hasShare);
    let targetDate: string;
    if (log) {
      targetDate = log.date;
    } else {
      if (want === 0) return { date: '', subject: '', count: 0, subjectTotal: 0 }; // geri alınacak pay yok
      const d = String(opts.date || '').trim();
      targetDate = /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayStr ? d : todayStr;
      log = mine.find((q) => q.date === targetDate);
    }

    const entries: QuestionLogSubjectEntry[] = (log?.entries || []).map((e) => ({
      ...e,
      planItems: (e.planItems || []).map((p) => ({ id: p.id, count: Number(p.count) || 0 })),
    }));
    let idx = entries.findIndex((e) => (e.planItems || []).some((p) => p.id === itemId));
    if (idx >= 0) {
      const e = entries[idx];
      const old = (e.planItems || []).find((p) => p.id === itemId)?.count || 0;
      e.questionCount = Math.max(0, (Number(e.questionCount) || 0) - old);
      e.planItems = (e.planItems || []).filter((p) => p.id !== itemId);
    } else {
      idx = entries.findIndex((e) => sameSubjectName(e.subject, opts.subject));
      if (idx < 0) {
        const list = getStudentQuestionSubjects(student, this.classes);
        const name = list.find((s) => sameSubjectName(s, opts.subject)) || normalizeSubject(opts.subject).trim();
        if (!name) throw new Error('Görevin dersi bulunamadı.');
        entries.push({ subject: name, questionCount: 0, correctCount: 0, wrongCount: 0, planItems: [] });
        idx = entries.length - 1;
      }
    }
    const e = entries[idx];
    e.questionCount = (Number(e.questionCount) || 0) + want;
    if (want > 0) e.planItems = [...(e.planItems || []), { id: itemId, count: want }];
    if (e.questionCount > 1000) throw new Error(`${e.subject}: bir günde en fazla 1000 soru girilebilir.`);
    // Doğru + yanlış, soru sayısını aşamaz (soru azaldıysa önce yanlış, sonra doğru kırpılır)
    let c = Number(e.correctCount) || 0;
    let w = Number(e.wrongCount) || 0;
    if (c + w > e.questionCount) {
      w = Math.min(w, e.questionCount);
      c = Math.min(c, e.questionCount - w);
    }
    e.correctCount = c;
    e.wrongCount = w;
    delete e.emptyCount;

    const remaining = entries.filter((x) => (Number(x.questionCount) || 0) > 0);
    const result = { date: targetDate, subject: e.subject, count: want, subjectTotal: e.questionCount };
    if (remaining.length === 0) {
      // O günün kaydında başka soru kalmadı: kayıt kaldırılır
      if (log) await this.deleteQuestionLog(log.id);
      return result;
    }
    const cls = this.classes.find((x) => x.id === student.classId);
    await this.saveQuestionLog({
      id: log?.id,
      studentId: student.id,
      studentName: log?.studentName || student.name,
      classId: log?.classId || student.classId || '',
      className: log?.className || student.className || cls?.name || 'Belirtilmedi',
      date: targetDate,
      entries: remaining,
      notes: log?.notes || '',
    });
    return result;
  }

  public async clearAllQuestionLogs(): Promise<void> {
    const prevLogs = [...this.questionLogs];
    const ids = this.questionLogs.map((q) => q.id);
    this.questionLogs = [];
    this.persistQuestionLogsLocal();
    this.notify();
    await this.runCloudWrite(
      async () => {
        for (let i = 0; i < ids.length; i += 100) {
          const res = await deleteRowsVerified('question_logs', ids.slice(i, i + 100));
          if (res.error) return res;
        }
        return { error: null };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kayıtları silinemedi'
    );
  }

  // --- SORU HEDEFLERİ (Aşama 10) ---
  // Her öğretmen kendi hedefini verir: aynı öğrenciye aynı dönemde farklı öğretmenlerin ayrı hedefleri olabilir.
  // Sınıf hedefi tek kayıttır; sınıftaki (sonradan eklenenler dahil) her öğrenci onu görür.
  // Bir öğretmenin aynı dönem için hem sınıf hem öğrenci hedefi varsa öğrenciye özel olan geçerlidir.

  // Hedefin bitiş günü (YYYY-MM-DD)
  public questionTargetEnd(t: WeeklyQuestionTarget): string {
    if (t.weekEndDate && /^\d{4}-\d{2}-\d{2}$/.test(t.weekEndDate)) return t.weekEndDate;
    const start = t.weekStartDate || '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (!m) return start;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + Math.max(1, t.targetDays || 7) - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  protected myQuestionTargetOwnerKeys(): Set<string> {
    const me = this.getCurrentTeacher();
    const keys = new Set<string>();
    if (me?.id) keys.add(me.id);
    if (me?.auth_user_id) keys.add(`auth:${me.auth_user_id}`);
    return keys;
  }

  public isMyQuestionTarget(t: WeeklyQuestionTarget): boolean {
    const me = this.getCurrentTeacher();
    if (!me) return false;
    if (t.assignedByTeacherId) return t.assignedByTeacherId === me.id;
    if (t.createdBy && me.auth_user_id) return t.createdBy === me.auth_user_id;
    return false;
  }

  // Düzenleme / silme izni: yönetici her hedefi, öğretmen yalnızca kendi hedefini (ve sahibi bilinmeyen eski kayıtları)
  public canEditQuestionTarget(t: WeeklyQuestionTarget): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    if (this.isCurrentUserAdmin()) return true;
    if (!t.assignedByTeacherId && !t.createdBy) return true;
    return this.isMyQuestionTarget(t);
  }

  // Aşama 30: günlük plandan aktarılan KONU kayıtları (soru sayısı 0/1) hedef değildir; hiçbir hedef
  // listesinde, tabloda, grafikte ya da hesapta görünmez. Konular getPlanTopicsForStudentDay ile okunur.
  public getWeeklyQuestionTargets(): WeeklyQuestionTarget[] {
    // Aşama 84: aynı veriyle defalarca istendiğinde (aylık / haftalık hesaplar) her seferinde yeniden süzülmez
    const k = this.myKurum;
    return this.memoView(
      'WeeklyQuestionTargets',
      [this.weeklyQuestionTargets, this.teachers, this.classes, this.students],
      this.viewKey(`${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}${k.rolesEnabled ? 1 : 0}`),
      () => this.visibleQuestionTargetRecords().filter((t) => !isPendingPlanTarget(t))
    );
  }

  // Oturumdaki kullanıcının görebildiği TÜM kayıtlar (hedefler + plan konu kayıtları)
  protected visibleQuestionTargetRecords(): WeeklyQuestionTarget[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      const myId = session.user.id;
      const myClassId = this.students.find((s) => s.id === myId)?.classId || (session.user as any).classId;
      return this.weeklyQuestionTargets.filter((t) =>
        isClassQuestionTarget(t) ? !!myClassId && t.classId === myClassId : t.studentId === myId
      );
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.weeklyQuestionTargets];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      const visibleClassIds = new Set(this.getClasses().map((c) => c.id));
      return this.weeklyQuestionTargets.filter((t) =>
        isClassQuestionTarget(t) ? !!t.classId && visibleClassIds.has(t.classId) : !!t.studentId && visibleStudentIds.has(t.studentId)
      );
    }
    return [...this.weeklyQuestionTargets];
  }

  /**
   * Aşama 30 (eksikti — öğrenci "Soru Sayısı" sayfası bu yüzden hata veriyordu):
   * Öğretmenin "Soru takibine aktar" ile gönderdiği konular: verilen gün için ders → konu listesi.
   * Hem plan konu kayıtlarından hem de konu eklenmiş gerçek hedeflerden okunur (öğrenci + sınıf kayıtları).
   */
  public getPlanTopicsForStudentDay(studentId: string, ymd: string): Array<{ subject: string; topic: string }> {
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return [];
    const classId = this.students.find((s) => s.id === studentId)?.classId;
    const bySubject = new Map<string, string[]>();
    for (const t of this.visibleQuestionTargetRecords()) {
      const mine = isClassQuestionTarget(t) ? !!classId && t.classId === classId : t.studentId === studentId;
      if (!mine) continue;
      const topic = String((t.dailyTopics || {})[ymd] || '').replace(/\s+/g, ' ').trim();
      if (!topic) continue;
      if ((t.weekStartDate || '') > ymd || this.questionTargetEnd(t) < ymd) continue;
      for (const subject of targetSubjectList(t.subject)) {
        const list = bySubject.get(subject) || [];
        if (!list.includes(topic)) list.push(topic);
        bySubject.set(subject, list);
      }
    }
    return Array.from(bySubject.entries()).map(([subject, list]) => ({ subject, topic: list.join(', ').slice(0, 120) }));
  }

  /**
   * Aşama 30 (eksikti — "Soru takibine aktar" düğmesi bu yüzden hata veriyordu):
   * Bu öğretmenin, öğrenci için verilen tarih aralığına denk gelen PLAN kayıtları (konu kayıtları ve Aşama 43 ile plandaki soru sayılarından oluşan hedefler).
   */
  public getMyPlanTopicRecords(studentId: string, rangeStart: string, rangeEnd: string): WeeklyQuestionTarget[] {
    const mine = this.myQuestionTargetOwnerKeys();
    return this.weeklyQuestionTargets.filter(
      (t) =>
        !isClassQuestionTarget(t) &&
        t.studentId === studentId &&
        isPlanTopicRecord(t) && // Aşama 43: konu kayıtları VE plandaki soru sayılarından oluşan hedefler
        mine.has(questionTargetOwnerKey(t)) &&
        this.questionTargetOverlaps(t, rangeStart, rangeEnd)
    );
  }

  /**
   * Aşama 53: öğrencinin (sınıf kayıtları hariç) verilen tarih aralığına denk gelen TÜM soru kayıtları:
   * öğretmen hedefleri, plandan gelen hedefler ve konu kayıtları — sahibi kim olursa olsun.
   * Plan → Soru Kaydet aktarımı aynı hafta/ders için birden çok kayıt (çift kayıt) kalmasın diye kullanır.
   */
  public getStudentQuestionRecordsInRange(studentId: string, rangeStart: string, rangeEnd: string): WeeklyQuestionTarget[] {
    if (!studentId) return [];
    return this.weeklyQuestionTargets.filter(
      (t) => !isClassQuestionTarget(t) && t.studentId === studentId && this.questionTargetOverlaps(t, rangeStart, rangeEnd)
    );
  }

  public getStudentQuestionTargets(): WeeklyQuestionTarget[] {
    return this.getWeeklyQuestionTargets().filter((t) => !isClassQuestionTarget(t) && !!t.studentId);
  }

  public getClassQuestionTargets(): WeeklyQuestionTarget[] {
    return this.getWeeklyQuestionTargets().filter((t) => isClassQuestionTarget(t) && !!t.classId);
  }

  protected questionTargetOverlaps(t: WeeklyQuestionTarget, rangeStart: string, rangeEnd: string): boolean {
    const start = t.weekStartDate || '';
    if (!start) return false;
    return start <= rangeEnd && this.questionTargetEnd(t) >= rangeStart;
  }

  // Sıralama: önce benim hedefim, sonra başlangıç tarihi
  protected sortQuestionTargets(list: WeeklyQuestionTarget[]): WeeklyQuestionTarget[] {
    return [...list].sort((a, b) => {
      const am = this.isMyQuestionTarget(a) ? 0 : 1;
      const bm = this.isMyQuestionTarget(b) ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.weekStartDate || '').localeCompare(b.weekStartDate || '');
    });
  }

  // Bir öğrencinin verilen tarih aralığına denk gelen geçerli hedefleri (öğrenci + sınıf hedefleri)
  public getQuestionTargetsForStudent(studentId: string, rangeStart: string, rangeEnd: string = rangeStart): WeeklyQuestionTarget[] {
    const student = this.students.find((s) => s.id === studentId);
    const classId = student?.classId;
    const visible = this.getWeeklyQuestionTargets().filter((t) => this.questionTargetOverlaps(t, rangeStart, rangeEnd));
    const own = visible.filter((t) => !isClassQuestionTarget(t) && t.studentId === studentId);
    const cls = classId ? visible.filter((t) => isClassQuestionTarget(t) && t.classId === classId) : [];
    const result = [...own];
    for (const c of cls) {
      // Aynı öğretmenin aynı ders için öğrenciye özel hedefi varsa sınıf hedefi gösterilmez
      const covered = own.some(
        (o) =>
          questionTargetOwnerKey(o) === questionTargetOwnerKey(c) &&
          normalizeSubject(o.subject || '') === normalizeSubject(c.subject || '') &&
          (o.weekStartDate || '') <= this.questionTargetEnd(c) &&
          this.questionTargetEnd(o) >= (c.weekStartDate || '')
      );
      if (!covered) result.push(c);
    }
    return this.sortQuestionTargets(result);
  }

  public getQuestionTargetsForClass(classId: string, rangeStart: string, rangeEnd: string = rangeStart): WeeklyQuestionTarget[] {
    return this.sortQuestionTargets(
      this.getClassQuestionTargets().filter((t) => t.classId === classId && this.questionTargetOverlaps(t, rangeStart, rangeEnd))
    );
  }

  // Eski kullanım için: haftaya denk gelen ilk (öncelikle benim) hedef. Başka haftanın hedefi ASLA döndürülmez.
  public getWeeklyQuestionTarget(studentId: string, weekStartDate?: string): WeeklyQuestionTarget | null {
    if (!weekStartDate) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartDate);
    if (!m) return null;
    const end = new Date(+m[1], +m[2] - 1, +m[3] + 6);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return this.getQuestionTargetsForStudent(studentId, weekStartDate, endStr)[0] || null;
  }

  // Aynı öğretmenin aynı öğrenci/sınıf ve ders için çakışan başka hedefi (yeni kayıtta "güncellenecek" diye gösterilir)
  public findQuestionTargetConflict(draft: WeeklyQuestionTarget): WeeklyQuestionTarget | null {
    const isClass = isClassQuestionTarget(draft);
    const ownerKeys = draft.assignedByTeacherId ? new Set([draft.assignedByTeacherId]) : this.myQuestionTargetOwnerKeys();
    const start = draft.weekStartDate || '';
    const end = this.questionTargetEnd(draft);
    return (
      this.weeklyQuestionTargets.find(
        (t) =>
          t.id !== draft.id &&
          isClassQuestionTarget(t) === isClass &&
          (isClass ? t.classId === draft.classId : t.studentId === draft.studentId) &&
          ownerKeys.has(questionTargetOwnerKey(t)) &&
          sameTargetSubjects(t.subject, draft.subject) &&
          (t.weekStartDate || '') <= end &&
          this.questionTargetEnd(t) >= start
      ) || null
    );
  }

  // Eski sürümün sınıf hedefiyle birlikte öğrencilere kopyaladığı kayıtlar (aynı anda kaydedildikleri için
  // aynı sınıf, aynı başlangıç ve aynı atanma zamanına sahiptirler)
  protected legacyClassTargetCopies(classTarget: WeeklyQuestionTarget): WeeklyQuestionTarget[] {
    if (!classTarget.assignedDate || classTarget.assignedByTeacherId) return [];
    return this.weeklyQuestionTargets.filter(
      (t) =>
        !isClassQuestionTarget(t) &&
        t.classId === classTarget.classId &&
        t.weekStartDate === classTarget.weekStartDate &&
        t.assignedDate === classTarget.assignedDate &&
        !t.assignedByTeacherId
    );
  }

  // Hedefi kaydeder (yeni ya da düzenleme). Kimlik verilirse o kayıt güncellenir.
  public async saveQuestionTarget(draft: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    const isClass = isClassQuestionTarget(draft);
    if (isClass ? !draft.classId : !draft.studentId) throw new Error(isClass ? 'Sınıf seçilmedi.' : 'Öğrenci seçilmedi.');
    if (!draft.weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.weekStartDate)) throw new Error('Başlangıç tarihi geçersiz.');
    const days = Math.max(1, Math.min(366, Math.round(draft.targetDays || 7)));
    // Gün gün farklı dağıtım: yalnızca hedefin tarihleri içindeki günler, 0..2000 arası tam sayılar tutulur
    const rangeEnd = this.questionTargetEnd({ ...draft, targetDays: days });
    let dailyTargets: Record<string, number> | undefined;
    if (draft.dailyTargets && typeof draft.dailyTargets === 'object') {
      const dt: Record<string, number> = {};
      for (const [k, v] of Object.entries(draft.dailyTargets)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k < (draft.weekStartDate || '') || k > rangeEnd) continue;
        dt[k] = Math.max(0, Math.min(2000, Math.round(Number(v) || 0)));
      }
      if (Object.keys(dt).length) dailyTargets = dt;
    }
    const total = dailyTargets
      ? Object.values(dailyTargets).reduce((a, b) => a + b, 0)
      : Math.round(Number(draft.targetQuestions ?? draft.weeklyTarget) || 0);
    // Aşama 30: günlük plandan gelen KONU kaydı soru sayısı taşımaz (0); hedef değildir, yalnızca konuları taşır
    const isTopicRecord = !!draft.fromPlan && !dailyTargets && total <= 0;
    if (total < 1 && !isTopicRecord) throw new Error('Toplam soru hedefi en az 1 olmalı.');
    const daily = isTopicRecord
      ? 0
      : dailyTargets
      ? Math.max(1, Math.round(total / days))
      : Math.max(1, Math.round(Number(draft.dailyTarget) || total / days));
    const me = this.getCurrentTeacher();
    const existing = draft.id ? this.weeklyQuestionTargets.find((t) => t.id === draft.id) : undefined;
    if (existing && !this.canEditQuestionTarget(existing)) throw new Error('Bu hedefi yalnızca hedefi veren öğretmen değiştirebilir.');

    const subjectTargets =
      draft.subjectTargets && !Array.isArray(draft.subjectTargets)
        ? Object.fromEntries(
            Object.entries(draft.subjectTargets)
              .map(([k, v]) => [normalizeSubject(k), Math.round(Number(v) || 0)] as [string, number])
              .filter(([k, v]) => k && v > 0)
          )
        : undefined;

    const saved: WeeklyQuestionTarget = {
      ...(existing || {}),
      ...draft,
      id: existing?.id || draft.id || newQuestionTargetId(),
      targetType: isClass ? 'class' : 'student',
      studentId: isClass ? undefined : draft.studentId,
      targetDays: days,
      targetPeriodLabel: days === 7 ? 'Haftalık (7 Gün)' : `${days} Günlük`,
      targetQuestions: total,
      weeklyTarget: total,
      dailyTarget: daily,
      dailyTargets,
      weekEndDate: rangeEnd,
      subject: targetSubjectList(draft.subject).join(', ') || undefined,
      subjectTargets: subjectTargets && Object.keys(subjectTargets).length ? subjectTargets : undefined,
      notes: (draft.notes || '').trim().slice(0, 400) || undefined,
      // Sahip değişmez: düzenlemede ilk veren öğretmen kalır
      assignedByTeacherId: existing?.assignedByTeacherId || draft.assignedByTeacherId || me?.id,
      assignedByTeacherName: existing?.assignedByTeacherName || draft.assignedByTeacherName || me?.name,
      assignedBy: existing?.assignedByTeacherName || draft.assignedByTeacherName || me?.name || 'Öğretmen',
      assignedDate: new Date().toISOString(),
    };
    if (!saved.assignedByTeacherId) delete saved.assignedByTeacherId;

    const prevTargets = [...this.weeklyQuestionTargets];
    // Eski sınıf hedefi düzenleniyorsa öğrencilere yapılmış eski kopyalar kaldırılır (artık sınıf kaydı geçerli)
    const legacyCopies = existing && isClass ? this.legacyClassTargetCopies(existing) : [];
    const legacyIds = new Set(legacyCopies.map((t) => t.id));
    this.weeklyQuestionTargets = [saved, ...this.weeklyQuestionTargets.filter((t) => t.id !== saved.id && !legacyIds.has(t.id))];
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    const rollback = () => {
      this.weeklyQuestionTargets = prevTargets;
      saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    };
    await this.runCloudWrite(
      () => supabase.from('question_targets').upsert([questionTargetToRow(saved)], { onConflict: 'id' }),
      rollback,
      'Soru hedefi kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
    if (legacyCopies.length) {
      const ids = legacyCopies.map((t) => t.id).filter((id): id is string => !!id);
      await this.runCloudWrite(() => deleteRowsVerified('question_targets', ids), () => {}, 'Eski hedef kopyaları silinemedi', { silent: true });
    }
    return saved;
  }

  public async deleteQuestionTargetById(id: string): Promise<void> {
    const target = this.weeklyQuestionTargets.find((t) => t.id === id);
    if (!target) return;
    if (!this.canEditQuestionTarget(target)) throw new Error('Bu hedefi yalnızca hedefi veren öğretmen silebilir.');
    const extra = isClassQuestionTarget(target) ? this.legacyClassTargetCopies(target) : [];
    const removeIds = new Set([id, ...extra.map((t) => t.id)]);
    await this.removeQuestionTargets((t) => removeIds.has(t.id), 'Soru hedefi silinemedi');
  }

  // Eski çağrılar için (yeni ekranlar saveQuestionTarget kullanır)
  public async setWeeklyQuestionTarget(target: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    return this.saveQuestionTarget({ ...target, targetType: 'student' });
  }

  public async setClassQuestionTarget(
    classId: string,
    className: string,
    targetData: Partial<WeeklyQuestionTarget>
  ): Promise<WeeklyQuestionTarget> {
    return this.saveQuestionTarget({ ...targetData, targetType: 'class', classId, className, studentId: undefined });
  }

  protected async removeQuestionTargets(
    shouldRemove: (t: WeeklyQuestionTarget) => boolean,
    userMessage: string
  ): Promise<void> {
    const prevTargets = [...this.weeklyQuestionTargets];
    const removed = this.weeklyQuestionTargets.filter(shouldRemove);
    if (removed.length === 0) return;
    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => !shouldRemove(t));
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    const ids = removed.map((t) => t.id).filter((id): id is string => !!id);
    await this.runCloudWrite(
      () => deleteRowsVerified('question_targets', ids),
      () => {
        this.weeklyQuestionTargets = prevTargets;
        saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
      },
      userMessage
    );
  }

  // Hedefin ilerlemesi: yalnızca hedefin kendi tarihleri (ve dersi seçildiyse o ders) sayılır
  public questionTargetProgress(
    t: WeeklyQuestionTarget,
    studentId: string,
    logs: StudentQuestionLog[]
  ): { solved: number; total: number; percent: number; done: boolean; remaining: number; bySubject: Record<string, number> } {
    const start = t.weekStartDate || '';
    const end = this.questionTargetEnd(t);
    const subj = t.subject ? normalizeSubject(t.subject) : '';
    const counts = targetSubjectMatcher(t.subject);
    const bySubject: Record<string, number> = {};
    let solved = 0;
    for (const l of logs) {
      if (l.studentId !== studentId || !l.date || l.date < start || l.date > end) continue;
      const entries = Array.isArray(l.entries) ? l.entries : [];
      if (entries.length) {
        for (const e of entries) {
          const name = normalizeSubject(e.subject || '');
          const n = Number(e.questionCount) || 0;
          bySubject[name] = (bySubject[name] || 0) + n;
          if (counts(name)) solved += n;
        }
      } else if (!subj) {
        solved += Number(l.totalQuestions) || 0;
      }
    }
    const total = Math.max(1, Number(t.targetQuestions || t.weeklyTarget) || 1);
    return {
      solved,
      total,
      percent: Math.min(100, Math.round((solved / total) * 100)),
      done: solved >= total,
      remaining: Math.max(0, total - solved),
      bySubject,
    };
  }
}
