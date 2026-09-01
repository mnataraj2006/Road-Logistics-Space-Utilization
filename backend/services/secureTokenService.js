import crypto from 'crypto';

const getSecret = () => process.env.TOKEN_SECRET || process.env.JWT_SECRET || 'cargolytics-secure-logistics-key-2026';

/**
 * Encodes an object to Base64URL string.
 */
const base64UrlEncode = (obj) => {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

/**
 * Decodes a Base64URL string to an object.
 */
const base64UrlDecode = (str) => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
};

/**
 * Generates a cryptographically signed, tamper-proof, single-use, trip-bound stop token.
 *
 * @param {Object} params
 * @param {string} params.tripId - Unique Trip ID
 * @param {string} params.vehicleId - Unique Vehicle ID
 * @param {string} params.routeId - Unique Route ID
 * @param {string} params.stopId - Stop ID
 * @param {number} params.sequence - Stop sequence number (1-based)
 * @param {string} params.locationName - Stop location name
 * @param {number} [params.validityHours=48] - Token validity duration in hours
 * @returns {string} Signed token format: "STP-SEC.<base64UrlPayload>.<hmacSignature>"
 */
export const generateSecureStopToken = ({
  tripId,
  vehicleId,
  routeId,
  stopId,
  sequence,
  locationName,
  validityHours = 48
}) => {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + validityHours * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(12).toString('hex');

  const payload = {
    tripId: String(tripId).trim(),
    vehicleId: String(vehicleId || '').trim(),
    routeId: String(routeId).trim(),
    stopId: String(stopId).trim(),
    sequence: Number(sequence),
    locationName: String(locationName || '').trim(),
    issuedAt,
    expiresAt,
    nonce
  };

  const encodedPayload = base64UrlEncode(payload);
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `STP-SEC.${encodedPayload}.${signature}`;
};

/**
 * Validates and decodes a signed stop token.
 * Checks HMAC signature and expiration.
 *
 * @param {string} token - The raw token string
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
export const verifySecureStopToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is missing or not a string.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'STP-SEC') {
    return { valid: false, error: 'Invalid token format. Expected STP-SEC token header.' };
  }

  const [, encodedPayload, signature] = parts;

  // 1. Verify HMAC Signature
  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // Constant time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Cryptographic signature mismatch. Token has been tampered with or forged.' };
  }

  // 2. Decode payload
  let payload;
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch (err) {
    return { valid: false, error: 'Malformed token payload.' };
  }

  // 3. Check expiration
  if (Date.now() > payload.expiresAt) {
    return {
      valid: false,
      error: `Token expired at ${new Date(payload.expiresAt).toISOString()}.`,
      payload
    };
  }

  return { valid: true, payload };
};
