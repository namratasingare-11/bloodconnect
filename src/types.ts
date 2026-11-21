export type UserRole = 'donor' | 'hospital' | 'staff' | 'admin';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type BloodComponent = 
  | 'Whole Blood' 
  | 'Packed Red Cells' 
  | 'Platelets' 
  | 'Fresh Frozen Plasma' 
  | 'Cryoprecipitate';

export type RequestUrgency = 'Normal' | 'Urgent' | 'Emergency';

export type RequestStatus = 
  | 'Pending' 
  | 'Under Review' 
  | 'Approved' 
  | 'Partially Fulfilled' 
  | 'Fulfilled' 
  | 'Rejected';

export type DonationStatus = 'Completed' | 'Pending Testing' | 'Deferred' | 'Discarded';

export type UnitStatus = 'Available' | 'Reserved' | 'Issued' | 'Expired' | 'Quarantined';

export type AccountStatus = 'active' | 'pending_verification' | 'suspended' | 'deactivated';

export interface PermissionDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
}

export interface RbacRole {
  key: string;
  name: string;
  description: string;
  authorityRank: number;
  portalScope: UserRole;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
  createdAt: string;
}

export interface UserSessionInfo {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  actorUserId?: number;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  outcome: 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'WARNING';
  resource: string;
  targetUserId?: number;
  ipAddress: string;
  userAgent?: string;
  details: string;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  roleKey?: string;
  roleName?: string;
  authorityRank?: number;
  permissions?: string[];
  status?: AccountStatus;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  department?: string;
  fullName: string;
  phone: string;
  createdAt: string;
  lastLogin?: string;
  donorId?: number;
  hospitalId?: number;
  organizationName?: string;
  licenseNumber?: string;
  password?: string;
  passwordHash?: string;
}

export interface Donor {
  id: number;
  donorCode: string; // e.g., DON-000001
  userId: number;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: BloodGroup;
  rhFactor?: 'Positive' | 'Negative';
  address: string;
  city: string;
  state: string;
  pincode: string;
  weightKg: number;
  totalDonations: number;
  lastDonationDate?: string;
  nextEligibleDate: string;
  eligibilityStatus: 'Eligible' | 'Deferred' | 'Temporary Deferral' | 'Temporarily Deferred' | 'Permanently Deferred';
  donorStatus?: 'Active' | 'Inactive' | 'Temporarily Unavailable';
  availability?: 'Available' | 'Not Available';
  verificationStatus?: 'Verified' | 'Pending Verification';
  medicalNotes?: string;
  consentAccepted: boolean;
  registeredAt: string;
}

export interface MedicalScreening {
  id: number;
  screeningCode?: string; // e.g., SCR-000001
  donorId: number;
  donationId?: number;
  screeningDate: string;
  weightKg: number;
  hemoglobinGdl: number; // Normal >= 12.5
  bloodPressure: string; // e.g., 120/80
  pulseBpm: number;
  temperatureC: number;
  isEligible: boolean;
  eligibilityStatus?: 'Eligible' | 'Deferred' | 'Temporary Deferral' | 'Temporarily Deferred' | 'Permanently Deferred';
  deferralReason?: string;
  screenedByStaffId: number;
  staffName?: string;
}

export interface Donation {
  id: number;
  donationCode: string; // e.g., DN-2026-0045 or DON-REC-000001
  donorId: number;
  donorName: string;
  bloodGroup: BloodGroup;
  donationDate: string;
  donationCenter?: string;
  donationType: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
  unitsCollected: number;
  campId?: number;
  campName?: string;
  staffId: number;
  status: DonationStatus;
  bloodUnitId?: number;
  screeningId: number;
  notes?: string;
}

