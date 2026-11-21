import { BloodComponent, BloodGroup, UserRole } from '../types';

export const BLOOD_GROUPS: readonly BloodGroup[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;

export const BLOOD_COMPONENTS: readonly BloodComponent[] = [
  'Whole Blood',
  'Packed Red Cells',
  'Platelets',
  'Fresh Frozen Plasma',
  'Cryoprecipitate',
] as const;

export const DONATION_TIME_SLOTS: readonly string[] = [
  '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:30 AM - 12:30 PM',
  '02:00 PM - 03:00 PM',
  '03:30 PM - 04:30 PM',
  '05:00 PM - 06:00 PM',
] as const;

export const VIEW_LABELS: Record<string, string> = {
  blood_map: 'Live Regional Blood Map',
  ai_care: 'AI Clinical Care Desk',
  availability: 'Find Blood',
  find_blood: 'Find Blood',
  find_donors: 'Find Donors',
  compatibility: 'Compatibility Matrix',
  camps: 'Blood Donation Camps',
  reports: 'Analytics & Reports',
  dbms_architecture: 'DBMS Specifications',
  donor_dashboard: 'Donor Portal',
  hospital_dashboard: 'Hospital Transfusion Desk',
  staff_dashboard: 'Laboratory & Staff Desk',
  admin_dashboard: 'System Administration',
  account_settings: 'Account & Security Settings',
  auth: 'Sign In',
};

export const VIEW_PATHS: Record<string, string> = {
  home: '/',
  blood_map: '/blood-map',
  ai_care: '/ai-care',
  availability: '/find-blood',
  find_blood: '/find-blood',
  find_donors: '/find-donors',
  compatibility: '/compatibility',
  camps: '/camps',
  reports: '/reports',
  dbms_architecture: '/architecture',
  donor_dashboard: '/donor',
  hospital_dashboard: '/hospital',
  staff_dashboard: '/staff',
  admin_dashboard: '/admin',
  account_settings: '/account',
  auth: '/auth',
};

export function resolveViewFromPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = Object.entries(VIEW_PATHS).find(([, path]) => path === normalized);
  return match ? match[0] : 'home';
}

export const ROLE_LABELS: Record<UserRole, string> = {
  donor: 'Donor Portal',
  hospital: 'Hospital Transfusion Desk',
  staff: 'Laboratory & Staff Desk',
  admin: 'System Administration Console',
};

export const DASHBOARD_VIEW_BY_ROLE: Record<UserRole, string> = {
  donor: 'donor_dashboard',
  hospital: 'hospital_dashboard',
  staff: 'staff_dashboard',
  admin: 'admin_dashboard',
};

export const STORAGE_KEYS = {
  units: 'bloodconnect_units',
  requests: 'bloodconnect_requests',
  patients: 'bloodconnect_patients',
  camps: 'bloodconnect_camps',
  donations: 'bloodconnect_donations',
  audit: 'bloodconnect_audit',
  users: 'bloodconnect_users',
  screenings: 'bloodconnect_screenings',
  appointments: 'bloodconnect_appointments',
  customDonors: 'bloodconnect_custom_donors',
  session: 'bloodconnect_session',
} as const;
