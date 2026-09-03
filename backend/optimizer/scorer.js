import { DEFAULT_OBJECTIVE_WEIGHTS } from './constants.js';

/**
 * Calculates a standardized, multi-objective score for an optimization solution.
 *
 * @param {Object} params
 * @param {Object} params.utilizationReport - Output from SegmentTracker
 * @param {Array} params.assignments - Placed shipment assignments with spatial and obstruction metrics
 * @param {Array} params.unassignedShipments - Shipments that could not be assigned
 * @param {Object} [params.customWeights] - Configurable objective weights
 * @returns {Object} Score breakdown and overall scalar objective score
 */
export const calculateObjectiveScore = ({
  utilizationReport,
  assignments,
  unassignedShipments,
  customWeights = {}
}) => {
  const weights = { ...DEFAULT_OBJECTIVE_WEIGHTS, ...customWeights };

  // If no assignments were placed, score is 0
  if (!assignments || assignments.length === 0) {
    return {
      totalScore: 0,
      breakdown: {
        volumeScore: 0,
        weightScore: 0,
        priorityScore: 0,
        accessibilityScore: 0,
        wastedPenalty: 0,
        totalObstructions: 0
      }
    };
  }

  const volUtil = utilizationReport.overallVolumeUtilization; // 0 - 100
  const wtUtil = utilizationReport.overallWeightUtilization;   // 0 - 100

  // 1. Volume & Weight score
  const volumeScore = (volUtil / 100) * weights.volumeUtilization;
  const weightScore = (wtUtil / 100) * weights.weightUtilization;

  // 2. Priority Satisfaction (Ratio of priority weight fulfilled)
  let totalPriorityRequested = 0;
  let totalPriorityAssigned = 0;

  for (const a of assignments) {
    totalPriorityAssigned += a.priorityWeight || 100;
    totalPriorityRequested += a.priorityWeight || 100;
  }
  for (const u of unassignedShipments) {
    totalPriorityRequested += u.priorityWeight || 100;
  }

  const priorityRatio = totalPriorityRequested > 0 ? totalPriorityAssigned / totalPriorityRequested : 1.0;
  const priorityScore = priorityRatio * weights.prioritySatisfaction;

  // 3. Delivery Accessibility & Obstruction Penalty
  let totalObstructions = 0;
  for (const a of assignments) {
    totalObstructions += a.obstructionScore || 0;
  }
  const accessibilityScore = Math.max(0, weights.deliveryAccessibility - totalObstructions * 2.0);

  // 4. Wasted Space / Peak Imbalance Penalty
  const peakDiff = Math.abs(utilizationReport.peakVolumeUtilization - utilizationReport.overallVolumeUtilization);
  const wastedPenalty = (peakDiff / 100) * weights.wastedSpacePenalty;

  // Overall Score (0 - 100 scale baseline, can scale up with priority count)
  const totalScore = parseFloat(
    (volumeScore + weightScore + priorityScore + accessibilityScore - wastedPenalty).toFixed(2)
  );

  return {
    totalScore,
    breakdown: {
      volumeScore: parseFloat(volumeScore.toFixed(2)),
      weightScore: parseFloat(weightScore.toFixed(2)),
      priorityScore: parseFloat(priorityScore.toFixed(2)),
      accessibilityScore: parseFloat(accessibilityScore.toFixed(2)),
      wastedPenalty: parseFloat(wastedPenalty.toFixed(2)),
      totalObstructions
    }
  };
};
