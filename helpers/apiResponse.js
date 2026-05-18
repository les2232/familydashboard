export function sendSuccess(res, { data, source = 'live', statusCode = 200 }) {
  return res.status(statusCode).json({
    success: true,
    data,
    source,
    error: null,
    timestamp: new Date().toISOString()
  });
}

export function createHttpError(message, { statusCode = 500, code = 'REQUEST_FAILED', details } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

export function getSafeErrorMessage(error, fallbackMessage) {
  if (error.statusCode === 400 || error.statusCode === 503) {
    return error.message;
  }

  return fallbackMessage;
}

export function getSafeErrorCode(error, statusCode) {
  if (error.code) return error.code;
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 403) return 'FORBIDDEN_ORIGIN';
  if (statusCode === 503) return 'INTEGRATION_NOT_CONFIGURED';
  return 'REQUEST_FAILED';
}

export function getSafeErrorDetails(error) {
  if (!error.details || typeof error.details !== 'object') {
    return undefined;
  }

  return error.details;
}

export function sendError(res, error, fallbackMessage = 'Request failed') {
  const statusCode = error.statusCode || 500;
  const body = {
    success: false,
    data: null,
    source: 'error',
    error: getSafeErrorMessage(error, fallbackMessage),
    code: getSafeErrorCode(error, statusCode),
    timestamp: new Date().toISOString()
  };

  const details = getSafeErrorDetails(error);
  if (details) body.details = details;

  return res.status(statusCode).json(body);
}
