// Kullanıcı yönetimi › giriş bilgisi, cinsiyet ve Excel pencereleri (Aşama 354d: ayrı parça)
import React from 'react';
import { StudentCredential } from '../../../types';
import { TeacherExcelUploadModal, CinsiyetDoldurModal, TeacherCredentialSendModal, StudentCredentialPickModal, CredentialSendModal, StudentWelcomeCredentialsModal } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function KullaniciPencereleri() {
  const { users, isExcelTeacherOpen, setIsExcelTeacherOpen, isGenderFillOpen, setIsGenderFillOpen, isCredSendOpen, setIsCredSendOpen, stuPickOpen, setStuPickOpen, stuSendOne, setStuSendOne, stuNewCreds, setStuNewCreds, showToast, loadData, reloadContacts, credTeachers, credStudents, rowManageable } = useKullaniciBaglam();
  return (
    <>
      {isCredSendOpen && (
        <React.Suspense fallback={null}>
          <TeacherCredentialSendModal open onClose={() => setIsCredSendOpen(false)} teachers={credTeachers} />
        </React.Suspense>
      )}
      {/* Aşama 149: ÖĞRENCİLERE GİRİŞ BİLGİSİ (sınıf seçimli pencere / tek öğrenci) + yeni verilen şifreler */}
      {stuPickOpen && (
        <React.Suspense fallback={null}>
          <StudentCredentialPickModal open onClose={() => setStuPickOpen(false)} students={credStudents} onNewCredentials={(c: StudentCredential[]) => setStuNewCreds(c)} />
        </React.Suspense>
      )}
      {stuSendOne && (
        <React.Suspense fallback={null}>
          <CredentialSendModal open onClose={() => setStuSendOne(null)} students={[stuSendOne]} allowReset onNewCredentials={(c: StudentCredential[]) => setStuNewCreds(c)} />
        </React.Suspense>
      )}
      {stuNewCreds && stuNewCreds.length > 0 && (
        <React.Suspense fallback={null}>
          <StudentWelcomeCredentialsModal isOpen onClose={() => setStuNewCreds(null)} credentials={stuNewCreds} failures={[]} title="Yeni Giriş Bilgileri" />
        </React.Suspense>
      )}
      {/* Aşama 171: ÖĞRETMEN CİNSİYETİNİ ADDAN DOLDUR */}
      {isGenderFillOpen && (
        <React.Suspense fallback={null}>
          <CinsiyetDoldurModal
            open
            kind="teacher"
            onClose={() => setIsGenderFillOpen(false)}
            people={users
              .filter((u) => u.role !== 'student' && rowManageable(u))
              .map((u) => ({ id: u.id, name: u.name, gender: u.gender, avatar: u.avatar, branch: u.branch, isAdmin: u.isAdmin, sub: u.branch }))}
            onDone={(msg: string) => {
              showToast(`✓ ${msg}`, 'success');
              loadData();
            }}
          />
        </React.Suspense>
      )}
      {/* Aşama 144: EXCEL İLE TOPLU ÖĞRETMEN */}
      {isExcelTeacherOpen && (
        <React.Suspense fallback={null}>
          <TeacherExcelUploadModal
            open
            onClose={() => setIsExcelTeacherOpen(false)}
            onCreated={(n: number) => {
              showToast(`✓ ${n} öğretmenin hesabı açıldı.`, 'success');
              loadData();
              reloadContacts(true);
            }}
          />
        </React.Suspense>
      )}
    </>
  );
}
export default KullaniciPencereleri;
