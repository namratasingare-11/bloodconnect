import { getPool } from '../connection';

export async function listCamps() {
  const pool = getPool();
  const [rows]: any = await pool.query('SELECT * FROM donation_camps ORDER BY camp_id DESC');
  return rows;
}

export async function upsertCamp(camp: Record<string, any>) {
  const pool = getPool();
  const sql = `
    INSERT INTO donation_camps (
      camp_code, name, organizer, camp_date, start_time, end_time,
      location, city, capacity, registered_donors_count, collected_units_count,
      status, contact_person, contact_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      registered_donors_count = VALUES(registered_donors_count),
      status = VALUES(status)
  `;

  const params = [
    camp.campCode || camp.camp_code || `CMP-${Date.now().toString().slice(-6)}`,
    camp.name || 'Community Blood Drive',
    camp.organizer || 'Red Cross Society',
    camp.date || camp.camp_date || new Date().toISOString().split('T')[0],
    camp.startTime || camp.start_time || '09:00 AM',
    camp.endTime || camp.end_time || '05:00 PM',
    camp.location || 'Community Center',
    camp.city || 'Mumbai',
    Number(camp.capacity ?? 100),
    Number(camp.registeredDonorsCount ?? camp.registered_donors_count ?? 0),
    Number(camp.collectedUnitsCount ?? camp.collected_units_count ?? 0),
    camp.status || 'Upcoming',
    camp.contactPerson || camp.contact_person || 'Coordinator',
    camp.contactPhone || camp.contact_phone || '+91 98000 22222',
  ];

  const [res]: any = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

export async function registerCampDonor(
  campId: number,
  donor: Record<string, any>,
  timeSlot: string
) {
  const pool = getPool();
  const sql = `
    INSERT INTO camp_registrations (
      camp_id, camp_name, donor_id, donor_name, donor_code, blood_group, time_slot, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    campId,
    donor.campName || 'Donation Drive',
    Number(donor.id ?? donor.donorId ?? 1),
    donor.fullName || donor.donorName || 'Donor',
    donor.donorCode || 'DON-0001',
    donor.bloodGroup || 'O+',
    timeSlot || '10:00 AM - 11:00 AM',
    'Registered',
  ];

  const [res]: any = await pool.query(sql, params);
  await pool.query(
    'UPDATE donation_camps SET registered_donors_count = registered_donors_count + 1 WHERE camp_id = ?',
    [campId]
  );
  return { insertId: res.insertId };
}
