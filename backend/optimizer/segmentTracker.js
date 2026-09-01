/**
 * Manages segment-by-segment load state across multi-stop routes.
 */
export class SegmentTracker {
  constructor(route, truck) {
    this.route = route;
    this.truck = truck;
    this.numSegments = route.segmentsCount;

    // Segment arrays indexed 0 ... numSegments - 1
    this.usedVolume = new Array(this.numSegments).fill(0);
    this.usedWeight = new Array(this.numSegments).fill(0);
    this.assignedItems = [];
  }

  /**
   * Clones the current segment tracker state for branching / lookahead search.
   */
  clone() {
    const copy = new SegmentTracker(this.route, this.truck);
    copy.usedVolume = [...this.usedVolume];
    copy.usedWeight = [...this.usedWeight];
    copy.assignedItems = [...this.assignedItems];
    return copy;
  }

  /**
   * Initializes state with locked existing load (re-optimization support).
   */
  applyExistingLoad(currentLoadList) {
    for (const item of currentLoadList) {
      this.allocate(item, true);
    }
  }

  /**
   * Tests if a shipment can physically fit across all its occupied route segments.
   *
   * @param {Object} shipment
   * @param {Number} shipment.pickupIndex
   * @param {Number} shipment.deliveryIndex
   * @param {Number} shipment.volume
   * @param {Number} shipment.weight
   * @returns {Object} { canFit: Boolean, failureReason: String|null, bottleneckSegment: Object|null }
   */
  canFit(shipment) {
    const { pickupIndex, deliveryIndex, volume, weight } = shipment;

    for (let seg = pickupIndex; seg < deliveryIndex; seg++) {
      const nextVol = this.usedVolume[seg] + volume;
      const nextWt = this.usedWeight[seg] + weight;

      if (nextVol > this.truck.capacityVolume) {
        return {
          canFit: false,
          failureReason: `Volume overflow on segment ${this.route.stops[seg]} → ${this.route.stops[seg + 1]} (Occupied: ${this.usedVolume[seg].toFixed(2)}m³ + Req: ${volume}m³ > Cap: ${this.truck.capacityVolume}m³)`,
          bottleneckSegment: {
            from: this.route.stops[seg],
            to: this.route.stops[seg + 1],
            overflowType: 'VOLUME',
            current: this.usedVolume[seg],
            required: volume,
            capacity: this.truck.capacityVolume
          }
        };
      }

      if (nextWt > this.truck.capacityWeight) {
        return {
          canFit: false,
          failureReason: `Weight overflow on segment ${this.route.stops[seg]} → ${this.route.stops[seg + 1]} (Occupied: ${this.usedWeight[seg]}kg + Req: ${weight}kg > Cap: ${this.truck.capacityWeight}kg)`,
          bottleneckSegment: {
            from: this.route.stops[seg],
            to: this.route.stops[seg + 1],
            overflowType: 'WEIGHT',
            current: this.usedWeight[seg],
            required: weight,
            capacity: this.truck.capacityWeight
          }
        };
      }
    }

    return { canFit: true, failureReason: null, bottleneckSegment: null };
  }

  /**
   * Allocates a shipment onto its route segments.
   */
  allocate(shipment, isLocked = false) {
    const { pickupIndex, deliveryIndex, volume, weight } = shipment;
    for (let seg = pickupIndex; seg < deliveryIndex; seg++) {
      this.usedVolume[seg] += volume;
      this.usedWeight[seg] += weight;
    }
    this.assignedItems.push({ ...shipment, isLocked });
  }

  /**
   * Removes a shipment from its route segments (used during local search / backtracking).
   */
  deallocate(shipmentId) {
    const idx = this.assignedItems.findIndex(i => i.shipmentId === shipmentId);
    if (idx === -1) return false;

    const item = this.assignedItems[idx];
    if (item.isLocked) return false; // Cannot remove locked cargo

    for (let seg = item.pickupIndex; seg < item.deliveryIndex; seg++) {
      this.usedVolume[seg] = Math.max(0, this.usedVolume[seg] - item.volume);
      this.usedWeight[seg] = Math.max(0, this.usedWeight[seg] - item.weight);
    }
    this.assignedItems.splice(idx, 1);
    return true;
  }

  /**
   * Computes comprehensive segment breakdown and overall metrics.
   */
  getUtilizationReport() {
    let peakVol = 0;
    let peakWt = 0;
    let totalVolSum = 0;
    let totalWtSum = 0;

    const segments = [];

    for (let i = 0; i < this.numSegments; i++) {
      const uVol = parseFloat(this.usedVolume[i].toFixed(2));
      const uWt = Math.round(this.usedWeight[i]);

      const remVol = parseFloat(Math.max(0, this.truck.capacityVolume - uVol).toFixed(2));
      const remWt = Math.max(0, this.truck.capacityWeight - uWt);

      const volPct = this.truck.capacityVolume > 0 ? parseFloat(((uVol / this.truck.capacityVolume) * 100).toFixed(1)) : 0;
      const wtPct = this.truck.capacityWeight > 0 ? parseFloat(((uWt / this.truck.capacityWeight) * 100).toFixed(1)) : 0;

      if (volPct > peakVol) peakVol = volPct;
      if (wtPct > peakWt) peakWt = wtPct;

      totalVolSum += volPct;
      totalWtSum += wtPct;

      segments.push({
        segmentIndex: i,
        fromStop: this.route.stops[i],
        toStop: this.route.stops[i + 1],
        usedVolume: uVol,
        usedWeight: uWt,
        remainingVolume: remVol,
        remainingWeight: remWt,
        volumeUtilization: volPct,
        weightUtilization: wtPct
      });
    }

    const avgVolPct = this.numSegments > 0 ? parseFloat((totalVolSum / this.numSegments).toFixed(1)) : 0;
    const avgWtPct = this.numSegments > 0 ? parseFloat((totalWtSum / this.numSegments).toFixed(1)) : 0;

    return {
      segments,
      overallVolumeUtilization: avgVolPct,
      overallWeightUtilization: avgWtPct,
      peakVolumeUtilization: peakVol,
      peakWeightUtilization: peakWt,
      assignedCount: this.assignedItems.length
    };
  }
}
