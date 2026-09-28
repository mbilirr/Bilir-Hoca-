/**
 * Migration Script: Migrate existing Teachers & Students to real Supabase Auth
 * 
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" npx tsx scripts/migrate-to-supabase-auth.ts
 *
 * This script:
 * 1. Connects to Supabase with service_role privileges (bypassing RLS).
 * 2. Fetches all records from `teachers` and `students`.
 * 3. Creates a genuine Supabase Auth user via `auth.admin.createUser()` with `email_confirm: true`.
 * 4. Generates a fresh, secure random password for each user (never reusing old plain text passwords).
 * 5. Updates `auth_user_id` in the respective `teachers` and `students` rows.
 * 6. Generates a clean CSV file and console report with all credentials for the administrator.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zzdchsxfjzedgciejuxd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ HATA: SUPABASE_SERVICE_ROLE_KEY ortam değişkeni tanımlanmadı.');
  console.error('Kullanım: SUPABASE_SERVICE_ROLE_KEY="eyJh..." npx tsx scripts/migrate-to-supabase-auth.ts');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function generateSyntheticEmail(type: 'student' | 'teacher', identifier: string): string {
  const clean = identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const prefix = type === 'teacher' ? 'tch' : 'std';
  return `${prefix}_${clean || 'user'}@okul.internal.net`;
}

function generateRandomPassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    pass += chars[idx];
  }
  return pass;
}

interface CredentialEntry {
  type: 'Öğretmen' | 'Öğrenci';
  name: string;
  loginIdentifier: string;
  syntheticEmail: string;
  newPassword: string;
  authUserId: string;
  legacyId: string;
}

async function runMigration() {
  console.log('🚀 Supabase Auth Geçiş İşlemi Başlatılıyor...');
  console.log(`📡 Hedef Proje: ${SUPABASE_URL}`);

  const results: CredentialEntry[] = [];

  // 1. Öğretmenleri Çek ve Auth Hesabı Oluştur
  console.log('\n--- 1. ÖĞRETMENLER AKTARILIYOR ---');
  const { data: teachers, error: teacherError } = await supabaseAdmin
    .from('teachers')
    .select('*');

  if (teacherError) {
    console.error('Öğretmenler listelenemedi:', teacherError.message);
  } else {
    console.log(`Bulunan öğretmen sayısı: ${teachers?.length || 0}`);
    for (const t of teachers || []) {
      const identifier = t.username || t.email || t.id;
      const syntheticEmail = generateSyntheticEmail('teacher', identifier);
      const newPassword = generateRandomPassword(8);

      try {
        let authUserId = '';
        const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: syntheticEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            role: 'teacher',
            legacy_id: t.id,
            name: t.name,
            is_admin: !!t.isAdmin || !!t.is_admin,
          },
        });

        if (createError) {
          if (createError.message.includes('already registered')) {
            const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
            const existing = userList?.users?.find(u => u.email?.toLowerCase() === syntheticEmail.toLowerCase());
            if (existing) {
              authUserId = existing.id;
              await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                password: newPassword,
                email_confirm: true,
              });
            }
          } else {
            console.error(`❌ Öğretmen [${t.name}] Auth oluşturulamadı:`, createError.message);
            continue;
          }
        } else if (createdUser?.user) {
          authUserId = createdUser.user.id;
        }

        if (authUserId) {
          await supabaseAdmin
            .from('teachers')
            .update({ auth_user_id: authUserId })
            .eq('id', t.id);

          results.push({
            type: 'Öğretmen',
            name: t.name,
            loginIdentifier: identifier,
            syntheticEmail,
            newPassword,
            authUserId,
            legacyId: t.id,
          });
          console.log(`✅ [Öğretmen] ${t.name} -> ${syntheticEmail} (Auth UID: ${authUserId.slice(0, 8)}...)`);
        }
      } catch (err: any) {
        console.error(`Hata [${t.name}]:`, err.message);
      }
    }
  }

  // 2. Öğrencileri Çek ve Auth Hesabı Oluştur
  console.log('\n--- 2. ÖĞRENCİLER AKTARILIYOR ---');
  const { data: students, error: studentError } = await supabaseAdmin
    .from('students')
    .select('*');

  if (studentError) {
    console.error('Öğrenciler listelenemedi:', studentError.message);
  } else {
    console.log(`Bulunan öğrenci sayısı: ${students?.length || 0}`);
    for (const s of students || []) {
      const identifier = s.student_number || s.studentNumber || s.username || s.id;
      const syntheticEmail = generateSyntheticEmail('student', identifier);
      const newPassword = generateRandomPassword(8);

      try {
        let authUserId = '';
        const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: syntheticEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            role: 'student',
            legacy_id: s.id,
            name: s.name,
            class_id: s.class_id || s.classId,
          },
        });

        if (createError) {
          if (createError.message.includes('already registered')) {
            const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
            const existing = userList?.users?.find(u => u.email?.toLowerCase() === syntheticEmail.toLowerCase());
            if (existing) {
              authUserId = existing.id;
              await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                password: newPassword,
                email_confirm: true,
              });
            }
          } else {
            console.error(`❌ Öğrenci [${s.name} - No: ${identifier}] Auth oluşturulamadı:`, createError.message);
            continue;
          }
        } else if (createdUser?.user) {
          authUserId = createdUser.user.id;
        }

        if (authUserId) {
          await supabaseAdmin
            .from('students')
            .update({ auth_user_id: authUserId })
            .eq('id', s.id);

          results.push({
            type: 'Öğrenci',
            name: s.name,
            loginIdentifier: identifier,
            syntheticEmail,
            newPassword,
            authUserId,
            legacyId: s.id,
          });
          console.log(`✅ [Öğrenci] ${s.name} (No: ${identifier}) -> ${syntheticEmail}`);
        }
      } catch (err: any) {
        console.error(`Hata [${s.name}]:`, err.message);
      }
    }
  }

  // 3. CSV Raporu Oluştur
  const csvLines = ['Tip,İsim,Giriş Kimliği,Sistem E-postası,Yeni Şifre,Auth UID,Eski ID'];
  for (const r of results) {
    csvLines.push(`"${r.type}","${r.name}","${r.loginIdentifier}","${r.syntheticEmail}","${r.newPassword}","${r.authUserId}","${r.legacyId}"`);
  }
  const csvPath = path.join(process.cwd(), 'credentials_migration_export.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

  console.log(`\n🎉 GEÇİŞ TAMAMLANDI!`);
  console.log(`Toplam oluşturulan hesap sayısı: ${results.length}`);
  console.log(`📁 Şifre Listesi CSV Dosyası: ${csvPath}`);
}

runMigration().catch(console.error);
