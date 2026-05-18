import express from 'express';
import { getCalendarEvents } from '../services/calendarService.js';
import { sendError, sendSuccess } from '../helpers/apiResponse.js';

const router = express.Router();

router.get('/calendar', async (req, res) => {
  try {
    const date = req.query.date;
    const result = await getCalendarEvents({ date });
    sendSuccess(res, { data: result.data, source: result.source });
  } catch (error) {
    console.error('Calendar API error:', error);
    sendError(res, error, 'Failed to fetch calendar data');
  }
});

export default router;
