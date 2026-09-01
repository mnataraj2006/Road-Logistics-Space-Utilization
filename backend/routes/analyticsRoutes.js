import express from 'express';
import { getLogisticsPerformanceAnalytics } from '../services/analyticsService.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

/**
 * @desc    Get real-time logistics performance analytics calculated from live database state
 * @route   GET /api/analytics/performance
 * @access  Private (Logistics Manager / Admin)
 */
router.get('/performance', protect, authorizeRoles('logistics_manager', 'admin'), async (req, res, next) => {
  try {
    const analytics = await getLogisticsPerformanceAnalytics();
    res.json({
      success: true,
      data: analytics,
      correlationId: req.correlationId
    });
  } catch (error) {
    next(error);
  }
});

export default router;
