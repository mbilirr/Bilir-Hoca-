import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Download, Info, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { dataService, ADMIN_EMAIL, type InitialCredentialInfo } from '../../services/dataService';
import type { ClassGroup, Student, Teacher } from '../../types';
import { Panel, cx } from '../ui/kit';
import { useAutoDismiss } from '../../lib/useAutoDismiss';

// ============================================================================
// Aşama 25: ÖĞRENCİ VE ÖĞRETMEN LİSTESİ (EXCEL) — ilk giriş şifreleri dahil
// Genel yönetici tüm kullanıcıları, kurum yöneticisi yalnız kendi kurumunu indirir.
// İlk şifreler "initial_credentials" tablosundan gelir (09c numaralı SQL).
// Supabase şifreleri geri okunamaz şekilde sakladığı için, bu güncellemeden ÖNCE verilmiş
// şifreler listede "kayıtlı değil" görünür. İstenirse bu hesaplara yeni ilk şifre verilebilir.
// ============================================================================

type Row = (string | number)[];

const todayStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Sütun genişlikleri: ad sütunu geniş, diğerleri başlık uzunluğuna göre
const columnWidths = (head: Row) =>
  head.map((h, i) => ({ wch: i === 1 ? 28 : Math.max(10, String(h).length + 2) }));

const isHeadTeacher = (t: Teacher) => (t.email || '').trim().toLowerCase() === ADMIN_EMAIL || t.id === 'admin-mustafa-bilir';

