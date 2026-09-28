import fetch from 'node-fetch';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zzdchsxfjzedgciejuxd.supabase.co';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZGNoc3hmanplZGdjaWVqdXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjI2MjgsImV4cCI6MjEwMzI5ODYyOH0.1eWzEPZr9oyWQgPZWdKM9i09b-mZfIOELdZQjJZDBto';

async function testTeacherLoginAndStudentAccess(
  email: string,
  pass: string,
  label: string
) {
  console.log(`\n======================================================`);
  console.log(`TEST: ${label} (${email})`);
  console.log(`======================================================`);

  // 1. Authenticate with Supabase Auth
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: pass }),
  });

  const authStatus = authRes.status;
  const authJson: any = await authRes.json();

  console.log(`[1] Auth Status: ${authStatus}`);
  if (authStatus !== 200 || !authJson.access_token) {
    console.log(`[!] Auth Yanıtı:`, JSON.stringify(authJson, null, 2));
    return;
  }

  const token = authJson.access_token;
  console.log(`[✓] JWT Token başarıyla alındı. (Role: ${authJson.user?.app_metadata?.role || 'tanımsız'})`);

  // 2. Query /rest/v1/students with the teacher's JWT
  const restRes = await fetch(`${SUPABASE_URL}/rest/v1/students?select=id,name,class_id`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  console.log(`[2] REST /students HTTP Status: ${restRes.status}`);
  const restData = await restRes.json();
  console.log(`[3] Dönen Öğrenci Verisi (RLS Filtreli):`);
  console.log(JSON.stringify(restData, null, 2));
}

async function run() {
  console.log('🚀 AŞAMA 2 - RLS DOĞRULAMA TESTİ BAŞLATILIYOR...');
  console.log(`Proje: ${SUPABASE_URL}`);

  // Test 1: Teacher Alpha (8-A Sınıfına Yetkilendirilmiş Öğretmen)
  await testTeacherLoginAndStudentAccess(
    'teacher_alpha@okul.internal.net',
    'TeacherAlpha2026!',
    'Öğretmen 1: Teacher Alpha (SADECE 8-A Sınıfına Yetkili)'
  );

  // Test 2: Teacher Beta (Hiçbir Sınıfa Yetkisi Olmayan Öğretmen)
  await testTeacherLoginAndStudentAccess(
    'teacher_beta@okul.internal.net',
    'TeacherBeta2026!',
    'Öğretmen 2: Teacher Beta (Yetkisiz Öğretmen)'
  );
}

run().catch(console.error);
