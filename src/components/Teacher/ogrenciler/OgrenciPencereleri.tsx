// Öğrenciler sayfası › Excel, silme onayı, giriş bilgisi ve şifre pencereleri (Aşama 354a: ayrı parça)
import { Suspense } from 'react';
import { AlertCircle, Key } from 'lucide-react';
import { StudentCredential, StudentAccountResult } from '../../../types';
import { dataService } from '../../../services/dataService';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal';
import { inputCls } from '../FormParts';
import { Modal, cx } from '../../ui/kit';
import { ExcelStudentUploadModal, ExcelStudentUpdateModal, ExcelClassUploadModal, StudentListExportModal, CinsiyetDoldurModal, StudentWelcomeCredentialsModal, CredentialSendModal, StudentCredentialPickModal } from './ortak';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function OgrenciPencereleri() {
  const { students, classes, selectedClassFilter, selectedStudentIds, credSendList, setCredSendList, credPickOpen, setCredPickOpen, credPickStudents, isBulkDeleteModalOpen, setIsBulkDeleteModalOpen, isExcelModalOpen, setIsExcelModalOpen, isExcelUpdateOpen, setIsExcelUpdateOpen, isListExportOpen, setIsListExportOpen, isExcelClassModalOpen, setIsExcelClassModalOpen, everExcelOpen, everExcelUpdateOpen, everExcelClassOpen, studentToDelete, setStudentToDelete, classToDelete, setClassToDelete, credentialsResult, setCredentialsResult, passwordTarget, setPasswordTarget, passwordTargetValue, setPasswordTargetValue, passwordTargetError, isSettingPassword, setStudentSuccessFeedback, isGenderFillOpen, setIsGenderFillOpen, handleConfirmBulkDelete, handleConfirmSetPassword } = useOgrenciBaglam();
  return (
    <>
      {everExcelOpen && (
        <Suspense fallback={null}>
          <ExcelStudentUploadModal
            isOpen={isExcelModalOpen}
            onClose={() => setIsExcelModalOpen(false)}
            classes={classes}
            existingStudents={students}
            onAccountsCreated={(result: StudentAccountResult) =>
              setCredentialsResult({ credentials: result.created, failures: result.failed, title: "Excel'den Eklenen Öğrenciler" })
            }
          />
        </Suspense>
      )}

      {/* Aşama 49: EXCEL İLE MEVCUT ÖĞRENCİLERİ GÜNCELLEME */}
      {isListExportOpen && (
        <Suspense fallback={null}>
          <StudentListExportModal open={isListExportOpen} onClose={() => setIsListExportOpen(false)} students={students} classes={classes} />
        </Suspense>
      )}
      {/* Aşama 171: cinsiyeti addan doldur */}
      {isGenderFillOpen && (
        <Suspense fallback={null}>
          <CinsiyetDoldurModal
            open
            kind="student"
            onClose={() => setIsGenderFillOpen(false)}
            people={students
              .filter((s) => dataService.canManageStudent(s))
              .map((s) => ({ id: s.id, name: s.name, gender: s.gender, avatar: s.avatar, sub: s.className }))}
            onDone={(msg: string) => setStudentSuccessFeedback(msg)}
          />
        </Suspense>
      )}
      {everExcelUpdateOpen && (
        <Suspense fallback={null}>
          <ExcelStudentUpdateModal
            isOpen={isExcelUpdateOpen}
            onClose={() => setIsExcelUpdateOpen(false)}
            classes={classes}
            students={students}
            onDone={(msg: string) => setStudentSuccessFeedback(msg)}
          />
        </Suspense>
      )}

      {/* EXCEL BULK UPLOAD MODAL - CLASSES */}
      {everExcelClassOpen && (
        <Suspense fallback={null}>
          <ExcelClassUploadModal
            isOpen={isExcelClassModalOpen}
            onClose={() => setIsExcelClassModalOpen(false)}
          />
        </Suspense>
      )}

      {/* CONFIRM DELETE STUDENT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!studentToDelete}
        onClose={() => setStudentToDelete(null)}
        onConfirm={async () => {
          if (studentToDelete) {
            const target = studentToDelete;
            setStudentToDelete(null);
            try {
              await dataService.deleteStudent(target.id);
              setStudentSuccessFeedback(`"${target.name}" ve giriş hesabı sistemden silindi.`);
            } catch (err: any) {
              setStudentSuccessFeedback(`⚠️ "${target.name}" silinemedi: ${err?.message || 'bilinmeyen hata'}`);
            }
          }
        }}
        title="Öğrenciyi Sil"
        itemBadge={studentToDelete ? `${studentToDelete.className} • #${studentToDelete.studentNumber}` : undefined}
        description={`"${studentToDelete?.name}" adlı öğrenciyi sistemden kalıcı olarak silmek istediğinize emin misiniz? Öğrencinin tüm ödev teslimleri, notları ve mesaj kayıtları da temizlenecektir.`}
        confirmButtonText="Öğrenciyi Sil"
      />

      {/* CONFIRM BULK DELETE STUDENTS MODAL */}
      <ConfirmDeleteModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title="Seçilen Öğrencileri Sil"
        itemBadge={`${selectedStudentIds.length} Öğrenci Seçildi`}
        description={`Seçtiğiniz ${selectedStudentIds.length} adet öğrenciyi sistemden kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve seçilen öğrencilerin tüm ödev teslimleri, notları, mesajları ve etüt kayıtları silinecektir.`}
        confirmButtonText={`Evet, ${selectedStudentIds.length} Öğrenciyi Sil`}
        isDanger={true}
      />

      {/* CONFIRM DELETE CLASS MODAL */}
      <ConfirmDeleteModal
        isOpen={!!classToDelete}
        onClose={() => setClassToDelete(null)}
        onConfirm={async () => {
          if (classToDelete) {
            const target = classToDelete;
            setClassToDelete(null);
            await dataService.deleteClass(target.id);
            setStudentSuccessFeedback(`"${target.name}" sınıfı sistemden başarıyla silindi.`);
          }
        }}
        title="Sınıfı Sil"
        itemBadge={classToDelete?.branch}
        description={`"${classToDelete?.name}" sınıfını silmek istediğinize emin misiniz? Bu sınıfa kayıtlı öğrencilerin sınıf atamaları sıfırlanacaktır.`}
        confirmButtonText="Sınıfı Sil"
      />

      {/* Aşama 142: seçilenlere giriş bilgisi gönder (yeni şifre verilenler kapanınca giriş bilgileri penceresinde görünür) */}
      {credSendList && (
        <Suspense fallback={null}>
          <CredentialSendModal
            open
            onClose={() => setCredSendList(null)}
            students={credSendList}
            allowReset
            onNewCredentials={(creds: StudentCredential[]) => setCredentialsResult({ credentials: creds, failures: [], title: 'Yeni Giriş Bilgileri' })}
          />
        </Suspense>
      )}

      {/* Aşama 151: başlıktaki "Giriş Bilgisi" — sınıf seçimli pencere (sınıf süzgeci seçiliyse o sınıfla açılır) */}
      {credPickOpen && (
        <Suspense fallback={null}>
          <StudentCredentialPickModal
            open
            onClose={() => setCredPickOpen(false)}
            students={credPickStudents}
            initialClassKey={selectedClassFilter}
            onNewCredentials={(creds: StudentCredential[]) => setCredentialsResult({ credentials: creds, failures: [], title: 'Yeni Giriş Bilgileri' })}
          />
        </Suspense>
      )}

      {/* GİRİŞ BİLGİLERİ (hesap açıldıktan / şifre belirlendikten sonra, yalnızca bir kez gösterilir) */}
      {!!credentialsResult && (
        <Suspense fallback={null}>
          <StudentWelcomeCredentialsModal
            isOpen={!!credentialsResult}
            onClose={() => setCredentialsResult(null)}
            credentials={credentialsResult?.credentials || []}
            failures={credentialsResult?.failures || []}
            title={credentialsResult?.title}
          />
        </Suspense>
      )}

      {/* ŞİFRE BELİRLEME PENCERESİ */}
      <Modal
        open={!!passwordTarget}
        onClose={() => setPasswordTarget(null)}
        closeOnBackdrop={false}
        size="sm"
        icon={Key}
        tone="brand"
        title={passwordTarget?.auth_user_id ? 'Yeni Şifre Belirle' : 'Giriş Hesabı Aç'}
        description={passwordTarget ? `${passwordTarget.name} • No: ${passwordTarget.studentNumber || '-'}` : undefined}
        footer={
          <>
            <button type="button" onClick={() => setPasswordTarget(null)} className="ui-btn ui-btn-secondary">
              Vazgeç
            </button>
            <button type="button" onClick={handleConfirmSetPassword} disabled={isSettingPassword} className="ui-btn ui-btn-primary">
              {isSettingPassword ? 'Kaydediliyor...' : passwordTarget?.auth_user_id ? 'Şifreyi Kaydet' : 'Hesabı Aç'}
            </button>
          </>
        }
      >
        {passwordTarget && (
          <div className="space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              {passwordTarget.auth_user_id
                ? 'Öğrencinin eski şifresi geçersiz olur. Öğrenci yeni şifreyle giriş yapınca şifresini değiştirmesi istenir.'
                : 'Bu öğrencinin henüz giriş hesabı yok. Belirlediğiniz şifreyle hesap açılır; öğrenci, öğrenci numarası ve bu şifreyle giriş yapar.'}
            </p>
            {passwordTargetError && (
              <div role="alert" className="p-3 bg-danger-soft rounded-xl text-xs font-semibold text-danger-fg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordTargetError}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={passwordTargetValue}
                onChange={(e) => setPasswordTargetValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmSetPassword();
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Yeni şifre"
                className={cx(inputCls, 'flex-1 font-mono font-bold tracking-wider')}
                placeholder="En az 6 karakter"
              />
              <button
                type="button"
                onClick={() => setPasswordTargetValue(dataService.generatePassword())}
                className="ui-btn ui-btn-secondary"
              >
                🎲 Üret
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
export default OgrenciPencereleri;
