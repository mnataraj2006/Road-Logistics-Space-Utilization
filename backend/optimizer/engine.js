import { OPTIMIZER_VERSION } from './constants.js';
import { normalizeAndValidateInput, validatePackageWithinTruck } from './validator.js';
import { OptimizationSolver } from './localSearch.js';
import { SpatialEngine } from './spatialEngine.js';

/**
 * Main domain optimizer pipeline for generating multi-stop truck load plans.
 *
 * Algorithm assumptions & guarantees:
 * 1. Deterministic Heuristic: Given the same input, seed, and configuration, output is 100% deterministic.
 * 2. Multi-Segment Strict Feasibility: No route segment will ever exceed volume or weight limits.
 * 3. Spatial Non-Collision: 3D bounding boxes are verified against physical truck dimensions.
 * 4. Stacking Integrity: Non-stackable and fragile constraints are strictly respected.
 * 5. Explainability: Every assignment and rejection has explicit human-readable reasons.
 *
 * @param {Object} input - Optimization problem specification
 * @returns {Object} Final validated load plan result
 */
export const generateLoadPlan = (input) => {
  const startTime = Date.now();
  const warnings = [];

  // Step 1 & 2: Normalization and Input Validation
  const normalized = normalizeAndValidateInput(input);
  const { truck, route, candidateShipments, invalidShipments, currentLoad, config } = normalized;

  if (invalidShipments.length > 0) {
    for (const inv of invalidShipments) {
      warnings.push(`Shipment ${inv.item.shipmentId} pre-filtered: ${inv.reason}`);
    }
  }

  // Handle edge case: No candidates to allocate
  if (candidateShipments.length === 0) {
    const emptyUtilization = {
      segments: route.stops.slice(0, -1).map((s, idx) => ({
        segmentIndex: idx,
        fromStop: s,
        toStop: route.stops[idx + 1],
        usedVolume: 0,
        usedWeight: 0,
        remainingVolume: truck.capacityVolume,
        remainingWeight: truck.capacityWeight,
        volumeUtilization: 0,
        weightUtilization: 0
      })),
      overallVolumeUtilization: 0,
      overallWeightUtilization: 0,
      peakVolumeUtilization: 0,
      peakWeightUtilization: 0,
      assignedCount: 0
    };

    return {
      loadPlan: {
        truckId: truck.vehicleId,
        routeId: route.routeId,
        optimizerVersion: OPTIMIZER_VERSION,
        generatedAt: new Date(),
        status: 'PROPOSED'
      },
      assignments: [],
      unassignedShipments: invalidShipments.map(inv => ({
        shipmentId: inv.item.shipmentId,
        reason: inv.reason
      })),
      segmentUtilization: emptyUtilization.segments,
      overallVolumeUtilization: 0,
      overallWeightUtilization: 0,
      peakVolumeUtilization: 0,
      peakWeightUtilization: 0,
      objectiveScore: 0,
      constraintsSatisfied: true,
      warnings,
      explanation: 'No valid candidate shipments available for allocation.',
      algorithmVersion: OPTIMIZER_VERSION,
      executionTimeMs: Date.now() - startTime
    };
  }

  // Step 3, 4, 5, 6, 7, 8: Constructive Heuristics & Local Search
  const solver = new OptimizationSolver(truck, route, candidateShipments, currentLoad, config);
  const solution = solver.solve();

  // Final Physical Bounding-Box Verification Pass:
  // Every assignment committed to the solution MUST satisfy the physical truck envelope
  const verifiedAssignments = [];
  const postValidationUnassigned = [];

  for (const assign of solution.assignments) {
    const geoCheck = validatePackageWithinTruck({
      position: assign.position,
      dimensions: assign.dimensions || { dx: assign.dx, dy: assign.dy, dz: assign.dz },
      truckDimensions: truck.dimensions
    });

    if (geoCheck.valid) {
      verifiedAssignments.push(assign);
    } else {
      const violationDetail = geoCheck.violations
        .map(v => `${v.axis} (${v.boundary}): ${v.actual}m > ${v.limit}m (overflow: ${v.overflow}m)`)
        .join('; ');
      postValidationUnassigned.push({
        shipmentId: assign.shipmentId,
        bookingId: assign.bookingId,
        volume: assign.volume,
        weight: assign.weight,
        pickup: assign.pickup,
        delivery: assign.delivery,
        priority: assign.priority,
        reason: `PACKAGE_OUTSIDE_TRUCK_BOUNDARY: ${violationDetail}`,
        bottleneck: null
      });
      warnings.push(`CRITICAL: Shipment ${assign.shipmentId} rejected post-optimization due to physical boundary violation: ${violationDetail}`);
    }
  }

  solution.assignments = verifiedAssignments;

  // Combine invalid shipments with solver unassigned items and boundary rejections
  const allUnassigned = [
    ...invalidShipments.map(inv => ({
      shipmentId: inv.item.shipmentId,
      bookingId: inv.item.bookingId,
      volume: inv.item.volume,
      weight: inv.item.weight,
      pickup: inv.item.pickup,
      delivery: inv.item.delivery,
      priority: inv.item.priority,
      reason: inv.reason,
      bottleneck: null
    })),
    ...solution.unassigned,
    ...postValidationUnassigned
  ];

  // Step 9: Final Feasibility Verification
  const constraintsSatisfied =
    solution.utilReport.peakVolumeUtilization <= 100.0 &&
    solution.utilReport.peakWeightUtilization <= 100.0;

  if (!constraintsSatisfied) {
    warnings.push('CRITICAL: Final load plan exceeded physical capacity limits.');
  }

  // Step 10: Human-Readable Structured Explanation Synthesis
  const explanationLines = [
    `Generated Load Plan via ${OPTIMIZER_VERSION} using ${solution.strategyUsed} heuristic.`,
    `Allocated ${solution.assignments.length} of ${candidateShipments.length + invalidShipments.length} candidate shipments onto truck ${truck.vehicleId} on route ${route.source} ➔ ${route.destination}.`,
    `Space Fill Rates: Volume Avg = ${solution.utilReport.overallVolumeUtilization}% (Peak: ${solution.utilReport.peakVolumeUtilization}%), Weight Avg = ${solution.utilReport.overallWeightUtilization}% (Peak: ${solution.utilReport.peakWeightUtilization}%).`,
    `Objective Score: ${solution.objectiveScore} (Volume: ${solution.scoreBreakdown.volumeScore}, Weight: ${solution.scoreBreakdown.weightScore}, Priority: ${solution.scoreBreakdown.priorityScore}, Obstruction Penalty: -${solution.scoreBreakdown.totalObstructions}).`
  ];

  if (allUnassigned.length > 0) {
    explanationLines.push(`${allUnassigned.length} shipment(s) could not be accommodated due to segment headroom or physical bounds.`);
  }

  // Generate 2D operational representation
  const visualSpatial = new SpatialEngine(truck.dimensions || {});
  for (const a of solution.assignments) {
    visualSpatial.placeBox(a, {
      position: a.position,
      dims: a.dimensions,
      orientation: a.orientation,
      obstructionScore: a.obstructionScore
    });
  }
  const operational2DViews = visualSpatial.generateOperational2DViews(
    route.stops ? route.stops[0] : '',
    route.stops ? route.stops[1] : ''
  );

  return {
    loadPlan: {
      truckId: truck.vehicleId,
      routeId: route.routeId,
      optimizerVersion: OPTIMIZER_VERSION,
      strategyUsed: solution.strategyUsed,
      generatedAt: new Date(),
      status: 'PROPOSED'
    },
    assignments: solution.assignments,
    unassignedShipments: allUnassigned,
    segmentUtilization: solution.utilReport.segments,
    overallVolumeUtilization: solution.utilReport.overallVolumeUtilization,
    overallWeightUtilization: solution.utilReport.overallWeightUtilization,
    peakVolumeUtilization: solution.utilReport.peakVolumeUtilization,
    peakWeightUtilization: solution.utilReport.peakWeightUtilization,
    objectiveScore: solution.objectiveScore,
    scoreBreakdown: solution.scoreBreakdown,
    operational2DViews,
    constraintsSatisfied,
    warnings,
    explanation: explanationLines.join(' '),
    algorithmVersion: OPTIMIZER_VERSION,
    executionTimeMs: Date.now() - startTime
  };
};
