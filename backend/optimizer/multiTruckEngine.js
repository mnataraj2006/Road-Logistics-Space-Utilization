import { normalizeAndValidateInput } from './validator.js';
import { OptimizationSolver } from './localSearch.js';

/**
 * Solves multi-truck fleet allocation for a set of candidate shipments.
 * Sequentially packs trucks to minimize total trucks activated while maximizing fill rates.
 *
 * @param {Object} input
 * @param {Array} input.trucks - List of available trucks
 * @param {Object} input.route - Route specification
 * @param {Array} input.shipments - Candidate shipments to allocate
 * @param {Object} [input.config] - Optimizer configuration
 * @returns {Object} Fleet allocation plan
 */
export const optimizeMultiTruckFleet = (input) => {
  const { trucks = [], route, shipments = [], config = {} } = input;

  if (!Array.isArray(trucks) || trucks.length === 0) {
    throw new Error('Multi-truck optimization requires a non-empty array of trucks.');
  }

  let remainingShipments = [...shipments];
  const truckPlans = [];
  const allExplanations = [];

  // Sort trucks by capacity descending to prioritize larger capacity efficiency
  const sortedTrucks = [...trucks].sort((a, b) => (b.capacityVolume || 0) - (a.capacityVolume || 0));

  for (let tIdx = 0; tIdx < sortedTrucks.length; tIdx++) {
    if (remainingShipments.length === 0) break; // All cargo assigned!

    const currentTruck = sortedTrucks[tIdx];

    const normalized = normalizeAndValidateInput({
      truck: currentTruck,
      route,
      shipments: remainingShipments,
      currentLoad: [],
      config
    });

    if (normalized.candidateShipments.length === 0) {
      continue; // No valid shipments can fit in this truck
    }

    const solver = new OptimizationSolver(
      normalized.truck,
      normalized.route,
      normalized.candidateShipments,
      normalized.currentLoad,
      normalized.config
    );

    const solution = solver.solve();

    if (solution.assignments.length > 0) {
      truckPlans.push({
        truck: normalized.truck,
        assignments: solution.assignments,
        unassigned: solution.unassigned,
        utilization: solution.utilReport,
        objectiveScore: solution.objectiveScore,
        strategyUsed: solution.strategyUsed
      });

      allExplanations.push(
        `Truck ${normalized.truck.vehicleId} assigned ${solution.assignments.length} shipments (Volume Util: ${solution.utilReport.overallVolumeUtilization}%, Weight Util: ${solution.utilReport.overallWeightUtilization}%).`
      );

      // Filter out assigned shipments for the next truck
      const assignedIds = new Set(solution.assignments.map(a => a.shipmentId));
      remainingShipments = remainingShipments.filter(s => {
        const id = s.shipmentId || s.bookingId || s._id;
        return !assignedIds.has(id);
      });
    }
  }

  return {
    trucksActivatedCount: truckPlans.length,
    totalTrucksAvailable: trucks.length,
    truckPlans,
    unassignedShipments: remainingShipments,
    isFullyAssigned: remainingShipments.length === 0,
    explanations: allExplanations
  };
};
