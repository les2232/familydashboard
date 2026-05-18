import express from 'express';
import { getTasks } from '../services/tasksService.js';
import { sendError, sendSuccess } from '../helpers/apiResponse.js';

const router = express.Router();

router.get('/tasks', async (req, res) => {
  try {
    const result = await getTasks();
    sendSuccess(res, { data: result.data, source: result.source });
  } catch (error) {
    console.error('Tasks API error:', error);
    sendError(res, error, 'Failed to fetch tasks data');
  }
});

export default router;
