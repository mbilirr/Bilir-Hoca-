# Eğitim & Öğrenci Takip Sistemi

Öğretmen, öğrenci ve yönetici için sınıf yönetimi; ödev, soru sayısı, etüt, not ve devamsızlık takibi;
mesajlaşma ve e-posta bildirimleri.

Canlı adres: https://bilir-hoca.vercel.app

## Kullanılan teknolojiler

- React 19 + Vite + Tailwind CSS v4 (arayüz)
- Supabase (veritabanı, giriş, dosya deposu, anlık güncelleme)
- Vercel (yayın, `api/` klasöründeki sunucu fonksiyonları ve zamanlanmış görevler)
- recharts (grafikler), jsPDF (PDF), SheetJS/xlsx (Excel)

## Klasörler

| Klasör / dosya | İçerik |
| --- | --- |
| `src/` | Uygulamanın arayüz kodu |
| `src/services/dataService.ts` | Veri katmanı: Supabase ile eşitleme, önbellek, yetki denetimleri |
| `src/components/` | Sayfalar ve pencereler (Teacher, Student, Admin, Auth, Public, ui) |
| `src/lib/` | Küçük yardımcılar (e-posta istemcisi, sayfa yükleme, avatar, kimlik üretimi) |
| `api/mail.js` | E-posta gönderimi, hatırlatmalar, girişsiz etüt yoklaması |
| `api/keepalive.js` | Supabase projesinin duraklatılmaması için günlük küçük okuma |
| `api/icon.js` | Telefon ana ekranı için PNG simgeler |
| `supabase/migrations/` | Veritabanı kurulum SQL dosyaları |
| `vercel.json` | Sunucu fonksiyonu ayarları, zamanlanmış görevler, simge yönlendirmeleri |

## Ortam değişkenleri (Vercel > Settings > Environment Variables)

| Ad | Nerede kullanılır | Not |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Arayüz + sunucu | Supabase proje adresi |
| `VITE_SUPABASE_ANON_KEY` | Arayüz + sunucu | Herkese açık "anon" anahtar |
| `SUPABASE_SERVICE_ROLE_KEY` | Yalnız sunucu (`api/`) | **Gizli.** Koda ve GitHub'a asla yazılmaz |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Yalnız sunucu | **Gizli.** E-posta gönderimi için |
| `MAIL_SECRET_KEY` | Yalnız sunucu | İsteğe bağlı; e-posta bağlantılarını imzalar |
| `CRON_SECRET` | Yalnız sunucu | İsteğe bağlı; zamanlanmış görevleri korur |
| `APP_URL` | Yalnız sunucu | İsteğe bağlı; e-postalardaki site adresi (boşsa Vercel adresi) |
| `SCHOOL_NAME` | Yalnız sunucu | İsteğe bağlı; e-postalarda görünen okul adı |

Gizli anahtarlar yalnızca Vercel ortam değişkenlerine girilir; `.env` dosyaları GitHub'a gönderilmez.

## Veritabanı

Veritabanı değişiklikleri numaralı SQL dosyalarıyla yapılır (`supabase/migrations/` ve aşama paketleri).
Her yeni dosya Supabase > SQL Editor'de bir kez çalıştırılır; son dosyalar tekrar çalıştırılırsa zarar
vermez ve sonunda bir denetim tablosu gösterir. Son dosya: `16_gizlilik_ve_rapor_kalanlari.sql`.

## Yerelde çalıştırma

```bash
npm install
cp .env.example .env.local   # içine Supabase adresi ve anon anahtar yazılır
npm run dev                  # http://localhost:3000
npm run build                # yayın derlemesi (dist/)
npm run lint                 # TypeScript denetimi
```

## Yayın

`main` dalına gönderilen her değişiklik Vercel'de otomatik olarak yayınlanır.
