import { dataService } from '../services/dataService';
import { dateOfDay, setTaskDone, shortDayLabel, ymd, type PlanItem } from '../services/studyPlanService';

// ============================================================================
// Aşama 253: plan görevini "yaptım" işaretleme — TEK YER
// Öğrenci ana sayfasındaki "Bugünkü planım" ve "Bugün yapılması gerekenler" (StudentTodayPlan) aynı işi yapar:
//  1) işaret veritabanına yazılır (hata olursa fırlatılır; çağıran ekran işareti geri alır)
//  2) Aşama 46: görevde soru sayısı varsa soru kaydına aktarılır; işaret kaldırılınca geri alınır.
//     Aktarım kaydedildikten sonra pay görünmüyorsa (Aşama 67: gecikmiş eşitleme) bir kez daha yazılır;
//     sorular iki kez eklenmez (görevin payı varsa yalnız aynı sayıya güncellenir).
// Dönüş: öğrenciye gösterilecek bilgi ya da soru kaydı güncellenemediyse uyarı.
// ============================================================================

const gunYazi = (d: string) => (d === ymd(new Date()) ? 'bugün' : shortDayLabel(d));

export interface PlanIsaretSonuc {
  bilgi?: string;
  uyari?: string;
  /** soru kaydından çıkarıldı (ekran düzenleme kutusunu kapatsın) */
  cikarildi?: boolean;
}

export async function planGorevIsaretle(it: PlanItem, done: boolean, weekStart: string): Promise<PlanIsaretSonuc> {
  await setTaskDone(it.id, done);
  try {
    const before = dataService.getPlanTaskQuestionShare(it.id);
    if (done && it.questionCount > 0 && !before) {
      const req = { itemId: it.id, subject: it.subject, date: dateOfDay(weekStart, it.day), count: it.questionCount };
      let r = await dataService.setPlanTaskQuestions(req);
      if (!dataService.getPlanTaskQuestionShare(it.id)) r = await dataService.setPlanTaskQuestions(req);
      return {
        bilgi: `${r.subject}: ${r.count} soru, ${gunYazi(r.date)} soru kaydına otomatik eklendi ve kaydedildi. Fazlasını çözdüysen "Düzenle" ile güncelleyebilirsin.`,
      };
    }
    if (!done && before) {
      await dataService.setPlanTaskQuestions({ itemId: it.id, subject: it.subject, date: before.date, count: 0 });
      return { bilgi: `${before.subject}: ${before.count} soru, ${gunYazi(before.date)} soru kaydından çıkarıldı.`, cikarildi: true };
    }
    return {};
  } catch (e: any) {
    return {
      uyari: `Görev işaretlendi ama soru kaydı güncellenemedi: ${e?.message || 'bağlantı sorunu'}. Soru Kaydet bölümünden elle girebilirsin.`,
    };
  }
}
