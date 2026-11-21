import { DBConfig, getPool, MONITORED_TABLES } from '../connection';
import { SCHEMA_SQL } from '../schema';
import { upsertDonor } from './donor.repository';
import { upsertBloodUnit } from './bloodUnit.repository';
import { upsertBloodRequest } from './request.repository';
import { upsertCamp } from './camp.repository';
import { upsertAppointment } from './appointment.repository';
import { isDatabaseOfflineError } from '../../utils/apiResponse';
import { hashPassword } from '../../utils/crypto';

export async function executeAutoInit(customConfig?: Partial<DBConfig>): Promise<{
  success: boolean;
  message: string;
  executedQueries: number;
  offline?: boolean;
}> {
  try {
    const currentPool = getPool(customConfig);
    const statements = SCHEMA_SQL.split(';')
      .map(s => s.replace(/--[^\r\n]*/g, '').trim())
      .filter(s => s.length > 0);

    let executed = 0;
    const errors: string[] = [];

    for (const stmt of statements) {
      try {
        await currentPool.query(stmt);
        executed++;
      } catch (e: unknown) {
        const upper = stmt.toUpperCase();
        if (upper.startsWith('CREATE DATABASE') || upper.startsWith('USE ')) {
          continue;
        }
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (errors.length > 0 && executed === 0) {
      if (isDatabaseOfflineError(new Error(errors[0]))) {
        return {
          success: false,
          offline: true,
          message: `MySQL host ${customConfig?.host || 'localhost'} is unreachable (${errors[0]}). Configure DB_HOST/DB_USER/DB_PASSWORD or start your MySQL server to initialize tables.`,
          executedQueries: 0,
        };
      }
      return {
        success: false,
        message: `Schema execution error: ${errors[0]}`,
        executedQueries: 0,
      };
    }

    return {
      success: true,
      message: `Successfully executed schema statements in MySQL (${executed} DDL/DML statements applied).`,
      executedQueries: executed,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      offline: isDatabaseOfflineError(err),
      message: `Schema initialization failed: ${msg}`,
      executedQueries: 0,
    };
  }
}

export async function seedSampleDatabase(customConfig?: Partial<DBConfig>) {
  const pool = getPool(customConfig);
  const demoHash = hashPassword('password123');

  await pool.query(
    `INSERT IGNORE INTO users (username, email, password_hash, role, full_name, phone) VALUES
    ('donor_rahul', 'rahul.sharma@donor.bloodconnect.org', ?, 'donor', 'Rahul Sharma', '+91 98201 45678'),
    ('hosp_metro', 'admin@metrohealth.org', ?, 'hospital', 'Dr. Anita Desai', '+91 98450 12345'),
    ('staff_sarah', 'nurse.sarah@bloodconnect.org', ?, 'staff', 'Sarah Jenkins, RN', '+91 98111 87654'),
    ('admin_system', 'director@bloodconnect.org', ?, 'admin', 'Dr. Rajesh Nair', '+91 98220 99887')`,
    [demoHash, demoHash, demoHash, demoHash]
  );

  await pool.query(`
    INSERT IGNORE INTO donors (donor_code, full_name, email, phone, date_of_birth, gender, blood_group, address_line, city, pincode, weight_kg, total_donations, next_eligible_date) VALUES
    ('DNR-2026-001', 'Rahul Sharma', 'rahul.sharma@donor.bloodconnect.org', '+91 98201 45678', '1992-04-12', 'Male', 'O+', '402 Sunrise Heights, Bandra West', 'Mumbai', '400050', 74.5, 4, '2026-10-15'),
    ('DNR-2026-002', 'Priya Patel', 'priya.p@gmail.com', '+91 98210 23456', '1996-08-25', 'Female', 'A+', '12 Gulmohar Lane, Vile Parle', 'Mumbai', '400056', 58.0, 2, '2026-11-01'),
    ('DNR-2026-003', 'Vikramaditya Rao', 'vikram.rao@techcorp.in', '+91 97400 34567', '1989-11-03', 'Male', 'O-', '88 Koramangala 4th Block', 'Bengaluru', '560034', 81.0, 7, '2026-09-20'),
    ('DNR-2026-004', 'Ananya Sen', 'ananya.sen@kolkata.edu', '+91 98300 45678', '1998-02-14', 'Female', 'B+', '15 Ballygunge Circular Rd', 'Kolkata', '700019', 61.5, 3, '2026-10-05'),
    ('DNR-2026-005', 'Gurpreet Singh', 'gurpreet.s@delhitech.ac.in', '+91 98101 56789', '1994-07-19', 'Male', 'AB+', 'C-42 Hauz Khas Enclave', 'New Delhi', '110016', 79.0, 5, '2026-09-30')
  `);

  await pool.query(`
    INSERT IGNORE INTO blood_units (unit_code, donor_id, blood_group, component_type, volume_ml, collection_date, expiry_date, status, cold_storage_location, temperature_c, barcode) VALUES
    ('BC-2026-OP-001', 1, 'O+', 'Packed Red Blood Cells', 350, NOW(), DATE_ADD(NOW(), INTERVAL 35 DAY), 'Available', 'Freezer Bay Alpha-1', 3.8, 'BC99201456781'),
    ('BC-2026-ON-002', 3, 'O-', 'Whole Blood', 450, NOW(), DATE_ADD(NOW(), INTERVAL 28 DAY), 'Available', 'Freezer Bay Alpha-2', 4.0, 'BC99201456782'),
    ('BC-2026-AP-003', 2, 'A+', 'Platelets', 250, NOW(), DATE_ADD(NOW(), INTERVAL 5 DAY), 'Available', 'Agitator Chamber C-1', 22.0, 'BC99201456783'),
    ('BC-2026-BP-004', 4, 'B+', 'Fresh Frozen Plasma', 200, NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY), 'Available', 'Deep Subzero Vault D-1', -25.0, 'BC99201456784'),
    ('BC-2026-ABP-005', 5, 'AB+', 'Packed Red Blood Cells', 350, NOW(), DATE_ADD(NOW(), INTERVAL 32 DAY), 'Available', 'Freezer Bay Alpha-3', 3.5, 'BC99201456785')
  `);

  await pool.query(`
    INSERT IGNORE INTO blood_requests (request_code, hospital_id, hospital_name, patient_name, patient_age, patient_gender, blood_group, component_type, units_needed, urgency, diagnosis, attending_physician, contact_phone, required_date, status) VALUES
    ('REQ-2026-8801', 1, 'Metro General Hospital & Trauma Center', 'Deepak Verma', 42, 'Male', 'O-', 'Packed Red Blood Cells', 3, 'Immediate (Emergency)', 'Polytrauma / Road Accident with acute hemorrhage', 'Dr. Anita Desai', '+91 98450 12345', DATE_ADD(NOW(), INTERVAL 2 HOUR), 'Pending'),
    ('REQ-2026-8802', 2, 'Apollo Emergency Trauma Care', 'Sunita Roy', 28, 'Female', 'A+', 'Platelets', 2, 'Urgent', 'Severe Dengue with Thrombocytopenia', 'Dr. Arvind Mehra', '+91 98200 67890', DATE_ADD(NOW(), INTERVAL 8 HOUR), 'Approved')
  `);

  await pool.query(`
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value) VALUES
    (1, 'DATABASE_SAMPLE_DATA_SEEDED', 'system', 1, NULL, 'Initialized sample users, donors, units, and emergency requests in MySQL')
  `);
}

export async function executeRawQuery(
  sql: string,
  customConfig?: Partial<DBConfig>
): Promise<{
  success: boolean;
  message: string;
  rows?: unknown[];
  fields?: string[];
  durationMs: number;
  offline?: boolean;
}> {
  const start = Date.now();
  const trimmed = sql.trim().replace(/;+$/, '');

  try {
    const currentPool = getPool(customConfig);
    const [result, fieldDefs]: [any, any] = await currentPool.query(trimmed);
    const durationMs = Date.now() - start;

    if (Array.isArray(result)) {
      const fields = fieldDefs
        ? fieldDefs.map((f: { name: string }) => f.name)
        : result.length > 0
        ? Object.keys(result[0])
        : [];
      return {
        success: true,
        message: `Query executed successfully in ${durationMs}ms (${result.length} rows returned).`,
        rows: result,
        fields,
        durationMs,
      };
    }

    return {
      success: true,
      message: `Query executed successfully in ${durationMs}ms (${result.affectedRows || 0} rows affected).`,
      rows: [result],
      fields: Object.keys(result),
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const offline = isDatabaseOfflineError(err);

    return {
      success: false,
      offline,
      message: offline
        ? `MySQL server is not reachable (${msg}). Connect to a live MySQL instance to execute SQL queries.`
        : msg,
      durationMs,
    };
  }
}

export async function bulkSyncToMySQL(payload: {
  donors?: Record<string, any>[];
  bloodUnits?: Record<string, any>[];
  requests?: Record<string, any>[];
  camps?: Record<string, any>[];
  appointments?: Record<string, any>[];
}) {
  const pool = getPool();
  const results = {
    donorsSynced: 0,
    unitsSynced: 0,
    requestsSynced: 0,
    campsSynced: 0,
    appointmentsSynced: 0,
  };

  if (Array.isArray(payload.donors)) {
    for (const d of payload.donors.slice(0, 500)) {
      try {
        await upsertDonor(d);
        results.donorsSynced++;
      } catch {
        // Continue batch sync on individual row errors
      }
    }
  }

  if (Array.isArray(payload.bloodUnits)) {
    for (const u of payload.bloodUnits) {
      try {
        await upsertBloodUnit(u);
        results.unitsSynced++;
      } catch {}
    }
  }

  if (Array.isArray(payload.requests)) {
    for (const r of payload.requests) {
      try {
        await upsertBloodRequest(r);
        results.requestsSynced++;
      } catch {}
    }
  }

  if (Array.isArray(payload.camps)) {
    for (const c of payload.camps) {
      try {
        await upsertCamp(c);
        results.campsSynced++;
      } catch {}
    }
  }

  if (Array.isArray(payload.appointments)) {
    for (const apt of payload.appointments) {
      try {
        await upsertAppointment(apt);
        results.appointmentsSynced++;
      } catch {}
    }
  }

  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value) VALUES (?, ?, ?, ?, ?)',
      [
        1,
        'FULL_DATABASE_BULK_SYNC',
        'system',
        1,
        `Bulk sync completed: ${results.donorsSynced} donors, ${results.unitsSynced} units, ${results.requestsSynced} requests, ${results.campsSynced} camps, ${results.appointmentsSynced} appointments.`,
      ]
    );
  } catch {}

  return results;
}

