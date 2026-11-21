import { getPool } from '../connection';

export async function listBloodRequests() {
  const pool = getPool();
  const [rows]: any = await pool.query('SELECT * FROM blood_requests ORDER BY request_id DESC LIMIT 100');
  return rows;
}

export async function upsertBloodRequest(req: Record<string, any>) {
  const pool = getPool();
  const sql = `
    INSERT INTO blood_requests (
      request_code, hospital_id, hospital_name, patient_name, patient_age,
      patient_gender, blood_group, component_type, units_needed, urgency,
      diagnosis, attending_physician, contact_phone, required_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      units_needed = VALUES(units_needed)
  `;

  const params = [
    req.requestCode || req.request_code || `REQ-${Date.now().toString().slice(-6)}`,
    Number(req.hospitalId ?? req.hospital_id ?? 1),
    req.hospitalName || req.hospital_name || 'General Referral Hospital',
    req.patientName || req.patient_name || 'Emergency Patient',
    Number(req.patientAge ?? req.patient_age ?? 35),
    req.patientGender || req.patient_gender || 'Male',
    req.bloodGroup || req.blood_group || 'O+',
    req.component || req.component_type || 'Packed Red Blood Cells',
    Number(req.unitsRequired ?? req.units_needed ?? 1),
    req.urgency || 'Urgent',
    req.diagnosis || req.remarks || 'Acute need / Trauma',
    req.attendingPhysician || req.attending_physician || 'Duty Consultant, MD',
    req.contactPhone || req.contact_phone || '+91 98000 11111',
    req.requiredDate ? new Date(req.requiredDate) : new Date(Date.now() + 86400000),
    req.status || 'Pending',
  ];

  const [res]: any = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

export async function updateBloodRequestStatus(
  idOrCode: string | number,
  status: string,
  note?: string
) {
  const pool = getPool();
  const whereClause =
    typeof idOrCode === 'string' && idOrCode.startsWith('REQ-')
      ? 'WHERE request_code = ?'
      : 'WHERE request_id = ?';

  const [res]: any = await pool.query(
    `UPDATE blood_requests SET status = ? ${whereClause}`,
    [status, idOrCode]
  );

  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value) VALUES (?, ?, ?, ?, ?)',
      [
        1,
        'UPDATE_REQUEST_STATUS',
        'blood_requests',
        typeof idOrCode === 'number' ? idOrCode : 1,
        `Shifted to ${status}. ${note || ''}`.trim(),
      ]
    );
  } catch {
    // Audit insert failure should not roll back status mutation
  }

  return { affectedRows: res.affectedRows };
}
