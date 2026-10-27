// ============================================================================
// DENEME ANALİZİ (Aşama 92) — DENEMEYİ BAŞKA KURUMA AKTARMA (yalnızca genel yönetici)
//  * Kopyala: cevap anahtarı, B eşleşmesi ve kazanımlar hedef kuruma TASLAK olarak kopyalanır (2. adımdan açılır);
//    o kurum kendi optiğini yükler. Öğrenci sonuçları kopyalanmaz (öğrenci bilgisi başka kuruma geçmez).
//  * Taşı: deneme sonuçlarıyla birlikte hedef kuruma geçer (öğrenciler de o kuruma taşındıysa).
// Yetki veritabanında denetlenir (38 numaralı SQL: genel yönetici her kurumun denemesini yönetebilir); SQL değişikliği yok.
// ============================================================================
import { supabase } from '../supabase';
import { getExam, saveExam } from '../../services/denemeService';

export async function copyExamToKurum(examId: string, kurumId: string): Promise<void> {
  const full = await getExam(examId);
  if (!full) throw new Error('Deneme bulunamadı.');
  await saveExam({
    ...full,
    id: '',
    kurumId,
    published: false,
    summary: {} as any,
    draftInfo: { step: 2, at: new Date().toISOString() },
    draft: undefined,
  });
}

export async function moveExamToKurum(examId: string, kurumId: string): Promise<void> {
  const { data, error } = await supabase.from('deneme_exams').update({ kurum_id: kurumId, updated_at: new Date().toISOString() }).eq('id', examId).select('id');
  if (error) throw new Error(error.message || 'Deneme taşınamadı.');
  if (!data || !data.length) throw new Error('Deneme taşınamadı (yetki).');
}
