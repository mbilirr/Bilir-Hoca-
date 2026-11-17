// ============================================================================
// Aşama 317: VERİ SERVİSİNİ AYIRMA, 6. PARÇA — VERİTABANI SATIRI ⇄ EKRAN KAYDI DÖNÜŞÜMLERİ
// Ödev, soru kaydı, soru hedefi, not, yoklama ve mesajın veritabanı satırına çevrilmesi (ve tersi). Hiçbiri uygulamanın
// o anki durumuna bakmaz; aynı girdi her zaman aynı çıktıyı verir. Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı
// (yalnız "private" yerine "export function", "this." çağrıları doğrudan çağrı oldu); davranış aynı.
// Durum isteyenler (ödev ve teslim satırından kayıt, not satırından kayıt: öğrenci adı yerel listeden) dataService'te kaldı.
// ============================================================================
import type { Homework, HomeworkResource, StudentQuestionLog, WeeklyQuestionTarget, GradeRecord, AttendanceRecord, StudentMessage } from '../types';

// Veritabanı satırına gömülebilecek en büyük dosya (≈1 MB). Daha büyükleri dosya deposuna gider.
export const MAX_INLINE_FILE_CHARS = 1_400_000;

// Ödevin tabloda ayrı sütunu olmayan bilgileri (kaynak linkleri vb.) 'meta' sütununda saklanır.
// 1 MB üzerindeki gömülü dosya kabul edilmez (sessizce kaybolmasın diye hata verilir).
export function homeworkRowExtras(hw: Homework): { teacher_id: string | null; teacher_name: string | null; meta: Record<string, any> } {
  const keptResources = Array.isArray(hw.resources) ? hw.resources : [];
  assertInlineResourcesFit(keptResources);
  return {
    teacher_id: hw.teacherId || null,
    teacher_name: hw.teacherName || hw.createdByName || null,
    meta: {
      targetClassIds: hw.targetClassIds || [],
      isGlobalForNewStudents: hw.isGlobalForNewStudents ?? false,
      createdByName: hw.createdByName || null,
      schoolLevel: hw.schoolLevel || null,
      attachmentUrl: hw.attachmentUrl || null,
      outcomes: hw.outcomes || [],
      assignedDate: hw.assignedDate || null,
      resources: keptResources,
    },
  };
}

// Buluttan gelen ödev satırındaki ek bilgileri ödeve uygular. Eski satırlarda (meta yoksa) yerel değerler korunur.
export function applyHomeworkRowExtras(row: any, base: Homework): Homework {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  const hasMeta = Object.keys(meta).length > 0;
  return {
    ...base,
    teacherId: row?.teacher_id || base.teacherId,
    teacherName: row?.teacher_name || base.teacherName,
    createdByName: meta.createdByName || row?.teacher_name || base.createdByName,
    targetClassIds: hasMeta && Array.isArray(meta.targetClassIds) ? meta.targetClassIds : base.targetClassIds,
    isGlobalForNewStudents:
      typeof meta.isGlobalForNewStudents === 'boolean' ? meta.isGlobalForNewStudents : base.isGlobalForNewStudents,
    schoolLevel: meta.schoolLevel || base.schoolLevel,
    attachmentUrl: meta.attachmentUrl || base.attachmentUrl,
    outcomes: hasMeta && Array.isArray(meta.outcomes) ? meta.outcomes : base.outcomes,
    assignedDate: meta.assignedDate || base.assignedDate,
    resources: hasMeta && Array.isArray(meta.resources) ? meta.resources : base.resources,
  };
}

export function assertInlineResourcesFit(resources?: HomeworkResource[]): void {
  const tooBig = (resources || []).find(
    (r) => typeof r?.url === 'string' && r.url.startsWith('data:') && r.url.length > MAX_INLINE_FILE_CHARS
  );
  if (tooBig) {
    throw new Error(
      `"${tooBig.fileName || tooBig.title || 'Dosya'}" 1 MB sınırını aşıyor. Büyük dosyaları (video, uzun PDF) Google Drive veya YouTube bağlantısı olarak ekleyin.`
    );
  }
}

// Ödevin hedefi: sınıflar + (isteğe bağlı) yalnızca seçilen öğrenciler.
// Öğrenci listesi boşsa hedef sınıfların TÜM öğrencileri (sonradan katılanlar dahil) ödevi görür.
export function homeworkTargets(hw: Homework): { classIds: string[]; studentIds: string[] } {
  const studentIds = Array.isArray(hw.assignedTo) ? Array.from(new Set(hw.assignedTo.filter(Boolean))) : [];
  let classIds = Array.from(new Set((hw.targetClassIds || []).filter(Boolean)));
  if (classIds.length === 0 && hw.classId && hw.classId !== 'class-default') classIds = [hw.classId];
  return { classIds, studentIds };
}

export function homeworkToRow(hw: Homework) {
  const { classIds, studentIds } = homeworkTargets(hw);
  return {
    title: hw.title,
    description: hw.description || '',
    subject: hw.subject,
    due_date: hw.dueDate,
    learning_outcomes: hw.learningOutcomes || [],
    assigned_to: studentIds.length > 0 ? studentIds : 'all',
    class_id: classIds[0] || hw.classId || 'class-default',
    target_class_ids: classIds,
    target_student_ids: studentIds,
    ...homeworkRowExtras(hw),
  };
}

