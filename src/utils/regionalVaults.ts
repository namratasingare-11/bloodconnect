import {
  BloodComponent,
  BloodGroup,
  BloodUnit,
  DonationCamp,
  Hospital,
} from '../types';
import { BLOOD_COMPONENTS, BLOOD_GROUPS } from '../config/constants';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface HospitalVaultSnapshot {
  hospital: Hospital;
  coordinates: GeoPoint;
  zone: string;
  coldChainTempC: number;
  responseEtaMin: number;
  totalAvailableUnits: number;
  directUnits: number;
  compatibleSubstituteUnits: number;
  compatibleGroups: BloodGroup[];
  byBloodGroup: Record<BloodGroup, number>;
  byComponent: Record<BloodComponent, number>;
  status: 'Available' | 'Low' | 'Critical';
  distanceKm: number | null;
}

export interface CampPinSnapshot {
  camp: DonationCamp;
  coordinates: GeoPoint;
  remainingSlots: number;
  fillPct: number;
  distanceKm: number | null;
}

export const MUMBAI_METRO_CENTER: GeoPoint = {
  lat: 19.076,
  lng: 72.8777,
};

/**
 * Red-cell ABO/Rh donor groups compatible for a patient of a given BloodGroup.
 * Listed from exact match first, followed by clinically accepted substitutes.
 */
export const COMPATIBLE_DONOR_GROUPS: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

/**
 * Grounded neighborhood centroids for BloodConnect's accredited Mumbai hospital vaults.
 */
const HOSPITAL_GEO_LOOKUP: Record<
  number,
  { lat: number; lng: number; zone: string; coldChainTempC: number; responseEtaMin: number }
> = {
  1: { lat: 19.0028, lng: 72.8421, zone: 'Parel · Central Zone', coldChainTempC: 3.4, responseEtaMin: 12 },
  2: { lat: 19.1154, lng: 72.8697, zone: 'Andheri East · WEH', coldChainTempC: 3.1, responseEtaMin: 14 },
  3: { lat: 19.0596, lng: 72.8295, zone: 'Bandra West', coldChainTempC: 2.9, responseEtaMin: 15 },
  4: { lat: 19.0065, lng: 72.8414, zone: 'Parel Oncology Hub', coldChainTempC: 3.6, responseEtaMin: 13 },
  5: { lat: 19.0091, lng: 72.8156, zone: 'Worli Seaface', coldChainTempC: 3.2, responseEtaMin: 16 },
  6: { lat: 18.9388, lng: 72.8354, zone: 'Fort · South Mumbai', coldChainTempC: 3.8, responseEtaMin: 11 },
  7: { lat: 19.1726, lng: 72.9565, zone: 'Mulund West', coldChainTempC: 3.5, responseEtaMin: 18 },
  8: { lat: 19.0178, lng: 72.8478, zone: 'Dadar East', coldChainTempC: 3.0, responseEtaMin: 14 },
  9: { lat: 19.1197, lng: 72.8826, zone: 'Marol · Andheri East', coldChainTempC: 3.3, responseEtaMin: 15 },
  10: { lat: 19.0509, lng: 72.8294, zone: 'Bandra Reclamation', coldChainTempC: 2.8, responseEtaMin: 13 },
};

const CAMP_GEO_LOOKUP: Record<number, GeoPoint> = {
  1: { lat: 18.9146, lng: 72.8213 }, // Cuffe Parade
  2: { lat: 19.1526, lng: 72.8551 }, // Goregaon Nesco
  3: { lat: 19.0735, lng: 72.8548 }, // Kalina Santacruz East
  4: { lat: 18.9322, lng: 72.8264 }, // Churchgate
  5: { lat: 19.0645, lng: 72.9988 }, // Vashi Navi Mumbai
  6: { lat: 19.0279, lng: 72.8384 }, // Dadar Shivaji Park
  7: { lat: 19.0095, lng: 72.8467 }, // Naigaon Dadar East
  8: { lat: 19.2089, lng: 72.9718 }, // Thane Viviana Mall
  9: { lat: 19.1191, lng: 72.9096 }, // Powai Hiranandani
  10: { lat: 19.0442, lng: 72.8203 }, // Bandra Bandstand
};

