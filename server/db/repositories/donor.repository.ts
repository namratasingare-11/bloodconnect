import { getPool } from '../connection';

export interface DonorQueryParams {
  page: number;
  limit: number;
  bloodGroup?: string;
  city?: string;
}

export async function listDonors({ page, limit, bloodGroup, city }: DonorQueryParams) {
  const pool = getPool();
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM donors WHERE 1=1';
  const params: unknown[] = [];

  if (bloodGroup && bloodGroup !== 'all' && bloodGroup !== 'ALL') {
    query += ' AND blood_group = ?';
    params.push(bloodGroup);
  }
  if (city && city !== 'all' && city !== 'ALL') {
    query += ' AND city = ?';
    params.push(city);
  }

  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
  const [countResult]: any = await pool.query(countQuery, params);
  const total = Number(countResult[0]?.total ?? 0);

  query += ' ORDER BY donor_id ASC LIMIT ? OFFSET ?';
  const [rows]: any = await pool.query(query, [...params, limit, offset]);

  return { total, page, limit, donors: rows };
}

export async function upsertDonor(d: Record<string, any>) {
  const pool = getPool();
  const sql = `
    INSERT INTO donors (
      donor_code, full_name, email, phone, date_of_birth, gender, blood_group,
      address_line, city, state, pincode, weight_kg, eligibility_status,
      donor_status, availability, verification_status, total_donations,
      last_donation_date, next_eligible_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      email = VALUES(email),
      weight_kg = VALUES(weight_kg),
      eligibility_status = VALUES(eligibility_status),
      donor_status = VALUES(donor_status),
      availability = VALUES(availability),
      verification_status = VALUES(verification_status),
      total_donations = VALUES(total_donations),
      last_donation_date = VALUES(last_donation_date),
      next_eligible_date = VALUES(next_eligible_date)
  `;
  const params = [
    d.donorCode || d.donor_code || `DON-${Date.now().toString().slice(-6)}`,
    d.fullName || d.full_name || 'Anonymous Donor',
    d.email || `donor_${Date.now()}@bloodconnect.org`,
    d.phone || '+91 98000 00000',
    d.dateOfBirth || d.date_of_birth || '1995-01-01',
    d.gender || 'Male',
    d.bloodGroup || d.blood_group || 'O+',
    d.address || d.address_line || 'Central District',
    d.city || 'Mumbai',
    d.state || 'Maharashtra',
    d.pincode || '400001',
    Number(d.weightKg ?? d.weight_kg ?? 65.0),
    d.eligibilityStatus || d.eligibility_status || 'Eligible',
    d.donorStatus || d.donor_status || 'Active',
    d.availability || 'Available',
    d.verificationStatus || d.verification_status || 'Verified',
    Number(d.totalDonations ?? d.total_donations ?? 0),
    d.lastDonationDate || d.last_donation_date || null,
    d.nextEligibleDate || d.next_eligible_date || new Date().toISOString().split('T')[0],
  ];

  const [res]: any = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

export async function updateDonorByIdOrCode(idOrCode: string | number, updates: Record<string, any>) {
  const pool = getPool();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.fullName || updates.full_name) {
    fields.push('full_name = ?');
    params.push(updates.fullName || updates.full_name);
  }
  if (updates.phone) {
    fields.push('phone = ?');
    params.push(updates.phone);
  }
  if (updates.email) {
    fields.push('email = ?');
    params.push(updates.email);
  }
  if (updates.city) {
    fields.push('city = ?');
    params.push(updates.city);
  }
  if (updates.donorStatus || updates.donor_status) {
    fields.push('donor_status = ?');
    params.push(updates.donorStatus || updates.donor_status);
  }
  if (updates.availability) {
    fields.push('availability = ?');
    params.push(updates.availability);
  }
  if (updates.verificationStatus || updates.verification_status) {
    fields.push('verification_status = ?');
    params.push(updates.verificationStatus || updates.verification_status);
  }
  if (updates.eligibilityStatus || updates.eligibility_status) {
    fields.push('eligibility_status = ?');
    params.push(updates.eligibilityStatus || updates.eligibility_status);
  }
  if (updates.totalDonations !== undefined) {
    fields.push('total_donations = ?');
    params.push(Number(updates.totalDonations));
  }

  if (fields.length === 0) return { affectedRows: 0 };

  const whereClause =
    typeof idOrCode === 'string' && idOrCode.startsWith('DON-')
      ? 'WHERE donor_code = ?'
      : 'WHERE donor_id = ?';

  const [res]: any = await pool.query(
    `UPDATE donors SET ${fields.join(', ')} ${whereClause}`,
    [...params, idOrCode]
  );
  return { affectedRows: res.affectedRows };
}
