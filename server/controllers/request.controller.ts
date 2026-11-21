import { Request, Response } from 'express';
import {
  listBloodRequests,
  updateBloodRequestStatus,
  upsertBloodRequest,
} from '../db/repositories/request.repository';
import { isDatabaseOfflineError, sendCreated, sendSuccess, ValidationError } from '../utils/apiResponse';
import { isValidBloodGroup, VALID_REQUEST_STATUSES } from '../utils/validators';

export async function getBloodRequests(_req: Request, res: Response) {
  try {
    const requests = await listBloodRequests();
    return sendSuccess(res, { source: 'mysql', requests });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback', requests: [] });
    }
    throw err;
  }
}

export async function createBloodRequest(req: Request, res: Response) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError('Invalid blood group in blood request');
  }

  const units = Number(body.unitsRequired ?? body.units_needed ?? 1);
  if (!Number.isFinite(units) || units < 1 || units > 50) {
    throw new ValidationError('Units required must be between 1 and 50');
  }

  try {
    const result = await upsertBloodRequest(body);
    return sendCreated(res, {
      source: 'mysql',
      message: 'Blood request registered live in MySQL database',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}

export async function patchBloodRequestStatus(req: Request, res: Response) {
  const id = req.params.id;
  const { status, note } = req.body || {};

  if (!id) {
    throw new ValidationError('Request ID or code is required');
  }
  if (!status || !(VALID_REQUEST_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError('Invalid blood request status');
  }

  try {
    const result = await updateBloodRequestStatus(id, status, typeof note === 'string' ? note : undefined);
    return sendSuccess(res, {
      source: 'mysql',
      message: `Request status updated to ${status} in MySQL`,
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}
