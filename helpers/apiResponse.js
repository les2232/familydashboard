export function sendSuccess(res, { data, source = 'live', statusCode = 200 }) {
  return res.status(statusCode).json({
    success: true,
    data,
    source,
    error: null,
    timestamp: new Date().toISOString()
  });
}

export function getSafeErrorMessage(error, fallbackMessage) {
  if (error.statusCode === 400 || error.statusCode === 503) {
    return error.message;
  }

  return fallbackMessage;
}

export function sendError(res, error, fallbackMessage = 'Request failed') {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    data: null,
    source: 'error',
    error: getSafeErrorMessage(error, fallbackMessage),
    timestamp: new Date().toISOString()
  });
}
