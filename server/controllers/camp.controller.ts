import { Request, Response } from 'express';
import { listCamps, registerCampDonor, upsertCamp } from '../db/repositories/camp.repository';
import { isDatabaseOfflineError, sendCreated, sendSuccess, ValidationError } from '../utils/apiResponse';

export async function getCamps(_req: Request, res: Response) {
  try {
    const camps = await listCamps();
    return sendSuccess(res, { source: 'mysql', camps });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback', camps: [] });
    }
    throw err;
  }
}

export async function createCamp(req: Request, res: Response) {
  const body = req.body || {};
  if (!body.name || typeof body.name !== 'string') {
    throw new ValidationError('Camp name is required');
  }

  try {
    const result = await upsertCamp(body);
    return sendCreated(res, { source: 'mysql', result });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}

export async function registerForCamp(req: Request, res: Response) {
  const campId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(campId) || campId < 1) {
    throw new ValidationError('Valid numeric camp ID is required');
  }

  const { donor, timeSlot } = req.body || {};
  try {
    const result = await registerCampDonor(campId, donor || {}, timeSlot || '10:00 AM');
    return sendSuccess(res, {
      source: 'mysql',
      message: 'Registered in live MySQL database',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}
