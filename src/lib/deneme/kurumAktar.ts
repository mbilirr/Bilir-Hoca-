// ============================================================================
// DENEME ANALİZİ (Aşama 92) — DENEMEYİ BAŞKA KURUMA AKTARMA (yalnızca genel yönetici)
//  * Kopyala: cevap anahtarı, B eşleşmesi ve kazanımlar hedef kuruma TASLAK olarak kopyalanır (2. adımdan açılır);
//    o kurum kendi optiğini yükler. Öğrenci sonuçları kopyalanmaz (öğrenci bilgisi başka kuruma geçmez).
//  * Taşı: deneme sonuçlarıyla birlikte hedef kuruma geçer (öğrenciler de o kuruma taşındıysa).
// Yetki veritabanında denetlenir (38 numaralı SQL: genel yönetici her kurumun denemesini yönetebilir).
// Aşama 98: * Optik formatlarını da kopyalama (isteğe bağlı; aynı format ikinci kez kopyalanmaz)
//           * Genel yönetici kuruma geçmişken yanlış taşınan denemeyi kendi paneline geri alır (98 numaralı SQL).
// ============================================================================
import { supabase } from '../supabase';
import { getExam, listFormats, saveExam } from '../../services/denemeService';

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

/** Genel yöneticinin optik formatlarını hedef kuruma kopyalar; kurumda zaten varsa (aynı kaynaktan) dokunulmaz */
export async function copyFormatsToKurum(kurumId: string): Promise<number> {
  const own = (await listFormats()).filter((f) => !f.kurumId);
  if (!own.length) return 0;
  const rows = own.map((f) => ({
    id: `${f.id}-k${kurumId.replace(/-/g, '').slice(0, 12)}`,
    kurum_id: kurumId,
    name: f.name,
    fmt_text: f.fmtText,
    fields: f.fields,
  }));
  // Hedef kurumun kayıtları genel yöneticiye görünmez: yanıt istenmez; daha önce kopyalanan format (aynı kimlik) atlanır
  const res = await Promise.all(rows.map((r) => supabase.from('deneme_formats').insert(r)));
  const bad = res.find((r) => r.error && r.error.code !== '23505');
  if (bad?.error) throw new Error(`Optik formatları kopyalanamadı: ${bad.error.message}`);
  return res.filter((r) => !r.error).length;
}

/** Kuruma geçmişken: deneme (sonuçlarıyla) genel yöneticinin paneline geri döner */
export async function moveExamToHead(examId: string): Promise<void> {
  const { error } = await supabase.rpc('deneme_genel_yoneticiye_tasi', { p_exam_id: examId });
  if (error) {
    if (error.code === 'PGRST202' || /deneme_genel_yoneticiye_tasi/.test(error.message || ''))
      throw new Error("Bu işlem için Supabase SQL Editor'de Aşama 98 dosyasını çalıştırın.");
    throw new Error(error.message || 'Deneme geri taşınamadı.');
  }
}
