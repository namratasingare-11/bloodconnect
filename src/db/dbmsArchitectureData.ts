import { DbmsTableMeta, ErEntity, ErRelation } from '../types';

export const MYSQL_DDL_SCRIPT = `-- ==========================================================
-- BLOODCONNECT - BLOOD BANK & DONOR MANAGEMENT SYSTEM
-- RELATIONAL DATABASE MANAGEMENT SYSTEM (RDBMS) SCHEMA
-- Target DBMS: MySQL 8.0+ / MariaDB 10.5+
-- Normalization Level: 3rd Normal Form (3NF)
-- Engine: InnoDB (Full ACID Support, Foreign Keys & Transactions)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS bloodconnect_db
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE bloodconnect_db;

-- ----------------------------------------------------------
-- 1. USERS TABLE (Authentication & Base Identity)
-- ----------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('donor', 'hospital', 'staff', 'admin') NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 2. BLOOD GROUPS LOOKUP TABLE (Master Reference)
-- ----------------------------------------------------------
CREATE TABLE blood_groups (
  blood_group_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(5) NOT NULL UNIQUE, -- 'A+', 'O-', etc.
  antigen_a BOOLEAN NOT NULL,
  antigen_b BOOLEAN NOT NULL,
  rh_factor BOOLEAN NOT NULL,
  can_donate_to VARCHAR(100) NOT NULL,
  can_receive_from VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 3. DONORS TABLE (Core Donor Profile in 3NF)
-- ----------------------------------------------------------
CREATE TABLE donors (
  donor_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_code VARCHAR(20) NOT NULL UNIQUE, -- e.g., DON-2026-00124
  user_id INT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group_id INT NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL CHECK (weight_kg >= 45.00),
  eligibility_status ENUM('Eligible', 'Deferred', 'Temporary Deferral') DEFAULT 'Eligible',
  total_donations INT DEFAULT 0,
  last_donation_date DATE NULL,
  next_eligible_date DATE NOT NULL,
  medical_notes TEXT NULL,
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (blood_group_id) REFERENCES blood_groups(blood_group_id),
  INDEX idx_donors_blood_group (blood_group_id),
  INDEX idx_donors_eligibility (eligibility_status),
  INDEX idx_donors_city (city)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 4. MEDICAL SCREENINGS TABLE (Health Pre-requisite for Donation)
-- ----------------------------------------------------------
CREATE TABLE medical_screenings (
  screening_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_id INT NOT NULL,
  screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  weight_kg DECIMAL(5,2) NOT NULL,
  hemoglobin_gdl DECIMAL(4,2) NOT NULL CHECK (hemoglobin_gdl >= 5.0),
  blood_pressure VARCHAR(15) NOT NULL, -- e.g., 120/80
  pulse_bpm INT NOT NULL CHECK (pulse_bpm BETWEEN 50 AND 120),
  temperature_c DECIMAL(4,2) NOT NULL CHECK (temperature_c BETWEEN 35.0 AND 40.0),
  is_eligible BOOLEAN NOT NULL,
  deferral_reason VARCHAR(255) NULL,
  screened_by_staff_id INT NOT NULL,
  FOREIGN KEY (donor_id) REFERENCES donors(donor_id) ON DELETE RESTRICT,
  FOREIGN KEY (screened_by_staff_id) REFERENCES users(user_id),
  INDEX idx_screenings_donor (donor_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 5. DONATION CAMPS TABLE (Community Outreach Drives)
-- ----------------------------------------------------------
CREATE TABLE donation_camps (
  camp_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  organizer VARCHAR(150) NOT NULL,
  camp_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  capacity INT NOT NULL CHECK (capacity > 0),
  registered_count INT DEFAULT 0,
  collected_units_count INT DEFAULT 0,
  status ENUM('Upcoming', 'Ongoing', 'Completed') DEFAULT 'Upcoming',
  contact_person VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  INDEX idx_camps_date (camp_date)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 6. DONATIONS TABLE (Logged Donation Event)
-- ----------------------------------------------------------
CREATE TABLE donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  donation_code VARCHAR(20) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  screening_id INT NOT NULL UNIQUE,
  camp_id INT NULL,
  donation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  donation_type ENUM('Whole Blood', 'Apheresis Platelets', 'Plasma') DEFAULT 'Whole Blood',
  units_collected INT DEFAULT 1 CHECK (units_collected > 0),
  staff_id INT NOT NULL,
  status ENUM('Completed', 'Pending Testing', 'Deferred', 'Discarded') DEFAULT 'Completed',
  notes TEXT NULL,
  FOREIGN KEY (donor_id) REFERENCES donors(donor_id) ON DELETE RESTRICT,
  FOREIGN KEY (screening_id) REFERENCES medical_screenings(screening_id),
  FOREIGN KEY (camp_id) REFERENCES donation_camps(camp_id),
  FOREIGN KEY (staff_id) REFERENCES users(user_id),
  INDEX idx_donations_donor (donor_id),
  INDEX idx_donations_date (donation_date)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 7. BLOOD COMPONENTS LOOKUP TABLE
-- ----------------------------------------------------------
CREATE TABLE blood_components (
  component_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE, -- 'Whole Blood', 'Packed Red Cells', 'Platelets', 'FFP', etc.
  shelf_life_days INT NOT NULL,
  storage_temp_c VARCHAR(30) NOT NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 8. STORAGE LOCATIONS TABLE (Inventory Physical Tracking)
-- ----------------------------------------------------------
CREATE TABLE storage_locations (
  storage_id INT AUTO_INCREMENT PRIMARY KEY,
  room_name VARCHAR(50) NOT NULL,
  refrigerator_code VARCHAR(30) NOT NULL,
  shelf_number INT NOT NULL,
  temperature_c DECIMAL(4,2) NOT NULL,
  capacity_units INT NOT NULL,
  current_units_stored INT DEFAULT 0,
  UNIQUE KEY uq_storage (refrigerator_code, shelf_number)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 9. BLOOD UNITS TABLE (Unit-Level Serialization & Testing)
-- ----------------------------------------------------------
CREATE TABLE blood_units (
  unit_id INT AUTO_INCREMENT PRIMARY KEY,
  unit_code VARCHAR(20) NOT NULL UNIQUE, -- BLD-2026-9041
  donation_id INT NOT NULL,
  blood_group_id INT NOT NULL,
  component_id INT NOT NULL,
  storage_id INT NOT NULL,
  volume_ml INT NOT NULL CHECK (volume_ml > 0),
  collection_date TIMESTAMP NOT NULL,
  expiry_date TIMESTAMP NOT NULL,
  testing_status ENUM('Tested - Safe', 'Pending Testing', 'Failed Tests') DEFAULT 'Pending Testing',
  test_hiv ENUM('Negative', 'Positive') DEFAULT 'Negative',
  test_hepb ENUM('Negative', 'Positive') DEFAULT 'Negative',
  test_hepc ENUM('Negative', 'Positive') DEFAULT 'Negative',
  test_syphilis ENUM('Negative', 'Positive') DEFAULT 'Negative',
  test_malaria ENUM('Negative', 'Positive') DEFAULT 'Negative',
  status ENUM('Available', 'Reserved', 'Issued', 'Expired', 'Quarantined') DEFAULT 'Available',
  FOREIGN KEY (donation_id) REFERENCES donations(donation_id),
  FOREIGN KEY (blood_group_id) REFERENCES blood_groups(blood_group_id),
  FOREIGN KEY (component_id) REFERENCES blood_components(component_id),
  FOREIGN KEY (storage_id) REFERENCES storage_locations(storage_id),
  INDEX idx_units_bg_status (blood_group_id, status),
  INDEX idx_units_expiry (expiry_date)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 10. HOSPITALS TABLE (Certified Institutional Clients)
-- ----------------------------------------------------------
CREATE TABLE hospitals (
  hospital_id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_code VARCHAR(20) NOT NULL UNIQUE,
  user_id INT NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  license_number VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  is_verified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_hospitals_city (city)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 11. PATIENTS TABLE (Hospital Admitted Inpatients)
-- ----------------------------------------------------------
CREATE TABLE patients (
  patient_id INT AUTO_INCREMENT PRIMARY KEY,
  patient_code VARCHAR(20) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  age INT NOT NULL CHECK (age >= 0),
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group_id INT NOT NULL,
  diagnosis VARCHAR(255) NOT NULL,
  is_emergency BOOLEAN DEFAULT FALSE,
  bed_number VARCHAR(30) NULL,
  admission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
  FOREIGN KEY (blood_group_id) REFERENCES blood_groups(blood_group_id),
  INDEX idx_patients_hospital (hospital_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 12. BLOOD REQUESTS TABLE (Hospital Clinical Orders)
-- ----------------------------------------------------------
CREATE TABLE blood_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(20) NOT NULL UNIQUE, -- REQ-2026-00891
  hospital_id INT NOT NULL,
  patient_id INT NOT NULL,
  blood_group_id INT NOT NULL,
  component_id INT NOT NULL,
  units_required INT NOT NULL CHECK (units_required > 0),
  units_fulfilled INT DEFAULT 0,
  urgency ENUM('Normal', 'Urgent', 'Emergency') DEFAULT 'Normal',
  required_date DATE NOT NULL,
  status ENUM('Pending', 'Under Review', 'Approved', 'Partially Fulfilled', 'Fulfilled', 'Rejected') DEFAULT 'Pending',
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
  FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
  FOREIGN KEY (blood_group_id) REFERENCES blood_groups(blood_group_id),
  FOREIGN KEY (component_id) REFERENCES blood_components(component_id),
  INDEX idx_requests_status (status),
  INDEX idx_requests_urgency (urgency)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 13. BLOOD ISSUES TABLE (Issuance Event Header)
-- ----------------------------------------------------------
CREATE TABLE blood_issues (
  issue_id INT AUTO_INCREMENT PRIMARY KEY,
  issue_code VARCHAR(20) NOT NULL UNIQUE,
  request_id INT NOT NULL,
  issued_by_staff_id INT NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  units_issued INT NOT NULL CHECK (units_issued > 0),
  transport_temp_c DECIMAL(4,2) NOT NULL,
  transaction_hash VARCHAR(64) NOT NULL,
  FOREIGN KEY (request_id) REFERENCES blood_requests(request_id),
  FOREIGN KEY (issued_by_staff_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 14. BLOOD ISSUE UNITS (Bridge Table M:N for Unit Traceability)
-- ----------------------------------------------------------
CREATE TABLE blood_issue_units (
  issue_id INT NOT NULL,
  unit_id INT NOT NULL,
  compatibility_crossmatch_ok BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (issue_id, unit_id),
  FOREIGN KEY (issue_id) REFERENCES blood_issues(issue_id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES blood_units(unit_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 15. CAMP REGISTRATIONS TABLE
-- ----------------------------------------------------------
CREATE TABLE camp_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  camp_id INT NOT NULL,
  donor_id INT NOT NULL,
  time_slot VARCHAR(30) NOT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('Registered', 'Attended', 'Cancelled') DEFAULT 'Registered',
  UNIQUE KEY uq_camp_donor (camp_id, donor_id),
  FOREIGN KEY (camp_id) REFERENCES donation_camps(camp_id),
  FOREIGN KEY (donor_id) REFERENCES donors(donor_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------
-- 16. AUDIT LOGS TABLE (Comprehensive System Traceability)
-- ----------------------------------------------------------
CREATE TABLE audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id INT NULL,
  action VARCHAR(80) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id VARCHAR(50) NULL,
  details TEXT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  status ENUM('SUCCESS', 'ROLLBACK', 'WARNING') DEFAULT 'SUCCESS',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_audit_timestamp (timestamp)
) ENGINE=InnoDB;

-- ==========================================================
-- VIEWS
-- ==========================================================

-- VIEW 1: Available Blood Inventory by Group and Component
CREATE OR REPLACE VIEW available_blood_view AS
SELECT 
  bg.code AS blood_group,
  bc.name AS component_name,
  COUNT(bu.unit_id) AS available_units,
  MIN(bu.expiry_date) AS earliest_expiry
FROM blood_units bu
JOIN blood_groups bg ON bu.blood_group_id = bg.blood_group_id
JOIN blood_components bc ON bu.component_id = bc.component_id
WHERE bu.status = 'Available' AND bu.expiry_date > NOW()
GROUP BY bg.code, bc.name;

-- VIEW 2: Pending Emergency Requests View
CREATE OR REPLACE VIEW pending_requests_view AS
SELECT 
  br.request_code,
  h.name AS hospital_name,
  p.full_name AS patient_name,
  bg.code AS blood_group,
  bc.name AS component,
  br.units_required,
  br.urgency,
  br.required_date
FROM blood_requests br
JOIN hospitals h ON br.hospital_id = h.hospital_id
JOIN patients p ON br.patient_id = p.patient_id
JOIN blood_groups bg ON br.blood_group_id = bg.blood_group_id
JOIN blood_components bc ON br.component_id = bc.component_id
WHERE br.status IN ('Pending', 'Under Review');

-- VIEW 3: Expiring Blood Units View
CREATE OR REPLACE VIEW expiring_blood_view AS
SELECT 
  bu.unit_code,
  bg.code AS blood_group,
  bc.name AS component,
  bu.storage_location,
  bu.expiry_date,
  DATEDIFF(bu.expiry_date, NOW()) AS days_remaining
FROM blood_units bu
JOIN blood_groups bg ON bu.blood_group_id = bg.blood_group_id
JOIN blood_components bc ON bu.component_id = bc.component_id
WHERE bu.status = 'Available' 
  AND bu.expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
ORDER BY bu.expiry_date ASC;

-- ==========================================================
-- STORED PROCEDURE: issue_blood (ACID Transaction Demonstration)
-- ==========================================================
DELIMITER //
CREATE PROCEDURE issue_blood(
  IN p_request_id INT,
  IN p_unit_id INT,
  IN p_staff_id INT,
  OUT p_result_code VARCHAR(20),
  OUT p_message VARCHAR(255)
)
proc_label: BEGIN
  DECLARE v_unit_status VARCHAR(20);
  DECLARE v_expiry TIMESTAMP;
  DECLARE v_issue_id INT;
  DECLARE v_units_req INT;
  DECLARE v_units_ful INT;

  -- Error handler for automatic rollback
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_result_code = 'ERR_SQL';
    SET p_message = 'Database error encountered during issuance. Transaction rolled back.';
    INSERT INTO audit_logs (action, table_name, details, status, ip_address)
    VALUES ('ISSUE_BLOOD_ROLLBACK', 'blood_units', 'Transaction failed and rolled back automatically', 'ROLLBACK', '127.0.0.1');
  END;

  START TRANSACTION;

  -- 1. Check unit availability
  SELECT status, expiry_date INTO v_unit_status, v_expiry
  FROM blood_units
  WHERE unit_id = p_unit_id FOR UPDATE;

  IF v_unit_status != 'Available' OR v_expiry <= NOW() THEN
    ROLLBACK;
    SET p_result_code = 'ERR_UNAVAILABLE';
    SET p_message = 'Selected blood unit is not available or has expired.';
    LEAVE proc_label;
  END IF;

  -- 2. Mark unit as issued
  UPDATE blood_units 
  SET status = 'Issued'
  WHERE unit_id = p_unit_id;

  -- 3. Create issue record
  INSERT INTO blood_issues (request_id, issued_by_staff_id, units_issued, transport_temp_c, transaction_hash)
  VALUES (p_request_id, p_staff_id, 1, 4.0, SHA2(CONCAT(p_request_id, p_unit_id, NOW()), 256));
  
  SET v_issue_id = LAST_INSERT_ID();

  -- 4. Map unit to issue
  INSERT INTO blood_issue_units (issue_id, unit_id, compatibility_crossmatch_ok)
  VALUES (v_issue_id, p_unit_id, TRUE);

  -- 5. Update request status
  UPDATE blood_requests
  SET units_fulfilled = units_fulfilled + 1,
      status = CASE 
        WHEN units_fulfilled + 1 >= units_required THEN 'Fulfilled'
        ELSE 'Partially Fulfilled'
      END
  WHERE request_id = p_request_id;

  -- 6. Insert Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address, status)
  VALUES (p_staff_id, 'TRANSACTION_ISSUE_BLOOD', 'blood_issues', v_issue_id, 'Successfully issued blood unit with verified cold-chain and crossmatch', '127.0.0.1', 'SUCCESS');

  COMMIT;
  SET p_result_code = 'SUCCESS';
  SET p_message = 'Blood unit issued successfully. Inventory and request updated.';
END //
DELIMITER ;
`;

