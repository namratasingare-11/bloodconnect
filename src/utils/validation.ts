import { BLOOD_GROUPS } from '../config/constants';
import { BloodGroup } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{7,18}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone.trim());
}

export function isValidBloodGroup(value: string): value is BloodGroup {
  return (BLOOD_GROUPS as readonly string[]).includes(value);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  if (!password || password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long.' };
  }
  return { valid: true };
}
