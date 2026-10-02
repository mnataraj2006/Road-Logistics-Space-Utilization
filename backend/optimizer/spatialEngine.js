import { ORIENTATIONS, GEOMETRY_EPSILON } from './constants.js';
import { validatePackageWithinTruck } from './validator.js';

const EPSILON = GEOMETRY_EPSILON;
const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * 3D Physical Geometry & Collision Validation Engine for Road Logistics.
 *
 * Implements a practical, deterministic container loading model:
 * - Boundaries: interiorLength (X: Cabin=0 -> Door=L), interiorWidth (Y: 0 -> W), interiorHeight (Z: Floor=0 -> H)
 * - Orientation: Original (L x W x H) & Rotated 90° Horizontal (W x L x H)
 * - Stacking & Contact: Solid bottom support, stackable flags, fragile protection, maxStackWeight bounds
 * - Route-Segment Concurrency: 3D collisions checked only when packages share overlapping route hops
 * - LIFO Accessibility & Obstruction: Measures cargo blocking earlier delivery packages from rear door
 */
export class SpatialEngine {
  /**
   * @param {Object} truckDimensions
   * @param {number} truckDimensions.length - interiorLength in meters
   * @param {number} truckDimensions.width - interiorWidth in meters
   * @param {number} truckDimensions.height - interiorHeight in meters
   */
  constructor(truckDimensions = {}, capacityVolume = 0) {
    let len = Number(truckDimensions.length || truckDimensions.interiorLength || 0);
    let wid = Number(truckDimensions.width || truckDimensions.interiorWidth || 0);
    let hgt = Number(truckDimensions.height || truckDimensions.interiorHeight || 0);

    const capVol = Number(capacityVolume || truckDimensions.capacityVolume || 0);
    if (capVol > 0 && (len <= 0 || wid <= 0 || hgt <= 0)) {
      if (wid <= 0) wid = 2.45;
      if (hgt <= 0) hgt = 2.8;
      len = capVol / (wid * hgt);
    }

    // Standard authoritative defaults if still missing
    if (len <= 0) len = 13.6;
    if (wid <= 0) wid = 2.45;
    if (hgt <= 0) hgt = 2.8;

    this.interiorLength = len;
    this.interiorWidth = wid;
    this.interiorHeight = hgt;

    // Aliases for compatibility
    this.truckL = this.interiorLength;
    this.truckW = this.interiorWidth;
    this.truckH = this.interiorHeight;

    // Placed boxes in trailer
    this.placedBoxes = [];
  }

  /**
   * Clones spatial state.
   */
  clone() {
    const copy = new SpatialEngine({
      length: this.interiorLength,
      width: this.interiorWidth,
      height: this.interiorHeight
    });
    copy.placedBoxes = this.placedBoxes.map(b => ({
      ...b,
      position: { ...b.position },
      dims: { ...b.dims },
      segmentRange: { ...b.segmentRange }
    }));
    return copy;
  }

