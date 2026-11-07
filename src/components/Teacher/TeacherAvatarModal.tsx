import React, { useEffect, useState } from 'react';
import { Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { ProfilResmiSecModal } from '../ProfilResmiSecModal';
import { ogretmenProfilRol } from '../../lib/profilResmi';
import { fetchTeacherRoles } from '../../lib/teacherRoles';

// ============================================================================
// Öğretmen profil resmi (Aşama 171): eski emoji / hazır fotoğraf seçenekleri kaldırıldı;
// ortak "Profil resmi" penceresi kullanılır (çizimler + fotoğraf yükle).
// Unvan (Müdür, Rehberlik…) pencere açılınca bir kez okunur: yalnız kendi unvanının çizimi seçilebilir.
// ============================================================================

interface TeacherAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: Teacher;
}

export const TeacherAvatarModal: React.FC<TeacherAvatarModalProps> = ({ isOpen, onClose, teacher }) => {
  const [unvan, setUnvan] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetchTeacherRoles()
      .then((m) => alive && setUnvan(m.get(teacher.id) || []))
      .catch(() => {}); // rol tablosu yoksa branş / yönetici bilgisine bakılır
    return () => {
      alive = false;
    };
  }, [isOpen, teacher.id]);

  if (!isOpen) return null;
  return (
    <ProfilResmiSecModal
      open
      onClose={onClose}
      kind="teacher"
      rol={ogretmenProfilRol(teacher, unvan)}
      person={teacher}
      onSave={async (avatar) => {
        await dataService.saveTeacherProfile(teacher.id, { avatar });
      }}
    />
  );
};
