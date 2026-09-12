import React, { useState } from 'react';
import {
  CalendarDays,
  LayoutGrid,
  Plus,
  Clock,
  MapPin,
  Users,
  CalendarCheck,
  Trash2,
  Edit2,
  X,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Save,
  Mail,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Etut, Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { WeeklyEtutCalendar } from './WeeklyEtutCalendar';
import { SentCommunicationsModal } from './SentCommunicationsModal';

interface EtutManagementProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
}

export const EtutManagement: React.FC<EtutManagementProps> = ({ etuts, students, classes }) => {
  const [viewMode, setViewMode] = useState<'calendar' | 'cards'>('calendar');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [editingEtut, setEditingEtut] = useState<Etut | null>(null);
  const [etutToDelete, setEtutToDelete] = useState<Etut | null>(null);

  // Form states
  const [subject, setSubject] = useState('Matematik');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('16:00');
  const [duration, setDuration] = useState(45);
  const [location, setLocation] = useState('Matematik Dersliği 102');
  const [notes, setNotes] = useState('');
  const [assigneeMode, setAssigneeMode] = useState<'all' | 'custom'>('custom');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleSaveEtut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !date || !time) return;

    if (editingEtut) {
      dataService.updateEtut(editingEtut.id, {
        subject,
        topic,
        date,
        time,
        duration: Number(duration),
        location,
        notes,
        assignedStudentIds: assigneeMode === 'all' ? 'all' : selectedStudentIds,
      });
      setEditingEtut(null);
    } else {
      dataService.createEtut({
        subject,
        topic,
        date,
        time,
        duration: Number(duration),
        location,
        notes,
        assignedStudentIds: assigneeMode === 'all' ? 'all' : selectedStudentIds,
      });

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
      });
    }

    setIsCreateModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSubject('Matematik');
    setTopic('');
    setDate(new Date().toISOString().slice(0, 10));
    setTime('16:00');
    setDuration(45);
    setLocation('Derslik 102');
    setNotes('');
    setAssigneeMode('custom');
    setSelectedStudentIds([]);
  };

  const openEdit = (etut: Etut) => {
    setEditingEtut(etut);
    setSubject(etut.subject);
    setTopic(etut.topic);
    setDate(etut.date);
    setTime(etut.time);
    setDuration(etut.duration);
    setLocation(etut.location);
    setNotes(etut.notes || '');
    if (etut.assignedStudentIds === 'all') {
      setAssigneeMode('all');
      setSelectedStudentIds([]);
    } else {
      setAssigneeMode('custom');
      setSelectedStudentIds(etut.assignedStudentIds);
    }
    setIsCreateModalOpen(true);
  };

  const handleAddEtutForDate = (dateStr: string) => {
    resetForm();
    setDate(dateStr);
    setEditingEtut(null);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Etüt & Birebir Takip Planlama</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Ders, konu ve öğrenci bazlı etütler oluşturun; haftalık takvim veya kart görünümünde takip edin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Haftalık Takvim</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kart Listesi ({etuts.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsSentCommunicationsOpen(true)}
            className="flex items-center space-x-2 bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Öğrencilere gönderilen tüm otomatik e-posta ve bildirim kayıtları"
          >
            <Mail className="w-4 h-4 text-indigo-400" />
            <span>Giden E-Posta & Bildirimler</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setEditingEtut(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Etüt Planla</span>
          </button>
        </div>
      </div>

      {/* Main Content: Weekly Calendar View OR Cards Grid */}
      {viewMode === 'calendar' ? (
        <WeeklyEtutCalendar
          etuts={etuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
        />
      ) : (
        /* Etüt List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {etuts.map((etut) => {
            const assignedStudents =
              etut.assignedStudentIds === 'all'
                ? students
                : students.filter((s) => (etut.assignedStudentIds as string[]).includes(s.id));

            return (
              <div
                key={etut.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative group"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {etut.subject}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEdit(etut)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEtutToDelete(etut)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Etütü Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 line-clamp-2">{etut.topic}</h3>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-slate-300 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time} ({etut.duration} dk)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>{etut.location}</span>
                    </div>
                    {etut.notes && (
                      <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800/60 mt-1">
                        {etut.notes}
                      </p>
                    )}
                  </div>

                  {/* Assigned Students */}
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && (
                        <span className="text-[10px] text-indigo-400">Tümü Dahil</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {assignedStudents.map((std) => (
                        <span
                          key={std.id}
                          className="inline-flex items-center space-x-1 text-[11px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <span>{std.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <a
                    href={createGoogleCalendarUrlForEtut(etut)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition-all"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>Google Takvime Ekle</span>
                  </a>

                  <button
                    onClick={() =>
                      downloadIcsFile(
                        `etut-${etut.subject}-${etut.date}`,
                        `[ETÜT] ${etut.subject}: ${etut.topic}`,
                        etut.notes || `${etut.location} yerinde etüt çalışması`,
                        `${etut.date}T${etut.time}:00`,
                        etut.duration,
                        etut.location
                      )
                    }
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    title=".ics Takvim İndir"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE/EDIT ETUT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">
                  {editingEtut ? 'Etüt Bilgilerini Düzenle' : 'Yeni Etüt Oluştur'}
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEtut} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ders *</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Matematik">Matematik</option>
                    <option value="Geometri">Geometri</option>
                    <option value="Fizik">Fizik</option>
                    <option value="Kimya">Kimya</option>
                    <option value="Biyoloji">Biyoloji</option>
                    <option value="Türkçe">Türkçe / Edebiyat</option>
                    <option value="Tarih">Tarih</option>
                    <option value="Coğrafya">Coğrafya</option>
                    <option value="Felsefe">Felsefe & Din</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Konu *</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Türev Geometrik Yorum & Soru Çözümü"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tarih *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Başlangıç Saati *</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Süre (Dk)</label>
                  <input
                    type="number"
                    min={15}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Derslik / Yer</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Örn: 204 No'lu Fen Laboratuvarı"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Açıklama / Not</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Yanlarında soru bankasını getirsinler..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Student Assignment: Tümü vs Ayrı Ayrı Seçim */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Etüte Katılacak Öğrenciler:
                </label>
                <div className="flex items-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setAssigneeMode('all')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      assigneeMode === 'all'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👥 Tüm Öğrenciler ({students.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigneeMode('custom')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      assigneeMode === 'custom'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Listeden Ayrı Ayrı Seç ({selectedStudentIds.length})
                  </button>
                </div>

                {assigneeMode === 'custom' && (
                  <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                      <span className="text-xs text-slate-400 font-medium">Öğrenci Seçimi:</span>
                      <button
                        type="button"
                        onClick={handleSelectAllStudents}
                        className="text-xs text-indigo-400 hover:underline font-semibold"
                      >
                        {selectedStudentIds.length === students.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {students.map((std) => (
                        <label
                          key={std.id}
                          className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(std.id)}
                            onChange={() => handleToggleStudent(std.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-white truncate">{std.name}</span>
                          <span className="text-slate-400 text-[10px]">({std.className})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Otomatik Bildirim & E-Posta Bilgilendirme Notu */}
              <div className="p-3 bg-teal-950/40 border border-teal-500/30 rounded-xl flex items-start space-x-2.5 text-xs text-teal-200">
                <Mail className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">
                    🔔 Otomatik Sistem Bildirimi ve E-Posta İletimi
                  </span>
                  <span>
                    Etüt kaydedildiğinde atanan öğrencilere anında sistem bildirimi düşer ve tarih, saat, derslik bilgilerini içeren kurumsal HTML e-posta otomatik olarak iletilir.
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingEtut ? 'Değişiklikleri Kaydet' : 'Etütü Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ETUT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!etutToDelete}
        onClose={() => setEtutToDelete(null)}
        onConfirm={() => {
          if (etutToDelete) {
            dataService.deleteEtut(etutToDelete.id);
          }
        }}
        title="Etütü Sil"
        itemBadge={etutToDelete ? `${etutToDelete.subject} • ${etutToDelete.date} ${etutToDelete.time}` : undefined}
        description={`"${etutToDelete?.topic}" başlıklı etüt planını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmButtonText="Etütü Sil"
      />

      {/* Giden E-Posta & Bildirim İletim Günlüğü */}
      <SentCommunicationsModal
        isOpen={isSentCommunicationsOpen}
        onClose={() => setIsSentCommunicationsOpen(false)}
      />
    </div>
  );
};
