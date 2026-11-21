import { getPool } from '../connection';

export async function listAppointments(donorId?: number) {
  const pool = getPool();
  if (donorId) {
    const [rows]: any = await pool.query(
      'SELECT * FROM donation_appointments WHERE donor_id = ? ORDER BY appointment_date ASC, appointment_id DESC',
      [donorId]
    );
    return rows;
  }
  const [rows]: any = await pool.query(
    'SELECT * FROM donation_appointments ORDER BY appointment_id DESC LIMIT 100'
  );
  return rows;
}

export async function upsertAppointment(apt: Record<string, any>) {
  const pool = getPool();
  const sql = `
    INSERT INTO donation_appointments (
      appointment_code, donor_id, donor_name, donor_phone, donor_email,
      blood_group, hospital_id, center_name, center_address, city,
      donation_type, appointment_date, time_slot, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      appointment_date = VALUES(appointment_date),
      time_slot = VALUES(time_slot),
      status = VALUES(status)
  `;

  const params = [
    apt.appointmentCode || apt.appointment_code || `APT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    apt.donorId ?? apt.donor_id ?? null,
    apt.donorName || apt.donor_name || 'Donor',
    apt.donorPhone || apt.donor_phone || '',
    apt.donorEmail || apt.donor_email || '',
    apt.bloodGroup || apt.blood_group || 'O+',
    Number(apt.hospitalId ?? apt.hospital_id ?? 1),
    apt.centerName || apt.center_name || 'BloodConnect Collection Center',
    apt.centerAddress || apt.center_address || 'Main Campus',
    apt.city || 'Mumbai',
    apt.donationType || apt.donation_type || 'Whole Blood',
    apt.appointmentDate || apt.appointment_date || new Date().toISOString().split('T')[0],
    apt.timeSlot || apt.time_slot || '10:00 AM - 11:00 AM',
    apt.status || 'Scheduled',
  ];

  const [res]: any = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

export async function updateAppointmentByIdOrCode(
  idOrCode: string | number,
  updates: { status?: string; appointmentDate?: string; timeSlot?: string }
) {
  const pool = getPool();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.status) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.appointmentDate) {
    fields.push('appointment_date = ?');
    params.push(updates.appointmentDate);
  }
  if (updates.timeSlot) {
    fields.push('time_slot = ?');
    params.push(updates.timeSlot);
  }

  if (fields.length === 0) return { affectedRows: 0 };

  const whereClause =
    typeof idOrCode === 'string' && idOrCode.startsWith('APT-')
      ? 'WHERE appointment_code = ?'
      : 'WHERE appointment_id = ?';

  const [res]: any = await pool.query(
    `UPDATE donation_appointments SET ${fields.join(', ')} ${whereClause}`,
    [...params, idOrCode]
  );

  return { affectedRows: res.affectedRows };
}