export function getHospitalCoordinates(hospital: Hospital): {
  coordinates: GeoPoint;
  zone: string;
  coldChainTempC: number;
  responseEtaMin: number;
} {
  if (typeof hospital.latitude === 'number' && typeof hospital.longitude === 'number') {
    return {
      coordinates: { lat: hospital.latitude, lng: hospital.longitude },
      zone: hospital.zone || hospital.city,
      coldChainTempC: 3.4,
      responseEtaMin: 15,
    };
  }
  const preset = HOSPITAL_GEO_LOOKUP[hospital.id];
  if (preset) {
    return {
      coordinates: { lat: preset.lat, lng: preset.lng },
      zone: preset.zone,
      coldChainTempC: preset.coldChainTempC,
      responseEtaMin: preset.responseEtaMin,
    };
  }
  const offset = ((hospital.id * 37) % 100) / 1000;
  return {
    coordinates: { lat: MUMBAI_METRO_CENTER.lat + offset - 0.05, lng: MUMBAI_METRO_CENTER.lng + offset - 0.03 },
    zone: hospital.city,
    coldChainTempC: 3.5,
    responseEtaMin: 16,
  };
}

export function getCampCoordinates(camp: DonationCamp): GeoPoint {
  if (typeof camp.latitude === 'number' && typeof camp.longitude === 'number') {
    return { lat: camp.latitude, lng: camp.longitude };
  }
  const preset = CAMP_GEO_LOOKUP[camp.id];
  if (preset) return preset;
  const offset = ((camp.id * 29) % 100) / 1000;
  return {
    lat: MUMBAI_METRO_CENTER.lat + offset - 0.04,
    lng: MUMBAI_METRO_CENTER.lng + offset - 0.02,
  };
}

export function haversineDistanceKm(origin: GeoPoint, destination: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(1));
}

function createEmptyGroupCounts(): Record<BloodGroup, number> {
  return {
    'A+': 0,
    'A-': 0,
    'B+': 0,
    'B-': 0,
    'AB+': 0,
    'AB-': 0,
    'O+': 0,
    'O-': 0,
  };
}

function createEmptyComponentCounts(): Record<BloodComponent, number> {
  return {
    'Whole Blood': 0,
    'Packed Red Cells': 0,
    Platelets: 0,
    'Fresh Frozen Plasma': 0,
    Cryoprecipitate: 0,
  };
}

/**
 * Deterministically maps real Available blood units in the BloodConnect store
 * across verified regional hospital vaults so every pin reflects live store changes.
 */
