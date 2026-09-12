import { Homework, Etut } from '../types';

/**
 * Formats a Date or ISO string into Google Calendar ISO format (YYYYMMDDTHHmmssZ)
 */
export function formatToGoogleCalendarDate(dateStr: string, addHours = 1): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 2);
    return fallback.toISOString().replace(/-|:|\.\d\d\d/g, '');
  }
  return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
}

export function formatEndTime(dateStr: string, durationMinutes = 60): string {
  const d = new Date(dateStr);
  d.setMinutes(d.getMinutes() + durationMinutes);
  return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
}

/**
 * Creates an instant Google Calendar event creation URL
 */
export function createGoogleCalendarUrlForHomework(homework: Homework): string {
  const title = encodeURIComponent(`[ÖDEV] ${homework.subject}: ${homework.title}`);
  const outcomesText = homework.outcomes?.length
    ? `\n\n📌 Kazanımlar:\n${homework.outcomes.map(o => `• ${o}`).join('\n')}`
    : '';
  const desc = encodeURIComponent(
    `📚 Ders: ${homework.subject}\n📝 Açıklama: ${homework.description}${outcomesText}\n\nÖğretmen: ${homework.createdByName || 'M. Bilir'}\nSistem: Eğitim & Öğrenci Takip Portalı`
  );

  const startIso = formatToGoogleCalendarDate(homework.dueDate);
  const endIso = formatEndTime(homework.dueDate, 60);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${startIso}/${endIso}&add=m.bilirr@gmail.com`;
}

/**
 * Creates Google Calendar URL for an Etüt session
 */
export function createGoogleCalendarUrlForEtut(etut: Etut): string {
  const startDateTime = `${etut.date}T${etut.time || '14:00'}:00`;
  const title = encodeURIComponent(`[ETÜT] ${etut.subject} - ${etut.topic}`);
  const desc = encodeURIComponent(
    `🎯 Ders: ${etut.subject}\n📖 Konu: ${etut.topic}\n📍 Yer / Sınıf: ${etut.location}\n⏱️ Süre: ${etut.duration} dakika\n\nNotlar: ${etut.notes || 'Etüt saatinde hazır olunuz.'}`
  );

  const startIso = formatToGoogleCalendarDate(startDateTime);
  const endIso = formatEndTime(startDateTime, etut.duration || 60);
  const location = encodeURIComponent(etut.location || 'Okul Derslik');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&location=${location}&dates=${startIso}/${endIso}&add=m.bilirr@gmail.com`;
}

/**
 * Generates an .ics calendar file for universal calendar import
 */
export function downloadIcsFile(filename: string, title: string, description: string, startDate: string, durationMinutes = 60, location = 'Online / Okul') {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const formatDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Egitim Takip Sistemi//TR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    `DTSTART:${formatDate(start)}`,
    `DTEND:${formatDate(end)}`,
    `STATUS:CONFIRMED`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
