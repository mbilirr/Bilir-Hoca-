import type { Etut, Homework, Student, StudentNotification } from '../types';
import { formatDueDateTurkish, formatEtutDateTurkish, generateEtutEmail, generateHomeworkEmail } from '../lib/emailTemplates';

// ============================================================================
// Aşama 286: ÖĞRENCİ BİLDİRİMLERİNİN HAZIRLANMASI (veri servisinden ayrıldı)
// Yeni ödev / yeni etüt kaydedilince öğrencinin Bildirim Merkezi'ne düşen kayıt ve içindeki e-posta önizlemesi
// burada hazırlanır. Bu dosya YALNIZ hazırlar: hiçbir şey kaydetmez, buluta yazmaz, ekranı yenilemez; listeyi
// alıp sonuç döndürür. Kaydetme, buluta yazma ve tarayıcı bildirimi eskisi gibi veri servisinde (dataService)
// kalır. Davranış eskisiyle birebir aynıdır (aynı başlık, aynı metin, aynı e-posta).
// Gerçek e-postalar burada gönderilmez: sunucu gönderir (api/mail.js, mail_log).
// ============================================================================

/** Hazırlanan bildirimler ve (oturumdaki öğrenci alıcılar arasındaysa) tarayıcıda gösterilecek kısa bildirim */
export interface HazirBildirimler {
  bildirimler: StudentNotification[];
  /** Alıcıların kimlikleri (tarayıcı bildirimi yalnız oturumdaki öğrenci bunlardan biriyse gösterilir) */
  aliciIdleri: Set<string>;
  tarayici: { baslik: string; metin: string };
}

const rastgeleEk = () => Math.random().toString(36).substr(2, 4);

/** Ödevin alıcıları: "herkes" ise hedef sınıflar (yoksa bütün öğrenciler), değilse seçilen öğrenciler */
export function odevAlicilari(hw: Homework, ogrenciler: Student[]): Student[] {
  if (hw.assignedTo === 'all') {
    if (hw.targetClassIds && hw.targetClassIds.length > 0) return ogrenciler.filter((s) => hw.targetClassIds!.includes(s.classId));
    return [...ogrenciler];
  }
  if (Array.isArray(hw.assignedTo)) return ogrenciler.filter((s) => (hw.assignedTo as string[]).includes(s.id));
  return [];
}

/** Etüdün alıcıları: "herkes" ise bütün öğrenciler, değilse seçilen öğrenciler */
export function etutAlicilari(etut: Etut, ogrenciler: Student[]): Student[] {
  if (etut.assignedStudentIds === 'all') return [...ogrenciler];
  if (Array.isArray(etut.assignedStudentIds)) return ogrenciler.filter((s) => etut.assignedStudentIds.includes(s.id));
  return [];
}

/** Yeni ödev bildirimleri (her alıcıya bir kayıt; en yeni üstte olacak sırayla eklenmesi veri servisinin işi) */
export function odevBildirimleriHazirla(hw: Homework, alicilar: Student[], nowIso = new Date().toISOString()): HazirBildirimler {
  const ogretmen = hw.createdByName || 'Öğretmen';
  const bildirimler = alicilar.map((student): StudentNotification => {
    const eposta = generateHomeworkEmail({
      studentName: student.name,
      studentEmail: student.email || '',
      teacherName: ogretmen,
      subject: hw.subject,
      title: hw.title,
      description: hw.description,
      dueDate: hw.dueDate,
      outcomes: hw.outcomes || hw.learningOutcomes || [],
      resourcesCount: hw.resources?.length || 0,
      attachmentUrl: hw.attachmentUrl,
    });
    return {
      id: `notif-${Date.now()}-${student.id}-${rastgeleEk()}`,
      studentId: student.id,
      type: 'new_homework',
      title: `Yeni Ödev: ${hw.subject} - ${hw.title}`,
      message: `${hw.createdByName || 'Öğretmeniniz'} yeni bir ödev tanımladı. Son teslim tarihi: ${formatDueDateTurkish(hw.dueDate)}`,
      sourceId: hw.id,
      sourceTitle: hw.title,
      teacherName: ogretmen,
      createdAt: nowIso,
      read: false,
      linkTab: 'homework',
      emailSent: false,
      emailRecipient: student.email,
      emailDetails: { subject: eposta.subject, bodyHtml: eposta.html, sentAt: nowIso },
    };
  });
  return {
    bildirimler,
    aliciIdleri: new Set(alicilar.map((s) => s.id)),
    tarayici: {
      baslik: `📚 Yeni Ödev: ${hw.subject}`,
      metin: `"${hw.title}" başlıklı yeni ödeviniz tanımlandı. Son teslim: ${formatDueDateTurkish(hw.dueDate)}`,
    },
  };
}

/** Yeni etüt bildirimleri */
export function etutBildirimleriHazirla(etut: Etut, alicilar: Student[], nowIso = new Date().toISOString()): HazirBildirimler {
  const ogretmen = etut.teacherName || 'Öğretmen';
  const bildirimler = alicilar.map((student): StudentNotification => {
    const eposta = generateEtutEmail({
      studentName: student.name,
      studentEmail: student.email || '',
      teacherName: ogretmen,
      subject: etut.subject,
      topic: etut.topic,
      date: etut.date,
      time: etut.time,
      duration: etut.duration,
      location: etut.location,
      notes: etut.notes,
      teacherFeedback: etut.teacherFeedback,
    });
    return {
      id: `notif-${Date.now()}-${student.id}-${rastgeleEk()}`,
      studentId: student.id,
      type: 'new_etut',
      title: `Yeni Etüt: ${etut.subject} - ${etut.topic}`,
      message: `${formatEtutDateTurkish(etut.date)} saat ${etut.time}'de (${etut.duration} dk), ${etut.location} dersliğinde etüdünüz planlandı.`,
      sourceId: etut.id,
      sourceTitle: etut.topic,
      teacherName: ogretmen,
      createdAt: nowIso,
      read: false,
      linkTab: 'etuts',
      emailSent: false,
      emailRecipient: student.email,
      emailDetails: { subject: eposta.subject, bodyHtml: eposta.html, sentAt: nowIso },
    };
  });
  return {
    bildirimler,
    aliciIdleri: new Set(alicilar.map((s) => s.id)),
    tarayici: {
      baslik: `📅 Yeni Etüt: ${etut.subject}`,
      metin: `"${etut.topic}" konulu etüdünüz ${etut.date} saat ${etut.time}'de planlandı.`,
    },
  };
}