  /**
   * Checks whether two route segment ranges overlap.
   */
  static isSegmentConcurrent(segA, segB) {
    const startA = segA?.fromIndex ?? segA?.pickupIndex ?? 0;
    const endA = segA?.toIndex ?? segA?.deliveryIndex ?? 1;
    const startB = segB?.fromIndex ?? segB?.pickupIndex ?? 0;
    const endB = segB?.toIndex ?? segB?.deliveryIndex ?? 1;
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  /**
   * Checks whether a 3D box is strictly inside container boundaries.
   */
  isWithinBoundaries(x, y, z, dx, dy, dz) {
    const res = validatePackageWithinTruck({
      position: { x, y, z },
      dimensions: { dx, dy, dz },
      truckDimensions: {
        length: this.interiorLength,
        width: this.interiorWidth,
        height: this.interiorHeight
      },
      tolerance: EPSILON
    });
    return res.valid;
  }

  /**
   * 3D Bounding-Box Overlap / Intersection test.
   */
  static doBoxesOverlap(b1, b2) {
    const xOverlap = Math.max(b1.x, b2.x) < Math.min(b1.x + b1.dx, b2.x + b2.dx) - EPSILON;
    const yOverlap = Math.max(b1.y, b2.y) < Math.min(b1.y + b1.dy, b2.y + b2.dy) - EPSILON;
    const zOverlap = Math.max(b1.z, b2.z) < Math.min(b1.z + b1.dz, b2.z + b2.dz) - EPSILON;
    return xOverlap && yOverlap && zOverlap;
  }

  /**
   * Checks if candidate position overlaps any concurrent placed box on shared route legs.
   */
  hasCollision(candidateBox, candidateSegment) {
    for (const pb of this.placedBoxes) {
      if (SpatialEngine.isSegmentConcurrent(candidateSegment, pb.segmentRange)) {
        const boxPlaced = {
          x: pb.position.x,
          y: pb.position.y,
          z: pb.position.z,
          dx: pb.dims.dx,
          dy: pb.dims.dy,
          dz: pb.dims.dz
        };
        if (SpatialEngine.doBoxesOverlap(candidateBox, boxPlaced)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Validates vertical support, stacking rules, fragile items, and maxStackWeight.
   */
  validateVerticalSupportAndStacking(candidateBox, candidateShipment, candidateSegment) {
    // If placed directly on trailer floor (z=0), it has 100% solid physical support
    if (candidateBox.z <= EPSILON) {
      return { valid: true };
    }

    // Must have at least one supporting box directly beneath
    let supportArea = 0;
    const candidateArea = candidateBox.dx * candidateBox.dy;
    const supportingBoxes = [];

    for (const pb of this.placedBoxes) {
      if (SpatialEngine.isSegmentConcurrent(candidateSegment, pb.segmentRange)) {
        const topOfPb = pb.position.z + pb.dims.dz;
        // Check if candidate rests on top face of pb
        if (Math.abs(candidateBox.z - topOfPb) <= EPSILON) {
          const xOverlap = Math.max(candidateBox.x, pb.position.x) < Math.min(candidateBox.x + candidateBox.dx, pb.position.x + pb.dims.dx) - EPSILON;
          const yOverlap = Math.max(candidateBox.y, pb.position.y) < Math.min(candidateBox.y + candidateBox.dy, pb.position.y + pb.dims.dy) - EPSILON;

          if (xOverlap && yOverlap) {
            // Check Stacking Rule 1: Bottom item must allow stacking
            if (pb.stackable === false) {
              return { valid: false, reason: `Bottom item ${pb.shipmentId} is marked NON-STACKABLE.` };
            }
            // Check Stacking Rule 2: Bottom item cannot be fragile
            if (pb.fragile === true) {
              return { valid: false, reason: `Bottom item ${pb.shipmentId} is FRAGILE and cannot support load.` };
            }

            // Check Stacking Rule 3: Max stack weight limit on bottom item
            const currentWeightOnPb = pb.stackedWeightOnTop || 0;
            const newWeightOnPb = currentWeightOnPb + (candidateShipment.weight || 0);
            const maxAllowed = pb.maxStackWeight != null ? pb.maxStackWeight : 1000;
            if (newWeightOnPb > maxAllowed) {
              return { valid: false, reason: `Exceeds max stack weight of bottom item ${pb.shipmentId} (${newWeightOnPb}kg > ${maxAllowed}kg).` };
            }

            const overlapX = Math.min(candidateBox.x + candidateBox.dx, pb.position.x + pb.dims.dx) - Math.max(candidateBox.x, pb.position.x);
            const overlapY = Math.min(candidateBox.y + candidateBox.dy, pb.position.y + pb.dims.dy) - Math.max(candidateBox.y, pb.position.y);
            supportArea += overlapX * overlapY;
            supportingBoxes.push(pb);
          }
        }
      }
    }

    // Require at least 60% base contact support area
    if (supportArea < 0.6 * candidateArea) {
      return { valid: false, reason: 'Insufficient horizontal support base beneath package.' };
    }

    return { valid: true, supportingBoxes };
  }

  /**
   * Computes LIFO door obstruction penalty:
   * Rear door is located at X = interiorLength.
   * If an earlier-delivery cargo is placed at X < X_later, the later cargo obstructs it from exit.
   */
  calculateObstructionScore(candidateBox, candidateDeliverySeq, candidateSegment) {
    let obstructions = 0;
    const candXEnd = candidateBox.x + candidateBox.dx;

    for (const pb of this.placedBoxes) {
      if (SpatialEngine.isSegmentConcurrent(candidateSegment, pb.segmentRange)) {
        const pbDeliverySeq = pb.unloadingSequence || 999;
        const pbXEnd = pb.position.x + pb.dims.dx;

        // If placed box delivers BEFORE candidate (lower sequence), but candidate is positioned between placed box and rear door
        if (pbDeliverySeq < candidateDeliverySeq && candidateBox.x + EPSILON >= pbXEnd) {
          obstructions += 1;
        }
        // If candidate delivers BEFORE placed box (lower sequence), but placed box is between candidate and rear door
        if (candidateDeliverySeq < pbDeliverySeq && pb.position.x + EPSILON >= candXEnd) {
          obstructions += 1;
        }
      }
    }
    return obstructions;
  }

  /**
   * Evaluates valid placement coordinates for a shipment considering 3D space,
   * boundaries, stacking rules, fragility, contact support, and delivery accessibility.
   *
   * @param {Object} shipment
   * @returns {Object|null} Placement details with position {x, y, z}, dimensions {dx, dy, dz}, orientation, and obstruction score
   */
  findBestPlacement(shipment) {
    const itemDims = shipment.dimensions || {};
    let len = Number(itemDims.length || shipment.length || 0);
    let wid = Number(itemDims.width || shipment.width || 0);
    let hgt = Number(itemDims.height || shipment.height || 0);
    const allowRotation = shipment.allowRotation !== false;

    const orientations = [];

    if (len > 0 && wid > 0 && hgt > 0) {
      // Original orientation
      if (len <= this.interiorLength + EPSILON && wid <= this.interiorWidth + EPSILON && hgt <= this.interiorHeight + EPSILON) {
        orientations.push({ name: ORIENTATIONS.ORIGINAL, dx: len, dy: wid, dz: hgt });
      }
      // Horizontal 90° rotation (X-Y plane rotation, keeping upright height)
      if (allowRotation && wid <= this.interiorLength + EPSILON && len <= this.interiorWidth + EPSILON && hgt <= this.interiorHeight + EPSILON) {
        orientations.push({ name: ORIENTATIONS.ROTATED_90, dx: wid, dy: len, dz: hgt });
      }
    } else {
      // Standard multi-lane pallet pack options derived from volume
      const vol = Math.max(0.1, Number(shipment.volume || 1));
      const fullW = this.interiorWidth;
      const fullH = this.interiorHeight;
      const halfW = this.interiorWidth / 2;
      const halfH = this.interiorHeight / 2;

      // Option A: Full cross-section
      const lenA = vol / (fullW * fullH);
      if (lenA <= this.interiorLength + EPSILON) {
        orientations.push({ name: 'FULL_CROSS_SECTION', dx: lenA, dy: fullW, dz: fullH });
      }

      // Option B: Half-width, Full-height
      const lenB = vol / (halfW * fullH);
      if (lenB <= this.interiorLength + EPSILON) {
        orientations.push({ name: 'HALF_WIDTH_FULL_HEIGHT', dx: lenB, dy: halfW, dz: fullH });
      }

      // Option C: Half-width, Half-height
      const lenC = vol / (halfW * halfH);
      if (lenC <= this.interiorLength + EPSILON) {
        orientations.push({ name: 'HALF_WIDTH_HALF_HEIGHT', dx: lenC, dy: halfW, dz: halfH });
      }
    }

    if (orientations.length === 0) {
      return null;
    }

    // Generate Candidate 3D Anchor Points (Extreme Points on Floor & Box Tops)
    const anchorPointsMap = new Map();
    anchorPointsMap.set('0.000000_0.000000_0.000000', { x: 0, y: 0, z: 0 });

    for (const pb of this.placedBoxes) {
      if (SpatialEngine.isSegmentConcurrent(shipment.segmentRange, pb.segmentRange)) {
        // Point next to box in X
        const ptX = { x: pb.position.x + pb.dims.dx, y: pb.position.y, z: pb.position.z };
        if (ptX.x <= this.interiorLength + EPSILON) {
          anchorPointsMap.set(`${ptX.x.toFixed(6)}_${ptX.y.toFixed(6)}_${ptX.z.toFixed(6)}`, ptX);
        }
        // Point next to box in Y
        const ptY = { x: pb.position.x, y: pb.position.y + pb.dims.dy, z: pb.position.z };
        if (ptY.y <= this.interiorWidth + EPSILON) {
          anchorPointsMap.set(`${ptY.x.toFixed(6)}_${ptY.y.toFixed(6)}_${ptY.z.toFixed(6)}`, ptY);
        }
        // Point on top of box in Z (if stackable)
        if (pb.stackable !== false && pb.fragile !== true) {
          const ptZ = { x: pb.position.x, y: pb.position.y, z: pb.position.z + pb.dims.dz };
          if (ptZ.z <= this.interiorHeight + EPSILON) {
            anchorPointsMap.set(`${ptZ.x.toFixed(6)}_${ptZ.y.toFixed(6)}_${ptZ.z.toFixed(6)}`, ptZ);
          }
        }
      }
    }

    const anchorPoints = Array.from(anchorPointsMap.values());
    // Sort anchor points (prefer front of truck X=0, floor Z=0, left Y=0)
    anchorPoints.sort((a, b) => (a.x - b.x) || (a.z - b.z) || (a.y - b.y));

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const ori of orientations) {
      for (const pt of anchorPoints) {
        if (pt.x + ori.dx > this.interiorLength + EPSILON) continue;
        if (pt.y + ori.dy > this.interiorWidth + EPSILON) continue;
        if (pt.z + ori.dz > this.interiorHeight + EPSILON) continue;

        const candidateBox = {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          dx: ori.dx,
          dy: ori.dy,
          dz: ori.dz
        };

        // 1. Container Boundary Check
        if (!this.isWithinBoundaries(candidateBox.x, candidateBox.y, candidateBox.z, candidateBox.dx, candidateBox.dy, candidateBox.dz)) {
          continue;
        }

        // 2. 3D Overlap Collision Check
        if (this.hasCollision(candidateBox, shipment.segmentRange)) {
          continue;
        }

        // 3. Vertical Support & Stacking Check
        const supportCheck = this.validateVerticalSupportAndStacking(candidateBox, shipment, shipment.segmentRange);
        if (!supportCheck.valid) {
          continue;
        }

        // 4. LIFO Door Accessibility & Obstruction
        const deliverySeq = shipment.unloadingSequence || shipment.deliveryIndex || shipment.segmentRange?.toIndex || 1;
        const obstructionScore = this.calculateObstructionScore(candidateBox, deliverySeq, shipment.segmentRange);

        // Evaluation cost: prioritize floor, front of truck, minimize obstruction
        const placementCost = (candidateBox.x * 1.5) + (candidateBox.y * 1.0) + (candidateBox.z * 3.0) + (obstructionScore * 50);

        if (placementCost < bestScore) {
          bestScore = placementCost;
          bestCandidate = {
            position: {
              x: candidateBox.x,
              y: candidateBox.y,
              z: candidateBox.z
            },
            dims: {
              dx: ori.dx,
              dy: ori.dy,
              dz: ori.dz
            },
            orientation: ori.name,
            obstructionScore,
            supportingBoxes: supportCheck.supportingBoxes || []
          };
        }
      }
    }

    return bestCandidate;
  }

  /**
   * Commits a placed box into spatial engine state.
   */
  placeBox(shipment, placement) {
    const placedItem = {
      shipmentId: shipment.shipmentId,
      bookingId: shipment.bookingId || '',
      position: placement.position,
      dims: placement.dims,
      orientation: placement.orientation,
      volume: shipment.volume,
      weight: shipment.weight,
      fragile: shipment.fragile === true,
      stackable: shipment.stackable !== false,
      maxStackWeight: shipment.maxStackWeight != null ? shipment.maxStackWeight : 1000,
      stackedWeightOnTop: 0,
      segmentRange: shipment.segmentRange,
      loadingSequence: shipment.loadingSequence || 0,
      unloadingSequence: shipment.unloadingSequence || 0,
      toStop: shipment.deliveryStop || shipment.segmentRange?.toStop || ''
    };

    // Update stacked weight on supporting boxes below
    if (placement.supportingBoxes && placement.supportingBoxes.length > 0) {
      for (const sb of placement.supportingBoxes) {
        sb.stackedWeightOnTop = (sb.stackedWeightOnTop || 0) + (shipment.weight || 0);
      }
    }

    this.placedBoxes.push(placedItem);
    return placedItem;
  }

  /**
   * Generates a 2D Operational Representation (Top-Down and Side View).
   * Categorizes cargo:
   * - DELIVERED_AT_NEXT_STOP (Immediate delivery)
   * - DELIVERED_LATER (Intermediate cargo)
   * - CURRENTLY_BLOCKING_ACCESS (Obstruction to earlier delivery packages)
   * - NEWLY_LOADED (Just picked up)
   * - FREE_SPACE
   */
  generateOperational2DViews(currentStopName = '', nextStopName = '') {
    const topDownSlots = [];
    const sideViewSlots = [];

    const normNext = norm(nextStopName);

    for (const b of this.placedBoxes) {
      const isNextDelivery = norm(b.toStop) === normNext;
      const isBlocking = (b.obstructionScore || 0) > 0;

      let operationalTag = 'DELIVERED_LATER';
      if (isNextDelivery) operationalTag = 'DELIVERED_AT_NEXT_STOP';
      if (isBlocking) operationalTag = 'CURRENTLY_BLOCKING_ACCESS';

      topDownSlots.push({
        shipmentId: b.shipmentId,
        operationalTag,
        x: b.position.x,
        y: b.position.y,
        dx: b.dims.dx,
        dy: b.dims.dy,
        destination: b.toStop,
        volume: b.volume,
        weight: b.weight,
        unloadingSequence: b.unloadingSequence
      });

      sideViewSlots.push({
        shipmentId: b.shipmentId,
        operationalTag,
        x: b.position.x,
        z: b.position.z,
        dx: b.dims.dx,
        dz: b.dims.dz,
        destination: b.toStop,
        stackLevel: b.position.z > 0 ? 'UPPER_TIER' : 'FLOOR'
      });
    }

    return {
      container: {
        interiorLength: this.interiorLength,
        interiorWidth: this.interiorWidth,
        interiorHeight: this.interiorHeight,
        cabinEnd: 'X=0 (Front Cabin)',
        doorEnd: `X=${this.interiorLength} (Rear Door / Unloading Exit)`
      },
      topDownView: topDownSlots,
      sideView: sideViewSlots,
      summary: {
        totalPackages: this.placedBoxes.length,
        deliveredAtNextStopCount: topDownSlots.filter(s => s.operationalTag === 'DELIVERED_AT_NEXT_STOP').length,
        blockingAccessCount: topDownSlots.filter(s => s.operationalTag === 'CURRENTLY_BLOCKING_ACCESS').length
      }
    };
  }
}
