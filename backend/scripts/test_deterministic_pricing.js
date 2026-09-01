import {
  calculateDeterministicPrice,
  DEFAULT_PRICING_CONFIG,
  PRICING_RULE_VERSION
} from '../services/pricingService.js';

const runDeterministicPricingTestSuite = () => {
  console.log('\n===============================================================');
  console.log('STARTING DETERMINISTIC PRICING DOMAIN SERVICE TEST SUITE');
  console.log('===============================================================');

  // ── TEST 1: 100% DETERMINISM & REPRODUCIBILITY (100 RUNS) ─────
  console.log('\n[TEST 1] Testing 100% Determinism Across 100 Invocations...');
  const baseInput = {
    distanceKm: 350,
    volume: 12.5,
    weight: 2400,
    cargoType: 'STANDARD',
    serviceLevel: 'STANDARD',
    truckType: 'Container Truck',
    segmentUtilization: 65,
    demandFactor: 1.0
  };

  const initialRun = calculateDeterministicPrice(baseInput);
  for (let i = 0; i < 100; i++) {
    const iterRun = calculateDeterministicPrice(baseInput);
    if (
      iterRun.finalPrice !== initialRun.finalPrice ||
      iterRun.subtotal !== initialRun.subtotal ||
      iterRun.basePrice !== initialRun.basePrice
    ) {
      throw new Error(`Test 1 Failed: Non-deterministic fluctuation detected at iteration ${i}! Initial: ${initialRun.finalPrice}, Iter: ${iterRun.finalPrice}`);
    }
  }
  console.log(`✅ TEST 1 PASSED: Exact reproducibility verified across 100 runs. Output price: ₹${initialRun.finalPrice}`);

  // ── TEST 2: MATHEMATICAL FORMULA DECOMPOSITION ────────────────
  console.log('\n[TEST 2] Verifying Mathematical Formula Component Decomposition...');
  const input2 = {
    distanceKm: 200,
    volume: 10,
    weight: 1000,
    cargoType: 'STANDARD',
    serviceLevel: 'STANDARD',
    truckType: 'Container Truck',
    segmentUtilization: 60,
    demandFactor: 1.0
  };
  const res2 = calculateDeterministicPrice(input2);

  // Expected calculations:
  // Base Consignment = 500 * 1.0 = 500
  // Distance = 200 * 3.5 * 1.0 = 700
  // Volume = 10 * 200 * 0.85 = 1700
  // Weight = 1000 * 200 * 0.0035 = 700
  // Subtotal = 500 + 700 + 1700 + 700 = 3600
  if (res2.breakdown.baseConsignmentCharge !== 500) throw new Error('Test 2 Failed: Base consignment charge mismatch');
  if (res2.breakdown.distanceCharge !== 700) throw new Error('Test 2 Failed: Distance charge mismatch');
  if (res2.breakdown.volumeCharge !== 1700) throw new Error('Test 2 Failed: Volume charge mismatch');
  if (res2.breakdown.weightCharge !== 700) throw new Error('Test 2 Failed: Weight charge mismatch');
  if (res2.subtotal !== 3600 || res2.finalPrice !== 3600) throw new Error('Test 2 Failed: Subtotal or final price mismatch');
  console.log('✅ TEST 2 PASSED: Decomposed components match mathematical formulation (Subtotal = ₹3,600).');

  // ── TEST 3: TRUCK TYPE MULTIPLIERS ───────────────────────────
  console.log('\n[TEST 3] Testing Truck Type Multipliers (Container vs Heavy vs Light Van)...');
  const resContainer = calculateDeterministicPrice({ ...input2, truckType: 'Container Truck' });
  const resHeavy = calculateDeterministicPrice({ ...input2, truckType: 'Heavy Truck' }); // 1.05x on base & dist
  const resLightVan = calculateDeterministicPrice({ ...input2, truckType: 'Light Van' });  // 0.75x on base & dist

  if (resHeavy.breakdown.baseConsignmentCharge !== 525) throw new Error('Test 3 Failed: Heavy truck base charge mismatch');
  if (resLightVan.breakdown.baseConsignmentCharge !== 375) throw new Error('Test 3 Failed: Light van base charge mismatch');
  if (resHeavy.finalPrice <= resContainer.finalPrice || resLightVan.finalPrice >= resContainer.finalPrice) {
    throw new Error('Test 3 Failed: Truck type ordering failed');
  }
  console.log(`✅ TEST 3 PASSED: Container = ₹${resContainer.finalPrice}, Heavy (1.05x) = ₹${resHeavy.finalPrice}, Light Van (0.75x) = ₹${resLightVan.finalPrice}.`);

  // ── TEST 4: CARGO HANDLING SURCHARGES (FRAGILE / HAZMAT) ─────
  console.log('\n[TEST 4] Testing Cargo Handling Surcharges (Fragile +15%, HAZMAT +30%)...');
  const resStd = calculateDeterministicPrice(input2);
  const resFragile = calculateDeterministicPrice({ ...input2, cargoType: 'FRAGILE' });
  const resHazmat = calculateDeterministicPrice({ ...input2, cargoType: 'HAZMAT' });

  // Fragile: Subtotal 3600 + 15% (540) = 4140
  // HAZMAT: Subtotal 3600 + 30% (1080) = 4680
  if (resFragile.finalPrice !== 4140) throw new Error(`Test 4 Failed: Fragile price ${resFragile.finalPrice} != 4140`);
  if (resHazmat.finalPrice !== 4680) throw new Error(`Test 4 Failed: HAZMAT price ${resHazmat.finalPrice} != 4680`);

  const fragileAdj = resFragile.appliedAdjustments.find(a => a.code === 'CARGO_FRAGILE_SURCHARGE');
  if (!fragileAdj || fragileAdj.amount !== 540) throw new Error('Test 4 Failed: Fragile adjustment missing or incorrect');
  console.log(`✅ TEST 4 PASSED: Standard = ₹${resStd.finalPrice}, Fragile (+15%) = ₹${resFragile.finalPrice}, HAZMAT (+30%) = ₹${resHazmat.finalPrice}.`);

  // ── TEST 5: SERVICE TIER MULTIPLIERS (EXPRESS & URGENT) ──────
  console.log('\n[TEST 5] Testing Service Tier Multipliers (Express +25%, Urgent +50%)...');
  const resExpress = calculateDeterministicPrice({ ...input2, serviceLevel: 'EXPRESS' });
  const resUrgent = calculateDeterministicPrice({ ...input2, serviceLevel: 'URGENT' });

  // Express: Subtotal 3600 + 25% (900) = 4500
  // Urgent: Subtotal 3600 + 50% (1800) = 5400
  if (resExpress.finalPrice !== 4500) throw new Error(`Test 5 Failed: Express price ${resExpress.finalPrice} != 4500`);
  if (resUrgent.finalPrice !== 5400) throw new Error(`Test 5 Failed: Urgent price ${resUrgent.finalPrice} != 5400`);
  console.log(`✅ TEST 5 PASSED: Standard = ₹${resStd.finalPrice}, Express (+25%) = ₹${resExpress.finalPrice}, Urgent (+50%) = ₹${resUrgent.finalPrice}.`);

  // ── TEST 6: CAPACITY UTILIZATION INCENTIVE & SURCHARGE ───────
  console.log('\n[TEST 6] Testing Segment Utilization Dynamic Incentive (-10% backhaul vs +10% peak)...');
  const resLowUtil = calculateDeterministicPrice({ ...input2, segmentUtilization: 30 }); // <= 40% -> -10% discount
  const resPeakUtil = calculateDeterministicPrice({ ...input2, segmentUtilization: 90 }); // >= 85% -> +10% surcharge

  // Low Util: Subtotal 3600 - 10% (-360) = 3240
  // Peak Util: Subtotal 3600 + 10% (+360) = 3960
  if (resLowUtil.finalPrice !== 3240) throw new Error(`Test 6 Failed: Backhaul discount ${resLowUtil.finalPrice} != 3240`);
  if (resPeakUtil.finalPrice !== 3960) throw new Error(`Test 6 Failed: Peak surcharge ${resPeakUtil.finalPrice} != 3960`);

  const discountAdj = resLowUtil.appliedAdjustments.find(a => a.code === 'BACKHAUL_UTILIZATION_DISCOUNT');
  if (!discountAdj || discountAdj.amount !== -360) throw new Error('Test 6 Failed: Backhaul adjustment missing');
  console.log(`✅ TEST 6 PASSED: Low Util 30% (-10% Backhaul) = ₹${resLowUtil.finalPrice}, Peak Util 90% (+10% Surcharge) = ₹${resPeakUtil.finalPrice}.`);

  // ── TEST 7: REGIONAL MARKET DEMAND FACTOR ─────────────────────
  console.log('\n[TEST 7] Testing Regional Demand Factor Multiplier (0.90x vs 1.15x)...');
  const resOffPeak = calculateDeterministicPrice({ ...input2, demandFactor: 0.90 }); // -10%
  const resPeakSeason = calculateDeterministicPrice({ ...input2, demandFactor: 1.15 }); // +15%

  if (resOffPeak.finalPrice !== 3240) throw new Error(`Test 7 Failed: Off-peak price ${resOffPeak.finalPrice} != 3240`);
  if (resPeakSeason.finalPrice !== 4140) throw new Error(`Test 7 Failed: Peak season price ${resPeakSeason.finalPrice} != 4140`);
  console.log(`✅ TEST 7 PASSED: Off-peak (0.9x) = ₹${resOffPeak.finalPrice}, Peak Season (1.15x) = ₹${resPeakSeason.finalPrice}.`);

  // ── TEST 8: MINIMUM CONSIGNMENT FLOOR PRICE ───────────────────
  console.log('\n[TEST 8] Testing Minimum Consignment Price Floor (Floor = ₹800)...');
  const tinyInput = {
    distanceKm: 5,
    volume: 0.05,
    weight: 2,
    cargoType: 'STANDARD',
    serviceLevel: 'STANDARD'
  };
  const resTiny = calculateDeterministicPrice(tinyInput);
  if (resTiny.finalPrice !== 800) {
    throw new Error(`Test 8 Failed: Tiny shipment did not enforce ₹800 floor! Got: ₹${resTiny.finalPrice}`);
  }
  const floorAdj = resTiny.appliedAdjustments.find(a => a.code === 'MINIMUM_CONSIGNMENT_FLOOR_ADJUSTMENT');
  if (!floorAdj) throw new Error('Test 8 Failed: Floor adjustment missing in adjustment breakdown');
  console.log(`✅ TEST 8 PASSED: Tiny shipment automatically adjusted to minimum floor ₹${resTiny.finalPrice}.`);

  // ── TEST 9: RULE VERSIONING & AUDIT METADATA ──────────────────
  console.log('\n[TEST 9] Testing Pricing Rule Versioning & Audit Metadata...');
  if (resStd.pricingRuleVersion !== PRICING_RULE_VERSION) {
    throw new Error('Test 9 Failed: Pricing rule version mismatch');
  }
  if (!resStd.isDeterministic || !resStd.calculatedAt || !resStd.currency) {
    throw new Error('Test 9 Failed: Metadata attributes missing');
  }
  console.log(`✅ TEST 9 PASSED: Active pricing rule version: '${resStd.pricingRuleVersion}', currency: '${resStd.currency}'.`);

  // ── TEST 10: COMPLEX COMBINED SCENARIO WITH EXPLANATIONS ──────
  console.log('\n[TEST 10] Testing Complex Multi-Constraint Pricing Calculation...');
  const complexInput = {
    distanceKm: 480,
    volume: 8.5,
    weight: 1800,
    cargoType: 'FRAGILE',           // +15%
    serviceLevel: 'EXPRESS',        // +25%
    truckType: 'Container Truck',   // 1.0x
    segmentUtilization: 35,         // -10% Backhaul
    demandFactor: 1.10              // +10% Peak demand
  };

  const complexRes = calculateDeterministicPrice(complexInput);
  console.log('\n--- DETERMINISTIC PRICING QUOTE BREAKDOWN ---');
  console.log(`Base Price (Subtotal): ₹${complexRes.subtotal}`);
  console.log('Applied Adjustments:');
  for (const adj of complexRes.appliedAdjustments) {
    console.log(`  - [${adj.type}] ${adj.name}: ₹${adj.amount} (${adj.explanation})`);
  }
  console.log(`Final Certified Price: ₹${complexRes.finalPrice} ${complexRes.currency}`);
  console.log(`Pricing Rule Version: ${complexRes.pricingRuleVersion}`);
  console.log('---------------------------------------------');

  if (complexRes.appliedAdjustments.length !== 4) {
    throw new Error(`Test 10 Failed: Expected 4 applied adjustments, got ${complexRes.appliedAdjustments.length}`);
  }
  console.log('✅ TEST 10 PASSED: Complex multi-adjustment pricing computed with complete explanation.');

  console.log('\n===============================================================');
  console.log('🎉 ALL 10 DETERMINISTIC PRICING TESTS PASSED (100%)');
  console.log('===============================================================');
};

runDeterministicPricingTestSuite();