export const DBMS_TABLES_META: DbmsTableMeta[] = [
  {
    tableName: 'users',
    description: 'Central credential repository and role-based access control table.',
    primaryKey: 'user_id',
    foreignKeys: [],
    columnsCount: 9,
    rowCount: 54,
    normalizationLevel: '3NF (Atomic fields, distinct role categorization)',
    columns: [
      { name: 'user_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Surrogate primary key' },
      { name: 'email', type: 'VARCHAR(120)', constraints: 'NOT NULL UNIQUE', description: 'User login email' },
      { name: 'username', type: 'VARCHAR(50)', constraints: 'NOT NULL UNIQUE', description: 'Unique username' },
      { name: 'role', type: 'ENUM', constraints: "NOT NULL ('donor','hospital','staff','admin')", description: 'RBAC authorization level' },
      { name: 'full_name', type: 'VARCHAR(100)', constraints: 'NOT NULL', description: 'Legal name of account holder' },
      { name: 'phone', type: 'VARCHAR(20)', constraints: 'NOT NULL', description: 'Contact telephone' }
    ]
  },
  {
    tableName: 'blood_groups',
    description: 'Lookup table storing ABO/Rh antigen phenotypes and compatibility matrices.',
    primaryKey: 'blood_group_id',
    foreignKeys: [],
    columnsCount: 6,
    rowCount: 8,
    normalizationLevel: '3NF (Reference entity isolating antigen details from transaction records)',
    columns: [
      { name: 'blood_group_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Unique group identifier' },
      { name: 'code', type: 'VARCHAR(5)', constraints: 'NOT NULL UNIQUE', description: 'ABO/Rh code (e.g., A+, O-)' },
      { name: 'can_donate_to', type: 'VARCHAR(100)', constraints: 'NOT NULL', description: 'Compatible recipient blood groups' },
      { name: 'can_receive_from', type: 'VARCHAR(100)', constraints: 'NOT NULL', description: 'Compatible donor blood groups' }
    ]
  },
  {
    tableName: 'donors',
    description: 'Comprehensive medical and contact profile of registered voluntary donors.',
    primaryKey: 'donor_id',
    foreignKeys: [
      { column: 'user_id', references: 'users(user_id)' },
      { column: 'blood_group_id', references: 'blood_groups(blood_group_id)' }
    ],
    columnsCount: 16,
    rowCount: 52,
    normalizationLevel: '3NF (Normalized addresses, foreign key to blood_groups, zero multi-valued fields)',
    columns: [
      { name: 'donor_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Internal primary key' },
      { name: 'donor_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Human-readable barcode (e.g., DON-2026-00124)' },
      { name: 'user_id', type: 'INT', constraints: 'NOT NULL UNIQUE FK', description: 'Linked authentication user' },
      { name: 'blood_group_id', type: 'INT', constraints: 'NOT NULL FK', description: 'Verified blood group reference' },
      { name: 'weight_kg', type: 'DECIMAL(5,2)', constraints: 'NOT NULL CHECK(>=45.0)', description: 'Eligibility weight verification' },
      { name: 'eligibility_status', type: 'ENUM', constraints: "('Eligible','Deferred','Temporary Deferral')", description: 'Current donation readiness status' },
      { name: 'next_eligible_date', type: 'DATE', constraints: 'NOT NULL', description: '3-month cooldown restriction date' }
    ]
  },
  {
    tableName: 'medical_screenings',
    description: 'Pre-donation clinical vitals, hemoglobin count, and medical deferral history.',
    primaryKey: 'screening_id',
    foreignKeys: [
      { column: 'donor_id', references: 'donors(donor_id)' },
      { column: 'screened_by_staff_id', references: 'users(user_id)' }
    ],
    columnsCount: 10,
    rowCount: 28,
    normalizationLevel: '3NF (Screening measurements isolated into dedicated physical check entity)',
    columns: [
      { name: 'screening_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Screening event ID' },
      { name: 'donor_id', type: 'INT', constraints: 'NOT NULL FK', description: 'Candidate donor reference' },
      { name: 'hemoglobin_gdl', type: 'DECIMAL(4,2)', constraints: 'NOT NULL CHECK(>=5.0)', description: 'Spectrophotometric Hb reading' },
      { name: 'blood_pressure', type: 'VARCHAR(15)', constraints: 'NOT NULL', description: 'Systolic/diastolic measurement' },
      { name: 'is_eligible', type: 'BOOLEAN', constraints: 'NOT NULL', description: 'Doctor clearance flag' }
    ]
  },
  {
    tableName: 'donations',
    description: 'Transactional blood collection logs linking donors, staff, and screening tests.',
    primaryKey: 'donation_id',
    foreignKeys: [
      { column: 'donor_id', references: 'donors(donor_id)' },
      { column: 'screening_id', references: 'medical_screenings(screening_id)' },
      { column: 'camp_id', references: 'donation_camps(camp_id)' },
      { column: 'staff_id', references: 'users(user_id)' }
    ],
    columnsCount: 10,
    rowCount: 23,
    normalizationLevel: '3NF (Zero repeating groups; camp reference is nullable for in-clinic donations)',
    columns: [
      { name: 'donation_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Donation transaction ID' },
      { name: 'donation_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Standard donation track ID' },
      { name: 'donation_type', type: 'ENUM', constraints: "('Whole Blood','Apheresis Platelets','Plasma')", description: 'Donation harvest modality' },
      { name: 'units_collected', type: 'INT', constraints: 'NOT NULL CHECK(>0)', description: 'Quantity collected' }
    ]
  },
  {
    tableName: 'blood_units',
    description: 'Serialized individual blood bags, component status, cold-chain storage and viral testing.',
    primaryKey: 'unit_id',
    foreignKeys: [
      { column: 'donation_id', references: 'donations(donation_id)' },
      { column: 'blood_group_id', references: 'blood_groups(blood_group_id)' },
      { column: 'component_id', references: 'blood_components(component_id)' },
      { column: 'storage_id', references: 'storage_locations(storage_id)' }
    ],
    columnsCount: 16,
    rowCount: 36,
    normalizationLevel: '3NF (Discrete storage location reference, full viral testing attributes)',
    columns: [
      { name: 'unit_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Bag identification primary key' },
      { name: 'unit_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'ISBT 128 barcode format' },
      { name: 'status', type: 'ENUM', constraints: "('Available','Reserved','Issued','Expired','Quarantined')", description: 'Lifecycle status' },
      { name: 'expiry_date', type: 'TIMESTAMP', constraints: 'NOT NULL', description: 'Shelf-life expiration timestamp' }
    ]
  },
  {
    tableName: 'hospitals',
    description: 'Registered hospital institutions with verified medical licenses and dispatch addresses.',
    primaryKey: 'hospital_id',
    foreignKeys: [{ column: 'user_id', references: 'users(user_id)' }],
    columnsCount: 12,
    rowCount: 10,
    normalizationLevel: '3NF (Separated institutional credentials from patient orders)',
    columns: [
      { name: 'hospital_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Hospital ID' },
      { name: 'name', type: 'VARCHAR(150)', constraints: 'NOT NULL', description: 'Hospital trade name' },
      { name: 'license_number', type: 'VARCHAR(50)', constraints: 'NOT NULL UNIQUE', description: 'State health council license' },
      { name: 'is_verified', type: 'BOOLEAN', constraints: 'DEFAULT TRUE', description: 'Verification check' }
    ]
  },
  {
    tableName: 'patients',
    description: 'Hospital inpatients requiring blood transfusion interventions.',
    primaryKey: 'patient_id',
    foreignKeys: [
      { column: 'hospital_id', references: 'hospitals(hospital_id)' },
      { column: 'blood_group_id', references: 'blood_groups(blood_group_id)' }
    ],
    columnsCount: 10,
    rowCount: 20,
    normalizationLevel: '3NF (Cleanly separated from hospital records and request records)',
    columns: [
      { name: 'patient_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Patient key' },
      { name: 'patient_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Hospital admission code' },
      { name: 'diagnosis', type: 'VARCHAR(255)', constraints: 'NOT NULL', description: 'Clinical indication for transfusion' },
      { name: 'is_emergency', type: 'BOOLEAN', constraints: 'DEFAULT FALSE', description: 'Priority triage marker' }
    ]
  },
  {
    tableName: 'blood_requests',
    description: 'Formal requisitions generated by hospitals for specific patients and urgency grades.',
    primaryKey: 'request_id',
    foreignKeys: [
      { column: 'hospital_id', references: 'hospitals(hospital_id)' },
      { column: 'patient_id', references: 'patients(patient_id)' },
      { column: 'blood_group_id', references: 'blood_groups(blood_group_id)' },
      { column: 'component_id', references: 'blood_components(component_id)' }
    ],
    columnsCount: 13,
    rowCount: 16,
    normalizationLevel: '3NF (Zero transitive dependencies, normalized urgency & status stages)',
    columns: [
      { name: 'request_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Requisition ID' },
      { name: 'request_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Trackable reference code' },
      { name: 'urgency', type: 'ENUM', constraints: "('Normal','Urgent','Emergency')", description: 'Triage prioritization' },
      { name: 'status', type: 'ENUM', constraints: "('Pending','Under Review','Approved','Partially Fulfilled','Fulfilled','Rejected')", description: 'Workflow stage' }
    ]
  },
  {
    tableName: 'blood_issues',
    description: 'Dispatched blood issuance transaction headers with cold-chain logs and cryptographic hash.',
    primaryKey: 'issue_id',
    foreignKeys: [
      { column: 'request_id', references: 'blood_requests(request_id)' },
      { column: 'issued_by_staff_id', references: 'users(user_id)' }
    ],
    columnsCount: 8,
    rowCount: 14,
    normalizationLevel: '3NF (Transaction records with full ACID audit integrity)',
    columns: [
      { name: 'issue_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Dispatch event ID' },
      { name: 'issue_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Official dispatch voucher' },
      { name: 'units_issued', type: 'INT', constraints: 'NOT NULL CHECK(>0)', description: 'Total units transferred' },
      { name: 'transaction_hash', type: 'VARCHAR(64)', constraints: 'NOT NULL', description: 'SHA-256 database transaction integrity hash' }
    ]
  },
  {
    tableName: 'donation_camps',
    description: 'Community and corporate voluntary donation camps with capacity management.',
    primaryKey: 'camp_id',
    foreignKeys: [],
    columnsCount: 14,
    rowCount: 10,
    normalizationLevel: '3NF (Independent outreach calendar entity)',
    columns: [
      { name: 'camp_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Camp ID' },
      { name: 'camp_code', type: 'VARCHAR(20)', constraints: 'NOT NULL UNIQUE', description: 'Event code' },
      { name: 'capacity', type: 'INT', constraints: 'NOT NULL CHECK(>0)', description: 'Maximum donor ceiling' },
      { name: 'registered_count', type: 'INT', constraints: 'DEFAULT 0', description: 'Current bookings' }
    ]
  },
  {
    tableName: 'audit_logs',
    description: 'System-wide immutable security audit trail logging every INSERT, UPDATE, and transaction.',
    primaryKey: 'log_id',
    foreignKeys: [{ column: 'user_id', references: 'users(user_id)' }],
    columnsCount: 9,
    rowCount: 45,
    normalizationLevel: '3NF (Immutable append-only compliance store)',
    columns: [
      { name: 'log_id', type: 'INT', constraints: 'PRIMARY KEY AUTO_INCREMENT', description: 'Audit record key' },
      { name: 'action', type: 'VARCHAR(80)', constraints: 'NOT NULL', description: 'DB operation name' },
      { name: 'status', type: 'ENUM', constraints: "('SUCCESS','ROLLBACK','WARNING')", description: 'ACID transaction result' }
    ]
  }
];

export const ER_ENTITIES: ErEntity[] = [
  {
    id: 'users',
    label: 'USERS',
    type: 'lookup',
    attributes: ['user_id (PK)', 'email', 'username', 'role', 'full_name', 'phone'],
    pk: 'user_id',
    fks: []
  },
  {
    id: 'blood_groups',
    label: 'BLOOD_GROUPS',
    type: 'lookup',
    attributes: ['blood_group_id (PK)', 'code', 'can_donate_to', 'can_receive_from'],
    pk: 'blood_group_id',
    fks: []
  },
  {
    id: 'donors',
    label: 'DONORS',
    type: 'core',
    attributes: ['donor_id (PK)', 'donor_code', 'user_id (FK)', 'blood_group_id (FK)', 'weight_kg', 'eligibility_status', 'next_eligible_date'],
    pk: 'donor_id',
    fks: ['user_id', 'blood_group_id']
  },
  {
    id: 'medical_screenings',
    label: 'MEDICAL_SCREENINGS',
    type: 'transaction',
    attributes: ['screening_id (PK)', 'donor_id (FK)', 'hemoglobin_gdl', 'blood_pressure', 'is_eligible', 'screened_by_staff_id (FK)'],
    pk: 'screening_id',
    fks: ['donor_id', 'screened_by_staff_id']
  },
  {
    id: 'donations',
    label: 'DONATIONS',
    type: 'transaction',
    attributes: ['donation_id (PK)', 'donation_code', 'donor_id (FK)', 'screening_id (FK)', 'camp_id (FK)', 'units_collected', 'staff_id (FK)'],
    pk: 'donation_id',
    fks: ['donor_id', 'screening_id', 'camp_id', 'staff_id']
  },
  {
    id: 'blood_units',
    label: 'BLOOD_UNITS',
    type: 'core',
    attributes: ['unit_id (PK)', 'unit_code', 'donation_id (FK)', 'blood_group_id (FK)', 'component_id (FK)', 'storage_id (FK)', 'expiry_date', 'status'],
    pk: 'unit_id',
    fks: ['donation_id', 'blood_group_id', 'component_id', 'storage_id']
  },
  {
    id: 'hospitals',
    label: 'HOSPITALS',
    type: 'core',
    attributes: ['hospital_id (PK)', 'hospital_code', 'user_id (FK)', 'name', 'license_number', 'city'],
    pk: 'hospital_id',
    fks: ['user_id']
  },
  {
    id: 'patients',
    label: 'PATIENTS',
    type: 'core',
    attributes: ['patient_id (PK)', 'patient_code', 'hospital_id (FK)', 'blood_group_id (FK)', 'diagnosis', 'is_emergency'],
    pk: 'patient_id',
    fks: ['hospital_id', 'blood_group_id']
  },
  {
    id: 'blood_requests',
    label: 'BLOOD_REQUESTS',
    type: 'transaction',
    attributes: ['request_id (PK)', 'request_code', 'hospital_id (FK)', 'patient_id (FK)', 'blood_group_id (FK)', 'urgency', 'status'],
    pk: 'request_id',
    fks: ['hospital_id', 'patient_id', 'blood_group_id']
  },
  {
    id: 'blood_issues',
    label: 'BLOOD_ISSUES',
    type: 'transaction',
    attributes: ['issue_id (PK)', 'issue_code', 'request_id (FK)', 'units_issued', 'issued_by_staff_id (FK)', 'transaction_hash'],
    pk: 'issue_id',
    fks: ['request_id', 'issued_by_staff_id']
  },
  {
    id: 'donation_camps',
    label: 'DONATION_CAMPS',
    type: 'lookup',
    attributes: ['camp_id (PK)', 'camp_code', 'name', 'camp_date', 'capacity', 'registered_count'],
    pk: 'camp_id',
    fks: []
  },
  {
    id: 'audit_logs',
    label: 'AUDIT_LOGS',
    type: 'log',
    attributes: ['log_id (PK)', 'user_id (FK)', 'action', 'table_name', 'status', 'timestamp'],
    pk: 'log_id',
    fks: ['user_id']
  }
];

export const ER_RELATIONS: ErRelation[] = [
  { from: 'users', to: 'donors', label: '1:1 Authentication', cardinality: '1:1' },
  { from: 'users', to: 'hospitals', label: '1:1 Hospital Portal', cardinality: '1:1' },
  { from: 'blood_groups', to: 'donors', label: '1:N Classifies', cardinality: '1:N' },
  { from: 'donors', to: 'medical_screenings', label: '1:N Evaluates', cardinality: '1:N' },
  { from: 'medical_screenings', to: 'donations', label: '1:1 Validates', cardinality: '1:1' },
  { from: 'donors', to: 'donations', label: '1:N Performs', cardinality: '1:N' },
  { from: 'donation_camps', to: 'donations', label: '1:N Hosts', cardinality: '1:N' },
  { from: 'donations', to: 'blood_units', label: '1:N Produces Bags', cardinality: '1:N' },
  { from: 'blood_groups', to: 'blood_units', label: '1:N Categorizes', cardinality: '1:N' },
  { from: 'hospitals', to: 'patients', label: '1:N Admits', cardinality: '1:N' },
  { from: 'hospitals', to: 'blood_requests', label: '1:N Submits', cardinality: '1:N' },
  { from: 'patients', to: 'blood_requests', label: '1:N Requests for', cardinality: '1:N' },
  { from: 'blood_requests', to: 'blood_issues', label: '1:N Fulfills', cardinality: '1:N' },
  { from: 'users', to: 'audit_logs', label: '1:N Tracks Ops', cardinality: '1:N' }
];

export interface VivaSqlQuery {
  id: string;
  title: string;
  category: 'JOIN' | 'AGGREGATE' | 'SUBQUERY' | 'TRANSACTION' | 'VIEW';
  description: string;
  sql: string;
}

export const VIVA_SQL_QUERIES: VivaSqlQuery[] = [
  {
    id: 'q1',
    title: 'Available O-Negative Units (Universal Donor Emergency Search)',
    category: 'JOIN',
    description: 'Find all currently available, safe, and unexpired O-negative blood units with precise storage refrigerator location for immediate trauma response.',
    sql: `SELECT 
    bu.unit_code,
    bg.code AS blood_group,
    bc.name AS component,
    bu.volume_ml,
    bu.storage_location,
    bu.refrigerator_code,
    bu.expiry_date,
    DATEDIFF(bu.expiry_date, NOW()) AS days_to_expire
FROM blood_units bu
INNER JOIN blood_groups bg ON bu.blood_group_id = bg.blood_group_id
INNER JOIN blood_components bc ON bu.component_id = bc.component_id
WHERE bg.code = 'O-'
  AND bu.status = 'Available'
  AND bu.testing_status = 'Tested - Safe'
  AND bu.expiry_date > NOW()
ORDER BY bu.expiry_date ASC;`
  },
  {
    id: 'q2',
    title: 'Inventory Breakdown by Blood Group & Status (GROUP BY & Aggregate)',
    category: 'AGGREGATE',
    description: 'Comprehensive inventory distribution across all 8 blood groups counting available, reserved, and expired bags.',
    sql: `SELECT 
    bg.code AS blood_group,
    COUNT(CASE WHEN bu.status = 'Available' THEN 1 END) AS available_units,
    COUNT(CASE WHEN bu.status = 'Reserved' THEN 1 END) AS reserved_units,
    COUNT(CASE WHEN bu.status = 'Issued' THEN 1 END) AS issued_units,
    COUNT(CASE WHEN bu.status = 'Expired' THEN 1 END) AS expired_units,
    COUNT(bu.unit_id) AS total_units_in_system
FROM blood_groups bg
LEFT JOIN blood_units bu ON bg.blood_group_id = bu.blood_group_id
GROUP BY bg.code
ORDER BY available_units ASC;`
  },
  {
    id: 'q3',
    title: 'Top Requesting Hospitals Exceeding Average (HAVING & Subquery)',
    category: 'SUBQUERY',
    description: 'Identifies high-consumption healthcare centers whose total blood requests exceed the overall network hospital average.',
    sql: `SELECT 
    h.hospital_code,
    h.name AS hospital_name,
    h.city,
    COUNT(br.request_id) AS total_requests_lodged,
    SUM(br.units_required) AS total_units_demanded
FROM hospitals h
INNER JOIN blood_requests br ON h.hospital_id = br.hospital_id
GROUP BY h.hospital_id, h.name, h.city
HAVING COUNT(br.request_id) > (
    SELECT AVG(request_count) 
    FROM (
        SELECT COUNT(request_id) AS request_count 
        FROM blood_requests 
        GROUP BY hospital_id
    ) AS hospital_averages
)
ORDER BY total_units_demanded DESC;`
  },
  {
    id: 'q4',
    title: 'Eligible Donors Ready for Transfusion Recall (Date Arithmetic & Cooldown)',
    category: 'JOIN',
    description: 'Locates registered voluntary donors whose 90-day biological cooldown period has concluded, sorted by total historic contribution.',
    sql: `SELECT 
    d.donor_code,
    u.full_name,
    bg.code AS blood_group,
    d.city,
    u.phone,
    d.total_donations,
    d.last_donation_date,
    d.next_eligible_date
FROM donors d
JOIN users u ON d.user_id = u.user_id
JOIN blood_groups bg ON d.blood_group_id = bg.blood_group_id
WHERE d.eligibility_status = 'Eligible'
  AND d.next_eligible_date <= CURRENT_DATE()
ORDER BY d.total_donations DESC, d.last_donation_date ASC;`
  },
  {
    id: 'q5',
    title: 'Active Emergency Requests Requiring Immediate Matching (Multi-Table JOIN)',
    category: 'JOIN',
    description: 'Retrieves all unfulfilled Emergency priority requisitions with patient clinical diagnosis and hospital contact numbers.',
    sql: `SELECT 
    br.request_code,
    br.urgency,
    h.name AS hospital_name,
    h.phone AS hospital_contact,
    p.full_name AS patient_name,
    p.diagnosis,
    bg.code AS blood_group_needed,
    bc.name AS component_needed,
    (br.units_required - br.units_fulfilled) AS pending_units,
    br.required_date
FROM blood_requests br
JOIN hospitals h ON br.hospital_id = h.hospital_id
JOIN patients p ON br.patient_id = p.patient_id
JOIN blood_groups bg ON br.blood_group_id = bg.blood_group_id
JOIN blood_components bc ON br.component_id = bc.component_id
WHERE br.urgency IN ('Emergency', 'Urgent')
  AND br.status IN ('Pending', 'Under Review', 'Partially Fulfilled')
ORDER BY CASE br.urgency 
    WHEN 'Emergency' THEN 1 
    WHEN 'Urgent' THEN 2 
    ELSE 3 
END, br.created_at ASC;`
  },
  {
    id: 'q6',
    title: 'Expiring Units in Next 7 Days (Cold-Chain Alerting Query)',
    category: 'VIEW',
    description: 'Queries units nearing their expiry deadline to trigger priority allocation to elective surgeries before loss.',
    sql: `SELECT 
    bu.unit_code,
    bg.code AS blood_group,
    bc.name AS component,
    bu.storage_location,
    bu.expiry_date,
    TIMESTAMPDIFF(HOUR, NOW(), bu.expiry_date) AS hours_remaining
FROM blood_units bu
JOIN blood_groups bg ON bu.blood_group_id = bg.blood_group_id
JOIN blood_components bc ON bu.component_id = bc.component_id
WHERE bu.status = 'Available'
  AND bu.expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
ORDER BY bu.expiry_date ASC;`
  },
  {
    id: 'q7',
    title: 'ACID Transaction Simulation: Blood Issuance with Strict Rollback Guard',
    category: 'TRANSACTION',
    description: 'Demonstrates START TRANSACTION, row-level locking (FOR UPDATE), inventory state transition, and audit log generation.',
    sql: `START TRANSACTION;

-- Step 1: Lock and verify specific unit
SELECT unit_id, status, expiry_date 
FROM blood_units 
WHERE unit_code = 'BLD-2026-9041' 
FOR UPDATE;

-- Step 2: Transition unit status to Issued
UPDATE blood_units 
SET status = 'Issued' 
WHERE unit_code = 'BLD-2026-9041';

-- Step 3: Insert Issue transaction header
INSERT INTO blood_issues (issue_code, request_id, issued_by_staff_id, units_issued, transport_temp_c, transaction_hash)
VALUES ('ISS-2026-0399', 1, 3, 1, 3.8, SHA2(UUID(), 256));

-- Step 4: Record issue-unit mapping
INSERT INTO blood_issue_units (issue_id, unit_id, compatibility_crossmatch_ok)
VALUES (LAST_INSERT_ID(), 1, TRUE);

-- Step 5: Update Blood Request fulfillment
UPDATE blood_requests
SET units_fulfilled = units_fulfilled + 1,
    status = 'Fulfilled'
WHERE request_id = 1;

-- Step 6: Commit state changes permanently
COMMIT;`
  }
];

export const NORMALIZATION_EXPLANATION = {
  unf: {
    title: 'Unnormalized Form (UNF)',
    summary: 'A flat log book entry where a single spreadsheet row contains repeated donor details, multiple blood units in a comma-separated string, hospital address embedded inside request columns, and screening vitals all in one row.',
    flaws: [
      'Insertion Anomaly: Cannot register a new donor without immediately recording a donation event.',
      'Deletion Anomaly: Deleting a patient request record deletes the hospital address and medical license record.',
      'Update Anomaly: If a hospital changes its phone number, every past blood request row must be updated independently.'
    ]
  },
  nf1: {
    title: 'First Normal Form (1NF)',
    summary: 'Achieved by eliminating multi-valued attributes and ensuring atomic values across all columns. Every table has an identified Primary Key.',
    actions: [
      'Split comma-separated blood unit IDs into individual discrete unit tuples.',
      'Split compound full-name and multi-line addresses into discrete atomic attributes (first_name, last_name, street, city, state, pincode).',
      'Created unique primary keys for donors, donations, and blood units.'
    ]
  },
  nf2: {
    title: 'Second Normal Form (2NF)',
    summary: 'Must be in 1NF and ensure that all non-key attributes are fully functionally dependent on the entire Primary Key, eliminating partial dependencies on composite keys.',
    actions: [
      'In the composite donation table (donor_id, donation_date), donor weight, address, and blood group depended only on donor_id (partial dependency).',
      'Extracted donor demographic and medical attributes into a separate DONORS relation.',
      'Extracted blood unit storage and expiry data into a dedicated BLOOD_UNITS relation.'
    ]
  },
  nf3: {
    title: 'Third Normal Form (3NF)',
    summary: 'Must be in 2NF and ensure that no non-key attribute is transitively dependent on the Primary Key (no X -> Y -> Z where X is PK).',
    actions: [
      'In BLOOD_REQUESTS, hospital name, license, and city were transitively dependent on request_id via hospital_id. Extracted into HOSPITALS relation.',
      'In BLOOD_UNITS, component shelf life and storage temperatures were dependent on component name. Extracted into BLOOD_COMPONENTS lookup relation.',
      'In PATIENTS, hospital details were dependent on patient_id via hospital_id. Extracted to maintain strict 3NF referential integrity.'
    ]
  }
};
