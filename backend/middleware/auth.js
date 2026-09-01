import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Verifies JWT bearer authentication token and sets req.user.
 */
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const secret = process.env.JWT_SECRET || 'road_logistics_secret_dev_key_2026';
      const decoded = jwt.verify(token, secret);

      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Not authorized: User not found.',
          correlationId: req.correlationId
        });
      }

      return next();
    } catch (error) {
      const isExpired = error.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        error: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Session expired. Please log in again.' : 'Invalid authentication token.',
        correlationId: req.correlationId
      });
    }
  }

  return res.status(401).json({
    success: false,
    error: 'TOKEN_MISSING',
    message: 'Authentication required. No Bearer token provided.',
    correlationId: req.correlationId
  });
};

/**
 * Role-Based Access Control (RBAC) middleware.
 *
 * @param {...string} allowedRoles - e.g. 'logistics_manager', 'admin', 'carrier', 'shipper'
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
        correlationId: req.correlationId
      });
    }

    const userRole = req.user.role;
    // Admins always have full supervisor access
    if (userRole === 'admin' || allowedRoles.includes(userRole)) {
      return next();
    }

    // Role alias equivalence: customer <-> shipper
    if (
      (allowedRoles.includes('customer') && userRole === 'shipper') ||
      (allowedRoles.includes('shipper') && userRole === 'customer')
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: `Access denied. Role '${userRole}' is not authorized to perform this operation. Required: [${allowedRoles.join(', ')}].`,
      correlationId: req.correlationId
    });
  };
};

/**
 * Enforces resource ownership preventing IDOR (Insecure Direct Object Reference).
 *
 * @param {Function} findDocFn - async function(req) => returns document
 * @param {Object} options
 * @param {string} [options.shipperField='shipperId'] - Field holding shipper username or ID
 * @param {string} [options.carrierField='carrierId'] - Field holding carrier ID
 */
export const enforceResourceOwnership = (findDocFn, {
  shipperField = 'shipperId',
  carrierField = 'carrierId'
} = {}) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // Admins and Logistics Managers have global operational oversight
      if (['admin', 'logistics_manager'].includes(user.role)) {
        return next();
      }

      const doc = await findDocFn(req);
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Requested resource not found.',
          correlationId: req.correlationId
        });
      }

      // For Shipper / Customer: verify ownership
      if (['shipper', 'customer'].includes(user.role)) {
        const docShipper = doc[shipperField] || doc.shipper || doc.customer;
        const isOwner =
          String(docShipper) === String(user.username) ||
          String(docShipper) === String(user._id);

        if (!isOwner) {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Access Denied: You do not have permission to view or modify another customer\'s record.',
            correlationId: req.correlationId
          });
        }
      }

      // For Carrier: verify vehicle / trip assignment
      if (user.role === 'carrier') {
        const docCarrier = doc[carrierField] || doc.carrier;
        const isCarrierOwner =
          String(docCarrier) === String(user.carrierId) ||
          String(docCarrier) === String(user.username) ||
          String(docCarrier) === String(user._id);

        if (!isCarrierOwner) {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Access Denied: You do not have permission to view or modify another carrier\'s record.',
            correlationId: req.correlationId
          });
        }
      }

      req.targetResource = doc;
      next();
    } catch (error) {
      console.error('enforceResourceOwnership error:', error);
      res.status(500).json({ success: false, message: 'Failed to verify resource authorization.' });
    }
  };
};

export const admin = authorizeRoles('admin');
