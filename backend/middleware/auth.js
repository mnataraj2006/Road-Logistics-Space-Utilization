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
 * Role-Based Access Control (RBAC) middleware for Two-Role Architecture:
 * 1. 'customer' (Cargo Shipper / Consignor)
 * 2. 'logistics_manager' (Fleet & Operations Supervisor)
 *
 * @param {...string} allowedRoles - e.g. 'logistics_manager', 'customer'
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
    // Canonical mapping for role equivalence
    const canonicalRole = (userRole === 'admin' || userRole === 'carrier')
      ? 'logistics_manager'
      : (userRole === 'shipper')
      ? 'customer'
      : userRole;

    const normalizedAllowed = allowedRoles.map(r => 
      (r === 'admin' || r === 'carrier') ? 'logistics_manager' : (r === 'shipper' ? 'customer' : r)
    );

    if (normalizedAllowed.includes(canonicalRole) || allowedRoles.includes(userRole)) {
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
 * Helper to build multi-tenant scoping filters for database queries.
 * @param {Object} user - Authenticated user from req.user
 * @returns {Object} MongoDB query filter object
 */
export const getTenantFilter = (user) => {
  if (!user) return { _id: null };
  if (user.role === 'logistics_manager' || user.role === 'admin' || user.role === 'carrier') {
    if (user.organizationId) {
      const orgId = user.organizationId._id || user.organizationId;
      return {
        $or: [
          { organizationId: orgId },
          { carrier: user._id },
          { carrierId: user.username },
          { carrierId: orgId.toString() }
        ]
      };
    }
    return {
      $or: [
        { carrier: user._id },
        { carrierId: user.username },
        { carrierId: user.carrierId || user.username }
      ]
    };
  }
  if (user.role === 'customer' || user.role === 'shipper') {
    return {
      $or: [
        { customer: user._id },
        { customerId: user.username },
        { shipper: user._id },
        { shipperId: user.username }
      ]
    };
  }
  return {};
};

/**
 * Enforces resource ownership preventing IDOR (Insecure Direct Object Reference)
 * and cross-tenant leakage across logistics organizations.
 *
 * @param {Function} findDocFn - async function(req) => returns document
 * @param {Object} options
 * @param {string} [options.customerField='customerId'] - Field holding customer username or ID
 */
export const enforceResourceOwnership = (findDocFn, {
  customerField = 'customerId',
  shipperField = 'shipperId'
} = {}) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
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

      // Tenant isolation for Logistics Managers: resource must belong to their organization
      if (['logistics_manager', 'admin', 'carrier'].includes(user.role)) {
        if (user.organizationId && doc.organizationId) {
          const userOrgId = String(user.organizationId._id || user.organizationId);
          const docOrgId = String(doc.organizationId._id || doc.organizationId);
          if (userOrgId !== docOrgId) {
            return res.status(403).json({
              success: false,
              error: 'FORBIDDEN_CROSS_TENANT',
              message: 'Access Denied: You cannot access or modify operational resources belonging to another logistics company.',
              correlationId: req.correlationId
            });
          }
        } else if (doc.carrier && String(doc.carrier) !== String(user._id) && doc.carrierId && doc.carrierId !== user.username) {
          // Fallback legacy carrier check
          if (user.organizationId && String(doc.carrierId) === String(user.organizationId)) {
            // matches organizationId
          } else {
            return res.status(403).json({
              success: false,
              error: 'FORBIDDEN',
              message: 'Access Denied: Resource belongs to another carrier/logistics organization.',
              correlationId: req.correlationId
            });
          }
        }
        req.targetResource = doc;
        return next();
      }

      // For Customer: verify ownership of own shipment / booking
      if (['customer', 'shipper'].includes(user.role)) {
        const docOwner = doc[customerField] || doc[shipperField] || doc.customer || doc.shipper;
        const isOwner =
          String(docOwner) === String(user.username) ||
          String(docOwner) === String(user._id);

        if (!isOwner) {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Access Denied: You do not have permission to view or modify another customer\'s record.',
            correlationId: req.correlationId
          });
        }
      }

      req.targetResource = doc;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'AUTHORIZATION_ERROR',
        message: error.message
      });
    }
  };
};

export const logisticsManagerOnly = authorizeRoles('logistics_manager');
export const customerOnly = authorizeRoles('customer');
export const admin = authorizeRoles('logistics_manager');

