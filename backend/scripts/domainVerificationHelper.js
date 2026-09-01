import { SpatialEngine } from '../optimizer/spatialEngine.js';

const EPSILON = 0.01; // 1cm tolerance for floating point rounding

/**
 * Independent Domain Invariant Verification Helper.
 * Strictly verifies optimization and loading plans without relying on optimizer internal flags.
 */
export const verifyDomainInvariants = ({
  loadPlanResult,
  truck,
  route,
  shipments = [],
  currentLoad = []
}) => {
  const violations = [];
  const assignments = loadPlanResult.assignments || [];
  const unassigned = loadPlanResult.unassignedShipments || [];

  const stops = route.stops || (route.stopsDetails ? route.stopsDetails.map(s => s.locationName) : []);
  const numSegments = stops.length - 1;

  const truckMaxVol = Number(truck.capacityVolume || 100);
  const truckMaxWt = Number(truck.capacityWeight || 20000);
  const truckL = Number(truck.dimensions?.length || truck.interiorLength || 13.6);
  const truckW = Number(truck.dimensions?.width || truck.interiorWidth || 2.45);
  const truckH = Number(truck.dimensions?.height || truck.interiorHeight || 3.0);

  // 1. ROUTE CONSTRAINTS
  for (const a of assignments) {
    const pIdx = a.segmentRange?.fromIndex != null ? a.segmentRange.fromIndex : stops.findIndex(s => s === a.pickup);
    const dIdx = a.segmentRange?.toIndex != null ? a.segmentRange.toIndex : stops.findIndex(s => s === a.delivery);

    if (pIdx === -1 || dIdx === -1) {
      violations.push(`Route Invariant Violation: Assignment ${a.shipmentId} pickup '${a.pickup}' or delivery '${a.delivery}' not found in route stops.`);
    }
    if (pIdx >= dIdx) {
      violations.push(`Route Invariant Violation: Assignment ${a.shipmentId} has invalid hop sequence (pickup index ${pIdx} >= delivery index ${dIdx}).`);
    }
  }

  // 2. SEGMENT-BY-SEGMENT CAPACITY & WEIGHT CONSTRAINTS
  const segVol = new Array(numSegments).fill(0);
  const segWt = new Array(numSegments).fill(0);

  for (const a of assignments) {
    const pIdx = a.segmentRange?.fromIndex != null ? a.segmentRange.fromIndex : stops.findIndex(s => s === a.pickup);
    const dIdx = a.segmentRange?.toIndex != null ? a.segmentRange.toIndex : stops.findIndex(s => s === a.delivery);

    for (let i = pIdx; i < dIdx; i++) {
      if (i >= 0 && i < numSegments) {
        segVol[i] += Number(a.volume || 0);
        segWt[i] += Number(a.weight || 0);
      }
    }
  }

  for (let i = 0; i < numSegments; i++) {
    if (segVol[i] > truckMaxVol + EPSILON) {
      violations.push(`Volume Overflow: Segment ${i} (${stops[i]} -> ${stops[i + 1]}) volume ${segVol[i].toFixed(2)}m³ exceeds truck capacity ${truckMaxVol}m³.`);
    }
    if (segWt[i] > truckMaxWt + EPSILON) {
      violations.push(`Weight Overflow: Segment ${i} (${stops[i]} -> ${stops[i + 1]}) weight ${segWt[i]}kg exceeds truck capacity ${truckMaxWt}kg.`);
    }
  }

  // 3. PHYSICAL 3D GEOMETRY CONSTRAINTS
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const pos = a.position || { x: 0, y: 0, z: 0 };
    const dims = a.dimensions || { dx: 0, dy: 0, dz: 0 };

    const dx = Number(dims.dx || dims.length || 0);
    const dy = Number(dims.dy || dims.width || 0);
    const dz = Number(dims.dz || dims.height || 0);

    // Boundary check
    if (
      pos.x < -EPSILON ||
      pos.y < -EPSILON ||
      pos.z < -EPSILON ||
      pos.x + dx > truckL + EPSILON ||
      pos.y + dy > truckW + EPSILON ||
      pos.z + dz > truckH + EPSILON
    ) {
      violations.push(`Boundary Collision: Item ${a.shipmentId} placed at (${pos.x}, ${pos.y}, ${pos.z}) with dims (${dx}, ${dy}, ${dz}) exceeds truck interior dimensions (${truckL}, ${truckW}, ${truckH}).`);
    }

    // 3D Overlap collision check with other concurrent items
    for (let j = i + 1; j < assignments.length; j++) {
      const b = assignments[j];
      const isConcurrent = SpatialEngine.isSegmentConcurrent(a.segmentRange, b.segmentRange);

      if (isConcurrent) {
        const bPos = b.position || { x: 0, y: 0, z: 0 };
        const bDims = b.dimensions || { dx: 0, dy: 0, dz: 0 };
        const bdx = Number(bDims.dx || bDims.length || 0);
        const bdy = Number(bDims.dy || bDims.width || 0);
        const bdz = Number(bDims.dz || bDims.height || 0);

        const boxA = { x: pos.x, y: pos.y, z: pos.z, dx, dy, dz };
        const boxB = { x: bPos.x, y: bPos.y, z: bPos.z, dx: bdx, dy: bdy, dz: bdz };

        if (SpatialEngine.doBoxesOverlap(boxA, boxB)) {
          violations.push(`Spatial Overlap Collision: Concurrent items ${a.shipmentId} and ${b.shipmentId} intersect in 3D trailer space.`);
        }
      }
    }

    // Stacking & Fragile checks
    if (pos.z > EPSILON) {
      // Must have supporting item below
      const supportingItems = assignments.filter(other => {
        if (other.shipmentId === a.shipmentId) return false;
        const otherPos = other.position || { x: 0, y: 0, z: 0 };
        const otherDims = other.dimensions || { dx: 0, dy: 0, dz: 0 };
        const otherTop = otherPos.z + Number(otherDims.dz || otherDims.height || 0);
        return Math.abs(pos.z - otherTop) <= EPSILON;
      });

      if (supportingItems.length === 0) {
        violations.push(`Floating Cargo Violation: Item ${a.shipmentId} at z=${pos.z} has no supporting item beneath.`);
      } else {
        for (const sup of supportingItems) {
          if (sup.stackable === false) {
            violations.push(`Stacking Violation: Item ${a.shipmentId} is stacked on non-stackable item ${sup.shipmentId}.`);
          }
          if (sup.fragile === true) {
            violations.push(`Fragile Violation: Item ${a.shipmentId} is stacked on fragile cargo ${sup.shipmentId}.`);
          }
        }
      }
    }
  }

  // 4. LOCKED CARGO INTEGRITY CHECK
  for (const locked of currentLoad) {
    const isRetained = assignments.some(a => a.shipmentId === locked.shipmentId);
    if (!isRetained) {
      violations.push(`Locked Cargo Invariant Violation: Locked trailer item ${locked.shipmentId} was dropped from plan.`);
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    segmentVolumeUsed: segVol,
    segmentWeightUsed: segWt
  };
};
