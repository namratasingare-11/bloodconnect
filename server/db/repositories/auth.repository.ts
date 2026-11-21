import { getPool } from '../connection';

export interface DbUserRow {
  user_id: number;
  username: string;
  email: string;
  role: 'admin' | 'staff' | 'hospital' | 'donor';
  full_name: string;
  phone: string;
  created_at: string;
  password_hash: string;
}

export async function findUserByIdentifier(identifier: string, role?: string): Promise<DbUserRow | null> {
  const pool = getPool();
  let sql =
    'SELECT user_id, username, email, role, full_name, phone, created_at, password_hash FROM users WHERE (email = ? OR username = ?)';
  const params: unknown[] = [identifier, identifier];

  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }

  const [rows]: any = await pool.query(sql, params);
  return rows && rows.length > 0 ? (rows[0] as DbUserRow) : null;
}

export async function findExistingUser(email: string, username: string): Promise<boolean> {
  const pool = getPool();
  const [rows]: any = await pool.query(
    'SELECT user_id FROM users WHERE email = ? OR username = ? LIMIT 1',
    [email, username]
  );
  return Array.isArray(rows) && rows.length > 0;
}

export async function createUser(input: {
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'staff' | 'hospital' | 'donor';
  fullName: string;
  phone: string;
}) {
  const pool = getPool();
  const [result]: any = await pool.query(
    'INSERT INTO users (username, email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [input.username, input.email, input.passwordHash, input.role, input.fullName, input.phone]
  );

  return {
    id: result.insertId as number,
    username: input.username,
    email: input.email,
    role: input.role,
    fullName: input.fullName,
    phone: input.phone,
    createdAt: new Date().toISOString(),
  };
}
