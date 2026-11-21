export const SCHEMA_SQL = `-- ==========================================================
-- BloodConnect MySQL 8.0 Relational Database Schema
-- 3NF Normalized Schema with Foreign Keys, Indexes & Audit Trail
-- ==========================================================

CREATE DATABASE IF NOT EXISTS bloodconnect_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bloodconnect_db;

-- 1. USERS & ACCESS MANAGEMENT
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'hospital', 'donor') NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. BLOOD GROUPS LOOKUP
CREATE TABLE IF NOT EXISTS blood_groups (
  blood_group_id INT AUTO_INCREMENT PRIMARY KEY,
  blood_group_name VARCHAR(5) NOT NULL UNIQUE,
  rh_factor ENUM('Positive', 'Negative') NOT NULL,
  compatible_donate_to VARCHAR(100) NOT NULL,
  compatible_receive_from VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- 3. REGISTERED DONORS
CREATE TABLE IF NOT EXISTS donors (
  donor_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_code VARCHAR(20) NOT NULL UNIQUE,
  user_id INT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL DEFAULT 'Maharashtra',
  pincode VARCHAR(10) NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  eligibility_status ENUM('Eligible', 'Temporarily Deferred', 'Permanently Deferred') DEFAULT 'Eligible',
  donor_status ENUM('Active', 'Inactive') DEFAULT 'Active',
  availability ENUM('Available', 'Not Available') DEFAULT 'Available',
  verification_status ENUM('Verified', 'Pending Verification', 'Rejected') DEFAULT 'Verified',
  total_donations INT DEFAULT 0,
  last_donation_date DATE NULL,
  next_eligible_date DATE NOT NULL,
  medical_notes TEXT NULL,
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_donors_blood_group (blood_group),
  INDEX idx_donors_city (city),
  INDEX idx_donors_availability (availability)
) ENGINE=InnoDB;

-- 4. MEDICAL SCREENINGS
CREATE TABLE IF NOT EXISTS medical_screenings (
  screening_id INT AUTO_INCREMENT PRIMARY KEY,
  screening_code VARCHAR(20) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  weight_kg DECIMAL(5,2) NOT NULL,
  hemoglobin_gdl DECIMAL(4,2) NOT NULL,
  blood_pressure VARCHAR(15) NOT NULL,
  pulse_bpm INT NOT NULL,
  temperature_c DECIMAL(4,2) NOT NULL,
  is_eligible BOOLEAN NOT NULL,
  eligibility_status VARCHAR(50) NOT NULL,
  deferral_reason VARCHAR(255) NULL,
  screened_by_staff_id INT DEFAULT 1,
  staff_name VARCHAR(100) DEFAULT 'Staff RN',
  FOREIGN KEY (donor_id) REFERENCES donors(donor_id) ON DELETE CASCADE,
  INDEX idx_screenings_donor (donor_id)
) ENGINE=InnoDB;

-- 5. DONATION CAMPS
CREATE TABLE IF NOT EXISTS donation_camps (
  camp_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  organizer VARCHAR(150) NOT NULL,
  camp_date DATE NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  location VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  capacity INT NOT NULL,
  registered_donors_count INT DEFAULT 0,
  collected_units_count INT DEFAULT 0,
  status ENUM('Upcoming', 'Ongoing', 'Completed') DEFAULT 'Upcoming',
  contact_person VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  INDEX idx_camps_date (camp_date),
  INDEX idx_camps_city (city)
) ENGINE=InnoDB;

-- 6. BLOOD INVENTORY UNITS
CREATE TABLE IF NOT EXISTS blood_units (
  unit_id INT AUTO_INCREMENT PRIMARY KEY,
  unit_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component_type ENUM('Whole Blood', 'Packed Red Blood Cells', 'Packed Red Cells', 'Platelets', 'Fresh Frozen Plasma', 'Cryoprecipitate') NOT NULL,
  volume_ml INT NOT NULL,
  collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP NOT NULL,
  status ENUM('Available', 'Reserved', 'Issued', 'Discarded', 'Expired', 'Quarantined') DEFAULT 'Available',
  cold_storage_location VARCHAR(100) NOT NULL,
  temperature_c DECIMAL(4,2) NOT NULL,
  barcode VARCHAR(50) NOT NULL,
  is_tested BOOLEAN DEFAULT TRUE,
  hiv_status VARCHAR(20) DEFAULT 'Negative',
  hbv_status VARCHAR(20) DEFAULT 'Negative',
  hcv_status VARCHAR(20) DEFAULT 'Negative',
  syphilis_status VARCHAR(20) DEFAULT 'Negative',
  malaria_status VARCHAR(20) DEFAULT 'Negative',
  INDEX idx_units_blood_group (blood_group),
  INDEX idx_units_status (status),
  INDEX idx_units_expiry (expiry_date)
) ENGINE=InnoDB;

-- 7. BLOOD REQUESTS (HOSPITALS & EMERGENCY)
CREATE TABLE IF NOT EXISTS blood_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(30) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  patient_age INT NOT NULL,
  patient_gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component_type VARCHAR(50) NOT NULL,
  units_needed INT NOT NULL,
  urgency ENUM('Normal', 'Routine', 'Urgent', 'Emergency', 'Immediate (Emergency)') NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  attending_physician VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  required_date TIMESTAMP NOT NULL,
  status ENUM('Pending', 'Under Review', 'In Cross-Match', 'Approved', 'Partially Fulfilled', 'Fulfilled', 'Rejected', 'Cancelled') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_requests_status (status),
  INDEX idx_requests_urgency (urgency)
) ENGINE=InnoDB;

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT 1,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  ip_address VARCHAR(45) DEFAULT '127.0.0.1',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. POPULATE INITIAL BLOOD GROUPS
INSERT IGNORE INTO blood_groups (blood_group_id, blood_group_name, rh_factor, compatible_donate_to, compatible_receive_from) VALUES
(1, 'O-', 'Negative', 'O-, O+, A-, A+, B-, B+, AB-, AB+', 'O-'),
(2, 'O+', 'Positive', 'O+, A+, B+, AB+', 'O-, O+'),
(3, 'A-', 'Negative', 'A-, A+, AB-, AB+', 'O-, A-'),
(4, 'A+', 'Positive', 'A+, AB+', 'O-, O+, A-, A+'),
(5, 'B-', 'Negative', 'B-, B+, AB-, AB+', 'O-, B-'),
(6, 'B+', 'Positive', 'B+, AB+', 'O-, O+, B-, B+'),
(7, 'AB-', 'Negative', 'AB-, AB+', 'O-, A-, B-, AB-'),
(8, 'AB+', 'Positive', 'AB+', 'ALL (Universal Recipient)');

-- 10. CAMP REGISTRATIONS
CREATE TABLE IF NOT EXISTS camp_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_id INT NOT NULL,
  camp_name VARCHAR(150) NOT NULL,
  donor_id INT NOT NULL,
  donor_name VARCHAR(100) NOT NULL,
  donor_code VARCHAR(30) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  time_slot VARCHAR(50) NOT NULL,
  status VARCHAR(30) DEFAULT 'Registered',
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 11. PATIENTS REGISTRY
CREATE TABLE IF NOT EXISTS patients (
  patient_id INT AUTO_INCREMENT PRIMARY KEY,
  patient_code VARCHAR(30) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  age INT NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  attending_doctor VARCHAR(100) NOT NULL,
  admission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 12. BLOOD DISPATCH / ISSUES
CREATE TABLE IF NOT EXISTS blood_issues (
  issue_id INT AUTO_INCREMENT PRIMARY KEY,
  issue_code VARCHAR(30) NOT NULL UNIQUE,
  request_id INT NOT NULL,
  request_code VARCHAR(30) NOT NULL,
  hospital_id INT NOT NULL,
  hospital_name VARCHAR(150) NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  component VARCHAR(50) NOT NULL,
  units_issued INT NOT NULL,
  issued_by_staff_id INT NOT NULL,
  staff_name VARCHAR(100) NOT NULL,
  blood_unit_codes TEXT NOT NULL,
  transaction_hash VARCHAR(64) NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 13. DONATIONS LOG
CREATE TABLE IF NOT EXISTS donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  donation_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  donor_name VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  donation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  donation_type VARCHAR(50) NOT NULL,
  units_collected INT DEFAULT 1,
  staff_id INT DEFAULT 1,
  status VARCHAR(30) DEFAULT 'Completed',
  blood_unit_id INT NULL,
  notes TEXT NULL
) ENGINE=InnoDB;

-- 14. DIRECT DONATION APPOINTMENTS & DIGITAL PASSES
CREATE TABLE IF NOT EXISTS donation_appointments (
  appointment_id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_code VARCHAR(30) NOT NULL UNIQUE,
  donor_id INT NULL,
  donor_name VARCHAR(100) NOT NULL,
  donor_phone VARCHAR(25) NOT NULL,
  donor_email VARCHAR(100) NOT NULL,
  blood_group VARCHAR(5) NOT NULL,
  hospital_id INT NOT NULL,
  center_name VARCHAR(150) NOT NULL,
  center_address VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  donation_type ENUM('Whole Blood', 'Apheresis Platelets', 'Plasma') NOT NULL DEFAULT 'Whole Blood',
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(50) NOT NULL,
  status ENUM('Scheduled', 'Checked In', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointments_date (appointment_date),
  INDEX idx_appointments_status (status),
  INDEX idx_appointments_donor (donor_id)
) ENGINE=InnoDB;

-- ==========================================================
-- 15. RBAC & AUTHENTICATION SECURITY SUBSYSTEM TABLES
-- ==========================================================

-- 15a. CONFIGURABLE ROLES & AUTHORITY HIERARCHY
CREATE TABLE IF NOT EXISTS roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(50) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  authority_rank INT NOT NULL DEFAULT 10,
  portal_scope ENUM('donor', 'hospital', 'staff', 'admin') NOT NULL DEFAULT 'donor',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roles_rank (authority_rank)
) ENGINE=InnoDB;

-- 15b. GRANULAR PERMISSIONS CATALOG
CREATE TABLE IF NOT EXISTS permissions (
  permission_id INT AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(80) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- 15c. ROLE -> PERMISSION MAPPING (M:N)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15d. USER -> ROLE ASSIGNMENT
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_by_user_id INT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15e. SERVER-MANAGED AUTHENTICATION SESSIONS (SHA-256 HASHED TOKENS)
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- 15f. PASSWORD RESET TOKENS (SINGLE-USE, SHA-256 HASHED)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_reset_user (user_id)
) ENGINE=InnoDB;

-- 15g. EMAIL VERIFICATION TOKENS (SINGLE-USE, SHA-256 HASHED)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_verify_user (user_id)
) ENGINE=InnoDB;

-- 15h. BRUTE-FORCE & LOGIN ATTEMPT TRACKER
CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key VARCHAR(160) PRIMARY KEY,
  failure_count INT NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 15i. OPTIONAL TOTP MULTI-FACTOR AUTHENTICATION (RFC 6238)
CREATE TABLE IF NOT EXISTS user_mfa (
  user_id INT PRIMARY KEY,
  totp_secret VARCHAR(128) NULL,
  pending_secret VARCHAR(128) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_code_hashes JSON NULL,
  enabled_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15j. IMMUTABLE SECURITY & AUTHORIZATION AUDIT LOGS
CREATE TABLE IF NOT EXISTS security_audit_logs (
  event_id VARCHAR(64) PRIMARY KEY,
  actor_user_id INT NULL,
  actor_email VARCHAR(120) NULL,
  actor_role VARCHAR(50) NULL,
  action VARCHAR(80) NOT NULL,
  outcome ENUM('SUCCESS', 'DENIED', 'BLOCKED', 'WARNING') NOT NULL,
  resource VARCHAR(160) NOT NULL,
  target_user_id INT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sec_audit_action (action),
  INDEX idx_sec_audit_outcome (outcome),
  INDEX idx_sec_audit_created (created_at)
) ENGINE=InnoDB;
`;

