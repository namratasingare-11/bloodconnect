import { Donor, MedicalScreening, Donation, BloodGroup } from '../types';

// Realistic Indian first names (Male & Female)
const MALE_FIRST_NAMES = [
  'Rahul', 'Aarav', 'Vikram', 'Rohan', 'Amit', 'Aditya', 'Sanjay', 'Deepak',
  'Naveen', 'Karan', 'Manish', 'Farhan', 'Gaurav', 'Varun', 'Arjun', 'Sameer',
  'Anand', 'Pranav', 'Devendra', 'Nikhil', 'Siddharth', 'Yash', 'Alok', 'Sachin',
  'Ashok', 'Girish', 'Harish', 'Kunal', 'Mohit', 'Pankaj', 'Rajesh', 'Suresh',
  'Tarun', 'Umesh', 'Vivek', 'Zaid', 'Irfan', 'Tushar', 'Abhishek', 'Omkar'
];

const FEMALE_FIRST_NAMES = [
  'Priya', 'Sneha', 'Ananya', 'Pooja', 'Sunita', 'Divya', 'Aarti', 'Tanvi',
  'Isha', 'Ritu', 'Nandini', 'Shruti', 'Meera', 'Kavita', 'Neha', 'Swati',
  'Pallavi', 'Rupali', 'Shreya', 'Anjali', 'Sonali', 'Geeta', 'Deepa', 'Rashmi',
  'Preeti', 'Jyoti', 'Komal', 'Madhuri', 'Archana', 'Bhavna', 'Chetna', 'Disha',
  'Ekta', 'Fatima', 'Gayatri', 'Heena', 'Ishani', 'Jhanvi', 'Kiran', 'Lata'
];

// Realistic regional surnames (Maharashtra & Pan-India)
const LAST_NAMES = [
  'Sharma', 'Patil', 'Kulkarni', 'Deshmukh', 'Joshi', 'Verma', 'Gupta', 'Iyer',
  'Nair', 'Shinde', 'Pawar', 'More', 'Chavan', 'Bhosale', 'Kadam', 'Jadhav',
  'Gaikwad', 'Sawant', 'Tambe', 'Gokhale', 'Choudhury', 'Pillai', 'Rao', 'Bhatia',
  'Malhotra', 'Qureshi', 'Kapoor', 'Agrawal', 'Mistry', 'Fernandes', 'D’Souza', 'Khan',
  'Mansoori', 'Waghmare', 'Sen', 'Dutta', 'Ghosh', 'Chatterjee', 'Banerjee', 'Mehta',
  'Shah', 'Pandey', 'Mishra', 'Tripathi', 'Tiwari', 'Bhattacharya', 'Srivastava', 'Chauhan'
];

// Cities in Maharashtra and surrounding regions
const CITIES = [
  { name: 'Mumbai', pincodePrefix: '4000' },
  { name: 'Pune', pincodePrefix: '4110' },
  { name: 'Nagpur', pincodePrefix: '4400' },
  { name: 'Nashik', pincodePrefix: '4220' },
  { name: 'Nanded', pincodePrefix: '4316' },
  { name: 'Aurangabad', pincodePrefix: '4310' },
  { name: 'Thane', pincodePrefix: '4006' },
  { name: 'Navi Mumbai', pincodePrefix: '4007' },
  { name: 'Kolhapur', pincodePrefix: '4160' },
  { name: 'Solapur', pincodePrefix: '4130' },
  { name: 'Amravati', pincodePrefix: '4446' },
  { name: 'Jalgaon', pincodePrefix: '4250' },
  { name: 'Akola', pincodePrefix: '4440' },
  { name: 'Satara', pincodePrefix: '4150' },
  { name: 'Latur', pincodePrefix: '4135' },
  { name: 'Dhule', pincodePrefix: '4240' }
];

// Addresses and localities
const STREET_NAMES = [
  'MG Road', 'Station Road', 'Shivaji Nagar', 'Tilak Road', 'Subhash Chandra Bose Marg',
  'Ambedkar Chowk', 'Gandhi Path', 'Laxmi Road', 'Nehru Nagar', 'Link Road',
  'Bypass Road', 'Main Bazaar', 'Sector 14', 'Green Park Avenue', 'Model Colony',
  'Ring Road', 'Civil Lines', 'High School Road', 'Hospital Road', 'Market Yard'
];