export async function fetchAllLiveData() {
  const pool = getPool();
  const data: {
    donors: unknown[];
    bloodUnits: unknown[];
    requests: unknown[];
    camps: unknown[];
    appointments: unknown[];
    patients: unknown[];
    auditLogs: unknown[];
    liveCounts: Record<string, number>;
  } = {
    donors: [],
    bloodUnits: [],
    requests: [],
    camps: [],
    appointments: [],
    patients: [],
    auditLogs: [],
    liveCounts: {},
  };

  const queries: Array<{ key: keyof Omit<typeof data, 'liveCounts'>; sql: string }> = [
    { key: 'donors', sql: 'SELECT * FROM donors ORDER BY donor_id DESC LIMIT 200' },
    { key: 'bloodUnits', sql: 'SELECT * FROM blood_units ORDER BY unit_id DESC LIMIT 200' },
    { key: 'requests', sql: 'SELECT * FROM blood_requests ORDER BY request_id DESC LIMIT 100' },
    { key: 'camps', sql: 'SELECT * FROM donation_camps ORDER BY camp_id DESC' },
    { key: 'appointments', sql: 'SELECT * FROM donation_appointments ORDER BY appointment_id DESC LIMIT 100' },
    { key: 'patients', sql: 'SELECT * FROM patients ORDER BY patient_id DESC LIMIT 50' },
    { key: 'auditLogs', sql: 'SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 50' },
  ];

  for (const item of queries) {
    try {
      const [rows]: any = await pool.query(item.sql);
      data[item.key] = rows;
    } catch {
      data[item.key] = [];
    }
  }

  for (const table of MONITORED_TABLES) {
    try {
      const [rows]: any = await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      data.liveCounts[table] = Number(rows[0]?.count ?? 0);
    } catch {
      // Table may not be initialized yet
    }
  }

  return data;
}
