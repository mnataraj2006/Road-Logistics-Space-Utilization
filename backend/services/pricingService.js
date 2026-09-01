/**
 * Deterministic Pricing Domain Service for Road Logistics Space Utilization.
 *
 * Rules & Invariants:
 * 1. 100% Deterministic & Reproducible: Identical input arguments always produce the exact same price.
 * 2. Transparent & Auditable: Every price calculation returns the full breakdown and active rule version.
 * 3. Configurable Rules: Rates, truck type factors, service multipliers, and utilization incentives are explicit.
 * 4. Zero ML/Random Fabrication: Price is strictly derived from verified physical, route, and commercial attributes.
 */

export const PRICING_RULE_VERSION = 'PRICING-RULE-v2.1.0-DETERMINISTIC';

export const DEFAULT_PRICING_CONFIG = {
  currency: 'INR',
  baseConsignmentFee: 500, // INR fixed dispatch handling fee
  baseRatePerKm: 3.5,      // INR per route km
  baseRatePerCbmKm: 0.85,  // INR per m³·km
  baseRatePerKgKm: 0.0035, // INR per kg·km

  truckTypeMultipliers: {
    'Container Truck': 1.0,
    'Heavy Truck': 1.05,
    '32 ft Truck': 1.0,
    '20 ft Truck': 0.95,
    '17 ft Truck': 0.90,
    '14 ft Truck': 0.85,
    'Medium Truck': 0.90,
    'Light Van': 0.75,
    'Pickup Truck': 0.70,
    'Mini Truck': 0.65,
    'Other': 1.0
  },

  cargoTypeSurcharges: {
    'STANDARD': 0.0,
    'FRAGILE': 0.15,     // +15% delicate cargo handling
    'HAZMAT': 0.30,      // +30% hazardous safety protocols
    'PERISHABLE': 0.20   // +20% thermal/expedited handling
  },

  serviceLevelMultipliers: {
    'STANDARD': 1.0,
    'EXPRESS': 1.25,     // +25% expedited routing
    'URGENT': 1.50       // +50% immediate dedicated priority
  },

  utilizationIncentives: {
    lowUtilizationThreshold: 40.0,   // <= 40% occupancy qualifies for discount
    lowUtilizationDiscount: 0.10,    // -10% backhaul space fill discount
    highUtilizationThreshold: 85.0,  // >= 85% occupancy incurs peak surcharge
    highUtilizationSurcharge: 0.10   // +10% tight capacity demand surcharge
  },

  minimumConsignmentPrice: 800 // Minimum floor price for any commercial booking
};

const round2 = (val) => Math.round((Number(val) + Number.EPSILON) * 100) / 100;

/**
 * Calculates deterministic price for shipment booking on road transport segments.
 *
 * @param {Object} params
 * @param {number} params.distanceKm - Route distance in kilometers
 * @param {number} params.volume - Cargo volume in m³
 * @param {number} params.weight - Cargo weight in kg
 * @param {string} [params.cargoType='STANDARD'] - Cargo handling type ('STANDARD', 'FRAGILE', 'HAZMAT', 'PERISHABLE')
 * @param {string} [params.serviceLevel='STANDARD'] - Requested service tier ('STANDARD', 'EXPRESS', 'URGENT')
 * @param {string} [params.priority='STANDARD'] - Alias for serviceLevel
 * @param {string} [params.truckType='Container Truck'] - Vehicle classification
 * @param {number} [params.segmentUtilization=50] - Current average route segment capacity occupancy percentage (0-100)
 * @param {number} [params.demandFactor=1.0] - Regional market demand factor (e.g. 1.0 standard, 1.15 seasonal peak)
 * @param {number} [params.underutilizationIncentive=null] - Optional manual override for space incentive
 * @param {Object} [customConfig] - Optional override config rules
 * @returns {Object} Deterministic pricing statement
 */
