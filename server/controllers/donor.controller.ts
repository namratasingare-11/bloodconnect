import { Request, Response } from 'express';
import { listDonors, updateDonorByIdOrCode, upsertDonor } from '../db/repositories/donor.repository';
import { isDatabaseOfflineError, sendCreated, sendSuccess, ValidationError } from '../utils/apiResponse';
import { isValidBloodGroup, parsePositiveInt } from '../utils/validators';

export async function getDonors(req: Request, res: Response) {
  const page = parsePositiveInt(req.query.page, 1, 10000);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const bloodGroup = typeof req.query.bloodGroup === 'string' ? req.query.bloodGroup : undefined;
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;

  if (bloodGroup && bloodGroup !== 'all' && bloodGroup !== 'ALL' && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError('Invalid blood group filter');
  }

  try {
    const data = await listDonors({ page, limit, bloodGroup, city });
    return sendSuccess(res, { source: 'mysql', ...data });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: 'fallback',
        message: 'MySQL is offline; frontend databaseStore is active.',
        donors: [],
      });
    }
    throw err;
  }
}

export async function createDonor(req: Request, res: Response) {
  const body = req.body || {};
  const bloodGroup = body.bloodGroup || body.blood_group;
  if (bloodGroup && !isValidBloodGroup(bloodGroup)) {
    throw new ValidationError('Invalid blood group');
  }

  try {
    const result = await upsertDonor(body);
    return sendCreated(res, {
      source: 'mysql',
      message: 'Donor registered in live MySQL database',
      result,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: 'fallback',
        message: 'Donor saved locally; will sync when MySQL is connected.',
      });
    }
    throw err;
  }
}

export async function updateDonor(req: Request, res: Response) {
  const id = req.params.id;
  if (!id) {
    throw new ValidationError('Donor ID or code is required');
  }

  try {
    const result = await updateDonorByIdOrCode(id, req.body || {});
    return sendSuccess(res, { source: 'mysql', result });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return sendSuccess(res, {
        source: 'fallback',
        message: 'Donor updated locally; MySQL offline.',
      });
    }
    throw err;
  }
}
