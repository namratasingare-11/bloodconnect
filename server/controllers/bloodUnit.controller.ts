import { Request, Response } from 'express';
import { listBloodUnits, upsertBloodUnit } from '../db/repositories/bloodUnit.repository';
import { isDatabaseOfflineError, sendCreated, sendSuccess, ValidationError } from '../utils/apiResponse';
import { isValidBloodGroup } from '../utils/validators';

export async function getBloodUnits(req: Request, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  try {
    const units = await listBloodUnits(status);
    return sendSuccess(res, { source: 'mysql', units });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback', units: [] });
    }
    throw err;
  }
}

export async function createBloodUnit(req: Request, res: Response) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError('Invalid blood group for blood unit');
  }

  try {
    const result = await upsertBloodUnit(body);
    return sendCreated(res, {
      source: 'mysql',
      message: 'Blood unit added to live MySQL inventory',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, { source: 'fallback' });
    }
    throw err;
  }
}
