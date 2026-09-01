import express from 'express';
import {
  calculateDeterministicPrice,
  DEFAULT_PRICING_CONFIG,
  PRICING_RULE_VERSION
} from '../services/pricingService.js';

const router = express.Router();

/**
 * @desc    Generate deterministic pricing quote with auditable breakdown
 * @route   POST /api/pricing/quote
 * @access  Public
 */
router.post('/quote', (req, res) => {
  try {
    const result = calculateDeterministicPrice(req.body);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Pricing quote error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to calculate deterministic price.'
    });
  }
});

/**
 * @desc    Get active pricing rules and configuration schema
 * @route   GET /api/pricing/rules
 * @access  Public
 */
router.get('/rules', (req, res) => {
  res.json({
    success: true,
    version: PRICING_RULE_VERSION,
    rules: DEFAULT_PRICING_CONFIG,
    explanation: 'Deterministic pricing rules based on distance, volume, weight, cargo type, service tier, and segment capacity occupancy.'
  });
});

export default router;