export function buildRegionalVaultSnapshots(
  hospitals: Hospital[],
  bloodUnits: BloodUnit[],
  selectedBloodGroup: BloodGroup | 'ALL',
  selectedComponent: BloodComponent | 'ALL',
  userLocation: GeoPoint | null = null
): HospitalVaultSnapshot[] {
  if (hospitals.length === 0) return [];

  const availableUnits = bloodUnits.filter(
    (unit) =>
      unit.status === 'Available' &&
      (selectedComponent === 'ALL' || unit.component === selectedComponent)
  );

  const buckets: Record<number, BloodUnit[]> = {};
  hospitals.forEach((h) => {
    buckets[h.id] = [];
  });

  availableUnits.forEach((unit) => {
    const hostIndex = (unit.id * 3 + unit.donationId) % hospitals.length;
    const hostId = hospitals[hostIndex].id;
    buckets[hostId].push(unit);
  });

  const compatibleList: BloodGroup[] =
    selectedBloodGroup === 'ALL'
      ? [...BLOOD_GROUPS]
      : COMPATIBLE_DONOR_GROUPS[selectedBloodGroup];

  return hospitals.map((hospital) => {
    const units = buckets[hospital.id] || [];
    const byBloodGroup = createEmptyGroupCounts();
    const byComponent = createEmptyComponentCounts();

    units.forEach((u) => {
      byBloodGroup[u.bloodGroup] = (byBloodGroup[u.bloodGroup] || 0) + 1;
      byComponent[u.component] = (byComponent[u.component] || 0) + 1;
    });

    const directUnits =
      selectedBloodGroup === 'ALL'
        ? units.length
        : byBloodGroup[selectedBloodGroup] || 0;

    const compatibleSubstituteUnits =
      selectedBloodGroup === 'ALL'
        ? 0
        : compatibleList
            .filter((g) => g !== selectedBloodGroup)
            .reduce((sum, group) => sum + (byBloodGroup[group] || 0), 0);

    const effectiveUnits = selectedBloodGroup === 'ALL' ? units.length : directUnits;

    let status: 'Available' | 'Low' | 'Critical';
    if (selectedBloodGroup === 'ALL') {
      status = effectiveUnits >= 5 ? 'Available' : effectiveUnits >= 2 ? 'Low' : 'Critical';
    } else {
      status = effectiveUnits >= 2 ? 'Available' : effectiveUnits === 1 ? 'Low' : 'Critical';
    }

    const geo = getHospitalCoordinates(hospital);
    const distanceKm = userLocation ? haversineDistanceKm(userLocation, geo.coordinates) : null;

    return {
      hospital,
      coordinates: geo.coordinates,
      zone: geo.zone,
      coldChainTempC: geo.coldChainTempC,
      responseEtaMin: geo.responseEtaMin,
      totalAvailableUnits: units.length,
      directUnits,
      compatibleSubstituteUnits,
      compatibleGroups: compatibleList,
      byBloodGroup,
      byComponent,
      status,
      distanceKm,
    };
  });
}

export function buildCampPinSnapshots(
  camps: DonationCamp[],
  userLocation: GeoPoint | null = null
): CampPinSnapshot[] {
  return camps
    .filter((camp) => camp.status !== 'Completed')
    .map((camp) => {
      const coordinates = getCampCoordinates(camp);
      const remainingSlots = Math.max(0, camp.capacity - camp.registeredDonorsCount);
      const fillPct =
        camp.capacity > 0
          ? Math.min(100, Math.round((camp.registeredDonorsCount / camp.capacity) * 100))
          : 0;
      return {
        camp,
        coordinates,
        remainingSlots,
        fillPct,
        distanceKm: userLocation ? haversineDistanceKm(userLocation, coordinates) : null,
      };
    });
}

export interface SosAppealInput {
  bloodGroup: BloodGroup;
  unitsNeeded: number;
  component: BloodComponent;
  patientName?: string;
  hospitalName?: string;
  hospitalPhone?: string;
  hospitalCity?: string;
  customNote?: string;
}

export function buildFamilySosAppeal(input: SosAppealInput): string {
  const substitutes = COMPATIBLE_DONOR_GROUPS[input.bloodGroup].filter(
    (bg) => bg !== input.bloodGroup
  );
  const lines = [
    `URGENT BLOOD REQUIREMENT · ${input.bloodGroup} (${input.unitsNeeded} ${
      input.unitsNeeded === 1 ? 'Unit' : 'Units'
    } · ${input.component})`,
    input.patientName?.trim() ? `Patient / Ward: ${input.patientName.trim()}` : null,
    input.hospitalName
      ? `Hospital / Vault: ${input.hospitalName}${input.hospitalCity ? `, ${input.hospitalCity}` : ''}`
      : 'Region: Mumbai Metropolitan Clinical Network',
    substitutes.length > 0
      ? `Compatible Donor Substitutes: ${substitutes.join(', ')}`
      : 'Exact Match Required: O- Universal RBC only',
    input.hospitalPhone ? `Blood Bank Desk: ${input.hospitalPhone}` : null,
    '24/7 Emergency Helpline: 1800-11-9999',
    input.customNote?.trim() ? `Note: ${input.customNote.trim()}` : null,
    typeof window !== 'undefined'
      ? `Verify Live Vault Stock: ${window.location.origin}/blood-map`
      : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function getSortedComponents(): readonly BloodComponent[] {
  return BLOOD_COMPONENTS;
}
