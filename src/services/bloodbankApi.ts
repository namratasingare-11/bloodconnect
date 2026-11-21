import { apiClient } from './apiClient';
import { BloodRequest, BloodUnit, DonationAppointment, DonationCamp, Donor } from '../types';

export const bloodbankApi = {
  async syncDonorCreate(donor: Donor): Promise<void> {
    try {
      await apiClient.post('/api/donors', donor);
    } catch {
      // Non-blocking background sync when MySQL is offline
    }
  },

  async syncDonorUpdate(donor: Donor): Promise<void> {
    try {
      await apiClient.put(`/api/donors/${donor.donorCode || donor.id}`, donor);
    } catch {
      // Non-blocking background sync when MySQL is offline
    }
  },

  async syncBloodUnitCreate(unit: BloodUnit): Promise<void> {
    try {
      await apiClient.post('/api/blood-units', unit);
    } catch {
      // Non-blocking background sync
    }
  },

  async syncRequestCreate(request: BloodRequest): Promise<void> {
    try {
      await apiClient.post('/api/requests', request);
    } catch {
      // Non-blocking background sync
    }
  },

  async syncRequestStatus(idOrCode: string | number, status: string, note?: string): Promise<void> {
    try {
      await apiClient.patch(`/api/requests/${idOrCode}`, { status, note });
    } catch {
      // Non-blocking background sync
    }
  },

  async syncCampCreate(camp: DonationCamp): Promise<void> {
    try {
      await apiClient.post('/api/camps', camp);
    } catch {
      // Non-blocking background sync
    }
  },

  async syncCampRegistration(campId: number, donor: Partial<Donor> & { campName?: string }, timeSlot: string): Promise<void> {
    try {
      await apiClient.post(`/api/camps/${campId}/register`, { donor, timeSlot });
    } catch {
      // Non-blocking background sync
    }
  },

  async syncAppointmentCreate(appointment: DonationAppointment): Promise<void> {
    try {
      await apiClient.post('/api/appointments', appointment);
    } catch {
      // Non-blocking background sync
    }
  },

  async syncAppointmentUpdate(
    idOrCode: string | number,
    updates: { status?: DonationAppointment['status']; appointmentDate?: string; timeSlot?: string }
  ): Promise<void> {
    try {
      await apiClient.patch(`/api/appointments/${idOrCode}`, updates);
    } catch {
      // Non-blocking background sync
    }
  },
};
