import { TeacherDocument } from '../types';

export const INITIAL_TEACHER_DOCUMENTS: TeacherDocument[] = [
  {
    id: 'doc-1',
    title: '2025-2026 12. Sınıf İleri Düzey Matematik Yıllık Planı',
    description: 'MEB güncel müfredatına uygun haftalık ünite dağılımı, kazanım kodları, yazılı tarihleri ve zümre kararları.',
    category: 'yearly_plan',
    fileFormat: 'xlsx',
    fileName: '12_Matematik_Yillik_Ders_Plani_2025_2026.xlsx',
    fileSize: '48.5 KB',
    uploadedAt: '2025-09-08T09:30:00Z',
    uploadedBy: 'Ahmet Yılmaz (Zümre Başkanı)',
    academicYear: '2025 - 2026',
    subject: 'Matematik',
    gradeLevel: '12. Sınıf',
    tags: ['Yıllık Plan', 'Türev', 'İntegral', 'MEB Müfredatı'],
    tableSheets: [
      {
        name: '1. Dönem Planı',
        rows: [
          ['Hafta', 'Tarih Aralığı', 'Ünite / Konu', 'Kazanım Kodu', 'Hedeflenen Kazanım Açıklaması', 'Ölçme & Değerlendirme'],
          ['1. Hafta', '08-12 Eylül', 'Fonksiyonlarda Limit', 'M.12.1.1', 'Bir fonksiyonun bir noktadaki limitini grafik ve cebirsel yollarla açıklar.', 'Ön Değerlendirme Testi'],
          ['2. Hafta', '15-19 Eylül', 'Sağdan-Soldan Limit', 'M.12.1.2', 'Fonksiyonların sağdan ve soldan limitlerini hesaplar ve süreklilikle ilişkilendirir.', 'Çalışma Yaprağı 1'],
          ['3. Hafta', '22-26 Eylül', 'Süreklilik Kavramı', 'M.12.1.3', 'Kapalı aralıkta sürekli fonksiyonların özelliklerini ve ara değer teoremini inceler.', 'Kısa Sınav (Quiz 1)'],
          ['4. Hafta', '29 Eyl - 03 Eki', 'Türev Kavramı & Anlık Değişim', 'M.12.2.1', 'Bir fonksiyonun anlık değişim oranını türevle açıklar ve teğetin eğimini bulur.', 'Uygulama Ödevi 1'],
          ['5. Hafta', '06-10 Ekim', 'Türev Alma Kuralları 1', 'M.12.2.2', 'Toplam, fark ve çarpım durumundaki cebirsel fonksiyonların türevini alır.', 'Ödev Değerlendirme'],
          ['6. Hafta', '13-17 Ekim', 'Türev Alma Kuralları 2 (Zincir Kuralı)', 'M.12.2.3', 'Bileşke fonksiyonların türevinde zincir kuralını uygular.', 'Ara Quiz'],
          ['7. Hafta', '20-24 Ekim', 'Türevin Geometrik Yorumu', 'M.12.2.4', 'Teğet ve normal denklemlerini kurarak teğet açısını hesaplar.', 'Örnek Soru Çözümü'],
          ['8. Hafta', '27-31 Ekim', 'Genel Tekrar & Sınav Hazırlığı', 'M.12.2.5', 'Limit ve türev kazanımlarına yönelik pekiştirme etütü ve soru çözümü.', '1. Ortak Yazılı Sınavı'],
          ['9. Hafta', '03-07 Kasım', 'Artan-Azalan Fonksiyonlar', 'M.12.3.1', 'Türevin işaret tablosundan faydalanarak fonksiyonların yerel ekstremum noktalarını bulur.', 'Etüt Çalışması'],
          ['10. Hafta', '10-14 Kasım', 'Maksimum-Minimum Problemleri', 'M.12.3.2', 'Gerçek hayat durumlarını modelleyen en büyük ve en küçük değer problemlerini çözer.', 'Proje Sunumu'],
        ],
      },
      {
        name: '2. Dönem Planı',
        rows: [
          ['Hafta', 'Tarih Aralığı', 'Ünite / Konu', 'Kazanım Kodu', 'Hedeflenen Kazanım Açıklaması', 'Ölçme & Değerlendirme'],
          ['19. Hafta', '09-13 Şubat', 'Belirsiz İntegral', 'M.12.4.1', 'Türevi verilen fonksiyonu bulma sürecini integral alma olarak tanımlar.', 'Kazanım Testi'],
          ['20. Hafta', '16-20 Şubat', 'İntegral Alma Yöntemleri', 'M.12.4.2', 'Değişken değiştirme yöntemiyle diferansiyel hesaplar.', 'Uygulama Kağıdı'],
          ['21. Hafta', '23-27 Şubat', 'Belirli İntegral & Alan Hesabı', 'M.12.4.3', 'Riemann toplamı ve integral yardımıyla eğri altında kalan alanı hesaplar.', '2. Dönem 1. Yazılı'],
        ],
      },
    ],
  },
  {
    id: 'doc-2',
    title: '12. Sınıf Matematik 1. Dönem 1. Ortak Yazılı Sınavı ve Cevap Anahtarı',
    description: 'MEB senaryolarına tam uyumlu açık uçlu ve klasik yazılı soru kağıdı, soru kazanım eşleştirme tablosu ve detaylı puanlama rubriği.',
    category: 'sample_exam',
    fileFormat: 'pdf',
    fileName: '12_Matematik_1Donem_1Yazili_Senaryo2_Cozumlu.pdf',
    fileSize: '312 KB',
    uploadedAt: '2025-10-15T14:10:00Z',
    uploadedBy: 'Ahmet Yılmaz',
    academicYear: '2025 - 2026',
    subject: 'Matematik',
    gradeLevel: '12. Sınıf',
    tags: ['Yazılı Sınav', 'Senaryo 2', 'Açık Uçlu', 'Cevap Anahtarı'],
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 18px; font-weight: bold; color: #0f172a;">T.C. MİLLÎ EĞİTİM BAKANLIĞI</h2>
          <h3 style="margin: 4px 0; font-size: 16px; font-weight: 600; color: #334155;">2025-2026 EĞİTİM-ÖĞRETİM YILI 12. SINIF MATEMATİK DERSİ</h3>
          <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: #475569;">1. DÖNEM 1. ORTAK YAZILI DEĞERLENDİRME SINAVI (SENARYO 2)</h4>
        </div>

        <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 10px 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-size: 13px;">
          <div><strong>Öğrenci Adı Soyadı:</strong> ....................................................</div>
          <div><strong>Sınıf / Şube:</strong> 12 / ......</div>
          <div><strong>Okul No:</strong> ............</div>
          <div><strong>Puan:</strong> .......... / 100</div>
        </div>

        <div style="margin-bottom: 18px; padding: 12px; border-left: 4px solid #4f46e5; background: #f8fafc; border-radius: 4px;">
          <p style="margin: 0 0 6px 0; font-weight: bold; font-size: 14px;">Soru 1 (10 Puan) — [Kazanım: M.12.1.1 - Limit Kavramı]</p>
          <p style="margin: 0 0 8px 0; font-size: 13px;">$f(x) = \\frac{x^2 - 9}{x - 3}$ fonksiyonunun $x \\to 3$ için limit değerini çarpanlara ayırma yöntemini göstererek hesaplayınız.</p>
          <div style="background: #ecfdf5; border: 1px dashed #10b981; padding: 8px; border-radius: 6px; font-size: 12px; color: #065f46;">
            <strong>Çözüm Anahtarı:</strong> $\\lim_{x \\to 3} \\frac{(x-3)(x+3)}{x-3} = \\lim_{x \\to 3} (x+3) = 3 + 3 = 6$. (Belirsizlik giderme: 5P, Sonuç: 5P)
          </div>
        </div>

        <div style="margin-bottom: 18px; padding: 12px; border-left: 4px solid #4f46e5; background: #f8fafc; border-radius: 4px;">
          <p style="margin: 0 0 6px 0; font-weight: bold; font-size: 14px;">Soru 2 (15 Puan) — [Kazanım: M.12.2.1 - Türev ve Teğet Eğimi]</p>
          <p style="margin: 0 0 8px 0; font-size: 13px;">$y = 2x^3 - 5x + 4$ eğrisinin $x = 1$ apsisli noktasındaki teğetinin denklemini bulunuz.</p>
          <div style="background: #ecfdf5; border: 1px dashed #10b981; padding: 8px; border-radius: 6px; font-size: 12px; color: #065f46;">
            <strong>Çözüm Anahtarı:</strong> $y' = 6x^2 - 5$. $x=1$ için teğetin eğimi $m = 6(1)^2 - 5 = 1$. Nokta: $y(1) = 2(1) - 5 + 4 = 1 \\implies (1,1)$. Teğet denklemi: $y - 1 = 1(x - 1) \\implies y = x$.
          </div>
        </div>

        <div style="margin-bottom: 18px; padding: 12px; border-left: 4px solid #4f46e5; background: #f8fafc; border-radius: 4px;">
          <p style="margin: 0 0 6px 0; font-weight: bold; font-size: 14px;">Soru 3 (20 Puan) — [Kazanım: M.12.3.2 - Maksimum Minimum Problemleri]</p>
          <p style="margin: 0 0 8px 0; font-size: 13px;">Toplamları 24 olan iki reel sayının çarpımının alabileceği en büyük değer kaçtır? Matematiksel modelleme ile türev yardımıyla ispatlayınız.</p>
          <div style="background: #ecfdf5; border: 1px dashed #10b981; padding: 8px; border-radius: 6px; font-size: 12px; color: #065f46;">
            <strong>Çözüm Anahtarı:</strong> $a + b = 24 \\implies b = 24 - a$. Çarpım fonksiyonu $C(a) = a(24 - a) = 24a - a^2$. $C'(a) = 24 - 2a = 0 \\implies a = 12$. $b = 12$. Maksimum Çarpım = $12 \\times 12 = 144$.
          </div>
        </div>
      </div>
    `,
  },
  {
    id: 'doc-3',
    title: '2025-2026 Sene Başı Matematik Zümre Öğretmenler Kurulu Karar Tutanağı',
    description: 'Yıllık planlama, ortak sınav tarihleri, ödev takip prensipleri ve öğrenci başarısını artırma tedbirleri toplantı tutanağı.',
    category: 'meeting_minutes',
    fileFormat: 'docx',
    fileName: '2025_2026_Matematik_Sene_Basi_Zumre_Tutanagi.docx',
    fileSize: '84.2 KB',
    uploadedAt: '2025-09-04T11:00:00Z',
    uploadedBy: 'Ahmet Yılmaz',
    academicYear: '2025 - 2026',
    subject: 'Matematik',
    gradeLevel: 'Tüm Sınıflar',
    tags: ['Zümre', 'Karar Tutanağı', 'Sene Başı', 'Sınav Tarihleri'],
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #1e293b;">
        <h2 style="text-align: center; font-size: 17px; font-weight: bold; border-bottom: 2px solid #334155; padding-bottom: 8px; margin-bottom: 16px;">
          2025-2026 EĞİTİM VE ÖĞRETİM YILI MATEMATİK DERSİ SENE BAŞI ZÜMRE ÖĞRETMENLER KURULU TOPLANTI TUTANAĞI
        </h2>
        
        <p><strong>Toplantı No:</strong> 1</p>
        <p><strong>Toplantı Tarihi ve Saati:</strong> 04 Eylül 2025 - 10:00</p>
        <p><strong>Toplantı Yeri:</strong> Öğretmenler Kurulu Odası</p>
        <p><strong>Toplantıya Katılanlar:</strong> Ahmet Yılmaz (Zümre Bşk.), Mehmet Kaya, Fatma Yıldırım</p>
        
        <h3 style="margin-top: 20px; font-size: 15px; font-weight: bold; color: #4338ca;">GÜNDEM MADDELERİ:</h3>
        <ol style="padding-left: 20px;">
          <li>Açılış ve yoklama, zümre başkanının seçimi.</li>
          <li>Bir önceki eğitim-öğretim yılı YKS ve okul başarı durumlarının değerlendirilmesi.</li>
          <li>MEB güncel öğretim programlarının incelenmesi ve yıllık planların hazırlanması.</li>
          <li>Ortak yazılı sınav tarihleri, senaryoları ve soru dağılım tablolarının belirlenmesi.</li>
          <li>Öğrenci ödev takibi, dijital portaldan ödev kontrolü ve pekiştirme etütlerinin planlanması.</li>
          <li>Özel gereksinimli (BEP) öğrencilere yönelik alınacak tedbirler.</li>
        </ol>

        <h3 style="margin-top: 20px; font-size: 15px; font-weight: bold; color: #4338ca;">ALINAN KARARLAR:</h3>
        <ul style="padding-left: 20px;">
          <li><strong>Karar 1:</strong> 12. sınıflarda YKS ve okul başarısı hedeflenerek haftalık ödev takibi dijital portal üzerinden öğrenci bazlı kazanım odaklı yürütülecektir.</li>
          <li><strong>Karar 2:</strong> 1. Dönem 1. Ortak Yazılı Sınavı 28 Ekim 2025 haftasında, 2. Yazılı Sınavı ise 05 Ocak 2026 haftasında yapılacaktır.</li>
          <li><strong>Karar 3:</strong> Ödev teslimini geciktiren veya kazanım kavrama oranı %65'in altında kalan öğrenciler için haftalık birebir ve grup etütleri düzenlenecektir.</li>
          <li><strong>Karar 4:</strong> Ders defterlerine işlenen kazanımların yıllık plan ile tam paralel ilerlemesi sağlanacaktır.</li>
        </ul>

        <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 13px;">
          <div style="text-align: center;"><strong>Ahmet YILMAZ</strong><br>Zümre Başkanı</div>
          <div style="text-align: center;"><strong>Mehmet KAYA</strong><br>Matematik Öğretmeni</div>
          <div style="text-align: center;"><strong>Fatma YILDIRIM</strong><br>Matematik Öğretmeni</div>
        </div>
      </div>
    `,
  },
  {
    id: 'doc-4',
    title: '12-A Şubesi Fizik Dersi Haftalık Uygulama ve Deney Planı',
    description: 'Manyetik alan, indüksiyon akımı ve transformatör deneylerine ait haftalık laboratuvar yönergesi ve kazanım çalışma föyü.',
    category: 'weekly_plan',
    fileFormat: 'docx',
    fileName: '12A_Fizik_Haftalik_Uygulama_ve_Deney_Plani.docx',
    fileSize: '62.0 KB',
    uploadedAt: '2025-10-02T16:20:00Z',
    uploadedBy: 'Mehmet Demir',
    academicYear: '2025 - 2026',
    subject: 'Fizik',
    gradeLevel: '12. Sınıf',
    tags: ['Haftalık Plan', 'Fizik', 'Laboratuvar', 'İndüksiyon'],
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
        <h2 style="text-align: center; font-size: 16px; font-weight: bold; border-bottom: 2px solid #0284c7; padding-bottom: 8px;">
          12-A ŞUBESİ FİZİK DERSİ HAFTALIK UYGULAMA VE LABORATUVAR ÇALIŞMA PLANI
        </h2>
        <p><strong>Hafta:</strong> 6. Hafta (13 - 17 Ekim)</p>
        <p><strong>Ünite:</strong> Manyetizma ve Elektromanyetik İndüklenme</p>
        <p><strong>Kazanım:</strong> F.11.2.3: Manyetik akı değişiminin indüksiyon emk'si ve indüksiyon akımı oluşturduğunu deneyle gösterir.</p>
        
        <h3 style="font-size: 14px; font-weight: bold; margin-top: 14px; color: #0369a1;">Haftalık Çalışma Akışı:</h3>
        <ul>
          <li><strong>Pazartesi (2 Saat):</strong> Manyetik akı formülasyonu (Φ = B·A·cosθ) ve akı değişimi teorik anlatımı.</li>
          <li><strong>Çarşamba (1 Saat Laboratuvar):</strong> Solenoid, çubuk mıknatıs ve galvanometre ile Faraday ve Lenz kanunlarının gözlenmesi.</li>
          <li><strong>Cuma (1 Saat Problem Çözümü):</strong> Ödev sorularının sınıfta tartışılması ve etüt ihtiyacı olan öğrencilerin tespiti.</li>
        </ul>
      </div>
    `,
  },
];
