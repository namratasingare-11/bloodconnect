import { getPool } from '../connection';

export async function listBloodUnits(status?: string) {
  const pool = getPool();
  let query = 'SELECT * FROM blood_units WHERE 1=1';
  const params: unknown[] = [];

  if (status && status !== 'all' && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY unit_id DESC LIMIT 100';

  const [rows]: any = await pool.query(query, params);
  return rows;
}

export async function upsertBloodUnit(unit: Record<string, any>) {
  const pool = getPool();
  const sql = `
    INSERT INTO blood_units (
      unit_code, donor_id, blood_group, component_type, volume_ml,
      collection_date, expiry_date, status, cold_storage_location,
      temperature_c, barcode, is_tested
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      cold_storage_location = VALUES(cold_storage_location)
  `;

  const params = [
    unit.unitCode || unit.unit_code || `BC-${Date.now().toString().slice(-8)}`,
    unit.donorId || unit.donor_id || null,
    unit.bloodGroup || unit.blood_group || 'O+',
    unit.component || unit.component_type || 'Packed Red Blood Cells',
    Number(unit.volumeMl ?? unit.volume_ml ?? 350),
    unit.collectionDate ? new Date(unit.collectionDate) : new Date(),
    unit.expiryDate ? new Date(unit.expiryDate) : new Date(Date.now() + 35 * 86400000),
    unit.status || 'Available',
    unit.storageLocation || unit.cold_storage_location || 'Freezer Bay Alpha-1',
    Number(unit.temperatureC ?? unit.temperature_c ?? 4.0),
    unit.barcode || `BAR${Date.now().toString().slice(-10)}`,
    unit.isTested !== undefined ? Boolean(unit.isTested) : true,
  ];

  const [res]: any = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}
