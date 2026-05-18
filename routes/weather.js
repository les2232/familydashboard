import express from 'express';
import { getWeather } from '../services/weatherService.js';
import { sendError, sendSuccess } from '../helpers/apiResponse.js';

const router = express.Router();

router.get('/weather', async (req, res) => {
  try {
    const city = req.query.city || 'Aurora,CO,US';
    const result = await getWeather({ city });
    sendSuccess(res, { data: result.data, source: result.source });
  } catch (err) {
    console.error('Weather route error:', err);
    sendError(res, err, 'Failed to fetch weather data');
  }
});

export default router;
