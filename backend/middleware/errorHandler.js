/**
 * Global API Error Handling & Standardized Response Envelope Middleware.
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  });
};

export const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  const isProduction = process.env.NODE_ENV === 'production';

  // Format message
  let message = err.message || 'An internal server error occurred.';
  let errorCode = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 400 ? 'BAD_REQUEST' : 'SERVER_ERROR');

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    message = `Resource not found or invalid identifier format: '${err.value}'`;
    errorCode = 'INVALID_ID_FORMAT';
  }

  // Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(val => val.message).join(', ');
    errorCode = 'VALIDATION_ERROR';
  }

  // Handle MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate field value entered for [${fields}]. Must be unique.`;
    errorCode = 'DUPLICATE_RESOURCE';
  }

  // Handle JSON parse error in body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    message = 'Malformed JSON body in request.';
    errorCode = 'INVALID_JSON_BODY';
  }

  const responsePayload = {
    success: false,
    error: errorCode,
    message,
    correlationId: req.correlationId || 'none',
    timestamp: new Date().toISOString()
  };

  // Only attach stack trace in non-production environments
  if (!isProduction && err.stack) {
    responsePayload.debugStack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
};