export function questionLogToRow(q: StudentQuestionLog) {
  return {
    id: q.id,
    student_id: q.studentId,
    student_name: q.studentName || '',
    class_id: q.classId || '',
    class_name: q.className || '',
    date: q.date,
    entries: q.entries || [],
    total_questions: Math.round(Number(q.totalQuestions) || 0),
    total_correct: Math.round(Number(q.totalCorrect) || 0),
    total_wrong: Math.round(Number(q.totalWrong) || 0),
    total_empty: Math.round(Number(q.totalEmpty) || 0),
    notes: q.notes || '',
    created_at: q.createdAt || new Date().toISOString(),
  };
}

export function questionLogFromRow(r: any): StudentQuestionLog {
  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name || '',
    classId: r.class_id || '',
    className: r.class_name || '',
    date: r.date,
    entries: Array.isArray(r.entries) ? r.entries : [],
    totalQuestions: Number(r.total_questions) || 0,
    totalCorrect: Number(r.total_correct) || 0,
    totalWrong: Number(r.total_wrong) || 0,
    totalEmpty: Number(r.total_empty) || 0,
    notes: r.notes || '',
    createdAt: r.created_at || new Date().toISOString(),
  };
}

export function isClassQuestionTarget(t: WeeklyQuestionTarget): boolean {
  return t.targetType === 'class' || (!!t.classId && !t.studentId);
}

export function questionTargetToRow(t: WeeklyQuestionTarget) {
  const isClass = isClassQuestionTarget(t);
  return {
    id: t.id,
    target_type: isClass ? 'class' : 'student',
    student_id: isClass ? null : t.studentId || null,
    class_id: t.classId || null,
    week_start_date: t.weekStartDate || null,
    data: JSON.parse(JSON.stringify({ ...t, createdBy: undefined })),
    updated_at: new Date().toISOString(),
  };
}

export function questionTargetFromRow(r: any): WeeklyQuestionTarget {
  const data = r.data && typeof r.data === 'object' ? r.data : {};
  return {
    ...data,
    id: r.id,
    targetType: r.target_type === 'class' ? 'class' : 'student',
    studentId: r.target_type === 'class' ? undefined : r.student_id || data.studentId,
    classId: r.class_id || data.classId,
    weekStartDate: r.week_start_date || data.weekStartDate,
    createdBy: r.created_by || undefined,
  };
}

export function gradeToRow(g: GradeRecord) {
  return {
    id: g.id,
    student_id: g.studentId,
    class_id: g.classId || 'c-1',
    subject: g.subject,
    score: g.score,
    max_score: g.maxScore ?? 100,
    exam_type: g.examType || '1. Yazılı',
    date: g.date,
    remarks: g.remarks || null,
  };
}

export function attendanceToRow(a: AttendanceRecord) {
  return {
    id: a.id,
    class_id: a.classId,
    date: a.date,
    subject: a.subject || 'Genel',
    records: a.records || [],
  };
}

export function messageToRow(m: StudentMessage) {
  return {
    id: m.id,
    student_id: m.studentId,
    student_name: m.studentName,
    student_class: m.studentClass,
    student_avatar: m.studentAvatar || null,
    subject: m.subject,
    text: m.text,
    link_url: m.linkUrl || null,
    created_at: m.createdAt,
    read: m.read,
    // Aşama 28: yalnızca duyuru/not satırlarında eklenir. Böylece öğrenci mesajları
    // (eski tablo yapısıyla da) aynen çalışmaya devam eder.
    ...(m.kind === 'announcement' || m.kind === 'note'
      ? { kind: m.kind, sender_id: m.senderId || null, sender_name: m.senderName || null, group_id: m.groupId || null }
      : {}),
    // Aşama 45: "Kime" seçildiyse (35 numaralı SQL'deki sütunlar); seçilmediyse satıra hiç eklenmez
    ...(m.kind !== 'announcement' && m.kind !== 'note' && m.toTeacherId
      ? { to_teacher_id: m.toTeacherId, to_teacher_name: m.toTeacherName || null }
      : {}),
  };
}

export function rowToMessage(rm: any): StudentMessage {
  const kind = rm.kind === 'announcement' || rm.kind === 'note' ? (rm.kind as 'announcement' | 'note') : undefined;
  return {
    id: rm.id,
    studentId: rm.student_id,
    studentName: rm.student_name,
    studentClass: rm.student_class,
    studentAvatar: rm.student_avatar,
    subject: rm.subject,
    text: rm.text,
    linkUrl: rm.link_url,
    createdAt: rm.created_at || new Date().toISOString(),
    read: Boolean(rm.read),
    teacherReply: rm.teacher_reply,
    repliedAt: rm.replied_at,
    ...(kind ? { kind, senderId: rm.sender_id || undefined, senderName: rm.sender_name || undefined, groupId: rm.group_id || undefined } : {}),
    ...(rm.to_teacher_id ? { toTeacherId: String(rm.to_teacher_id), toTeacherName: rm.to_teacher_name || undefined } : {}),
    ...(rm.replied_by_id ? { repliedById: String(rm.replied_by_id), repliedByName: rm.replied_by_name || undefined } : {}),
  };
}
