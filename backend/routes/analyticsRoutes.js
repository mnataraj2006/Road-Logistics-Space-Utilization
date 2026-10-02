import express from 'express';
import {
  getLogisticsPerformanceAnalytics,
  getSpaceAndWeightUtilization,
  getAnalyticsTimeSeries
} from '../services/analyticsService.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

/**
 * @desc    Get real-time logistics performance & space analytics calculated from live database state
 * @route   GET /api/analytics/performance
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/performance', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const analytics = await getLogisticsPerformanceAnalytics(req.query);
    res.json({
      success: true,
      data: analytics,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get detailed space & weight utilization breakdown with density discrepancies
 * @route   GET /api/analytics/utilization
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/utilization', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const data = await getSpaceAndWeightUtilization(req.query);
    res.json({
      success: true,
      data,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get chronological time-series aggregations (volume, weight, bookings, revenue)
 * @route   GET /api/analytics/time-series
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/time-series', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const data = await getAnalyticsTimeSeries(req.query);
    res.json({
      success: true,
      data,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get dataset health, referential integrity, and data quality audit report
 * @route   GET /api/analytics/quality
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/quality', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const analytics = await getLogisticsPerformanceAnalytics(req.query);
    res.json({
      success: true,
      data: analytics.dataQuality,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

export default router;
