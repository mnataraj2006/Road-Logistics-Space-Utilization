export const OPTIMIZER_VERSION = '2.4.0-deterministic-multistop';

/**
 * Authoritative geometric comparison epsilon (1 nanometer: 1e-9 meters).
 * Provides a clean floating-point tolerance for boundary, collision, and alignment
 * calculations without permitting physical container breaches.
 */
export const GEOMETRY_EPSILON = 1e-9;

export const PRIORITY_WEIGHTS = {
  URGENT: 1000,
  EXPRESS: 500,
  HIGH: 300,
  STANDARD: 100,
  LOW: 50
};

export const DEFAULT_OBJECTIVE_WEIGHTS = {
  volumeUtilization: 40.0,
  weightUtilization: 30.0,
  prioritySatisfaction: 15.0,
  deliveryAccessibility: 10.0,
  wastedSpacePenalty: 5.0
};

export const ORIENTATIONS = {
  ORIGINAL: 'ORIGINAL',       // (L, W, H)
  ROTATED_90: 'ROTATED_90',   // (W, L, H) - rotated on horizontal plane
  UPRIGHT_ONLY: 'UPRIGHT_ONLY' // Height must remain vertical
};

export const LOAD_STATUS = {
  ASSIGNED: 'ASSIGNED',
  REJECTED_VOLUME: 'REJECTED_VOLUME',
  REJECTED_WEIGHT: 'REJECTED_WEIGHT',
  REJECTED_DIMENSIONS: 'REJECTED_DIMENSIONS',
  REJECTED_ROUTE_MISMATCH: 'REJECTED_ROUTE_MISMATCH',
  REJECTED_STACKING: 'REJECTED_STACKING',
  REJECTED_ACCESSIBILITY: 'REJECTED_ACCESSIBILITY',
  UNASSIGNED: 'UNASSIGNED'
};
