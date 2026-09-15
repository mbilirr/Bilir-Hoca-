// Email template generator for student homework and etüt assignments

export interface HomeworkEmailParams {
  studentName: string;
  studentEmail: string;
  teacherName: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  outcomes?: string[];
  resourcesCount?: number;
  attachmentUrl?: string;
}

export interface EtutEmailParams {
  studentName: string;
  studentEmail: string;
  teacherName: string;
  subject: string;
  topic: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  notes?: string;
}

export function formatDueDateTurkish(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatEtutDateTurkish(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function generateHomeworkEmail(params: HomeworkEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedDueDate = formatDueDateTurkish(params.dueDate);
  const subject = `[Ödev Bildirimi] ${params.subject}: ${params.title}`;

  const text = `
Sayın ${params.studentName},

${params.teacherName} öğretmeniniz tarafından size yeni bir ödev tanımlandı.

DERS: ${params.subject}
ÖDEV BAŞLIĞI: ${params.title}
SON TESLİM TARİHİ: ${formattedDueDate}
AÇIKLAMA: ${params.description}
${params.outcomes && params.outcomes.length > 0 ? `KAZANIMLAR:\n${params.outcomes.map((o) => ` - ${o}`).join('\n')}` : ''}

Ödevinizi hazırlayıp zamanında teslim etmenizi rica eder, iyi çalışmalar dileriz.

${params.teacherName}
Eğitim & Öğrenci Takip Sistemi
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #334155; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #4338ca 0%, #312e81 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
    .header p { margin: 8px 0 0; font-size: 13px; color: #c7d2fe; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
    .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .card { background: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .card-row { display: flex; margin-bottom: 12px; font-size: 13px; }
    .card-row:last-child { margin-bottom: 0; }
    .card-label { font-weight: 700; color: #475569; width: 140px; flex-shrink: 0; }
    .card-value { color: #0f172a; font-weight: 600; }
    .due-pill { display: inline-block; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    .description-box { background: #f1f5f9; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; color: #334155; line-height: 1.6; }
    .outcomes-list { margin: 12px 0 0; padding-left: 20px; font-size: 12px; color: #475569; }
    .outcomes-list li { margin-bottom: 6px; }
    .cta-btn { display: block; width: 100%; text-align: center; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 14px 20px; border-radius: 10px; font-weight: 700; font-size: 14px; margin: 24px 0 16px; box-sizing: border-box; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 11px; color: #94a3b8; }
    .teacher-sig { font-weight: 700; color: #334155; font-size: 13px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <span class="badge">📚 Yeni Ödev Ataması</span>
      <h1>${params.subject} Ödevi</h1>
      <p>Son Teslim: ${formattedDueDate}</p>
    </div>
    
    <div class="content">
      <div class="greeting">Merhaba ${params.studentName},</div>
      <div class="intro">
        <strong>${params.teacherName}</strong> öğretmeniniz tarafından sisteme yeni bir ödev tanımlandı. Detaylar ve kazanımlar aşağıda bilgilerinize sunulmuştur:
      </div>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Ders:</span>
          <span class="card-value">${params.subject}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Ödev Başlığı:</span>
          <span class="card-value">${params.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Son Teslim:</span>
          <span class="card-value"><span class="due-pill">⏰ ${formattedDueDate}</span></span>
        </div>
        <div class="card-row">
          <span class="card-label">Öğretmen:</span>
          <span class="card-value">${params.teacherName}</span>
        </div>
      </div>

      <div class="description-box">
        <strong>Ödev Yönergesi:</strong>
        <p style="margin: 6px 0 0;">${params.description}</p>
      </div>

      ${
        params.outcomes && params.outcomes.length > 0
          ? `
      <div style="margin-top: 16px;">
        <strong style="font-size: 13px; color: #1e293b;">İlgili Ders Kazanımları:</strong>
        <ul class="outcomes-list">
          ${params.outcomes.map((o) => `<li>${o}</li>`).join('')}
        </ul>
      </div>
      `
          : ''
      }

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 12px; color: #64748b;">Öğrenci Portalı üzerinden ödevinizi dijital olarak teslim edebilir, video ve PDF kaynaklarına erişebilirsiniz.</div>
      </div>
    </div>

    <div class="footer">
      <div>Bu bilgilendirme e-postası <strong>Eğitim & Öğrenci Takip Sistemi</strong> tarafından otomatik olarak oluşturulmuştur.</div>
      <div class="teacher-sig">${params.teacherName} • Danışman / Branş Öğretmeni</div>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}

export function generateEtutEmail(params: EtutEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedDate = formatEtutDateTurkish(params.date);
  const subject = `[Etüt Bildirimi] ${params.subject}: ${params.topic} (${formattedDate} - ${params.time})`;

  const text = `
Sayın ${params.studentName},

${params.teacherName} öğretmeniniz ile etüt randevunuz planlandı.

DERS: ${params.subject}
KONU: ${params.topic}
TARİH: ${formattedDate}
SAAT: ${params.time} (${params.duration} Dakika)
DERSLİK / YER: ${params.location}
${params.notes ? `NOTLAR: ${params.notes}` : ''}

Lütfen belirtilen tarih ve saatte derslikte hazır bulununuz.

${params.teacherName}
Eğitim & Öğrenci Takip Sistemi
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #334155; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
    .header p { margin: 8px 0 0; font-size: 13px; color: #ccfbf1; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
    .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .card { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .card-row { display: flex; margin-bottom: 12px; font-size: 13px; }
    .card-row:last-child { margin-bottom: 0; }
    .card-label { font-weight: 700; color: #475569; width: 140px; flex-shrink: 0; }
    .card-value { color: #0f172a; font-weight: 600; }
    .time-pill { display: inline-block; background: #ccfbf1; color: #0f766e; border: 1px solid #99f6e4; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    .notes-box { background: #f8fafc; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; color: #334155; line-height: 1.6; border: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 11px; color: #94a3b8; }
    .teacher-sig { font-weight: 700; color: #334155; font-size: 13px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <span class="badge">📅 Etüt & Birebir Takip</span>
      <h1>${params.subject} Etüdü</h1>
      <p>${formattedDate} • Saat ${params.time}</p>
    </div>
    
    <div class="content">
      <div class="greeting">Merhaba ${params.studentName},</div>
      <div class="intro">
        <strong>${params.teacherName}</strong> öğretmeniniz ile birebir / grup etüt randevunuz başarıyla planlandı. Etüt detayları aşağıdadır:
      </div>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Ders:</span>
          <span class="card-value">${params.subject}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Konu / Odak:</span>
          <span class="card-value">${params.topic}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Tarih & Saat:</span>
          <span class="card-value"><span class="time-pill">🕒 ${formattedDate} - ${params.time} (${params.duration} dk)</span></span>
        </div>
        <div class="card-row">
          <span class="card-label">Derslik / Konum:</span>
          <span class="card-value">📍 ${params.location}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Öğretmen:</span>
          <span class="card-value">${params.teacherName}</span>
        </div>
      </div>

      ${
        params.notes
          ? `
      <div class="notes-box">
        <strong>Öğretmen Notu:</strong>
        <p style="margin: 6px 0 0;">${params.notes}</p>
      </div>
      `
          : ''
      }

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 12px; color: #64748b;">
          ⚠️ Lütfen etüt saatinde belirtilen derslikte hazır bulununuz. Herhangi bir mazeretiniz oluşması durumunda danışman öğretmeninize mesaj yoluyla bildiriniz.
        </div>
      </div>
    </div>

    <div class="footer">
      <div>Bu bilgilendirme e-postası <strong>Eğitim & Öğrenci Takip Sistemi</strong> tarafından otomatik olarak oluşturulmuştur.</div>
      <div class="teacher-sig">${params.teacherName} • Danışman / Branş Öğretmeni</div>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}

export function createMailtoLink(to: string, subject: string, bodyText: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(bodyText);
  return `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
}

export function createGmailComposeLink(to: string, subject: string, bodyText: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(bodyText);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodedSubject}&body=${encodedBody}`;
}

export interface StudentWelcomeEmailParams {
  studentName: string;
  studentEmail: string;
  username: string;
  studentNumber?: string;
  password?: string;
  className?: string;
  teacherName: string;
}

export function generateStudentWelcomeEmail(params: StudentWelcomeEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Eğitim Portalı] Sisteme Kaydınız Başarıyla Oluşturuldu - Giriş Bilgileriniz`;

  const text = `
Sayın ${params.studentName},

${params.teacherName} öğretmeniniz tarafından Eğitim & Öğrenci Takip Portalı sistemine kaydınız tamamlanmıştır.

GİRİŞ BİLGİLERİNİZ:
- Kullanıcı Adı: ${params.username}
- E-posta: ${params.studentEmail}
- Öğrenci No: ${params.studentNumber || '-'}
- Sınıf / Şube: ${params.className || '-'}
- Giriş Şifreniz: ${params.password || '123456'}

GİRİŞ REHBERİ:
Uygulama giriş sayfasından "Öğrenci Portalı"nı seçip yukarıdaki kullanıcı adınız (veya e-postanız) ve şifreniz ile sisteme giriş yapabilirsiniz.

Sistem üzerinden ödevlerinizi takip edebilir, etütlerinizi görüntüleyebilir ve öğretmenlerinizle iletişim kurabilirsiniz.

İyi çalışmalar ve başarılar dileriz!
${params.teacherName}
Eğitim Portalı Yönetimi
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #334155; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .creds-box { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px solid #cbd5e1; border-radius: 14px; padding: 20px; margin-bottom: 24px; }
    .creds-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #047857; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .cred-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .cred-row:last-child { border-bottom: none; }
    .cred-label { font-weight: 600; color: #64748b; }
    .cred-value { font-weight: 800; color: #0f172a; }
    .password-pill { background: #fee2e2; color: #991b1b; padding: 3px 10px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 800; border: 1px solid #fecaca; }
    .steps-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
    .steps-box h4 { margin: 0 0 8px; color: #065f46; font-size: 13px; font-weight: 700; }
    .steps-box ol { margin: 0; padding-left: 20px; font-size: 12.5px; color: #047857; line-height: 1.6; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
    .teacher-sig { margin-top: 8px; font-weight: 700; color: #334155; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="badge">🎓 YENİ ÖĞRENCİ KAYDI</div>
      <h1>Eğitim Portalı'na Hoş Geldiniz!</h1>
      <p>Sisteme erişim bilgileriniz başarıyla oluşturuldu</p>
    </div>

    <div class="body">
      <div class="greeting">Merhaba ${params.studentName},</div>
      <div class="intro">
        <strong>${params.teacherName}</strong> öğretmeniniz tarafından Eğitim & Öğrenci Takip Portalı sistemine kaydınız gerçekleştirildi. Portala giriş yapabilmeniz için tanımlanan hesap bilgileriniz aşağıdadır:
      </div>

      <div class="creds-box">
        <div class="creds-title">🔑 GİRİŞ VE HESAP BİLGİLERİNİZ</div>
        <div class="cred-row">
          <span class="cred-label">Adı Soyadı:</span>
          <span class="cred-value">${params.studentName}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Kullanıcı Adı:</span>
          <span class="cred-value" style="color: #2563eb;">${params.username}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Kayıtlı E-posta:</span>
          <span class="cred-value">${params.studentEmail}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Öğrenci Numarası:</span>
          <span class="cred-value">${params.studentNumber || '-'}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Sınıfı / Şubesi:</span>
          <span class="cred-value">${params.className || '-'}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Giriş Şifresi:</span>
          <span class="cred-value"><span class="password-pill">${params.password || '123456'}</span></span>
        </div>
      </div>

      <div class="steps-box">
        <h4>📱 Nasıl Giriş Yapacaksınız?</h4>
        <ol>
          <li>Uygulama giriş ekranında <strong>"Öğrenci Portalı"</strong> butonuna tıklayınız.</li>
          <li>Kullanıcı adı veya e-posta alanına <strong>${params.username}</strong> veya <strong>${params.studentEmail}</strong> yazınız.</li>
          <li>Şifre alanına <strong>${params.password || '123456'}</strong> yazıp Giriş Yap butonuna basınız.</li>
          <li>Giriş yaptıktan sonra şifrenizi profil menüsünden dilediğiniz zaman değiştirebilirsiniz.</li>
        </ol>
      </div>

      <div style="font-size: 12px; color: #94a3b8; text-align: center;">
        🔒 Şifrenizi güvenliğiniz için başkalarıyla paylaşmayınız.
      </div>
    </div>

    <div class="footer">
      <div>Bu bilgilendirme e-postası <strong>Eğitim & Öğrenci Takip Sistemi</strong> tarafından otomatik olarak oluşturulmuştur.</div>
      <div class="teacher-sig">${params.teacherName} • Danışman / Branş Öğretmeni</div>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}
