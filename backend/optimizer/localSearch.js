import { SegmentTracker } from './segmentTracker.js';
import { SpatialEngine } from './spatialEngine.js';
import { calculateObjectiveScore } from './scorer.js';

/**
 * Executes constructive heuristic sorting strategies and local search improvements.
 */
export class OptimizationSolver {
  constructor(truck, route, candidateShipments, currentLoad, config = {}) {
    this.truck = truck;
    this.route = route;
    this.candidates = [...candidateShipments];
    this.currentLoad = currentLoad;
    this.config = config;
  }

  /**
   * Evaluates multiple deterministic candidate sorting strategies and performs local search.
   *
   * @returns {Object} Best optimization solution
   */
  solve() {
    const strategies = [
      { name: 'Priority-LIFO-Density', sortFn: this._sortByPriorityLIFODensity },
      { name: 'SegmentSpan-VolumeDesc', sortFn: this._sortBySegmentSpanVolume },
      { name: 'DeliveryOrder-LIFO', sortFn: this._sortByDeliveryOrderLIFO },
      { name: 'VolumeFitDecreasing', sortFn: this._sortByVolumeDesc }
    ];

    let bestSolution = null;

    for (const strat of strategies) {
      const sortedCandidates = [...this.candidates].sort(strat.sortFn);
      const solution = this._constructSolution(sortedCandidates);
      
      // Perform 2-opt insertion local search
      const improvedSolution = this._runLocalSearch(solution);

      if (!bestSolution || improvedSolution.objectiveScore > bestSolution.objectiveScore) {
        bestSolution = { ...improvedSolution, strategyUsed: strat.name };
      }
    }

    return bestSolution;
  }

  /**
   * Constructs a solution given a specific ordering of candidate shipments.
   */
  _constructSolution(orderedShipments) {
    const tracker = new SegmentTracker(this.route, this.truck);
    tracker.applyExistingLoad(this.currentLoad);

    const spatial = new SpatialEngine(this.truck.dimensions, this.truck.capacityVolume);

    const assignments = [];
    const unassigned = [];
    const explanations = [];

    // Pre-populate locked items into spatial and assignments if present
    if (this.currentLoad && this.currentLoad.length > 0) {
      for (const locked of this.currentLoad) {
        const stopsList = this.route.stops || [];
        const pStop = locked.pickup || stopsList[locked.pickupIndex || 0] || 'Origin';
        const dStop = locked.delivery || stopsList[locked.deliveryIndex || stopsList.length - 1] || 'Dest';
        const segRange = {
          fromIndex: locked.pickupIndex || 0,
          toIndex: locked.deliveryIndex || stopsList.length - 1,
          fromStop: pStop,
          toStop: dStop
        };

        const pPlacement = spatial.findBestPlacement({
          ...locked,
          pickup: pStop,
          delivery: dStop,
          segmentRange: segRange
        });

        if (pPlacement) {
          spatial.placeBox({ ...locked, segmentRange: segRange }, pPlacement);
          assignments.push({
            shipmentId: locked.shipmentId,
            bookingId: locked.bookingId || locked.shipmentId,
            pickup: pStop,
            delivery: dStop,
            pickupIndex: locked.pickupIndex || 0,
            deliveryIndex: locked.deliveryIndex || stopsList.length - 1,
            segmentRange: segRange,
            volume: locked.volume,
            weight: locked.weight,
            priority: 'URGENT',
            priorityWeight: 300,
            isLocked: true,
            loadingSequence: 0,
            unloadingSequence: locked.deliveryIndex || 99,
            dimensions: pPlacement.dims || { length: 0, width: 0, height: 0 },
            orientation: pPlacement.orientation,
            position: pPlacement.position,
            obstructionScore: pPlacement.obstructionScore
          });
        }
      }
    }

    let seqCounter = 1;

    for (const item of orderedShipments) {
      if (!item.segmentRange) {
        item.segmentRange = {
          fromIndex: item.pickupIndex,
          toIndex: item.deliveryIndex,
          fromStop: item.pickup,
          toStop: item.delivery
        };
      }

      // 1. Segment Capacity Check
      const fitCheck = tracker.canFit(item);
      if (!fitCheck.canFit) {
        unassigned.push({
          shipmentId: item.shipmentId,
          bookingId: item.bookingId,
          volume: item.volume,
          weight: item.weight,
          priority: item.priority,
          priorityWeight: item.priorityWeight,
          pickup: item.pickup,
          delivery: item.delivery,
          reason: fitCheck.failureReason,
          bottleneck: fitCheck.bottleneckSegment
        });
        explanations.push(`Shipment ${item.shipmentId} rejected: ${fitCheck.failureReason}`);
        continue;
      }

      // 2. 3D Spatial & Stacking Check
      const placement = spatial.findBestPlacement(item);
      if (!placement) {
        unassigned.push({
          shipmentId: item.shipmentId,
          bookingId: item.bookingId,
          volume: item.volume,
          weight: item.weight,
          priority: item.priority,
          priorityWeight: item.priorityWeight,
          pickup: item.pickup,
          delivery: item.delivery,
          reason: 'Spatial container or stacking constraint violation: item cannot physically be placed without collision or stacking violation.',
          bottleneck: null
        });
        explanations.push(`Shipment ${item.shipmentId} rejected: No valid collision-free 3D position in trailer.`);
        continue;
      }

      // Commit placement
      placement.loadingSequence = seqCounter++;
      tracker.allocate(item);
      spatial.placeBox(item, placement);

      assignments.push({
        shipmentId: item.shipmentId,
        bookingId: item.bookingId,
        pickup: item.pickup,
        delivery: item.delivery,
        pickupIndex: item.pickupIndex,
        deliveryIndex: item.deliveryIndex,
        segmentRange: {
          fromIndex: item.pickupIndex,
          toIndex: item.deliveryIndex,
          fromStop: item.pickup,
          toStop: item.delivery
        },
        volume: item.volume,
        weight: item.weight,
        priority: item.priority,
        priorityWeight: item.priorityWeight,
        fragile: item.fragile,
        stackable: item.stackable,
        loadingSequence: placement.loadingSequence || seqCounter,
        unloadingSequence: placement.unloadingSequence || item.deliveryIndex || 1,
        dimensions: placement.dims || placement.dimensions || { length: 0, width: 0, height: 0 },
        orientation: placement.orientation,
        position: placement.position,
        obstructionScore: placement.obstructionScore
      });

      explanations.push(`Shipment ${item.shipmentId} assigned at (${placement.position.x}, ${placement.position.y}, ${placement.position.z}) [${placement.orientation}] for hops ${item.pickup} ➔ ${item.delivery}.`);
    }

    const utilReport = tracker.getUtilizationReport();
    const scoreResult = calculateObjectiveScore({
      utilizationReport: utilReport,
      assignments,
      unassignedShipments: unassigned,
      customWeights: this.config.objectiveWeights
    });

    return {
      tracker,
      spatial,
      assignments,
      unassigned,
      utilReport,
      objectiveScore: scoreResult.totalScore,
      scoreBreakdown: scoreResult.breakdown,
      explanations
    };
  }