export const UserCredentialsExport: React.FC<{ classes: ClassGroup[] }> = ({ classes }) => {
  const isHead = dataService.isHeadAdmin();
  const myKurumId = dataService.getMyKurumId();

  const [teachers, setTeachers] = useState<Teacher[]>(() => dataService.getAllTeachersInternal());
  const [students, setStudents] = useState<Student[]>(() => dataService.getAllStudents());
  useEffect(
    () =>
      dataService.subscribe(() => {
        setTeachers(dataService.getAllTeachersInternal());
        setStudents(dataService.getAllStudents());
      }),
    []
  );

  const [includeStudents, setIncludeStudents] = useState(true);
  const [includeTeachers, setIncludeTeachers] = useState(true);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [fillMissing, setFillMissing] = useState(false);
  const [confirmFill, setConfirmFill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useAutoDismiss(msg, () => setMsg(null)); // Aşama 32: 15 sn sonra kaybolur

  // Görebileceği kişiler
  const myStudents = useMemo(
    () =>
      students
        .filter((s) => isHead || (!!myKurumId && s.kurumId === myKurumId))
        .filter((s) => classFilter === 'all' || s.classId === classFilter)
        .sort(
          (a, b) =>
            (a.className || '').localeCompare(b.className || '', 'tr', { numeric: true }) ||
            (a.studentNumber || '').localeCompare(b.studentNumber || '', 'tr', { numeric: true }) ||
            a.name.localeCompare(b.name, 'tr')
        ),
    [students, isHead, myKurumId, classFilter]
  );

  const myTeachers = useMemo(
    () =>
      teachers
        .filter((t) => (isHead ? true : !!myKurumId && t.kurumId === myKurumId && !t.isAdmin))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teachers, isHead, myKurumId]
  );

  const classOptions = useMemo(() => {
    const ids = new Set(students.filter((s) => isHead || (!!myKurumId && s.kurumId === myKurumId)).map((s) => s.classId));
    return classes
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }, [classes, students, isHead, myKurumId]);

  const kurumLabel = (kurumId?: string | null) => (kurumId ? dataService.getKurumNameForId(kurumId) : 'Genel yönetici');

  const statusText = (cred: InitialCredentialInfo | undefined, hasAccount: boolean, mustChangeFlag?: boolean) => {
    if (cred?.password) return cred.mustChange ? 'İlk şifre geçerli (ilk girişte değiştirecek)' : 'Şifre geçerli';
    if (cred?.changedAt) return `Kullanıcı şifresini değiştirdi (${fmtDate(cred.changedAt)})`;
    if (!hasAccount) return 'Giriş hesabı yok';
    if (mustChangeFlag === false) return 'Kullanıcı şifresini değiştirmiş olabilir (kayıt yok)';
    return 'Şifre kayıtlı değil (bu güncellemeden önce verilmiş)';
  };

  const handleExport = async () => {
    if (busy) return;
    if (!includeStudents && !includeTeachers) {
      setMsg({ tone: 'err', text: 'En az birini (öğrenci veya öğretmen) seçin.' });
      return;
    }
    if (fillMissing && !confirmFill) {
      setConfirmFill(true);
      return;
    }
    setConfirmFill(false);
    setBusy(true);
    setMsg(null);
    setProgress('Kayıtlı ilk şifreler okunuyor…');
    const errors: Row[] = [];
    try {
      const creds = await dataService.getInitialCredentials();

      // İsteğe bağlı: şifresi kayıtlı olmayan hesaplara yeni ilk şifre ver
      if (fillMissing) {
        const targets: Array<{ type: 'student' | 'teacher'; id: string; name: string }> = [];
        if (includeStudents) {
          myStudents.forEach((s) => {
            if (creds.has(`student:${s.id}`)) return;
            if (!dataService.canManageStudent(s)) return;
            if (!(s.studentNumber || '').trim()) {
              errors.push(['Öğrenci', s.name, 'Öğrenci numarası boş olduğu için şifre verilemedi.']);
              return;
            }
            targets.push({ type: 'student', id: s.id, name: s.name });
          });
        }
        if (includeTeachers) {
          myTeachers.forEach((t) => {
            if (creds.has(`teacher:${t.id}`) || isHeadTeacher(t)) return;
            if (!dataService.canManageTeacherAccount(t)) return;
            targets.push({ type: 'teacher', id: t.id, name: t.name });
          });
        }
        for (let i = 0; i < targets.length; i++) {
          const x = targets[i];
          setProgress(`Yeni ilk şifre veriliyor (${i + 1}/${targets.length}): ${x.name}`);
          try {
            const pw = await dataService.adminResetPassword(x.id);
            creds.set(`${x.type}:${x.id}`, {
              type: x.type,
              recordId: x.id,
              loginId: '',
              password: pw,
              mustChange: true,
              setAt: new Date().toISOString(),
              changedAt: null,
            });
          } catch (e: any) {
            errors.push([x.type === 'student' ? 'Öğrenci' : 'Öğretmen', x.name, e?.message || 'Şifre verilemedi.']);
          }
        }
      }

      setProgress('Excel dosyası hazırlanıyor…');
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      let studentCount = 0;
      let teacherCount = 0;
      let withPassword = 0;

      if (includeStudents) {
        const head: Row = [
          'Sıra',
          'Ad Soyad',
          'Öğrenci No (Giriş Adı)',
          'Sınıf',
          ...(isHead ? ['Kurum'] : []),
          'İlk Giriş Şifresi',
          'Şifre Durumu',
          'Hesap Durumu',
          'E-posta',
          'Telefon',
          'Şifre Verilme Tarihi',
        ];
        const rows: Row[] = myStudents.map((s, i) => {
          const cred = creds.get(`student:${s.id}`);
          if (cred?.password) withPassword++;
          return [
            i + 1,
            s.name,
            s.studentNumber || '',
            s.className || '',
            ...(isHead ? [kurumLabel(s.kurumId)] : []),
            cred?.password || '',
            statusText(cred, !!s.auth_user_id || !!cred, s.mustChangePassword),
            s.status === 'suspended' || s.isSuspended ? 'Askıda' : 'Aktif',
            s.email || '',
            s.phone || '',
            fmtDate(cred?.setAt),
          ];
        });
        studentCount = rows.length;
        const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
        ws['!cols'] = columnWidths(head);
        XLSX.utils.book_append_sheet(wb, ws, 'Öğrenciler');
      }

      if (includeTeachers) {
        const head: Row = [
          'Sıra',
          'Ad Soyad',
          'Kullanıcı Adı (Giriş Adı)',
          'Branş',
          'Rol',
          ...(isHead ? ['Kurum'] : []),
          'İlk Giriş Şifresi',
          'Şifre Durumu',
          'Hesap Durumu',
          'E-posta',
          'Telefon',
          'Şifre Verilme Tarihi',
        ];
        const rows: Row[] = myTeachers.map((t, i) => {
          const cred = creds.get(`teacher:${t.id}`);
          if (cred?.password) withPassword++;
          const headRow = isHeadTeacher(t);
          return [
            i + 1,
            t.name,
            headRow ? t.email : t.username || '',
            t.branch || '',
            headRow ? 'Genel Yönetici' : t.isAdmin ? 'Kurum Yöneticisi' : 'Öğretmen',
            ...(isHead ? [headRow ? '—' : kurumLabel(t.kurumId)] : []),
            headRow ? '' : cred?.password || '',
            headRow ? 'Gerçek e-posta ile giriş (listelenmez)' : statusText(cred, !!t.auth_user_id || !!cred),
            t.isSuspended || t.status === 'suspended' ? 'Askıda' : t.status === 'pending' ? 'Onay bekliyor' : 'Aktif',
            t.email || '',
            t.phone || '',
            fmtDate(cred?.setAt),
          ];
        });
        teacherCount = rows.length;
        const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
        ws['!cols'] = columnWidths(head);
        XLSX.utils.book_append_sheet(wb, ws, 'Öğretmenler');
      }

      if (errors.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tür', 'Ad Soyad', 'Hata'], ...errors]), 'Hatalar');
      }

      const info: Row[] = [
        ['Kullanıcı listesi'],
        ['Hazırlayan', dataService.getCurrentTeacher()?.name || ''],
        ['Tarih', fmtDate(new Date().toISOString())],
        ['Kapsam', isHead ? 'Tüm kurumlar' : dataService.getMyKurum().kurumName || 'Kurumum'],
        [],
        ['GİZLİDİR: Bu dosya giriş şifreleri içerir. Dağıttıktan sonra güvenli bir yerde saklayın veya silin.'],
        ['Kullanıcı kendi şifresini değiştirdiğinde ilk şifre listeden kalkar.'],
        ['"Şifre kayıtlı değil" görünen hesaplar için "yeni ilk şifre oluştur" seçeneğiyle tekrar indirebilirsiniz.'],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Bilgi');

      const fileName = `kullanici-listesi-${todayStamp()}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setMsg({
        tone: errors.length ? 'err' : 'ok',
        text:
          `${fileName} indirildi: ${studentCount} öğrenci, ${teacherCount} öğretmen, ${withPassword} kayıtlı ilk şifre.` +
          (errors.length ? ` ${errors.length} hesapta sorun oldu ("Hatalar" sayfasına bakın).` : ''),
      });
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.message || 'Liste hazırlanamadı.' });
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Panel
      id="user-credentials-export"
      icon={FileSpreadsheet}
      tone="success"
      title="Kullanıcı Listesi (Excel)"
      description="Öğrenci ve öğretmen bilgileri, ilk giriş şifreleri dahil"
    >
      <div className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2.5 text-xs mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Yeni açılan hesapların ve şifresi sıfırlanan hesapların ilk şifresi listeye kendiliğinden yazılır. Kullanıcı kendi
          şifresini değiştirince ilk şifre listeden kalkar. Bu özellikten önce verilmiş şifreler geri okunamaz; onlar için
          aşağıdaki "yeni ilk şifre oluştur" seçeneğini kullanabilirsiniz.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-3">
        <label className="inline-flex items-center gap-2 text-sm text-fg cursor-pointer">
          <input type="checkbox" checked={includeStudents} onChange={(e) => setIncludeStudents(e.target.checked)} />
          Öğrenciler ({myStudents.length})
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-fg cursor-pointer">
          <input type="checkbox" checked={includeTeachers} onChange={(e) => setIncludeTeachers(e.target.checked)} />
          Öğretmenler ({myTeachers.length})
        </label>
        {includeStudents && classOptions.length > 0 && (
          <select
            className="ui-input w-auto"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Sınıf seçimi"
          >
            <option value="all">Tüm sınıflar</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-fg-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={fillMissing}
          onChange={(e) => {
            setFillMissing(e.target.checked);
            setConfirmFill(false);
          }}
        />
        <span>
          <strong className="text-fg">Şifresi kayıtlı olmayan hesaplara yeni ilk şifre oluştur.</strong> Bu hesapların mevcut şifresi
          değişir ve ilk girişte yeni şifre belirlemeleri istenir. Şifresini kendisi değiştirmiş kullanıcılara dokunulmaz.
        </span>
      </label>

      {confirmFill && (
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2.5 text-xs mb-3" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Şifresi kayıtlı olmayan hesapların şifreleri değiştirilecek; bu kişiler eski şifreleriyle giriş yapamayacak. Onaylıyorsanız
            düğmeye tekrar basın.
          </span>
        </div>
      )}

      {progress && <p className="text-xs text-muted mb-2">{progress}</p>}
      {msg && (
        <p
          className={cx('text-xs font-semibold flex items-center gap-1.5 mb-3', msg.tone === 'ok' ? 'text-success-fg' : 'text-danger-fg')}
          role={msg.tone === 'err' ? 'alert' : 'status'}
        >
          {msg.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {msg.text}
        </p>
      )}

      <div className="flex justify-end">
        <button type="button" className="ui-btn ui-btn-primary" onClick={handleExport} disabled={busy} id="user-credentials-export-btn">
          {fillMissing ? <KeyRound className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {busy ? 'Hazırlanıyor…' : confirmFill ? 'Onaylıyorum, şifre ver ve indir' : 'Excel listesini indir'}
        </button>
      </div>
    </Panel>
  );
};
