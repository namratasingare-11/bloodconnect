import { DonationAppointment } from '../types';

function parseSlotTime(timePart: string): { hours: number; minutes: number } {
  const match = timePart.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hours: 10, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

function formatIcsLocalDate(dateIso: string, hours: number, minutes: number): string {
  const clean = dateIso.replace(/-/g, '');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${clean}T${hh}${mm}00`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Generates and downloads a standards-compliant RFC 5545 .ics calendar file
 * with a 2-hour pre-donation hydration reminder alarm.
 */
export function downloadAppointmentIcs(appointment: DonationAppointment): void {
  const [startRaw, endRaw] = appointment.timeSlot.split(/\s*[-–]\s*/);
  const start = parseSlotTime(startRaw || '10:00 AM');
  const end = endRaw ? parseSlotTime(endRaw) : { hours: start.hours + 1, minutes: start.minutes };

  const dtStart = formatIcsLocalDate(appointment.appointmentDate, start.hours, start.minutes);
  const dtEnd = formatIcsLocalDate(appointment.appointmentDate, end.hours, end.minutes);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const summary = `Blood Donation (${appointment.donationType}) · ${appointment.centerName}`;
  const location = `${appointment.centerName}, ${appointment.centerAddress}, ${appointment.city}`;
  const description = [
    `BloodConnect Digital Pass: ${appointment.appointmentCode}`,
    `Donor: ${appointment.donorName} (${appointment.bloodGroup})`,
    `Donation Type: ${appointment.donationType}`,
    `Preparation: Drink 500 mL of water 2 hours prior, eat a balanced low-fat meal, and carry a valid government photo ID.`
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BloodConnect//Clinical Appointment Pass//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appointment.appointmentCode}@bloodconnect.network`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:BloodConnect Reminder: Drink 500 mL water and eat a balanced meal before your donation slot.',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `BloodConnect_${appointment.appointmentCode}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
