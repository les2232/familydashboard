import express from 'express';
import { createCapture } from '../services/captureService.js';
import { logRouteError, sendError, sendSuccess } from '../helpers/apiResponse.js';

const router = express.Router();

router.post('/capture', async (req, res) => {
  try {
    const result = await createCapture(req.body);
    sendSuccess(res, { data: result.item, source: result.source, statusCode: 201 });
  } catch (error) {
    logRouteError('Capture API error', error);
    sendError(res, error, 'Failed to save capture');
  }
});

export default router;
