import { Request, Response } from 'express';
import {
  listAppointments,
  updateAppointmentByIdOrCode,
  upsertAppointment,
} from '../db/repositories/appointment.repository';
import {
  AuthorizationError,
  isDatabaseOfflineError,
  sendCreated,
  sendSuccess,
  ValidationError,
} from '../utils/apiResponse';
import { isValidBloodGroup, VALID_APPOINTMENT_STATUSES } from '../utils/validators';

export async function getAppointments(req: Request, res: Response) {
  const auth = req.auth!;
  const canReadAll = auth.permissions.has('appointments:read_all');
  const donorIdRaw = req.query.donorId ? Number.parseInt(String(req.query.donorId), 10) : undefined;
  const requestedDonorId = donorIdRaw && Number.isFinite(donorIdRaw) ? donorIdRaw : undefined;
  const ownDonorId = auth.user.donorId ?? auth.user.id;

  if (!canReadAll && requestedDonorId !== undefined && requestedDonorId !== ownDonorId) {
    throw new AuthorizationError('You may only view your own donation appointments.');
  }

  const effectiveDonorId = canReadAll ? requestedDonorId : ownDonorId;

  try {
    const appointments = await listAppointments(effectiveDonorId);
    return sendSuccess(res, { source: 'mysql', appointments });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback', appointments: [] });
    }
    throw err;
  }
}

export async function createAppointment(req: Request, res: Response) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError('Invalid blood group for appointment');
  }
  if (!body.appointmentDate && !body.appointment_date) {
    throw new ValidationError('Appointment date is required');
  }

  try {
    const result = await upsertAppointment(body);
    return sendCreated(res, {
      source: 'mysql',
      message: 'Donation appointment saved in live MySQL database',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}

export async function patchAppointment(req: Request, res: Response) {
  const id = req.params.id;
  if (!id) {
    throw new ValidationError('Appointment ID or code is required');
  }

  const { status, appointmentDate, timeSlot } = req.body || {};
  if (status && !(VALID_APPOINTMENT_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError('Invalid appointment status');
  }

  try {
    const result = await updateAppointmentByIdOrCode(id, {
      status,
      appointmentDate,
      timeSlot,
    });
    return sendSuccess(res, {
      source: 'mysql',
      message: 'Appointment updated in MySQL database',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}
