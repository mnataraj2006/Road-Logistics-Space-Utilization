import express from 'express';
import {
  queryAuditLedger,
  getShipmentLifecycleTrace,
  getUnallocatedCargoExplanations
} from '../services/auditService.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

/**
 * @desc    Query the tamper-proof audit ledger
 * @route   GET /api/audit/events
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/events', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const { entityType, eventType, tripId, entityId, startDate, endDate, limit, page } = req.query;
    const result = await queryAuditLedger({
      entityType,
      eventType,
      tripId,
      entityId,
      startDate,
      endDate,
      limit: parseInt(limit) || 50,
      page: parseInt(page) || 1
    });

    res.json({
      success: true,
      data: result,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get complete chronological lifecycle audit trace for a shipment/booking
 * @route   GET /api/audit/trace/:identifier
 * @access  Private
 */
router.get('/trace/:identifier', protect, async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const events = await getShipmentLifecycleTrace(identifier);

    res.json({
      success: true,
      identifier,
      eventCount: events.length,
      events,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get unallocated cargo explanations and constraint violation reasons
 * @route   GET /api/audit/unallocated
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/unallocated', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const { shipmentId, tripId } = req.query;
    const unallocated = await getUnallocatedCargoExplanations({ shipmentId, tripId });

    res.json({
      success: true,
      count: unallocated.length,
      unallocatedShipments: unallocated,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

export default router;