export interface DonorSearchFilters {
  bloodGroup?: string; // 'ALL' or specific BloodGroup
  city?: string; // 'ALL' or city name
  availability?: string; // 'ALL', 'Available', 'Not Available'
  eligibility?: string; // 'ALL', 'Eligible', 'Deferred', 'Temporarily Deferred'
  verification?: string; // 'ALL', 'Verified', 'Pending Verification'
  searchTerm?: string; // ID, Name, Phone, Email
  sortBy?: 'lastDonationDate' | 'totalDonations' | 'fullName' | 'city' | 'registeredAt';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

export interface DonorSearchResult {
  donors: Donor[];
  totalMatches: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  generatedSql: string;
  indexesUsed: string[];
  executionTimeMs: number;
}

export interface BloodUnit {
  id: number;
  unitCode: string; // e.g., BLD-2026-9041
  donationId: number;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  collectionDate: string;
  expiryDate: string;
  volumeMl: number;
  storageLocation: string; // e.g., Refrigerator A-1, Shelf 2
  refrigeratorCode: string;
  testingStatus: 'Tested - Safe' | 'Pending Testing' | 'Failed Tests';
  testResults: {
    hiv: 'Negative' | 'Positive';
    hepatitisB: 'Negative' | 'Positive';
    hepatitisC: 'Negative' | 'Positive';
    syphilis: 'Negative' | 'Positive';
    malaria: 'Negative' | 'Positive';
  };
  status: UnitStatus;
  issuedToHospitalId?: number;
  issuedAt?: string;
}

export interface Hospital {
  id: number;
  hospitalCode: string; // e.g., HOSP-001
  name: string;
  email: string;
  phone: string;
  licenseNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  totalRequests: number;
  totalUnitsReceived: number;
  verified: boolean;
  latitude?: number;
  longitude?: number;
  zone?: string;
}

export interface Patient {
  id: number;
  patientCode: string; // e.g., PAT-2026-081
  hospitalId: number;
  hospitalName: string;
  fullName: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: BloodGroup;
  diagnosis: string;
  isEmergency: boolean;
  admissionDate: string;
  bedNumber?: string;
}

export interface BloodRequest {
  id: number;
  requestCode: string; // e.g., REQ-2026-00891
  hospitalId: number;
  hospitalName: string;
  patientId: number;
  patientName: string;
  patientCode: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  unitsFulfilled: number;
  urgency: RequestUrgency;
  requiredDate: string;
  status: RequestStatus;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  reviewedByStaffId?: number;
  trackingTimeline: {
    stage: RequestStatus;
    timestamp: string;
    note: string;
  }[];
}

export interface BloodIssue {
  id: number;
  issueCode: string; // e.g., ISS-2026-0312
  requestId: number;
  requestCode: string;
  hospitalId: number;
  hospitalName: string;
  patientName: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsIssued: number;
  issuedAt: string;
  issuedByStaffId: number;
  staffName: string;
  bloodUnitCodes: string[];
  transportTemperatureC: number;
  transactionHash: string; // Cryptographic SHA-256 ledger transaction signature
}

export interface DonationCamp {
  id: number;
  campCode: string;
  name: string;
  organizer: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  city: string;
  capacity: number;
  registeredDonorsCount: number;
  unitsCollectedCount: number;
  status: 'Upcoming' | 'Ongoing' | 'Completed';
  contactPerson: string;
  contactPhone: string;
  latitude?: number;
  longitude?: number;
}

export interface CampRegistration {
  id: number;
  campId: number;
  campName: string;
  donorId: number;
  donorName: string;
  donorCode: string;
  bloodGroup: BloodGroup;
  registeredAt: string;
  timeSlot: string;
  status: 'Registered' | 'Attended' | 'Cancelled';
}

export interface DonationAppointment {
  id: number;
  appointmentCode: string; // e.g., APT-2026-4821
  donorId?: number;
  donorName: string;
  donorPhone: string;
  donorEmail: string;
  bloodGroup: BloodGroup;
  hospitalId: number;
  centerName: string;
  centerAddress: string;
  city: string;
  donationType: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
  appointmentDate: string; // YYYY-MM-DD
  timeSlot: string;
  status: 'Scheduled' | 'Checked In' | 'Completed' | 'Cancelled';
  createdAt: string;
}

export interface BloodSearchIntent {
  bloodGroup?: BloodGroup;
  city?: string;
  component?: BloodComponent;
}

export interface EmergencyPrefill {
  bloodGroup?: BloodGroup;
  component?: BloodComponent;
  hospitalId?: number;
  urgencyNote?: string;
}

export interface BookingPrefill {
  bloodGroup?: BloodGroup;
  city?: string;
  hospitalId?: number;
  donationType?: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
}

export interface BloodMapIntent {
  bloodGroup?: BloodGroup;
  component?: BloodComponent;
  hospitalId?: number;
  layer?: 'all' | 'vaults' | 'camps';
}


export interface AuditLog {
  id: number;
  timestamp: string;
  userId: number;
  userName: string;
  userRole: UserRole;
  action: string;
  tableName: string;
  recordId?: number | string;
  details: string;
  ipAddress: string;
  status: 'SUCCESS' | 'ROLLBACK' | 'WARNING';
}

export interface BloodGroupInventorySummary {
  bloodGroup: BloodGroup;
  availableUnits: number;
  reservedUnits: number;
  issuedUnits: number;
  expiredUnits: number;
  status: 'Available' | 'Low' | 'Critical';
  lastUpdated: string;
}

export interface DbmsTableMeta {
  tableName: string;
  description: string;
  primaryKey: string;
  foreignKeys: { column: string; references: string }[];
  columnsCount: number;
  rowCount: number;
  normalizationLevel: string;
  columns: {
    name: string;
    type: string;
    constraints: string;
    description: string;
  }[];
}

export interface ErEntity {
  id: string;
  label: string;
  type: 'core' | 'transaction' | 'lookup' | 'log';
  attributes: string[];
  pk: string;
  fks: string[];
}

export interface ErRelation {
  from: string;
  to: string;
  label: string;
  cardinality: '1:1' | '1:N' | 'M:N';
}
