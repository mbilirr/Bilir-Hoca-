// ============================================================================
// Aşama 319: VERİ SERVİSİNİ AYIRMA, 11. PARÇA — KAYIT KURALLARI
// Cinsiyet ve sınıf düzeyi okuma, yerel tarih, mahremiyet için etüt gizleme, ödev kontrol notu, duyuru grupları,
// soru hedefi kimliği ve sahip anahtarı. Hiçbiri uygulamanın o anki durumuna bakmaz.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi, "this." / "DataService."
// çağrıları doğrudan çağrı oldu); davranış aynı.
// ============================================================================
import type { Etut, HomeworkCheckStatus, StudentMessage, AnnouncementGroup, WeeklyQuestionTarget } from '../types';

/** Yalnız 'K' / 'E' kabul edilir; diğer her şey "belirtilmedi" */
export function normGender(v: unknown): 'K' | 'E' | undefined {
  return v === 'K' || v === 'E' ? v : undefined;
}

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultQuestionWindowStart(): string {
  const n = new Date();
  return ymdLocal(new Date(n.getFullYear(), n.getMonth() - 1, 1));
}

// Aşama 175: sınıf düzeyi (1–12). Önce "8. Sınıf" gibi düzey bilgisi, yoksa addaki ayrı duran 1–12 sayısı
// ("8/A", "8A", "11-B"); "LGS 2026", "Mezun", "Hazırlık" gibi adlarda 0 döner.
export function classLevelOf(cls: { gradeLevel?: string; name?: string }): number {
  const pick = (t?: string) => {
    const m = /(?:^|\D)(1[0-2]|[1-9])(?!\d)/.exec(String(t || ''));
    return m ? parseInt(m[1], 10) : 0;
  };
  return pick(cls.gradeLevel) || pick(cls.name);
}

/** Ortak takvimden gelen (ayrıntısı silinmiş) etüt satırı mı */
export function isRedactedRow(e: Etut): boolean {
  return !!(e as any).__redacted__;
}

/** Başka öğretmenin etüdü: yalnızca gün / saat / öğretmen / sınıf / ders / yer görünür (konu, not, görüş, yoklama silinir) */
export function redactEtut(e: Etut): Etut {
  return {
    ...e,
    topic: '',
    notes: '',
    teacherFeedback: '',
    // Öğrenci listesi yalnızca çakışma denetimi için tutulur; ekranlarda gösterilmez
    studentAttendance: undefined,
    attendanceTakenBy: undefined,
    privacyRedacted: true,
  };
}

export function defaultCheckNote(status: HomeworkCheckStatus): string {
  switch (status) {
    case 'yapti': return 'Ödev tamamlandı';
    case 'eksik': return 'Eksik ödev';
    case 'yapmadi': return 'Ödev yapılmadı';
    case 'izinli': return 'İzinli';
    default: return 'Derse gelmedi';
  }
}

export function isTeacherAuthoredMessage(m: StudentMessage): boolean {
  return m.kind === 'announcement' || m.kind === 'note';
}

export function buildAnnouncementGroups(list: StudentMessage[]): AnnouncementGroup[] {
  const map = new Map<string, AnnouncementGroup>();
  for (const m of list) {
    if (m.kind !== 'announcement' && m.kind !== 'note') continue;
    const key = m.groupId || m.id;
    let g = map.get(key);
    if (!g) {
      g = {
        groupId: key,
        kind: m.kind,
        title: m.subject,
        text: m.text,
        senderId: m.senderId,
        senderName: m.senderName,
        createdAt: m.createdAt,
        studentIds: [],
        studentNames: [],
        classNames: [],
        messageIds: [],
      };
      map.set(key, g);
    }
    g.studentIds.push(m.studentId);
    g.studentNames.push(m.studentName);
    if (m.studentClass && !g.classNames.includes(m.studentClass)) g.classNames.push(m.studentClass);
    g.messageIds.push(m.id);
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function newQuestionTargetId(): string {
  return `qt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Hedefin sahibi (öğretmen). Eski kayıtlarda kaydeden hesabın kimliği kullanılır.
export function questionTargetOwnerKey(t: WeeklyQuestionTarget): string {
  return t.assignedByTeacherId || (t.createdBy ? `auth:${t.createdBy}` : 'eski');
}
