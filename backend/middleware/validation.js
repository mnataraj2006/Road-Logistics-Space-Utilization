import mongoose from 'mongoose';

/**
 * Validates whether a value is a finite positive number.
 */
export const isPositiveFiniteNumber = (val) => {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
};

/**
 * Validates whether a value is a valid non-negative number (>= 0).
 */
export const isNonNegativeNumber = (val) => {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num >= 0;
};

/**
 * Validates valid ISO date string or Date object.
 */
export const isValidDate = (dateVal) => {
  if (!dateVal) return false;
  const d = new Date(dateVal);
  return d instanceof Date && !isNaN(d.getTime());
};

/**
 * Validates MongoDB ObjectId string.
 */
export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Middleware factory for validating request parameters and bodies.
 */
export const validateCapacitySearchRequest = (req, res, next) => {
  const { pickup, delivery, volume, weight, length, width, height, date } = req.body || req.query || {};

  const errors = [];

  if (!pickup || typeof pickup !== 'string' || pickup.trim().length === 0) {
    errors.push({ field: 'pickup', message: 'Pickup stop location is required.' });
  }

  if (!delivery || typeof delivery !== 'string' || delivery.trim().length === 0) {
    errors.push({ field: 'delivery', message: 'Delivery stop location is required.' });
  }

  if (pickup && delivery && String(pickup).trim().toLowerCase() === String(delivery).trim().toLowerCase()) {
    errors.push({ field: 'delivery', message: 'Pickup and delivery stops cannot be the same.' });
  }

  if (!isPositiveFiniteNumber(volume)) {
    errors.push({ field: 'volume', message: 'Volume must be a valid positive finite number (m³).' });
  }

  if (!isPositiveFiniteNumber(weight)) {
    errors.push({ field: 'weight', message: 'Weight must be a valid positive finite number (kg).' });
  }

  if (length != null && length !== '' && !isNonNegativeNumber(length)) {
    errors.push({ field: 'length', message: 'Length must be a non-negative finite number (m).' });
  }

  if (width != null && width !== '' && !isNonNegativeNumber(width)) {
    errors.push({ field: 'width', message: 'Width must be a non-negative finite number (m).' });
  }

  if (height != null && height !== '' && !isNonNegativeNumber(height)) {
    errors.push({ field: 'height', message: 'Height must be a non-negative finite number (m).' });
  }

  if (date && !isValidDate(date)) {
    errors.push({ field: 'date', message: 'Date must be a valid date format.' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Invalid request parameters.',
      errors,
      correlationId: req.correlationId
    });
  }

  next();
};

/**
 * Middleware for validating booking creation requests.
 */
export const validateBookingCreation = (req, res, next) => {
  const { fromStop, toStop, volume, weight } = req.body;

  const errors = [];

  if (!fromStop || typeof fromStop !== 'string') {
    errors.push({ field: 'fromStop', message: 'Origin stop (fromStop) is required.' });
  }

  if (!toStop || typeof toStop !== 'string') {
    errors.push({ field: 'toStop', message: 'Destination stop (toStop) is required.' });
  }

  if (!isPositiveFiniteNumber(volume)) {
    errors.push({ field: 'volume', message: 'Volume must be a valid positive finite number.' });
  }

  if (!isPositiveFiniteNumber(weight)) {
    errors.push({ field: 'weight', message: 'Weight must be a valid positive finite number.' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Invalid booking fields.',
      errors,
      correlationId: req.correlationId
    });
  }

  next();
};