const SOCIETY_NAMES = [
  'Gokul Dham', 'Shree Ram Residency', 'Sai Krupa Enclave', 'Shanti Niketan',
  'Green Meadows', 'Silver Heights', 'Surya Kiran Apartments', 'Nilgiri Society',
  'Panchavati Complex', 'Royal Palms', 'Vrindavan Park', 'Anand Nagar CHS',
  'Kasturi Heights', 'Lotus Towers', 'Gulmohar Garden', 'Shivalik Complex'
];

// Deterministic pseudo-random generator
function pseudoRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// Generate realistic Indian phone number
function generatePhone(id: number): string {
  const prefixes = ['98201', '98332', '98450', '98220', '97654', '98901', '94221', '97022'];
  const pfx = prefixes[id % prefixes.length];
  const suffix = String(10000 + (id * 739) % 90000);
  return `+91 ${pfx} ${suffix}`;
}

// Generate blood group matching realistic medical distributions
function getRealisticBloodGroup(id: number, rand: number): BloodGroup {
  // Medical distribution approximation:
  // O+: 37%, A+: 25%, B+: 26%, AB+: 7%
  // O-: 2.5%, A-: 1.2%, B-: 1.0%, AB-: 0.3%
  const val = rand * 100;
  if (val < 37.0) return 'O+';
  if (val < 62.0) return 'A+';
  if (val < 88.0) return 'B+';
  if (val < 95.0) return 'AB+';
  if (val < 97.5) return 'O-';
  if (val < 98.7) return 'A-';
  if (val < 99.7) return 'B-';
  return 'AB-';
}

export interface GeneratedDatabase {
  donors: Donor[];
  screenings: MedicalScreening[];
  donations: Donation[];
}

export function createScreeningForDonor(donor: Donor): MedicalScreening {
  const isElig = donor.eligibilityStatus === 'Eligible';
  return {
    id: 100000 + donor.id,
    screeningCode: `SCR-${String(100000 + donor.id).padStart(6, '0')}`,
    donorId: donor.id,
    screeningDate: donor.lastDonationDate || '2026-08-10',
    weightKg: donor.weightKg,
    hemoglobinGdl: isElig ? 13.8 : 11.4,
    bloodPressure: '120/80',
    pulseBpm: 72,
    temperatureC: 36.6,
    isEligible: isElig,
    eligibilityStatus: donor.eligibilityStatus,
    deferralReason: isElig ? undefined : 'Hemoglobin below clinical threshold (12.1 g/dL). Oral iron advised.',
    screenedByStaffId: 3,
    staffName: 'Sarah Jenkins, RN'
  };
}

export function createDonationsForDonor(donor: Donor): Donation[] {
  if (!donor.totalDonations || donor.totalDonations <= 0) return [];
  const donations: Donation[] = [];
  const count = Math.min(3, donor.totalDonations);
  for (let d = 0; d < count; d++) {
    const year = 2025 + Math.floor(d / 2);
    const month = String(1 + ((donor.id + d * 3) % 12)).padStart(2, '0');
    const day = String(1 + ((donor.id + d * 7) % 28)).padStart(2, '0');
    donations.push({
      id: 200000 + (donor.id * 10) + d,
      donationCode: `DON-REC-${String(200000 + donor.id * 10 + d).padStart(6, '0')}`,
      donorId: donor.id,
      donorName: donor.fullName,
      bloodGroup: donor.bloodGroup,
      donationDate: `${year}-${month}-${day}T10:00:00Z`,
      donationCenter: `${donor.city} Central Regional Blood Bank`,
      donationType: (d === 0 && donor.bloodGroup.includes('AB')) ? 'Apheresis Platelets' : 'Whole Blood',
      unitsCollected: 1,
      staffId: 3,
      status: 'Completed',
      screeningId: 100000 + donor.id,
      notes: 'Standard voluntary donation protocol successfully satisfied.'
    });
  }
  return donations;
}

