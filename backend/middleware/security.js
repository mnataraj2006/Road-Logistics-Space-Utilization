import crypto from 'crypto';

// In-memory rate limiting bucket store
const rateLimitBuckets = new Map();

// Periodic cleanup of stale rate-limit buckets (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitBuckets.entries()) {
    if (now - record.windowStart > record.windowMs) {
      rateLimitBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Attaches unique correlation ID and defensive security headers.
 */
export const securityHeadersAndCorrelation = (req, res, next) => {
  // 1. Generate or forward correlation ID
  const correlationId = req.headers['x-correlation-id'] || `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  // 2. Production Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  next();
};

/**
 * Sanitizes request body and query objects against NoSQL injection attempts ($ operators).
 */
export const sanitizeInput = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);

    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      // Strip keys starting with $ or containing dots to prevent MongoDB operator injection
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      if (value && typeof value === 'object') {
        clean[key] = sanitizeObject(value);
      } else if (typeof value === 'string') {
        // Strip null bytes and extreme unicode control characters
        clean[key] = value.replace(/\0/g, '').trim();
      } else {
        clean[key] = value;
      }
    }
    return clean;
  };

  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);

  next();
};

/**
 * Creates rate limiter middleware.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum allowed requests in window
 * @param {string} options.message - Error response message
 */
export const rateLimit = ({
  windowMs = 60 * 1000,
  max = 60,
  message = 'Too many requests, please slow down.'
} = {}) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitBuckets.get(key);
    if (!record || now - record.windowStart > windowMs) {
      record = { windowStart: now, count: 1, windowMs };
      rateLimitBuckets.set(key, record);
    } else {
      record.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds: Math.ceil((record.windowStart + windowMs - now) / 1000),
        correlationId: req.correlationId
      });
    }

    next();
  };
};
