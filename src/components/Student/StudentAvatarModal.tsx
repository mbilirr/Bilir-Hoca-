import React from 'react';
import { Student } from '../../types';
import { dataService } from '../../services/dataService';
import { ProfilResmiSecModal } from '../ProfilResmiSecModal';

// ============================================================================
// Öğrenci profil resmi (Aşama 171): eski emoji / karikatür seçenekleri kaldırıldı;
// ortak "Profil resmi" penceresi kullanılır (cinsiyete göre çizimler + fotoğraf yükle).
// ============================================================================

interface StudentAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onAvatarUpdated?: (newAvatar: string) => void;
}

export const StudentAvatarModal: React.FC<StudentAvatarModalProps> = ({ isOpen, onClose, student, onAvatarUpdated }) => {
  if (!isOpen) return null;
  return (
    <ProfilResmiSecModal
      open
      onClose={onClose}
      kind="student"
      rol="student"
      person={student}
      onSave={async (avatar) => {
        await dataService.updateStudent(student.id, { avatar });
        onAvatarUpdated?.(avatar || '');
      }}
    />
  );
};