export function generateDonors(targetCount = 95000): GeneratedDatabase {
  const rand = pseudoRandom(42);
  const donors: Donor[] = [];
  const screenings: MedicalScreening[] = [];
  const donations: Donation[] = [];

  let donationSeq = 100;
  let screeningSeq = 100;

  for (let i = 1; i <= targetCount; i++) {
    const r1 = rand();
    const r2 = rand();
    const r3 = rand();
    const r4 = rand();
    const r5 = rand();

    const isFemale = r1 > 0.48;
    let gender: 'Male' | 'Female' = isFemale ? 'Female' : 'Male';
    const firstList = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;

    let fullName = `${firstList[Math.floor(r2 * firstList.length)]} ${LAST_NAMES[Math.floor(r3 * LAST_NAMES.length)]}`;
    let cityObj = CITIES[Math.floor(r4 * CITIES.length)];
    let bloodGroup: BloodGroup = getRealisticBloodGroup(i, r5);
    let totalDonations = Math.floor(rand() * 12); // 0 to 11
    let eligibilityStatus: Donor['eligibilityStatus'] = 'Eligible';
    let availability: 'Available' | 'Not Available' = 'Available';
    let donorStatus: 'Active' | 'Inactive' | 'Temporarily Unavailable' = 'Active';
    let verificationStatus: 'Verified' | 'Pending Verification' = (i % 12 === 0) ? 'Pending Verification' : 'Verified';

    let lastDonationDate: string | undefined = undefined;
    let nextEligibleDate = '2026-10-15';

    // Format Donor Code as DON-000001 through DON-095000
    const donorCode = `DON-${String(i).padStart(6, '0')}`;

    // Specific exact prompt test cases:
    if (i === 147) {
      fullName = 'Rahul Sharma';
      gender = 'Male';
      bloodGroup = 'O-';
      cityObj = { name: 'Nagpur', pincodePrefix: '4400' };
      eligibilityStatus = 'Eligible';
      availability = 'Available';
      donorStatus = 'Active';
      verificationStatus = 'Verified';
      totalDonations = 6;
      lastDonationDate = '2026-08-12';
      nextEligibleDate = '2026-11-12';
    } else if (i === 583) {
      fullName = 'Aarav Patil';
      gender = 'Male';
      bloodGroup = 'O-';
      cityObj = { name: 'Pune', pincodePrefix: '4110' };
      eligibilityStatus = 'Eligible';
      availability = 'Available';
      donorStatus = 'Active';
      verificationStatus = 'Verified';
      totalDonations = 4;
      lastDonationDate = '2026-07-02';
      nextEligibleDate = '2026-10-02';
    } else if (i === 42) {
      // Nanded O- eligible donor for test query
      fullName = 'Sneha Kulkarni';
      gender = 'Female';
      bloodGroup = 'O-';
      cityObj = { name: 'Nanded', pincodePrefix: '4316' };
      eligibilityStatus = 'Eligible';
      availability = 'Available';
      donorStatus = 'Active';
      verificationStatus = 'Verified';
      totalDonations = 5;
      lastDonationDate = '2026-06-15';
      nextEligibleDate = '2026-09-15';
    } else if (i === 89) {
      // Another Nanded O- donor
      fullName = 'Vikram Deshmukh';
      gender = 'Male';
      bloodGroup = 'O-';
      cityObj = { name: 'Nanded', pincodePrefix: '4316' };
      eligibilityStatus = 'Eligible';
      availability = 'Available';
      donorStatus = 'Active';
      verificationStatus = 'Verified';
      totalDonations = 3;
      lastDonationDate = '2026-07-20';
      nextEligibleDate = '2026-10-20';
    } else {
      // General eligibility distribution
      const eligRoll = rand();
      if (eligRoll < 0.10) {
        eligibilityStatus = 'Temporarily Deferred';
        availability = 'Not Available';
      } else if (eligRoll < 0.12) {
        eligibilityStatus = 'Permanently Deferred';
        availability = 'Not Available';
        donorStatus = 'Inactive';
      } else {
        eligibilityStatus = 'Eligible';
        availability = (rand() > 0.15) ? 'Available' : 'Not Available';
      }

      if (totalDonations > 0) {
        const monthOffset = (i % 6) + 1;
        const day = 10 + (i % 18);
        lastDonationDate = `2026-0${Math.min(9, monthOffset)}-${String(day).padStart(2, '0')}`;
        const nextMonth = Math.min(12, monthOffset + 3);
        nextEligibleDate = `2026-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      } else {
        nextEligibleDate = '2026-09-08';
      }
    }

    const rhFactor: 'Positive' | 'Negative' = bloodGroup.includes('+') ? 'Positive' : 'Negative';
    const street = STREET_NAMES[i % STREET_NAMES.length];
    const society = SOCIETY_NAMES[(i * 3) % SOCIETY_NAMES.length];
    const flatNo = 100 + (i % 800);
    const address = `Flat ${flatNo}, ${society}, ${street}`;
    const pincode = `${cityObj.pincodePrefix}${String(10 + (i % 85)).padStart(2, '0')}`;
    const weightKg = Math.round(52 + (rand() * 38)); // 52kg to 90kg

    // Birth year between 1970 and 2005 (age 21 to 56)
    const birthYear = 1972 + (i % 32);
    const birthMonth = String(1 + (i % 12)).padStart(2, '0');
    const birthDay = String(1 + (i % 28)).padStart(2, '0');
    const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;

    const cleanName = fullName.toLowerCase().replace(/[^a-z]/g, '');
    const email = `${cleanName}.${i}@donorconnect.org`;
    const phone = generatePhone(i);

    // Deferral notes if deferred
    let medicalNotes = 'Fit for regular voluntary donation. Normal vitals.';
    let deferralReason: string | undefined = undefined;

    if (eligibilityStatus === 'Temporarily Deferred') {
      const reasons = [
        'Hemoglobin below clinical threshold (12.1 g/dL). Oral iron advised.',
        'Recent antibiotic therapy completed within past 14 days.',
        'Mild seasonal pyrexia noted during physical screening.',
        'Recent cosmetic tattoo/microblading (<6 months deferral window).',
        'Transient elevated blood pressure (148/96 mmHg) at check-in.'
      ];
      deferralReason = reasons[i % reasons.length];
      medicalNotes = `Temporary Deferral: ${deferralReason}`;
    } else if (eligibilityStatus === 'Permanently Deferred') {
      deferralReason = 'Chronic cardiac arrhythmia history reported on medical questionnaire.';
      medicalNotes = `Permanent Deferral: ${deferralReason}`;
    }

    // Push Donor record
    const donor: Donor = {
      id: i,
      donorCode,
      userId: 1000 + i,
      fullName,
      email,
      phone,
      dateOfBirth,
      gender,
      bloodGroup,
      rhFactor,
      address,
      city: cityObj.name,
      state: 'Maharashtra',
      pincode,
      weightKg,
      totalDonations,
      lastDonationDate,
      nextEligibleDate,
      eligibilityStatus,
      donorStatus,
      availability,
      verificationStatus,
      medicalNotes,
      consentAccepted: true,
      registeredAt: `2025-0${1 + (i % 9)}-${String(10 + (i % 18)).padStart(2, '0')}T09:00:00Z`
    };
    donors.push(donor);

    // Create Initial/Latest Medical Screening for this donor (pre-populate first 1500 for instant access)
    if (i <= 1500) {
      const hbValue = eligibilityStatus === 'Temporarily Deferred' && (i % 3 === 0)
        ? +(11.2 + rand() * 1.1).toFixed(1)
        : +(12.8 + rand() * 3.2).toFixed(1);

      const bpSys = 110 + Math.floor(rand() * 25);
      const bpDia = 70 + Math.floor(rand() * 18);
      const pulse = 64 + Math.floor(rand() * 24);
      const temp = +(36.4 + rand() * 0.7).toFixed(1);

      const screening: MedicalScreening = {
        id: screeningSeq,
        screeningCode: `SCR-${String(screeningSeq).padStart(6, '0')}`,
        donorId: i,
        screeningDate: lastDonationDate || '2026-08-10',
        weightKg,
        hemoglobinGdl: hbValue,
        bloodPressure: `${bpSys}/${bpDia}`,
        pulseBpm: pulse,
        temperatureC: temp,
        isEligible: eligibilityStatus === 'Eligible',
        eligibilityStatus,
        deferralReason,
        screenedByStaffId: 3,
        staffName: 'Sarah Jenkins, RN'
      };
      screenings.push(screening);
      screeningSeq++;

      // If donor has donations, generate historical donation records
      if (totalDonations > 0 && donationSeq <= 1000) {
        const recordsToGen = Math.min(3, totalDonations);
        for (let d = 0; d < recordsToGen; d++) {
          const donationYear = 2025 + Math.floor(d / 2);
          const donationMonth = String(1 + ((i + d * 3) % 12)).padStart(2, '0');
          const donationDay = String(1 + ((i + d * 7) % 28)).padStart(2, '0');
          const donationDate = `${donationYear}-${donationMonth}-${donationDay}T10:00:00Z`;

          const donation: Donation = {
            id: donationSeq,
            donationCode: `DON-REC-${String(donationSeq).padStart(6, '0')}`,
            donorId: i,
            donorName: fullName,
            bloodGroup,
            donationDate,
            donationCenter: `${cityObj.name} Central Regional Blood Bank`,
            donationType: (d === 0 && bloodGroup.includes('AB')) ? 'Apheresis Platelets' : 'Whole Blood',
            unitsCollected: 1,
            staffId: 3,
            status: 'Completed',
            screeningId: screening.id,
            notes: 'Standard voluntary donation protocol successfully satisfied.'
          };
          donations.push(donation);
          donationSeq++;
        }
      }
    }
  }

  return { donors, screenings, donations };
}

// Backward-compatible alias
export function generate1000Donors(): GeneratedDatabase {
  return generateDonors(95000);
}
