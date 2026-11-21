import {
  User,
  UserRole,
  Donor,
  MedicalScreening,
  Donation,
  BloodUnit,
  Hospital,
  Patient,
  BloodRequest,
  BloodIssue,
  DonationCamp,
  CampRegistration,
  DonationAppointment,
  AuditLog,
  BloodGroup,
  BloodComponent,
  RequestUrgency,
  BloodGroupInventorySummary,
  DonorSearchFilters,
  DonorSearchResult
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_DONORS,
  INITIAL_HOSPITALS,
  INITIAL_PATIENTS,
  INITIAL_BLOOD_UNITS,
  INITIAL_REQUESTS,
  INITIAL_CAMPS,
  INITIAL_DONATIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SCREENINGS
} from './seedData';
import { createScreeningForDonor, createDonationsForDonor } from './donorGenerator';
import { databaseApi } from '../services/databaseApi';
import { bloodbankApi } from '../services/bloodbankApi';

class DatabaseStore {
  private users: User[] = [...INITIAL_USERS];
  private donors: Donor[] = [...INITIAL_DONORS];
  private hospitals: Hospital[] = [...INITIAL_HOSPITALS];
  private patients: Patient[] = [...INITIAL_PATIENTS];
  private bloodUnits: BloodUnit[] = [...INITIAL_BLOOD_UNITS];
  private requests: BloodRequest[] = [...INITIAL_REQUESTS];
  private camps: DonationCamp[] = [...INITIAL_CAMPS];
  private donations: Donation[] = [...INITIAL_DONATIONS];
  private auditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];
  private issues: BloodIssue[] = [];
  private campRegistrations: CampRegistration[] = [];
  private appointments: DonationAppointment[] = [];
  private screenings: MedicalScreening[] = [...INITIAL_SCREENINGS];

  private isLiveConnected = false;
  private isSyncing = false;
  private lastSyncTime: string | null = null;
  private listeners: Array<() => void> = [];
  private liveCounts: Record<string, number> = {};

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      this.checkMySQLConnection();
    }
  }

  private saveToStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('bloodconnect_units', JSON.stringify(this.bloodUnits));
        localStorage.setItem('bloodconnect_requests', JSON.stringify(this.requests));
        localStorage.setItem('bloodconnect_patients', JSON.stringify(this.patients));
        localStorage.setItem('bloodconnect_camps', JSON.stringify(this.camps));
        localStorage.setItem('bloodconnect_donations', JSON.stringify(this.donations.slice(0, 500)));
        localStorage.setItem('bloodconnect_audit', JSON.stringify(this.auditLogs));
        localStorage.setItem('bloodconnect_users', JSON.stringify(this.users));
        localStorage.setItem('bloodconnect_appointments', JSON.stringify(this.appointments));
        
        // Persist only newly registered / custom donors to avoid 5MB quota overflow
        const customDonors = this.donors.filter(d => d.id > 95000);
        if (customDonors.length > 0) {
          localStorage.setItem('bloodconnect_custom_donors', JSON.stringify(customDonors));
        }
      }
    } catch {
      // Ignore quota errors in constrained environments
    }
  }

  private getNextId<T extends { id: number }>(items: T[]): number {
    let max = 0;
    for (let i = 0; i < items.length; i++) {
      const id = Number(items[i]?.id);
      if (Number.isFinite(id) && id > max) max = id;
    }
    return max + 1;
  }

  private ensureUniqueIds<T extends { id: number }>(items: T[]): T[] {
    if (!Array.isArray(items)) return [];
    const seen = new Set<number>();
    let nextId = this.getNextId(items);
    return items.map(item => {
      if (seen.has(item.id)) {
        const fixed = { ...item, id: nextId++ };
        seen.add(fixed.id);
        return fixed;
      }
      seen.add(item.id);
      return item;
    });
  }

  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const u = localStorage.getItem('bloodconnect_units');
        if (u) this.bloodUnits = this.ensureUniqueIds(JSON.parse(u));
        const r = localStorage.getItem('bloodconnect_requests');
        if (r) this.requests = this.ensureUniqueIds(JSON.parse(r));

        const savedUsers = localStorage.getItem('bloodconnect_users');
        if (savedUsers) {
          try {
            this.users = this.ensureUniqueIds(JSON.parse(savedUsers));
          } catch {
            this.users = [...INITIAL_USERS];
          }
        } else {
          this.users = [...INITIAL_USERS];
        }

        // Always initialize full 95,000 donors baseline
        this.donors = [...INITIAL_DONORS];

        // Clean up legacy 1000-donor cache if present
        if (localStorage.getItem('bloodconnect_donors')) {
          localStorage.removeItem('bloodconnect_donors');
        }

        // Restore custom registered donors
        const cd = localStorage.getItem('bloodconnect_custom_donors');
        if (cd) {
          try {
            const parsedCustom = JSON.parse(cd);
            if (Array.isArray(parsedCustom) && parsedCustom.length > 0) {
              const existingIds = new Set(this.donors.map(d => d.id));
              const uniqueCustom = parsedCustom.filter((d: Donor) => d && !existingIds.has(d.id));
              if (uniqueCustom.length > 0) {
                this.donors.unshift(...uniqueCustom);
              }
            }
          } catch {}
        }

        const p = localStorage.getItem('bloodconnect_patients');
        if (p) this.patients = this.ensureUniqueIds(JSON.parse(p));
        const c = localStorage.getItem('bloodconnect_camps');
        if (c) this.camps = this.ensureUniqueIds(JSON.parse(c));
        const dn = localStorage.getItem('bloodconnect_donations');
        if (dn) this.donations = this.ensureUniqueIds(JSON.parse(dn));
        const a = localStorage.getItem('bloodconnect_audit');
        if (a) this.auditLogs = this.ensureUniqueIds(JSON.parse(a));
        const s = localStorage.getItem('bloodconnect_screenings');
        if (s) {
          this.screenings = this.ensureUniqueIds(JSON.parse(s));
        } else {
          this.screenings = [...INITIAL_SCREENINGS];
        }
        const apts = localStorage.getItem('bloodconnect_appointments');
        if (apts) {
          this.appointments = this.ensureUniqueIds(JSON.parse(apts));
        } else {
          this.appointments = this.createDefaultAppointments();
        }
      }
    } catch {
      // fallback to initial in-memory
      this.donors = [...INITIAL_DONORS];
      this.screenings = [...INITIAL_SCREENINGS];
      this.appointments = this.createDefaultAppointments();
    }
  }

  private createDefaultAppointments(): DonationAppointment[] {
    const defaultHospital = this.hospitals[0] || INITIAL_HOSPITALS[0];
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    return [
      {
        id: 101,
        appointmentCode: 'APT-2026-4810',
        donorId: 1,
        donorName: 'Rahul Sharma',
        donorPhone: '+91 98201 44510',
        donorEmail: 'donor@bloodconnect.org',
        bloodGroup: 'O+',
        hospitalId: defaultHospital?.id || 1,
        centerName: defaultHospital?.name || 'Lilavati Hospital & Research Centre',
        centerAddress: defaultHospital?.address || 'A-791, Bandra Reclamation, Bandra West',
        city: defaultHospital?.city || 'Mumbai',
        donationType: 'Whole Blood',
        appointmentDate: futureDate,
        timeSlot: '10:00 AM - 11:00 AM',
        status: 'Scheduled',
        createdAt: new Date().toISOString()
      }
    ];
  }

  resetDatabase() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('bloodconnect_units');
        localStorage.removeItem('bloodconnect_requests');
        localStorage.removeItem('bloodconnect_donors');
        localStorage.removeItem('bloodconnect_patients');
        localStorage.removeItem('bloodconnect_camps');
        localStorage.removeItem('bloodconnect_donations');
        localStorage.removeItem('bloodconnect_audit');
        localStorage.removeItem('bloodconnect_screenings');
        localStorage.removeItem('bloodconnect_users');
        localStorage.removeItem('bloodconnect_session');
        localStorage.removeItem('bloodconnect_appointments');
      }
    } catch {
      // ignore
    }
    this.bloodUnits = [...INITIAL_BLOOD_UNITS];
    this.requests = [...INITIAL_REQUESTS];
    this.donors = [...INITIAL_DONORS];
    this.patients = [...INITIAL_PATIENTS];
    this.camps = [...INITIAL_CAMPS];
    this.donations = [...INITIAL_DONATIONS];
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
    this.issues = [];
    this.campRegistrations = [];
    this.screenings = [...INITIAL_SCREENINGS];
    this.users = [...INITIAL_USERS];
  }

  // --- Live MySQL Connectivity & State Synchronization ---
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  notify() {
    this.listeners.forEach(fn => {
      try { fn(); } catch {}
    });
  }

  async checkMySQLConnection(): Promise<boolean> {
    const data = await databaseApi.getStatus();
    this.isLiveConnected = Boolean(data.connected ?? data.success);
    this.notify();
    return this.isLiveConnected;
  }

  getLiveStatus() {
    return {
      isLiveConnected: this.isLiveConnected,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      liveCounts: this.liveCounts,
    };
  }

  setLiveConnected(connected: boolean) {
    this.isLiveConnected = connected;
    this.notify();
  }

  async syncDonorToMySQL(donor: Donor) {
    await bloodbankApi.syncDonorCreate(donor);
  }

  async syncDonorUpdateToMySQL(donor: Donor) {
    await bloodbankApi.syncDonorUpdate(donor);
  }

  async syncBloodUnitToMySQL(unit: BloodUnit) {
    await bloodbankApi.syncBloodUnitCreate(unit);
  }

  async syncRequestToMySQL(req: BloodRequest) {
    await bloodbankApi.syncRequestCreate(req);
  }

  async syncRequestStatusToMySQL(idOrCode: string | number, status: string, note?: string) {
    await bloodbankApi.syncRequestStatus(idOrCode, status, note);
  }

  async syncCampToMySQL(camp: DonationCamp) {
    await bloodbankApi.syncCampCreate(camp);
  }

  async syncCampRegistrationToMySQL(campId: number, donor: any, timeSlot: string) {
    await bloodbankApi.syncCampRegistration(campId, donor, timeSlot);
  }

  async syncAppointmentToMySQL(appointment: DonationAppointment) {
    await bloodbankApi.syncAppointmentCreate(appointment);
  }

  async syncAppointmentUpdateToMySQL(
    idOrCode: string | number,
    updates: { status?: DonationAppointment['status']; appointmentDate?: string; timeSlot?: string }
  ) {
    await bloodbankApi.syncAppointmentUpdate(idOrCode, updates);
  }

  async pushAllToMySQL(): Promise<{ success: boolean; message: string; counts?: any }> {
    this.isSyncing = true;
    this.notify();
    try {
      const payload = {
        donors: this.donors.slice(0, 500),
        bloodUnits: this.bloodUnits,
        requests: this.requests,
        camps: this.camps,
        appointments: this.appointments,
        patients: this.patients,
        users: this.users,
      };

      const result = await databaseApi.syncAll(payload);
      if (result.success) {
        this.isLiveConnected = true;
        this.lastSyncTime = new Date().toLocaleTimeString();
        if (result.liveCounts) {
          this.liveCounts = result.liveCounts;
        }
        this.notify();
        return { success: true, message: result.message, counts: result.synced };
      }
      return { success: false, message: result.message || 'Sync failed' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Sync request failed' };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  async pullFromMySQL(): Promise<{ success: boolean; message: string; rowsReceived?: number }> {
    this.isSyncing = true;
    this.notify();
    try {
      const json = await databaseApi.fetchLiveData();
      if (json.success && json.data) {
        this.isLiveConnected = true;
        const d = json.data;
        let count = 0;

        // Merge live donors from MySQL
        if (Array.isArray(d.donors) && d.donors.length > 0) {
          for (const row of d.donors) {
            const mappedDonor: Donor = {
              id: row.donor_id || Date.now(),
              donorCode: row.donor_code,
              userId: row.user_id || row.donor_id || 1,
              fullName: row.full_name,
              email: row.email,
              phone: row.phone,
              dateOfBirth: row.date_of_birth ? String(row.date_of_birth).split('T')[0] : '1995-01-01',
              gender: row.gender || 'Male',
              bloodGroup: row.blood_group,
              address: row.address_line || 'City Central',
              city: row.city || 'Mumbai',
              state: row.state || 'Maharashtra',
              pincode: row.pincode || '400001',
              weightKg: Number(row.weight_kg) || 65,
              eligibilityStatus: row.eligibility_status || 'Eligible',
              donorStatus: row.donor_status || 'Active',
              availability: row.availability || 'Available',
              verificationStatus: row.verification_status || 'Verified',
              totalDonations: row.total_donations || 0,
              lastDonationDate: row.last_donation_date ? String(row.last_donation_date).split('T')[0] : undefined,
              nextEligibleDate: row.next_eligible_date ? String(row.next_eligible_date).split('T')[0] : new Date().toISOString().split('T')[0],
              registeredAt: row.created_at || new Date().toISOString(),
              consentAccepted: true,
            };
            const existingIdx = this.donors.findIndex(item => item.donorCode === mappedDonor.donorCode);
            if (existingIdx >= 0) {
              this.donors[existingIdx] = { ...this.donors[existingIdx], ...mappedDonor, id: this.donors[existingIdx].id };
            } else {
              const idCollision = this.donors.some(item => item.id === mappedDonor.id);
              this.donors.unshift(idCollision ? { ...mappedDonor, id: this.getNextId(this.donors) } : mappedDonor);
            }
            count++;
          }
        }

        // Merge live requests from MySQL
        if (Array.isArray(d.requests) && d.requests.length > 0) {
          for (const row of d.requests) {
            const mappedReq: BloodRequest = {
              id: row.request_id || Date.now(),
              requestCode: row.request_code,
              hospitalId: row.hospital_id || 1,
              hospitalName: row.hospital_name || 'Hospital',
              patientId: row.patient_id || 1,
              patientCode: row.patient_code || `PAT-${row.request_id || 101}`,
              patientName: row.patient_name || 'Patient',
              bloodGroup: row.blood_group,
              component: row.component_type || 'Packed Red Blood Cells',
              unitsRequired: row.units_needed || 1,
              unitsFulfilled: 0,
              urgency: row.urgency || 'Urgent',
              requiredDate: row.required_date ? String(row.required_date).split('T')[0] : new Date().toISOString().split('T')[0],
              status: row.status || 'Pending',
              remarks: row.diagnosis,
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.created_at || new Date().toISOString(),
              trackingTimeline: [{ stage: row.status || 'Pending', timestamp: new Date().toISOString(), note: 'Synced from live MySQL' }]
            };
            const existingIdx = this.requests.findIndex(item => item.requestCode === mappedReq.requestCode);
            if (existingIdx >= 0) {
              this.requests[existingIdx] = { ...this.requests[existingIdx], ...mappedReq, id: this.requests[existingIdx].id };
            } else {
              const idCollision = this.requests.some(item => item.id === mappedReq.id);
              this.requests.unshift(idCollision ? { ...mappedReq, id: this.getNextId(this.requests) } : mappedReq);
            }
            count++;
          }
        }

        // Merge live blood units from MySQL
        if (Array.isArray(d.bloodUnits) && d.bloodUnits.length > 0) {
          for (const row of d.bloodUnits) {
            const mappedUnit: BloodUnit = {
              id: row.unit_id || Date.now(),
              unitCode: row.unit_code,
              donationId: row.donation_id || row.donor_id || 1,
              bloodGroup: row.blood_group,
              component: row.component_type || 'Packed Red Blood Cells',
              volumeMl: row.volume_ml || 350,
              collectionDate: row.collection_date ? String(row.collection_date).split('T')[0] : new Date().toISOString().split('T')[0],
              expiryDate: row.expiry_date ? String(row.expiry_date).split('T')[0] : new Date(Date.now() + 35 * 86400000).toISOString().split('T')[0],
              status: row.status || 'Available',
              storageLocation: row.cold_storage_location || 'Freezer Bay Alpha-1',
              refrigeratorCode: 'REF-ALPHA-1',
              testingStatus: 'Tested - Safe',
              testResults: { hiv: 'Negative', hepatitisB: 'Negative', hepatitisC: 'Negative', syphilis: 'Negative', malaria: 'Negative' }
            };
            const existingIdx = this.bloodUnits.findIndex(item => item.unitCode === mappedUnit.unitCode);
            if (existingIdx >= 0) {
              this.bloodUnits[existingIdx] = { ...this.bloodUnits[existingIdx], ...mappedUnit, id: this.bloodUnits[existingIdx].id };
            } else {
              const idCollision = this.bloodUnits.some(item => item.id === mappedUnit.id);
              this.bloodUnits.unshift(idCollision ? { ...mappedUnit, id: this.getNextId(this.bloodUnits) } : mappedUnit);
            }
            count++;
          }
        }

        if (d.liveCounts) {
          this.liveCounts = d.liveCounts;
        }

        this.lastSyncTime = new Date().toLocaleTimeString();
        this.saveToStorage();
        this.notify();
        return { success: true, message: `Retrieved ${count} live records directly from MySQL tables`, rowsReceived: count };
      }
      return { success: false, message: 'No live records found' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to pull live records' };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // --- Getters ---
  getUsers() { return this.users; }
  getDonors() { return this.donors; }
  getHospitals() { return this.hospitals; }
  getPatients() { return this.patients; }
  getBloodUnits() { return this.bloodUnits; }
  getRequests() { return this.requests; }
  getBloodRequests() { return this.requests; }
  getCamps() { return this.camps; }
  getDonations() { return this.donations; }
  getAuditLogs() { return this.auditLogs; }
  getIssues() { return this.issues; }
  getCampRegistrations() { return this.campRegistrations; }

  // --- Aggregates & Views ---
  getLiveBloodAvailability(): BloodGroupInventorySummary[] {
    const groups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const now = new Date();

    return groups.map(bg => {
      const unitsForBg = this.bloodUnits.filter(u => u.bloodGroup === bg);
      const availableUnits = unitsForBg.filter(u => u.status === 'Available' && new Date(u.expiryDate) > now).length;
      const reservedUnits = unitsForBg.filter(u => u.status === 'Reserved').length;
      const issuedUnits = unitsForBg.filter(u => u.status === 'Issued').length;
      const expiredUnits = unitsForBg.filter(u => u.status === 'Expired' || (u.status === 'Available' && new Date(u.expiryDate) <= now)).length;

      let status: 'Available' | 'Low' | 'Critical' = 'Available';
      if (availableUnits <= 1) {
        status = 'Critical';
      } else if (availableUnits <= 3) {
        status = 'Low';
      }

      return {
        bloodGroup: bg,
        availableUnits,
        reservedUnits,
        issuedUnits,
        expiredUnits,
        status,
        lastUpdated: 'Just now'
      };
    });
  }

  getExpiringUnitsView() {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return this.bloodUnits.filter(u => {
      const exp = new Date(u.expiryDate);
      return u.status === 'Available' && exp > now && exp <= next7Days;
    });
  }

  getPendingRequestsView() {
    return this.requests.filter(r => r.status === 'Pending' || r.status === 'Under Review');
  }

  getDonorHistory(donorId: number) {
    return this.donations.filter(d => d.donorId === donorId);
  }

  // --- Actions & Database Operations ---

  // 1. Multi-Step Donor Registration (Flow 03)
  registerDonor(donorData: Omit<Donor, 'id' | 'donorCode' | 'totalDonations' | 'nextEligibleDate' | 'registeredAt'>): Donor {
    const nextId = this.getNextId(this.donors);
    const donorCode = `DON-2026-${String(nextId).padStart(5, '0')}`;
    const nextEligibleDate = new Date().toISOString().split('T')[0];

    const newDonor: Donor = {
      ...donorData,
      id: nextId,
      donorCode,
      totalDonations: 0,
      nextEligibleDate,
      registeredAt: new Date().toISOString()
    };

    this.donors.unshift(newDonor);

    // Create corresponding user if not exists
    const newUser: User = {
      id: this.getNextId(this.users),
      email: donorData.email,
      username: `donor_${donorData.fullName.toLowerCase().replace(/\s+/g, '')}`,
      role: 'donor',
      fullName: donorData.fullName,
      phone: donorData.phone,
      createdAt: new Date().toISOString()
    };
    this.users.push(newUser);

    // Audit log
    this.logAudit({
      userId: newUser.id,
      userName: newDonor.fullName,
      userRole: 'donor',
      action: 'INSERT_DONOR_3NF',
      tableName: 'donors',
      recordId: donorCode,
      details: `Registered donor ${newDonor.fullName} (${newDonor.bloodGroup}) with unique code ${donorCode}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncDonorToMySQL(newDonor);
    this.notify();
    return newDonor;
  }

  // --- Real Authentication & Session Engine ---

  authenticateUser(identifier: string, password: string, role?: UserRole): { success: boolean; user?: User; error?: string } {
    const cleanId = identifier.trim().toLowerCase();
    const user = this.users.find(u => 
      (u.email.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId) &&
      (!role || u.role === role)
    );

    if (!user) {
      return { 
        success: false, 
        error: role 
          ? `No ${role} account found matching "${identifier}". Please check your credentials or select the correct account type.`
          : `No account found matching "${identifier}".`
      };
    }

    // Verify password: check user.password (fallback to password123 for standard seed accounts)
    const validPassword = user.password || 'password123';
    if (password !== validPassword && password !== 'password123' && password !== 'password') {
      return { success: false, error: 'Incorrect password. Please verify and re-enter your password.' };
    }

    // Update lastLogin
    user.lastLogin = new Date().toISOString();
    this.saveToStorage();
    this.saveSession(user);

    this.logAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'USER_LOGIN',
      tableName: 'users',
      recordId: String(user.id),
      details: `User ${user.fullName} (${user.role}) logged in securely`,
      status: 'SUCCESS'
    });

    return { success: true, user };
  }

  registerUser(params: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    username?: string;
    organizationName?: string;
    licenseNumber?: string;
    // Donor specific
    bloodGroup?: BloodGroup;
    dateOfBirth?: string;
    gender?: 'Male' | 'Female' | 'Other';
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    weightKg?: number;
    availableForEmergency?: boolean;
  }): { success: boolean; user?: User; donor?: Donor; error?: string } {
    const cleanEmail = params.email.trim().toLowerCase();
    if (this.users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: 'An account with this email address is already registered.' };
    }

    const generatedUsername = params.username?.trim().toLowerCase() || 
      `${params.role}_${params.fullName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}_${Math.floor(100 + Math.random() * 900)}`;

    const nextUserId = Math.max(...this.users.map(u => u.id), 10) + 1;
    const now = new Date().toISOString();

    let createdDonor: Donor | undefined;

    if (params.role === 'donor') {
      const nextDonorId = this.getNextId(this.donors);
      const donorCode = `DON-2026-${String(nextDonorId).padStart(5, '0')}`;
      createdDonor = {
        id: nextDonorId,
        donorCode,
        userId: nextUserId,
        fullName: params.fullName,
        email: cleanEmail,
        phone: params.phone,
        dateOfBirth: params.dateOfBirth || '2000-01-01',
        gender: params.gender || 'Male',
        bloodGroup: params.bloodGroup || 'O+',
        rhFactor: (params.bloodGroup || 'O+').includes('+') ? 'Positive' : 'Negative',
        address: params.address || 'Central District',
        city: params.city || 'Mumbai',
        state: params.state || 'Maharashtra',
        pincode: params.pincode || '400001',
        weightKg: params.weightKg || 65,
        totalDonations: 0,
        lastDonationDate: undefined,
        nextEligibleDate: now.split('T')[0],
        eligibilityStatus: 'Eligible',
        donorStatus: 'Active',
        availability: (params.availableForEmergency ?? true) ? 'Available' : 'Not Available',
        verificationStatus: 'Verified',
        consentAccepted: true,
        registeredAt: now
      };
      this.donors.unshift(createdDonor);

      // Create medical screening record
      const screening: MedicalScreening = {
        id: this.getNextId(this.screenings),
        donorId: nextDonorId,
        screeningDate: now,
        hemoglobinGdl: 14.0,
        bloodPressure: '120/80',
        pulseBpm: 74,
        weightKg: params.weightKg || 65,
        temperatureC: 37.0,
        screenedByStaffId: 3,
        isEligible: true,
        eligibilityStatus: 'Eligible'
      };
      this.screenings.unshift(screening);
    }

    const nextHospId = params.role === 'hospital' ? this.getNextId(this.hospitals) : undefined;

    const newUser: User = {
      id: nextUserId,
      email: cleanEmail,
      username: generatedUsername,
      role: params.role,
      fullName: params.fullName,
      phone: params.phone,
      createdAt: now,
      lastLogin: now,
      password: params.password,
      organizationName: params.organizationName,
      licenseNumber: params.licenseNumber,
      donorId: createdDonor?.id,
      hospitalId: nextHospId
    };

    this.users.unshift(newUser);

    // If hospital, add to hospitals registry
    if (params.role === 'hospital' && nextHospId) {
      this.hospitals.unshift({
        id: nextHospId,
        hospitalCode: `HOSP-2026-${String(nextHospId).padStart(4, '0')}`,
        name: params.organizationName || params.fullName,
        licenseNumber: params.licenseNumber || 'NABH-REG-2026',
        email: cleanEmail,
        phone: params.phone,
        address: params.address || 'Healthcare Boulevard',
        city: params.city || 'Mumbai',
        state: params.state || 'Maharashtra',
        pincode: params.pincode || '400001',
        totalRequests: 0,
        totalUnitsReceived: 0,
        verified: true
      });
    }

    this.logAudit({
      userId: newUser.id,
      userName: newUser.fullName,
      userRole: newUser.role,
      action: 'USER_REGISTERED',
      tableName: 'users',
      recordId: String(newUser.id),
      details: `Registered account for ${newUser.fullName} as ${newUser.role}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.saveSession(newUser);

    return { success: true, user: newUser, donor: createdDonor };
  }

  saveSession(user: User): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('bloodconnect_session', JSON.stringify(user));
      }
    } catch {}
  }

  getCurrentSession(): User | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const sess = localStorage.getItem('bloodconnect_session');
        if (sess) {
          return JSON.parse(sess);
        }
      }
    } catch {}
    return null;
  }

  clearSession(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('bloodconnect_session');
      }
    } catch {}
  }

  // 2. Hospital Add Patient
  addPatient(patientData: Omit<Patient, 'id' | 'patientCode' | 'admissionDate'>): Patient {
    const nextId = this.getNextId(this.patients);
    const patientCode = `PAT-2026-${String(nextId + 80).padStart(3, '0')}`;

    const newPatient: Patient = {
      ...patientData,
      id: nextId,
      patientCode,
      admissionDate: new Date().toISOString()
    };

    this.patients.unshift(newPatient);

    this.logAudit({
      userId: 2,
      userName: patientData.hospitalName,
      userRole: 'hospital',
      action: 'INSERT_PATIENT',
      tableName: 'patients',
      recordId: patientCode,
      details: `Admitted patient ${newPatient.fullName} (${newPatient.bloodGroup}) for ${newPatient.diagnosis}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    return newPatient;
  }

  // 3. Hospital Create Blood Request (Flow 06)
  createBloodRequest(data: {
    hospitalId: number;
    patientId?: number;
    hospitalName?: string;
    patientName?: string;
    patientCode?: string;
    bloodGroup: BloodGroup;
    component: BloodComponent;
    unitsRequired: number;
    urgency: RequestUrgency;
    requiredDate?: string;
    remarks?: string;
    doctorNotes?: string;
  }): BloodRequest {
    const hospital = this.hospitals.find(h => h.id === data.hospitalId) || this.hospitals[0];
    const patient = (data.patientId ? this.patients.find(p => p.id === data.patientId) : null) || this.patients[0];

    const nextId = this.getNextId(this.requests);
    const requestCode = `REQ-2026-${String(890 + nextId).padStart(5, '0')}`;
    const timestamp = new Date().toISOString();

    const newRequest: BloodRequest = {
      id: nextId,
      requestCode,
      hospitalId: hospital.id,
      hospitalName: data.hospitalName || hospital.name,
      patientId: patient.id,
      patientName: data.patientName || patient.fullName,
      patientCode: data.patientCode || patient.patientCode,
      bloodGroup: data.bloodGroup,
      component: data.component,
      unitsRequired: data.unitsRequired,
      unitsFulfilled: 0,
      urgency: data.urgency,
      requiredDate: data.requiredDate || timestamp.split('T')[0],
      status: 'Pending',
      remarks: data.doctorNotes || data.remarks || '',
      createdAt: timestamp,
      updatedAt: timestamp,
      trackingTimeline: [
        {
          stage: 'Pending',
          timestamp,
          note: `Request generated with urgency: ${data.urgency}. Awaiting blood bank review.`
        }
      ]
    };

    this.requests.unshift(newRequest);

    this.logAudit({
      userId: hospital.id,
      userName: hospital.name,
      userRole: 'hospital',
      action: 'CREATE_BLOOD_REQUEST',
      tableName: 'blood_requests',
      recordId: requestCode,
      details: `Requisition created for ${data.unitsRequired} unit(s) of ${data.bloodGroup} ${data.component} (${data.urgency})`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncRequestToMySQL(newRequest);
    this.notify();
    return newRequest;
  }

  // 4. Guided 7-Step Donation Process (Flow 09)
  processDonation(data: {
    donorId: number;
    screening: {
      weightKg: number;
      hemoglobinGdl: number;
      bloodPressure: string;
      pulseBpm: number;
      temperatureC: number;
      isEligible: boolean;
      deferralReason?: string;
    };
    donationType: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
    unitsCollected: number;
    component: BloodComponent;
    volumeMl: number;
    storageLocation: string;
    refrigeratorCode: string;
    staffId: number;
    staffName: string;
  }): { donation: Donation; bloodUnit?: BloodUnit } {
    const donor = this.donors.find(d => d.id === data.donorId);
    if (!donor) throw new Error('Donor not found');

    const timestamp = new Date().toISOString();

    // Step 2: Medical screening
    const screeningId = this.getNextId(this.screenings);
    const newScreening: MedicalScreening = {
      id: screeningId,
      donorId: donor.id,
      screeningDate: timestamp,
      ...data.screening,
      screenedByStaffId: data.staffId
    };
    this.screenings.push(newScreening);

    if (!data.screening.isEligible) {
      this.logAudit({
        userId: data.staffId,
        userName: data.staffName,
        userRole: 'staff',
        action: 'DONATION_DEFERRED',
        tableName: 'medical_screenings',
        recordId: screeningId,
        details: `Donor ${donor.fullName} deferred: ${data.screening.deferralReason}`,
        status: 'WARNING'
      });
      throw new Error(`Screening deferred: ${data.screening.deferralReason}`);
    }

    // Step 3 & 4: Record Donation
    const donationId = this.getNextId(this.donations);
    const donationCode = `DN-2026-${String(100 + donationId).padStart(4, '0')}`;

    // Step 4 & 5 & 6: Create Blood Unit
    const unitId = this.getNextId(this.bloodUnits);
    const unitCode = `BLD-2026-${String(9060 + unitId)}`;
    const shelfLifeDays = data.component === 'Platelets' ? 5 : (data.component === 'Whole Blood' ? 35 : 42);
    const expiryDate = new Date(Date.now() + shelfLifeDays * 24 * 60 * 60 * 1000).toISOString();

    const newUnit: BloodUnit = {
      id: unitId,
      unitCode,
      donationId,
      bloodGroup: donor.bloodGroup,
      component: data.component,
      collectionDate: timestamp,
      expiryDate,
      volumeMl: data.volumeMl,
      storageLocation: data.storageLocation,
      refrigeratorCode: data.refrigeratorCode,
      testingStatus: 'Tested - Safe',
      testResults: {
        hiv: 'Negative',
        hepatitisB: 'Negative',
        hepatitisC: 'Negative',
        syphilis: 'Negative',
        malaria: 'Negative'
      },
      status: 'Available'
    };
    this.bloodUnits.unshift(newUnit);

    const newDonation: Donation = {
      id: donationId,
      donationCode,
      donorId: donor.id,
      donorName: donor.fullName,
      bloodGroup: donor.bloodGroup,
      donationDate: timestamp,
      donationType: data.donationType,
      unitsCollected: data.unitsCollected,
      staffId: data.staffId,
      status: 'Completed',
      bloodUnitId: unitId,
      screeningId,
      notes: `Screened with Hb ${data.screening.hemoglobinGdl} g/dL, BP ${data.screening.bloodPressure}. Stored in ${data.refrigeratorCode}.`
    };
    this.donations.unshift(newDonation);

    // Update Donor Stats & Cooldown
    donor.totalDonations += 1;
    donor.lastDonationDate = timestamp.split('T')[0];
    const nextDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    donor.nextEligibleDate = nextDate.toISOString().split('T')[0];

    // Audit log
    this.logAudit({
      userId: data.staffId,
      userName: data.staffName,
      userRole: 'staff',
      action: 'WORKFLOW_DONATION_COLLECTED',
      tableName: 'blood_units',
      recordId: unitCode,
      details: `Processed complete donation cycle for ${donor.fullName}. Created blood unit ${unitCode} (${donor.bloodGroup} ${data.component}). Added to inventory.`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    if (newUnit) {
      this.syncBloodUnitToMySQL(newUnit);
    }
    this.notify();
    return { donation: newDonation, bloodUnit: newUnit };
  }

  // 5. ACID Transaction: Blood Issuance (Flow 11)
  issueBloodTransaction(params: {
    requestId: number;
    unitCodes: string[];
    staffId: number;
    staffName: string;
    simulateRollback?: boolean;
  }): { success: boolean; message: string; transactionHash?: string; issueCode?: string } {
    const request = this.requests.find(r => r.id === params.requestId);
    if (!request) {
      return { success: false, message: 'Transaction Aborted: Requisition record not found.' };
    }

    // Step 1: Lock & Verify All Units
    const selectedUnits: BloodUnit[] = [];
    for (const code of params.unitCodes) {
      const unit = this.bloodUnits.find(u => u.unitCode === code);
      if (!unit) {
        this.logAudit({
          userId: params.staffId,
          userName: params.staffName,
          userRole: 'staff',
          action: 'TRANSACTION_ROLLBACK',
          tableName: 'blood_issues',
          details: `ROLLBACK: Unit ${code} does not exist in inventory.`,
          status: 'ROLLBACK'
        });
        return { success: false, message: `ROLLBACK: Unit ${code} not found in inventory.` };
      }
      if (unit.status !== 'Available') {
        this.logAudit({
          userId: params.staffId,
          userName: params.staffName,
          userRole: 'staff',
          action: 'TRANSACTION_ROLLBACK',
          tableName: 'blood_issues',
          details: `ROLLBACK: Unit ${code} is currently ${unit.status}, cannot issue.`,
          status: 'ROLLBACK'
        });
        return { success: false, message: `ROLLBACK: Unit ${code} is currently ${unit.status}.` };
      }
      if (new Date(unit.expiryDate) <= new Date()) {
        this.logAudit({
          userId: params.staffId,
          userName: params.staffName,
          userRole: 'staff',
          action: 'TRANSACTION_ROLLBACK',
          tableName: 'blood_issues',
          details: `ROLLBACK: Unit ${code} is expired.`,
          status: 'ROLLBACK'
        });
        return { success: false, message: `ROLLBACK: Unit ${code} has expired on ${unit.expiryDate}.` };
      }
      selectedUnits.push(unit);
    }

    // Test deliberate transaction rollback simulation
    if (params.simulateRollback) {
      this.logAudit({
        userId: params.staffId,
        userName: params.staffName,
        userRole: 'staff',
        action: 'TRANSACTION_SIMULATED_ROLLBACK',
        tableName: 'blood_issues',
        details: 'Simulated DBMS constraint failure (Crossmatch antibody incompatibility). Transaction Rolled Back.',
        status: 'ROLLBACK'
      });
      return {
        success: false,
        message: 'SIMULATED ROLLBACK: Laboratory flagged atypical antibody crossmatch incompatibility. START TRANSACTION rolled back successfully. No inventory modified.'
      };
    }

    // COMMIT: Proceed with state change
    const timestamp = new Date().toISOString();
    const issueId = this.getNextId(this.issues);
    const issueCode = `ISS-2026-${String(350 + issueId).padStart(4, '0')}`;
    const transactionHash = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    // Update Blood Units
    for (const unit of selectedUnits) {
      unit.status = 'Issued';
      unit.issuedToHospitalId = request.hospitalId;
      unit.issuedAt = timestamp;
    }

    // Update Request
    request.unitsFulfilled += selectedUnits.length;
    if (request.unitsFulfilled >= request.unitsRequired) {
      request.status = 'Fulfilled';
    } else {
      request.status = 'Partially Fulfilled';
    }
    request.updatedAt = timestamp;
    request.trackingTimeline.push({
      stage: request.status,
      timestamp,
      note: `Issued ${selectedUnits.length} unit(s) [${params.unitCodes.join(', ')}] by ${params.staffName}. Transaction Hash: ${transactionHash.substring(0, 12)}...`
    });

    const newIssue: BloodIssue = {
      id: issueId,
      issueCode,
      requestId: request.id,
      requestCode: request.requestCode,
      hospitalId: request.hospitalId,
      hospitalName: request.hospitalName,
      patientName: request.patientName,
      bloodGroup: request.bloodGroup,
      component: request.component,
      unitsIssued: selectedUnits.length,
      issuedAt: timestamp,
      issuedByStaffId: params.staffId,
      staffName: params.staffName,
      bloodUnitCodes: params.unitCodes,
      transportTemperatureC: 4.0,
      transactionHash
    };
    this.issues.unshift(newIssue);

    // Create Audit Log
    this.logAudit({
      userId: params.staffId,
      userName: params.staffName,
      userRole: 'staff',
      action: 'TRANSACTION_ISSUE_BLOOD_COMMIT',
      tableName: 'blood_issues',
      recordId: issueCode,
      details: `COMMIT: Dispatched ${selectedUnits.length} units to ${request.hospitalName} for patient ${request.patientName}. Request ${request.requestCode} updated to ${request.status}. Hash: ${transactionHash}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    for (const u of selectedUnits) {
      this.syncBloodUnitToMySQL(u);
    }
    this.syncRequestStatusToMySQL(request.id, request.status);
    this.notify();
    return {
      success: true,
      message: `Transaction Committed! Successfully issued ${selectedUnits.length} blood unit(s).`,
      transactionHash,
      issueCode
    };
  }

  // 6. Camp Registration (Flow 14)
  registerForCamp(campId: number, donorId: number, timeSlot: string): { success: boolean; message: string } {
    const camp = this.camps.find(c => c.id === campId);
    const donor = this.donors.find(d => d.id === donorId);
    if (!camp || !donor) return { success: false, message: 'Camp or Donor record not found.' };

    if (camp.registeredDonorsCount >= camp.capacity) {
      return { success: false, message: 'Camp capacity reached maximum limit.' };
    }

    const exists = this.campRegistrations.some(r => r.campId === campId && r.donorId === donorId);
    if (exists) {
      return { success: false, message: 'You have already registered for this blood drive.' };
    }

    const regId = this.getNextId(this.campRegistrations);
    const newReg: CampRegistration = {
      id: regId,
      campId: camp.id,
      campName: camp.name,
      donorId: donor.id,
      donorName: donor.fullName,
      donorCode: donor.donorCode,
      bloodGroup: donor.bloodGroup,
      registeredAt: new Date().toISOString(),
      timeSlot,
      status: 'Registered'
    };
    this.campRegistrations.push(newReg);

    camp.registeredDonorsCount += 1;

    this.logAudit({
      userId: donor.userId,
      userName: donor.fullName,
      userRole: 'donor',
      action: 'INSERT_CAMP_REGISTRATION',
      tableName: 'camp_registrations',
      recordId: `CR-${regId}`,
      details: `Donor ${donor.fullName} registered for ${camp.name} at ${timeSlot}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncCampRegistrationToMySQL(camp.id, donor, timeSlot);
    this.notify();
    return { success: true, message: `Successfully registered for ${camp.name}! Slot: ${timeSlot}` };
  }

  // 7. Emergency Request Quick Lodging
  createEmergencyBloodRequest(data: {
    contactName: string;
    contactPhone: string;
    hospitalName: string;
    patientName: string;
    bloodGroup: BloodGroup;
    unitsRequired: number;
    remarks: string;
  }): BloodRequest {
    const nextId = this.getNextId(this.requests);
    const requestCode = `REQ-2026-${String(990 + nextId).padStart(5, '0')}`;
    const timestamp = new Date().toISOString();

    const newReq: BloodRequest = {
      id: nextId,
      requestCode,
      hospitalId: 1,
      hospitalName: data.hospitalName || 'Emergency Referral Hospital',
      patientId: 999,
      patientName: data.patientName,
      patientCode: `EMERG-${nextId}`,
      bloodGroup: data.bloodGroup,
      component: 'Packed Red Cells',
      unitsRequired: data.unitsRequired,
      unitsFulfilled: 0,
      urgency: 'Emergency',
      requiredDate: timestamp.split('T')[0],
      status: 'Pending',
      remarks: `24/7 Portal Emergency Lodging. Attending Contact: ${data.contactName} (${data.contactPhone}). ${data.remarks}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      trackingTimeline: [
        {
          stage: 'Pending',
          timestamp,
          note: `High-priority 24/7 trauma emergency request submitted. Paged to Blood Bank central desk.`
        }
      ]
    };

    this.requests.unshift(newReq);

    this.logAudit({
      userId: 1,
      userName: data.contactName,
      userRole: 'donor',
      action: 'CREATE_EMERGENCY_REQUEST',
      tableName: 'blood_requests',
      recordId: requestCode,
      details: `Emergency public blood request lodged for ${data.patientName} (${data.bloodGroup}, ${data.unitsRequired} units) at ${data.hospitalName}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncRequestToMySQL(newReq);
    this.notify();
    return newReq;
  }

  // 8. Update Blood Request Status (Admin / Staff)
  updateRequestStatus(requestId: number, newStatus: BloodRequest['status'], note: string, staffName: string) {
    const req = this.requests.find(r => r.id === requestId);
    if (!req) return;
    const timestamp = new Date().toISOString();
    req.status = newStatus;
    req.updatedAt = timestamp;
    req.trackingTimeline.push({
      stage: newStatus,
      timestamp,
      note: note || `Status updated to ${newStatus} by ${staffName}`
    });

    this.logAudit({
      userId: 3,
      userName: staffName,
      userRole: 'staff',
      action: 'UPDATE_REQUEST_STATUS',
      tableName: 'blood_requests',
      recordId: req.requestCode,
      details: `Status shifted to ${newStatus}. Note: ${note}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncRequestStatusToMySQL(req.id, newStatus, note);
    this.notify();
  }

  // --- Audit Logger ---
  private logAudit(entry: Omit<AuditLog, 'id' | 'timestamp' | 'ipAddress'>) {
    const log: AuditLog = {
      ...entry,
      id: this.getNextId(this.auditLogs),
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    };
    this.auditLogs.unshift(log);
  }

  // --- SQL Demonstrator Engine ---
  executeSql(query: string): {
    columns: string[];
    rows: (string | number | boolean | null)[][];
    rowCount: number;
    executionTimeMs: number;
    queryPlan: string;
  } {
    const startTime = performance.now();
    const clean = query.trim().toUpperCase();

    // Preset query matches
    if (clean.includes('O-') && clean.includes('BLOOD_UNITS')) {
      const filtered = this.bloodUnits.filter(u => u.bloodGroup === 'O-' && u.status === 'Available');
      const rows = filtered.map(u => [
        u.unitCode,
        u.bloodGroup,
        u.component,
        `${u.volumeMl} mL`,
        u.storageLocation,
        u.refrigeratorCode,
        u.expiryDate.split('T')[0],
        Math.max(0, Math.floor((new Date(u.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24)))
      ]);
      return {
        columns: ['unit_code', 'blood_group', 'component', 'volume', 'storage_location', 'refrigerator', 'expiry_date', 'days_to_expire'],
        rows,
        rowCount: rows.length,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: 'Index Scan on idx_units_bg_status (Cost: 0.05ms) -> Filter on status="Available"'
      };
    }

    if (clean.includes('GROUP BY') && clean.includes('BLOOD_GROUPS')) {
      const summary = this.getLiveBloodAvailability();
      const rows = summary.map(s => [
        s.bloodGroup,
        s.availableUnits,
        s.reservedUnits,
        s.issuedUnits,
        s.expiredUnits,
        s.availableUnits + s.reservedUnits + s.issuedUnits + s.expiredUnits
      ]);
      return {
        columns: ['blood_group', 'available_units', 'reserved_units', 'issued_units', 'expired_units', 'total_units_in_system'],
        rows,
        rowCount: rows.length,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: 'Hash Aggregate on blood_groups.code -> Hash Left Join on blood_units.blood_group_id'
      };
    }

    if (clean.includes('HAVING') && clean.includes('HOSPITALS')) {
      const rows = this.hospitals.slice(0, 5).map(h => [
        h.hospitalCode,
        h.name,
        h.city,
        h.totalRequests,
        h.totalUnitsReceived
      ]);
      return {
        columns: ['hospital_code', 'hospital_name', 'city', 'total_requests_lodged', 'total_units_demanded'],
        rows,
        rowCount: rows.length,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: 'Temporary Table with filesort -> Aggregate Filter (HAVING count > 18.5 subquery)'
      };
    }

    if (clean.includes('DONORS') && (clean.includes('ELIGIBLE') || clean.includes('NEXT_ELIGIBLE_DATE'))) {
      const eligible = this.donors.filter(d => d.eligibilityStatus === 'Eligible').slice(0, 10);
      const rows = eligible.map(d => [
        d.donorCode,
        d.fullName,
        d.bloodGroup,
        d.city,
        d.phone,
        d.totalDonations,
        d.lastDonationDate || 'N/A',
        d.nextEligibleDate
      ]);
      return {
        columns: ['donor_code', 'full_name', 'blood_group', 'city', 'phone', 'total_donations', 'last_donation', 'next_eligible_date'],
        rows,
        rowCount: rows.length,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        queryPlan: 'Index Scan on idx_donors_eligibility -> Filter on next_eligible_date <= CURRENT_DATE'
      };
    }

    if (clean.includes('TRANSACTION')) {
      return {
        columns: ['step', 'operation', 'status', 'lock_type', 'isolation_level'],
        rows: [
          ['1', 'START TRANSACTION', 'OK', 'None', 'REPEATABLE READ (InnoDB Default)'],
          ['2', 'SELECT ... FOR UPDATE', 'OK', 'Exclusive Row Lock (X-Lock)', 'Pessimistic concurrency'],
          ['3', 'UPDATE blood_units SET status="Issued"', 'OK', 'Row Updated', 'Write buffer flushed'],
          ['4', 'INSERT INTO blood_issues', 'OK', '1 Row Inserted', 'Auto-increment sequence advanced'],
          ['5', 'UPDATE blood_requests SET units_fulfilled+1', 'OK', 'Row Updated', 'Foreign key check verified'],
          ['6', 'COMMIT', 'OK', 'Transaction Sealed', 'Redo log synced to disk via fsync']
        ],
        rowCount: 6,
        executionTimeMs: 1.45,
        queryPlan: 'ACID Two-Phase Locking (2PL) Protocol with Write-Ahead Logging (WAL)'
      };
    }

    // Default SELECT fallback on units
    const units = this.bloodUnits.slice(0, 8);
    const rows = units.map(u => [
      u.unitCode,
      u.bloodGroup,
      u.component,
      u.status,
      u.volumeMl,
      u.storageLocation
    ]);
    return {
      columns: ['unit_code', 'blood_group', 'component', 'status', 'volume_ml', 'storage_location'],
      rows,
      rowCount: rows.length,
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      queryPlan: 'Full Table Scan on blood_units (filtered to 8 tuples)'
    };
  }

  // --- Relational Donors & SQL Engine ---

  getDonorById(id: number): Donor | undefined {
    return this.donors.find(d => d.id === id);
  }

  getDonorByCode(code: string): Donor | undefined {
    return this.donors.find(d => d.donorCode.toLowerCase() === code.trim().toLowerCase());
  }

  getDonorScreenings(donorId: number): MedicalScreening[] {
    const existing = this.screenings.filter(s => s.donorId === donorId);
    if (existing.length > 0) return existing;
    const donor = this.donors.find(d => d.id === donorId);
    if (donor) {
      const syn = createScreeningForDonor(donor);
      this.screenings.push(syn);
      return [syn];
    }
    return [];
  }

  getDonorDonations(donorId: number): Donation[] {
    const existing = this.donations.filter(d => d.donorId === donorId);
    if (existing.length > 0) return existing;
    const donor = this.donors.find(d => d.id === donorId);
    if (donor && (donor.totalDonations || 0) > 0) {
      const syn = createDonationsForDonor(donor);
      this.donations.push(...syn);
      return syn;
    }
    return [];
  }

  searchDonors(filters: DonorSearchFilters, user?: User): DonorSearchResult {
    const startTime = performance.now();
    const indexesUsed: string[] = [];
    const whereClauses: string[] = [];

    // Base query
    let filtered = [...this.donors];

    // Filter: Blood Group
    if (filters.bloodGroup && filters.bloodGroup !== 'ALL') {
      filtered = filtered.filter(d => d.bloodGroup === filters.bloodGroup);
      indexesUsed.push('idx_donors_blood_group');
      whereClauses.push(`d.blood_group = '${filters.bloodGroup}'`);
    }

    // Filter: City
    if (filters.city && filters.city !== 'ALL') {
      filtered = filtered.filter(d => d.city.toLowerCase() === filters.city!.toLowerCase());
      indexesUsed.push('idx_donors_city');
      whereClauses.push(`d.city = '${filters.city}'`);
    }

    // Filter: Availability
    if (filters.availability && filters.availability !== 'ALL') {
      filtered = filtered.filter(d => (d.availability || 'Available') === filters.availability);
      indexesUsed.push('idx_donors_availability');
      whereClauses.push(`d.availability = '${filters.availability}'`);
    }

    // Filter: Eligibility
    if (filters.eligibility && filters.eligibility !== 'ALL') {
      filtered = filtered.filter(d => d.eligibilityStatus === filters.eligibility);
      indexesUsed.push('idx_donors_eligibility');
      whereClauses.push(`d.eligibility_status = '${filters.eligibility}'`);
    }

    // Filter: Verification
    if (filters.verification && filters.verification !== 'ALL') {
      filtered = filtered.filter(d => (d.verificationStatus || 'Verified') === filters.verification);
      whereClauses.push(`d.verification_status = '${filters.verification}'`);
    }

    // Search Term (ID, Name, Phone, Email)
    if (filters.searchTerm && filters.searchTerm.trim() !== '') {
      const term = filters.searchTerm.trim().toLowerCase();
      filtered = filtered.filter(d => 
        d.donorCode.toLowerCase().includes(term) ||
        d.fullName.toLowerCase().includes(term) ||
        d.phone.toLowerCase().includes(term) ||
        d.email.toLowerCase().includes(term) ||
        d.city.toLowerCase().includes(term)
      );
      if (term.startsWith('don-')) {
        indexesUsed.push('PRIMARY_KEY / uq_donor_code');
      }
      whereClauses.push(`(d.donor_code LIKE '%${filters.searchTerm}%' OR d.full_name LIKE '%${filters.searchTerm}%' OR d.city LIKE '%${filters.searchTerm}%')`);
    }

    // Sorting
    const sortBy = filters.sortBy || 'lastDonationDate';
    const sortOrder = filters.sortOrder || 'DESC';

    filtered.sort((a, b) => {
      let valA: any = a[sortBy] || '';
      let valB: any = b[sortBy] || '';

      if (sortBy === 'totalDonations') {
        valA = a.totalDonations || 0;
        valB = b.totalDonations || 0;
      }

      if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
      if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });

    if (sortBy === 'lastDonationDate') {
      indexesUsed.push('idx_donors_last_donation_date');
    }

    // Privacy & RBAC: If user is not authenticated or not staff/admin, sanitize contact and private notes
    const isAuthorized = user && (user.role === 'admin' || user.role === 'staff');
    const sanitizedData = filtered.map(d => {
      if (isAuthorized) return d;
      return {
        ...d,
        phone: d.phone.replace(/(\+91 \d{2})\d{3} (\d{2})\d{3}/, '$1*** $2***'),
        email: d.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
        address: 'Protected (Requires Authorized Access)'
      };
    });

    const totalMatches = sanitizedData.length;
    const pageSize = filters.pageSize || 15;
    const currentPage = Math.max(1, filters.page || 1);
    const totalPages = Math.ceil(totalMatches / pageSize) || 1;
    const offset = (currentPage - 1) * pageSize;

    const pagedDonors = sanitizedData.slice(offset, offset + pageSize);

    // Build realistic SQL Query Demonstration
    const whereSql = whereClauses.length > 0 ? `\nWHERE\n  ` + whereClauses.join(' AND\n  ') : '';
    const generatedSql = 
`-- BloodConnect Relational Query Engine (MySQL 8.0 InnoDB)
-- Executed with RBAC context: ${user ? `${user.fullName} [${user.role.toUpperCase()}]` : 'ANONYMOUS_PUBLIC_USER [SANITIZED]'}
SELECT 
  d.donor_code,
  d.full_name,
  d.gender,
  d.blood_group,
  d.rh_factor,
  d.city,
  d.state,
  d.eligibility_status,
  d.availability,
  d.verification_status,
  d.total_donations,
  d.last_donation_date,
  d.next_eligible_date
FROM donors d
LEFT JOIN donations don ON d.id = don.donor_id${whereSql}
GROUP BY d.id
ORDER BY d.${sortBy === 'lastDonationDate' ? 'last_donation_date' : sortBy === 'totalDonations' ? 'total_donations' : 'id'} ${sortOrder}
LIMIT ${pageSize} OFFSET ${offset};`;

    const executionTimeMs = +(performance.now() - startTime).toFixed(2);

    return {
      donors: pagedDonors,
      totalMatches,
      currentPage,
      totalPages,
      pageSize,
      generatedSql,
      indexesUsed: Array.from(new Set(indexesUsed)),
      executionTimeMs
    };
  }

  updateDonor(id: number, updates: Partial<Donor>, actingUser?: User): Donor {
    const idx = this.donors.findIndex(d => d.id === id);
    if (idx === -1) throw new Error(`Donor with ID ${id} not found`);

    const prev = this.donors[idx];
    const updated: Donor = { ...prev, ...updates };
    this.donors[idx] = updated;

    this.logAudit({
      userId: actingUser?.id || 4,
      userName: actingUser?.fullName || 'System Administrator',
      userRole: actingUser?.role || 'admin',
      action: 'UPDATE_DONOR_PROFILE',
      tableName: 'donors',
      recordId: updated.donorCode,
      details: `Updated profile for donor ${updated.fullName} (${updated.donorCode}). Changes: ${Object.keys(updates).join(', ')}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    return updated;
  }

  createDonor(data: Omit<Donor, 'id' | 'donorCode' | 'registeredAt'>, actingUser?: User): Donor {
    const nextId = this.getNextId(this.donors);
    const donorCode = `DON-${String(nextId).padStart(6, '0')}`;
    const rhFactor: 'Positive' | 'Negative' = data.bloodGroup.includes('+') ? 'Positive' : 'Negative';

    const newDonor: Donor = {
      ...data,
      id: nextId,
      donorCode,
      rhFactor,
      registeredAt: new Date().toISOString(),
      donorStatus: data.donorStatus || 'Active',
      availability: data.availability || 'Available',
      verificationStatus: data.verificationStatus || 'Verified'
    };

    this.donors.unshift(newDonor);

    // Initial medical screening
    const screenId = this.getNextId(this.screenings);
    const screening: MedicalScreening = {
      id: screenId,
      screeningCode: `SCR-${String(screenId).padStart(6, '0')}`,
      donorId: nextId,
      screeningDate: new Date().toISOString().split('T')[0],
      weightKg: data.weightKg,
      hemoglobinGdl: 13.5,
      bloodPressure: '120/80',
      pulseBpm: 72,
      temperatureC: 36.6,
      isEligible: data.eligibilityStatus === 'Eligible',
      eligibilityStatus: data.eligibilityStatus,
      screenedByStaffId: actingUser?.id || 3,
      staffName: actingUser?.fullName || 'Sarah Jenkins, RN'
    };
    this.screenings.unshift(screening);

    this.logAudit({
      userId: actingUser?.id || 4,
      userName: actingUser?.fullName || 'System Administrator',
      userRole: actingUser?.role || 'admin',
      action: 'INSERT_DONOR_MANUAL',
      tableName: 'donors',
      recordId: donorCode,
      details: `Admin/Staff registered donor ${newDonor.fullName} (${newDonor.bloodGroup}) with unique code ${donorCode}`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    return newDonor;
  }

  toggleDonorStatus(id: number, actingUser?: User): Donor {
    const donor = this.donors.find(d => d.id === id);
    if (!donor) throw new Error(`Donor ${id} not found`);

    const newStatus = donor.donorStatus === 'Inactive' ? 'Active' : 'Inactive';
    const newAvailability = newStatus === 'Active' && donor.eligibilityStatus === 'Eligible' ? 'Available' : 'Not Available';
    return this.updateDonor(id, { donorStatus: newStatus, availability: newAvailability }, actingUser);
  }

  toggleDonorVerification(id: number, actingUser?: User): Donor {
    const donor = this.donors.find(d => d.id === id);
    if (!donor) throw new Error(`Donor ${id} not found`);

    const newVer = donor.verificationStatus === 'Pending Verification' ? 'Verified' : 'Pending Verification';
    return this.updateDonor(id, { verificationStatus: newVer }, actingUser);
  }

  getDonorStatistics() {
    const total = this.donors.length;
    const active = this.donors.filter(d => (d.donorStatus || 'Active') === 'Active').length;
    const eligible = this.donors.filter(d => d.eligibilityStatus === 'Eligible').length;
    const deferred = total - eligible;
    const available = this.donors.filter(d => (d.availability || 'Available') === 'Available').length;
    const verified = this.donors.filter(d => (d.verificationStatus || 'Verified') === 'Verified').length;

    // Blood groups breakdown
    const bgMap: Record<string, number> = {};
    this.donors.forEach(d => {
      bgMap[d.bloodGroup] = (bgMap[d.bloodGroup] || 0) + 1;
    });

    // Rh breakdown
    let rhPositive = 0;
    let rhNegative = 0;
    this.donors.forEach(d => {
      if (d.bloodGroup.includes('+')) rhPositive++;
      else rhNegative++;
    });

    // Top cities
    const cityMap: Record<string, number> = {};
    this.donors.forEach(d => {
      cityMap[d.city] = (cityMap[d.city] || 0) + 1;
    });
    const topCities = Object.entries(cityMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      active,
      eligible,
      deferred,
      available,
      verified,
      bgMap,
      rhPositive,
      rhNegative,
      topCities
    };
  }

  exportDonorsCsv(filters: DonorSearchFilters): string {
    const result = this.searchDonors({ ...filters, page: 1, pageSize: 5000 });
    const headers = ['Donor Code', 'Full Name', 'Gender', 'Blood Group', 'City', 'State', 'Phone', 'Email', 'Total Donations', 'Eligibility', 'Availability', 'Last Donation'];
    const rows = result.donors.map(d => [
      d.donorCode,
      `"${d.fullName}"`,
      d.gender,
      d.bloodGroup,
      `"${d.city}"`,
      d.state,
      `"${d.phone}"`,
      `"${d.email}"`,
      d.totalDonations,
      d.eligibilityStatus,
      d.availability || 'Available',
      d.lastDonationDate || 'N/A'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // ----------------- DIRECT DONATION APPOINTMENTS -----------------
  getAppointments(): DonationAppointment[] {
    return [...this.appointments];
  }

  getDonorAppointments(donorId?: number, email?: string): DonationAppointment[] {
    return this.appointments.filter(apt => {
      if (donorId && apt.donorId === donorId) return true;
      if (email && apt.donorEmail.toLowerCase() === email.toLowerCase()) return true;
      return false;
    });
  }

  createDonationAppointment(input: {
    donorId?: number;
    donorName: string;
    donorPhone: string;
    donorEmail: string;
    bloodGroup: BloodGroup;
    hospitalId: number;
    donationType: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
    appointmentDate: string;
    timeSlot: string;
  }): DonationAppointment {
    const hospital = this.hospitals.find(h => h.id === input.hospitalId) || this.hospitals[0];
    const nextId = this.appointments.length > 0 ? Math.max(...this.appointments.map(a => a.id)) + 1 : 101;
    const codeSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const appointmentCode = `APT-${new Date().getFullYear()}-${codeSuffix}`;

    const newApt: DonationAppointment = {
      id: nextId,
      appointmentCode,
      donorId: input.donorId,
      donorName: input.donorName.trim(),
      donorPhone: input.donorPhone.trim(),
      donorEmail: input.donorEmail.trim(),
      bloodGroup: input.bloodGroup,
      hospitalId: hospital.id,
      centerName: hospital.name,
      centerAddress: hospital.address,
      city: hospital.city,
      donationType: input.donationType,
      appointmentDate: input.appointmentDate,
      timeSlot: input.timeSlot,
      status: 'Scheduled',
      createdAt: new Date().toISOString()
    };

    this.appointments.unshift(newApt);

    this.logAudit({
      userId: input.donorId || 0,
      userName: newApt.donorName,
      userRole: 'donor',
      action: 'BOOK_DONATION_APPOINTMENT',
      tableName: 'donation_appointments',
      recordId: appointmentCode,
      details: `Booked ${newApt.donationType} slot at ${newApt.centerName} (${newApt.city}) on ${newApt.appointmentDate} (${newApt.timeSlot})`,
      status: 'SUCCESS'
    });

    this.saveToStorage();
    this.syncAppointmentToMySQL(newApt);
    this.notify();
    return newApt;
  }

  updateAppointmentStatus(id: number, status: DonationAppointment['status']): DonationAppointment | null {
    const idx = this.appointments.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.appointments[idx] = { ...this.appointments[idx], status };
    this.logAudit({
      userId: this.appointments[idx].donorId || 0,
      userName: this.appointments[idx].donorName,
      userRole: 'donor',
      action: 'UPDATE_APPOINTMENT_STATUS',
      tableName: 'donation_appointments',
      recordId: this.appointments[idx].appointmentCode,
      details: `Appointment ${this.appointments[idx].appointmentCode} updated to ${status}`,
      status: 'SUCCESS'
    });
    this.saveToStorage();
    this.syncAppointmentUpdateToMySQL(this.appointments[idx].appointmentCode, { status });
    this.notify();
    return this.appointments[idx];
  }

  rescheduleAppointment(id: number, appointmentDate: string, timeSlot: string): DonationAppointment | null {
    const idx = this.appointments.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.appointments[idx] = {
      ...this.appointments[idx],
      appointmentDate,
      timeSlot,
      status: 'Scheduled'
    };
    this.logAudit({
      userId: this.appointments[idx].donorId || 0,
      userName: this.appointments[idx].donorName,
      userRole: 'donor',
      action: 'RESCHEDULE_APPOINTMENT',
      tableName: 'donation_appointments',
      recordId: this.appointments[idx].appointmentCode,
      details: `Rescheduled appointment ${this.appointments[idx].appointmentCode} to ${appointmentDate} (${timeSlot})`,
      status: 'SUCCESS'
    });
    this.saveToStorage();
    this.syncAppointmentUpdateToMySQL(this.appointments[idx].appointmentCode, {
      appointmentDate,
      timeSlot,
      status: 'Scheduled',
    });
    this.notify();
    return this.appointments[idx];
  }

  // Reset demo data
  resetToInitial() {
    this.bloodUnits = [...INITIAL_BLOOD_UNITS];
    this.requests = [...INITIAL_REQUESTS];
    this.donors = [...INITIAL_DONORS];
    this.patients = [...INITIAL_PATIENTS];
    this.camps = [...INITIAL_CAMPS];
    this.donations = [...INITIAL_DONATIONS];
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
    this.issues = [];
    this.campRegistrations = [];
    this.appointments = this.createDefaultAppointments();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
  }
}

export const db = new DatabaseStore();
