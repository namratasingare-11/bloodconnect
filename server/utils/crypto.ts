import crypto from 'crypto';

const SCRYPT_PREFIX = 'scrypt$';
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Hashes a plaintext password using Node's built-in scrypt KDF (N=16384, r=8, p=1)
 * with a cryptographically random 16-byte salt.
 */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against a scrypt-hashed password using constant-time comparison.
 */
export function verifyPassword(plain: string, storedHash: string): boolean {
  if (!plain || !storedHash) return false;

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const derivedBuf = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    const storedBuf = Buffer.from(hashHex, 'hex');
    if (derivedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, storedBuf);
  }

  return false;
}

/**
 * Generates a URL-safe cryptographically secure opaque token.
 */
export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Computes a hex SHA-256 digest (used to hash session tokens, reset tokens, verification tokens, and recovery codes at rest).
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time string comparison for fixed-length hex digests / TOTP codes.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encodes a byte buffer into RFC 4648 Base32 (no padding) for TOTP secrets.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into raw bytes.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a 160-bit Base32 TOTP secret compatible with Google Authenticator / Authy / 1Password.
 */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Generates an RFC 6238 6-digit TOTP code (HMAC-SHA1, 30-second time step).
 */
export function generateTotpCode(secretBase32: string, stepOffset = 0, timestampMs = Date.now()): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / 30) + stepOffset;
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies an RFC 6238 6-digit TOTP code with ±1 window tolerance (90s total drift allowance).
 */
export function verifyTotpCode(secretBase32: string, candidateCode: string, window = 1): boolean {
  const normalized = candidateCode.replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(normalized)) return false;

  const now = Date.now();
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secretBase32, offset, now);
    if (safeEqual(normalized, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a standard otpauth:// URI for authenticator app enrollment.
 */
export function buildOtpAuthUri(accountEmail: string, secretBase32: string, issuer = 'BloodConnect'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates single-use human-readable MFA backup recovery codes (e.g., XXXX-XXXX).
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Validates password complexity policy: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password cannot exceed 128 characters.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  return null;
}