  /**
   * Deterministic local search: tries swapping lower-priority items for unassigned high-priority items.
   */
  _runLocalSearch(currentSolution) {
    if (currentSolution.unassigned.length === 0 || currentSolution.assignments.length === 0) {
      return currentSolution;
    }

    let improved = currentSolution;

    for (let uIdx = 0; uIdx < improved.unassigned.length; uIdx++) {
      const candidateToInsert = this.candidates.find(c => c.shipmentId === improved.unassigned[uIdx].shipmentId);
      if (!candidateToInsert) continue;

      for (let aIdx = 0; aIdx < improved.assignments.length; aIdx++) {
        const itemToRemove = improved.assignments[aIdx];
        // Only consider swap if candidate has equal or higher priority or higher volume
        if (candidateToInsert.priorityWeight < itemToRemove.priorityWeight && candidateToInsert.volume < itemToRemove.volume) {
          continue;
        }

        // Test trial ordering with candidateToInsert placed ahead of itemToRemove
        const trialList = this.candidates.filter(c => c.shipmentId !== itemToRemove.shipmentId);
        trialList.unshift(candidateToInsert);

        const trialSolution = this._constructSolution(trialList);
        if (trialSolution.objectiveScore > improved.objectiveScore) {
          improved = trialSolution;
          break;
        }
      }
    }

    return improved;
  }

  // Sorting Heuristics
  _sortByPriorityLIFODensity(a, b) {
    if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
    if (b.deliveryIndex !== a.deliveryIndex) return b.deliveryIndex - a.deliveryIndex;
    return b.density - a.density;
  }

  _sortBySegmentSpanVolume(a, b) {
    const spanA = a.deliveryIndex - a.pickupIndex;
    const spanB = b.deliveryIndex - b.pickupIndex;
    if (spanB !== spanA) return spanB - spanA;
    if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
    return b.volume - a.volume;
  }

  _sortByDeliveryOrderLIFO(a, b) {
    if (b.deliveryIndex !== a.deliveryIndex) return b.deliveryIndex - a.deliveryIndex;
    if (a.pickupIndex !== b.pickupIndex) return a.pickupIndex - b.pickupIndex;
    return b.volume - a.volume;
  }

  _sortByVolumeDesc(a, b) {
    if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
    return b.volume - a.volume;
  }
}