export const calculateDeterministicPrice = (params = {}, customConfig = {}) => {
  const config = { ...DEFAULT_PRICING_CONFIG, ...customConfig };

  const distanceKm = Math.max(1, Number(params.distanceKm || params.routeDistance || 100));
  const volume = Math.max(0.01, Number(params.volume || 1));
  const weight = Math.max(0.1, Number(params.weight || 100));

  const cargoType = String(params.cargoType || (params.fragile ? 'FRAGILE' : 'STANDARD')).toUpperCase();
  const serviceLevel = String(params.serviceLevel || params.priority || 'STANDARD').toUpperCase();
  const truckType = params.truckType || 'Container Truck';
  const segmentUtil = Number(params.segmentUtilization != null ? params.segmentUtilization : 50);
  const demandFactor = Math.max(0.5, Number(params.demandFactor || 1.0));

  // 1. Truck Type Factor
  const truckFactor = config.truckTypeMultipliers[truckType] || 1.0;

  // 2. Base Components
  const baseConsignmentCharge = round2(config.baseConsignmentFee * truckFactor);
  const distanceCharge = round2(distanceKm * config.baseRatePerKm * truckFactor);
  const volumeCharge = round2(volume * distanceKm * config.baseRatePerCbmKm);
  const weightCharge = round2(weight * distanceKm * config.baseRatePerKgKm);

  const subtotal = round2(baseConsignmentCharge + distanceCharge + volumeCharge + weightCharge);

  // 3. Applied Adjustments
  const appliedAdjustments = [];
  let adjustmentTotal = 0;

  // (A) Cargo Type Surcharge
  const cargoSurchargeRate = config.cargoTypeSurcharges[cargoType] || 0;
  if (cargoSurchargeRate > 0) {
    const amount = round2(subtotal * cargoSurchargeRate);
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: `CARGO_${cargoType}_SURCHARGE`,
      name: `${cargoType} Cargo Handling (+${Math.round(cargoSurchargeRate * 100)}%)`,
      type: 'SURCHARGE',
      ratePercent: Math.round(cargoSurchargeRate * 100),
      amount,
      explanation: `${Math.round(cargoSurchargeRate * 100)}% handling fee for ${cargoType} cargo requirements.`
    });
  }

  // (B) Service Level Multiplier (EXPRESS / URGENT)
  const serviceMultiplier = config.serviceLevelMultipliers[serviceLevel] || 1.0;
  if (serviceMultiplier > 1.0) {
    const rate = serviceMultiplier - 1.0;
    const amount = round2(subtotal * rate);
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: `SERVICE_${serviceLevel}_SURCHARGE`,
      name: `${serviceLevel} Service Tier (+${Math.round(rate * 100)}%)`,
      type: 'SURCHARGE',
      ratePercent: Math.round(rate * 100),
      amount,
      explanation: `${Math.round(rate * 100)}% premium for ${serviceLevel} prioritized routing and dispatch.`
    });
  }

  // (C) Route Segment Utilization Dynamic Incentive / Surcharge
  if (params.underutilizationIncentive != null) {
    const amount = round2(-Math.abs(Number(params.underutilizationIncentive)));
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: 'MANUAL_SPACE_UTILIZATION_INCENTIVE',
      name: 'Approved Space Fill Incentive',
      type: 'DISCOUNT',
      amount,
      explanation: 'Authorized commercial capacity discount.'
    });
  } else if (segmentUtil <= config.utilizationIncentives.lowUtilizationThreshold) {
    const discountRate = config.utilizationIncentives.lowUtilizationDiscount;
    const amount = round2(-subtotal * discountRate);
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: 'BACKHAUL_UTILIZATION_DISCOUNT',
      name: `Backhaul Space Fill Discount (-${Math.round(discountRate * 100)}%)`,
      type: 'DISCOUNT',
      ratePercent: -Math.round(discountRate * 100),
      amount,
      explanation: `Applied ${Math.round(discountRate * 100)}% space incentive because segment occupancy is only ${segmentUtil.toFixed(1)}%.`
    });
  } else if (segmentUtil >= config.utilizationIncentives.highUtilizationThreshold) {
    const surchargeRate = config.utilizationIncentives.highUtilizationSurcharge;
    const amount = round2(subtotal * surchargeRate);
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: 'PEAK_UTILIZATION_SURCHARGE',
      name: `Peak Capacity Surcharge (+${Math.round(surchargeRate * 100)}%)`,
      type: 'SURCHARGE',
      ratePercent: Math.round(surchargeRate * 100),
      amount,
      explanation: `Applied ${Math.round(surchargeRate * 100)}% high-demand surcharge because segment occupancy is ${segmentUtil.toFixed(1)}%.`
    });
  }

  // (D) Seasonal Demand Factor
  if (demandFactor !== 1.0) {
    const demandDelta = demandFactor - 1.0;
    const amount = round2(subtotal * demandDelta);
    adjustmentTotal += amount;
    appliedAdjustments.push({
      code: demandDelta > 0 ? 'PEAK_DEMAND_ADJUSTMENT' : 'OFF_PEAK_DEMAND_DISCOUNT',
      name: `Demand Factor Adjustment (${demandFactor}x)`,
      type: demandDelta > 0 ? 'SURCHARGE' : 'DISCOUNT',
      ratePercent: Math.round(demandDelta * 100),
      amount,
      explanation: `Market demand index ${demandFactor}x applied.`
    });
  }

  // 4. Calculate Final Price
  let finalPrice = round2(subtotal + adjustmentTotal);
  if (finalPrice < config.minimumConsignmentPrice) {
    const minAdjustment = round2(config.minimumConsignmentPrice - finalPrice);
    appliedAdjustments.push({
      code: 'MINIMUM_CONSIGNMENT_FLOOR_ADJUSTMENT',
      name: 'Minimum Consignment Floor',
      type: 'SURCHARGE',
      amount: minAdjustment,
      explanation: `Adjusted to minimum baseline price of ₹${config.minimumConsignmentPrice}.`
    });
    finalPrice = config.minimumConsignmentPrice;
  }

  return {
    pricingRuleVersion: PRICING_RULE_VERSION,
    currency: config.currency,
    basePrice: subtotal,
    subtotal,
    appliedAdjustments,
    finalPrice,
    breakdown: {
      baseConsignmentCharge,
      distanceCharge,
      volumeCharge,
      weightCharge,
      distanceKm,
      volumeCbm: volume,
      weightKg: weight,
      truckType,
      cargoType,
      serviceLevel,
      segmentUtilization: segmentUtil,
      demandFactor
    },
    isDeterministic: true,
    calculatedAt: new Date().toISOString()
  };
};
