import mongoose from 'mongoose';
import crypto from 'crypto';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { generateLoadPlan, validatePackageWithinTruck } from '../optimizer/index.js';
import { SpatialEngine } from '../optimizer/spatialEngine.js';
import { dispatchTruck } from './transitController.js';
import { getTenantFilter } from '../middleware/auth.js';

const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * Helper to resolve the authoritative vehicle configuration for a trip.
 * Rule:
 * - Planned / Ready trips use the authoritative Fleet Vehicle record and update snapshots.
 * - In-transit / Completed trips preserve the immutable dispatch snapshot.
 */
export const resolveAuthoritativeTruck = (trip, liveVehicle) => {
  if (['DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'OPERATIONS_IN_PROGRESS', 'STOP_COMPLETED', 'COMPLETED'].includes(trip.status) && trip.vehicleSnapshot?.capacityVolume > 0) {
    const snap = trip.vehicleSnapshot;
    return {
      vehicleId: snap.vehicleId || trip.vehicleId,
      type: snap.type || 'Heavy Truck',
      capacityVolume: Number(snap.capacityVolume) || 93.3,
      capacityWeight: Number(snap.capacityWeight) || 20000,
      dimensions: {
        length: Number(snap.dimensions?.length || snap.interiorLength || 13.6),
        width: Number(snap.dimensions?.width || snap.interiorWidth || 2.45),
        height: Number(snap.dimensions?.height || snap.interiorHeight || 2.8)
      },
      ratePerCbm: snap.ratePerCbm || 150,
      ratePerKg: snap.ratePerKg || 5
    };
  }

  const veh = liveVehicle || trip.vehicle || {};
  const len = Number(veh.dimensions?.length || veh.interiorLength || 13.6);
  const wid = Number(veh.dimensions?.width || veh.interiorWidth || 2.45);
  const hgt = Number(veh.dimensions?.height || veh.interiorHeight || 2.8);
  const capVol = Number(veh.capacityVolume || parseFloat((len * wid * hgt).toFixed(2)));
  const capWt = Number(veh.capacityWeight || 20000);

  return {
    vehicleId: veh.vehicleId || trip.vehicleId,
    type: veh.type || 'Heavy Truck',
    capacityVolume: capVol,
    capacityWeight: capWt,
    dimensions: {
      length: len,
      width: wid,
      height: hgt
    },
    ratePerCbm: veh.ratePerCbm || 150,
    ratePerKg: veh.ratePerKg || 5
  };
};

/**
 * @desc    Get all trips with optional status filtering (scoped to tenant)
 * @route   GET /api/trips
 */
export const getTrips = async (req, res) => {
  try {
    const { status, vehicleId, routeId } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (vehicleId) filter.vehicleId = vehicleId;
    if (routeId) filter.routeId = routeId;

    if (req.user && (req.user.role === 'logistics_manager' || req.user.role === 'carrier')) {
      filter = { ...filter, ...getTenantFilter(req.user) };
    }

    const trips = await Trip.find(filter)
      .populate('vehicle')
      .populate('route')
      .populate('driver', 'username name email')
      .sort({ plannedDeparture: -1, createdAt: -1 });

    // Ensure all trips have authoritative vehicle dimensions populated
    const mappedTrips = trips.map(t => {
      const authTruck = resolveAuthoritativeTruck(t, t.vehicle);
      const obj = t.toObject();
      obj.effectiveVehicle = authTruck;
      if (obj.vehicle) {
        obj.vehicle.dimensions = authTruck.dimensions;
        obj.vehicle.capacityVolume = authTruck.capacityVolume;
        obj.vehicle.capacityWeight = authTruck.capacityWeight;
      }
      return obj;
    });

    res.json(mappedTrips);
  } catch (error) {
    console.error('getTrips error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new planned trip
 * @route   POST /api/trips
 */
export const createTrip = async (req, res) => {
  try {
    const { vehicleId, routeId, plannedDeparture, driverId } = req.body;

    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ success: false, message: `Vehicle ${vehicleId} not found.` });

    const route = await Route.findOne({ routeId: routeId || vehicle.routeLane });
    if (!route) return res.status(404).json({ success: false, message: `Route ${routeId || vehicle.routeLane} not found.` });

    const orgId = req.user?.organizationId ? (req.user.organizationId._id || req.user.organizationId) : vehicle.organizationId;
    const compName = req.user?.companyName || vehicle.logisticsCompanyName || '';

    const tripId = `TRIP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const departure = plannedDeparture ? new Date(plannedDeparture) : new Date();

    const originStop = route.stopsDetails?.[0]?.locationName || route.stops?.[0] || route.source;

    const vLen = Number(vehicle.dimensions?.length || 13.6);
    const vWid = Number(vehicle.dimensions?.width || 2.45);
    const vHgt = Number(vehicle.dimensions?.height || 2.8);
    const vVol = Number(vehicle.capacityVolume || parseFloat((vLen * vWid * vHgt).toFixed(2)));
    const vWt = Number(vehicle.capacityWeight || 20000);

    const trip = new Trip({
      tripId,
      vehicle: vehicle._id,
      vehicleId: vehicle.vehicleId,
      vehicleSnapshot: {
        vehicleId: vehicle.vehicleId,
        type: vehicle.type || 'Heavy Truck',
        interiorLength: vLen,
        interiorWidth: vWid,
        interiorHeight: vHgt,
        capacityVolume: vVol,
        capacityWeight: vWt,
        dimensions: {
          length: vLen,
          width: vWid,
          height: vHgt
        },
        ratePerCbm: vehicle.ratePerCbm || 150,
        ratePerKg: vehicle.ratePerKg || 5,
        capturedAt: new Date()
      },
      route: route._id,
      routeId: route.routeId,
      organizationId: orgId,
      logisticsCompanyName: compName,
      carrierId: vehicle.carrierId || (orgId ? orgId.toString() : 'CARRIER'),
      driverId: driverId || vehicle.assignedDriverId || '',
      plannedDeparture: departure,
      currentStopIndex: 0,
      currentStop: originStop,
      status: 'PLANNED'
    });
    await trip.save();

    // Update Fleet Asset status to ASSIGNED
    vehicle.status = 'ASSIGNED';
    vehicle.transitStatus = 'ASSIGNED';
    vehicle.activeTripId = trip.tripId;
    vehicle.currentTripId = trip.tripId;
    await vehicle.save();

    // Create TripStop sequence records
    const stopsList = route.stopsDetails || [];
    if (stopsList.length > 0) {
      for (const sd of stopsList) {
        await TripStop.create({
          trip: trip._id,
          tripId: trip.tripId,
          stopId: sd.stopId || `STP-${sd.sequenceNumber}`,
          sequence: sd.sequenceNumber,
          location: sd.locationName,
          plannedArrival: departure,
          verificationStatus: sd.sequenceNumber === 1 ? 'READY' : 'UPCOMING',
          qrToken: sd.qrToken || `TKN-${trip.tripId}-${sd.sequenceNumber}`
        });
      }
    }

    res.status(201).json({ success: true, message: 'Trip created successfully', trip });
  } catch (error) {
    console.error('createTrip error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get trip details by tripId (including latest load plan)
 * @route   GET /api/trips/:tripId
 */
export const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findOne({ tripId })
      .populate('vehicle')
      .populate('route')
      .populate('driver', 'username name email');

    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    const stops = await TripStop.find({ tripId }).sort({ sequence: 1 });
    
    // Find authoritative active / approved / locked / latest LoadPlan
    const latestPlan = await LoadPlan.findOne({
      tripId,
      status: { $in: ['APPROVED', 'ACTIVE', 'LOCKED', 'GENERATED', 'UNDER_REVIEW', 'SUPERSEDED'] }
    }).sort({ isImmutable: -1, version: -1, createdAt: -1 });

    // Resolve authoritative truck first
    const authTruck = resolveAuthoritativeTruck(trip, trip.vehicle);
    const currentCity = trip.currentStop || (trip.route?.stopsDetails?.[trip.currentStopIndex || 0]?.locationName) || '';
    let assignments = [];
    if (latestPlan) {
      const rawAssignments = await LoadAssignment.find({ loadPlanId: latestPlan.loadPlanId })
        .sort({ loadingSequence: 1 })
        .lean();

      const shipmentIds = rawAssignments.map(a => a.shipmentId).filter(Boolean);
      const bookingIds = rawAssignments.map(a => a.bookingId).filter(Boolean);

      const [shipmentDocs, bookingDocs] = await Promise.all([
        Shipment.find({ $or: [{ shipmentId: { $in: shipmentIds } }, { allocatedTripId: trip.tripId }] }).lean(),
        Booking.find({ $or: [{ bookingId: { $in: bookingIds } }, { allocatedTripId: trip.tripId }] }).lean()
      ]);

      const shipmentMap = new Map(shipmentDocs.map(s => [s.shipmentId, s]));
      const bookingMap = new Map(bookingDocs.map(b => [b.bookingId, b]));

      assignments = rawAssignments.map(a => {
        const s = shipmentMap.get(a.shipmentId) || {};
        const b = bookingMap.get(a.bookingId) || {};

        const destStop = a.segmentRange?.toStop || s.deliveryStop || b.toStop || 'Bangalore';
        const origStop = a.segmentRange?.fromStop || s.pickupStop || b.fromStop || 'Chennai';
        
        let liveStatus = 'ON_TRUCK';
        if (s.status === 'DELIVERED' || b.status === 'DELIVERED' || a.status === 'DELIVERED') {
          liveStatus = 'DELIVERED';
        } else if (norm(destStop) === norm(currentCity)) {
          liveStatus = 'READY_FOR_UNLOAD';
        } else if (['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(trip.status)) {
          liveStatus = 'ON_TRUCK';
        } else {
          liveStatus = 'LOCKED';
        }

        const aDx = Number(a.dimensions?.dx ?? a.dx ?? a.dimensions?.length ?? s.length ?? b.length ?? 1.2);
        const aDy = Number(a.dimensions?.dy ?? a.dy ?? a.dimensions?.width ?? s.width ?? b.width ?? 1.0);
        const aDz = Number(a.dimensions?.dz ?? a.dz ?? a.dimensions?.height ?? s.height ?? b.height ?? 1.2);

        const aX = Number(a.position?.x ?? a.x ?? 0);
        const aY = Number(a.position?.y ?? a.y ?? 0);
        const aZ = Number(a.position?.z ?? a.z ?? 0);

        return {
          ...s,
          ...b,
          ...a,
          shipmentId: a.shipmentId,
          bookingId: a.bookingId || s.bookingId || b.bookingId,
          cargoDescription: s.cargoDescription || b.cargoDescription || a.cargoDescription || 'General Cargo',
          pickupStop: origStop,
          deliveryStop: destStop,
          pickup: origStop,
          delivery: destStop,
          dimensions: {
            dx: aDx,
            dy: aDy,
            dz: aDz,
            length: aDx,
            width: aDy,
            height: aDz
          },
          length: aDx,
          width: aDy,
          height: aDz,
          dx: aDx,
          dy: aDy,
          dz: aDz,
          position: { x: aX, y: aY, z: aZ },
          x: aX,
          y: aY,
          z: aZ,
          volume: a.volume || s.volume || b.volume || parseFloat((aDx * aDy * aDz).toFixed(3)) || 1.0,
          weight: a.weight || s.weight || b.weight || 500,
          fragile: Boolean(a.fragile ?? s.fragile ?? b.fragile),
          stackable: a.stackable !== false && s.stackable !== false && b.stackable !== false,
          isLocked: true,
          liveStatus,
          status: liveStatus
        };
      });
    }

    // Fallback if no assignments found in loadPlan but shipments are allocated to trip
    // Uses SpatialEngine bounded strictly by authTruck dimensions so cargo NEVER exceeds rear doors
    if (assignments.length === 0) {
      const allocatedShipments = await Shipment.find({ allocatedTripId: trip.tripId }).lean();
      if (allocatedShipments.length > 0) {
        const fallbackSpatial = new SpatialEngine(authTruck.dimensions, authTruck.capacityVolume);
        const stopsList = trip.route?.stopsDetails?.map(s => s.locationName) || trip.route?.stops || ['Chennai', 'Bangalore'];

        assignments = [];
        for (const s of allocatedShipments) {
          const sLen = Number(s.length || 1.2);
          const sWidth = Number(s.width || 1.0);
          const sHeight = Number(s.height || 1.2);

          const pIdx = stopsList.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stopsList.findIndex(st => norm(st) === norm(s.deliveryStop));
          const segRange = {
            fromIndex: pIdx >= 0 ? pIdx : 0,
            toIndex: dIdx >= 0 ? dIdx : stopsList.length - 1,
            fromStop: s.pickupStop || stopsList[0],
            toStop: s.deliveryStop || stopsList[stopsList.length - 1]
          };

          const placement = fallbackSpatial.findBestPlacement({
            shipmentId: s.shipmentId,
            dimensions: { length: sLen, width: sWidth, height: sHeight },
            volume: s.volume || (sLen * sWidth * sHeight) || 1.0,
            weight: s.weight || 500,
            allowRotation: s.allowRotation !== false,
            segmentRange: segRange
          });

          if (placement) {
            fallbackSpatial.placeBox(s, placement);
            const isDelivered = s.status === 'DELIVERED';
            const isReadyUnload = !isDelivered && norm(s.deliveryStop) === norm(currentCity);
            const lStatus = isDelivered ? 'DELIVERED' : isReadyUnload ? 'READY_FOR_UNLOAD' : 'ON_TRUCK';

            const aDx = placement.dims.dx;
            const aDy = placement.dims.dy;
            const aDz = placement.dims.dz;

            assignments.push({
              ...s,
              shipmentId: s.shipmentId,
              bookingId: s.bookingId || s.shipmentId,
              cargoDescription: s.cargoDescription || 'General Cargo',
              pickupStop: s.pickupStop || stopsList[0],
              deliveryStop: s.deliveryStop || stopsList[stopsList.length - 1],
              pickup: s.pickupStop || stopsList[0],
              delivery: s.deliveryStop || stopsList[stopsList.length - 1],
              dimensions: { dx: aDx, dy: aDy, dz: aDz, length: aDx, width: aDy, height: aDz },
              dx: aDx,
              dy: aDy,
              dz: aDz,
              length: aDx,
              width: aDy,
              height: aDz,
              x: placement.position.x,
              y: placement.position.y,
              z: placement.position.z,
              position: placement.position,
              volume: s.volume || parseFloat((aDx * aDy * aDz).toFixed(3)) || 1.0,
              weight: s.weight || 500,
              fragile: Boolean(s.fragile),
              stackable: s.stackable !== false,
              isLocked: true,
              liveStatus: lStatus,
              status: lStatus
            });
          }
        }
      }
    }

    const tripObj = trip.toObject();
    tripObj.effectiveVehicle = authTruck;
    if (tripObj.vehicle) {
      tripObj.vehicle.dimensions = authTruck.dimensions;
      tripObj.vehicle.capacityVolume = authTruck.capacityVolume;
      tripObj.vehicle.capacityWeight = authTruck.capacityWeight;
    }

    res.json({
      trip: tripObj,
      vehicle: authTruck,
      stops,
      latestPlan,
      assignments
    });
  } catch (error) {
    console.error('getTripById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get eligible candidate shipments for a trip
 * @route   GET /api/trips/:tripId/candidates
 */
export const getCandidateShipmentsForTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route');
    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    const authTruck = resolveAuthoritativeTruck(trip, trip.vehicle);
    const route = trip.route;
    const stops = route.stopsDetails?.length > 1
      ? route.stopsDetails.map(s => s.locationName)
      : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

    // Determine Current Stop & Stop Index
    let currentStop = trip.currentStop || stops[0];
    let currentStopIndex = stops.findIndex(st => norm(st) === norm(currentStop));
    if (currentStopIndex === -1) {
      currentStopIndex = 0;
      currentStop = stops[0];
    }

    // 1. Genuinely available/unallocated consignments ONLY
    // Must NOT be locked to ANY trip and must not be allocated to another trip
    const rawCandidates = await Shipment.find({
      status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] },
      isLocked: { $ne: true },
      $or: [
        { allocationStatus: { $in: ['AVAILABLE_FOR_OPTIMIZATION', 'PENDING', null] } },
        { allocationStatus: { $exists: false } }
      ],
      $and: [
        { $or: [{ allocatedTripId: null }, { allocatedTripId: { $exists: false } }, { allocatedTripId: '' }] }
      ]
    }).sort({ priority: -1, requestedDate: 1 });

    // Filter and segregate candidates
    const eligibleAtCurrentStop = [];
    const futureOriginShipments = [];
    const futureOriginBreakdown = {};

    for (const s of rawCandidates) {
      const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
      const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));

      if (pIdx !== -1 && dIdx !== -1 && pIdx < dIdx) {
        const candidateObj = {
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId || 'Shipper',
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          pickupIndex: pIdx,
          deliveryIndex: dIdx,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority || 'STANDARD',
          requestedDate: s.requestedDate,
          status: s.status,
          allocationStatus: s.allocationStatus || 'AVAILABLE_FOR_OPTIMIZATION',
          isLocked: false
        };

        // Strict Current-Stop Eligibility Rule:
        // A shipment is eligible for immediate loading ONLY if its pickup stop is the current stop.
        if (pIdx === currentStopIndex) {
          eligibleAtCurrentStop.push(candidateObj);
        } else if (pIdx > currentStopIndex) {
          futureOriginShipments.push(candidateObj);
          if (!futureOriginBreakdown[s.pickupStop]) {
            futureOriginBreakdown[s.pickupStop] = { count: 0, totalVolume: 0, totalWeight: 0, items: [] };
          }
          futureOriginBreakdown[s.pickupStop].count++;
          futureOriginBreakdown[s.pickupStop].totalVolume = parseFloat((futureOriginBreakdown[s.pickupStop].totalVolume + (s.volume || 0)).toFixed(2));
          futureOriginBreakdown[s.pickupStop].totalWeight += (s.weight || 0);
          futureOriginBreakdown[s.pickupStop].items.push(s.shipmentId);
        }
      }
    }

    // 2. Fetch cargo already allocated & locked to THIS trip
    const allocatedCargoDocs = await Shipment.find({
      allocatedTripId: trip.tripId,
      isLocked: true
    }).sort({ priority: -1, requestedDate: 1 });

    const allocatedCargo = allocatedCargoDocs.map(s => {
      let phys = s.physicalStatus;
      if (!phys || phys === 'WAITING_AT_ORIGIN') {
        if (s.status === 'DELIVERED') {
          phys = 'DELIVERED';
        } else if (['LOADED', 'IN_TRANSIT', 'ONBOARD'].includes(s.status)) {
          phys = 'ONBOARD';
        } else if (norm(s.pickupStop) === norm(currentStop)) {
          phys = 'READY_TO_LOAD';
        } else {
          phys = 'WAITING_AT_ORIGIN';
        }
      }

      let physDisplay = 'WAITING FOR LOAD AT ' + (s.pickupStop || '').toUpperCase();
      if (phys === 'READY_TO_LOAD') physDisplay = 'READY TO LOAD';
      else if (phys === 'ONBOARD') physDisplay = 'ONBOARD';
      else if (phys === 'DELIVERED') physDisplay = 'DELIVERED';

      return {
        shipmentId: s.shipmentId,
        bookingId: s.shipmentId,
        customer: s.shipperId || 'Shipper',
        cargoDescription: s.cargoDescription,
        pickup: s.pickupStop,
        delivery: s.deliveryStop,
        loadStop: s.pickupStop,
        unloadStop: s.deliveryStop,
        volume: s.volume,
        weight: s.weight,
        dimensions: { length: s.length, width: s.width, height: s.height },
        fragile: s.fragile,
        stackable: s.stackable,
        priority: s.priority || 'STANDARD',
        status: s.status,
        planStatus: 'LOCKED',
        allocationStatus: s.allocationStatus,
        physicalStatus: phys,
        physicalStatusDisplay: physDisplay,
        isLocked: true,
        allocatedLoadPlanId: s.allocatedLoadPlanId,
        allocatedAt: s.allocatedAt
      };
    });

    const physicalOnboard = allocatedCargo.filter(c => c.physicalStatus === 'ONBOARD');
    const onboardVol = physicalOnboard.reduce((s, c) => s + (c.volume || 0), 0);
    const onboardWt = physicalOnboard.reduce((s, c) => s + (c.weight || 0), 0);

    const currentPhysicalLoad = {
      packagesCount: trip.actualLoadSnapshot?.packagesCount ?? physicalOnboard.length,
      usedVolume: trip.actualLoadSnapshot?.usedVolume ?? parseFloat(onboardVol.toFixed(2)),
      usedWeight: trip.actualLoadSnapshot?.usedWeight ?? Math.round(onboardWt),
      loadedShipmentIds: trip.actualLoadSnapshot?.loadedShipmentIds ?? physicalOnboard.map(c => c.shipmentId)
    };

    res.json({
      success: true,
      tripId,
      tripStatus: trip.status,
      currentStop,
      currentStopIndex,
      stopsCount: stops.length,
      vehicle: authTruck,
      route: trip.route,
      stops,
      candidatesCount: eligibleAtCurrentStop.length,
      candidates: eligibleAtCurrentStop,
      candidateShipments: eligibleAtCurrentStop,
      eligibleCandidates: eligibleAtCurrentStop,
      eligibleCount: eligibleAtCurrentStop.length,
      futureOriginShipments,
      futureCount: futureOriginShipments.length,
      futureOriginBreakdown,
      allocatedCargoCount: allocatedCargo.length,
      allocatedCargo,
      currentPhysicalLoad,
      actualLoadSnapshot: currentPhysicalLoad
    });
  } catch (error) {
    console.error('getCandidateShipmentsForTrip error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Preview optimization in-memory (ZERO database mutations)
 * @route   POST /api/trips/:tripId/optimize/preview
 */
export const previewOptimization = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { customCandidates, selectedShipmentIds, config } = req.body;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route');
    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    if (['CANCELLED', 'COMPLETED'].includes(trip.status?.toUpperCase())) {
      return res.status(400).json({ success: false, message: `Cannot optimize trip ${tripId} with status '${trip.status}'.` });
    }

    // Backend duplicate allocation check: prevent re-optimizing cargo locked to another trip
    if (Array.isArray(selectedShipmentIds) && selectedShipmentIds.length > 0) {
      const lockedShipments = await Shipment.find({
        shipmentId: { $in: selectedShipmentIds },
        isLocked: true,
        allocatedTripId: { $ne: trip.tripId }
      });
      if (lockedShipments.length > 0) {
        const lockedIds = lockedShipments.map(s => `${s.shipmentId} (locked on Trip ${s.allocatedTripId})`).join(', ');
        return res.status(409).json({
          success: false,
          message: `Duplicate Allocation Conflict: Consignments [${lockedIds}] are already locked and allocated to another trip. Unlock them first.`
        });
      }
    }

    const authTruck = resolveAuthoritativeTruck(trip, trip.vehicle);

    // Resolve candidates
    let candidatesToUse = customCandidates;
    if (!candidatesToUse || !Array.isArray(candidatesToUse) || candidatesToUse.length === 0) {
      const route = trip.route;
      const stops = route.stopsDetails?.length > 1
        ? route.stopsDetails.map(s => s.locationName)
        : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

      let queryFilter = {
        $or: [
          { status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] }, isLocked: { $ne: true } },
          { allocatedTripId: trip.tripId } // Allow re-evaluating this trip's cargo during preview
        ]
      };
      if (Array.isArray(selectedShipmentIds) && selectedShipmentIds.length > 0) {
        queryFilter = { shipmentId: { $in: selectedShipmentIds } };
      }

      const rawShipments = await Shipment.find(queryFilter);

      candidatesToUse = rawShipments
        .filter(s => {
          const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));
          return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
        })
        .map(s => ({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId,
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority
        }));
    }

    // Run pure optimizer using authoritative vehicle specifications
    const result = generateLoadPlan({
      truck: authTruck,
      route: trip.route,
      shipments: candidatesToUse,
      currentLoad: [],
      config: config || {}
    });

    res.json({
      success: true,
      preview: true,
      tripId,
      truck: authTruck,
      vehicle: authTruck,
      route: trip.route,
      loadPlan: result,
      optimizationResult: result,
      ...result
    });
  } catch (error) {
    console.error('previewOptimization error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Run optimizer and generate a persistent LoadPlan version (status = GENERATED / UNDER_REVIEW)
 * @route   POST /api/trips/:tripId/optimize/generate
 */
export const generateTripLoadPlan = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;
    const { customCandidates, selectedShipmentIds, config } = req.body;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].includes(trip.status?.toUpperCase())) {
      throw { status: 400, message: `Cannot generate load plan for trip in '${trip.status}' status.` };
    }

    const authTruck = resolveAuthoritativeTruck(trip, trip.vehicle);

    // Resolve candidates
    let candidatesToUse = customCandidates;
    if (!candidatesToUse || !Array.isArray(candidatesToUse) || candidatesToUse.length === 0) {
      const route = trip.route;
      const stops = route.stopsDetails?.length > 1
        ? route.stopsDetails.map(s => s.locationName)
        : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

      let queryFilter = { status: { $in: ['DRAFT', 'PENDING', 'BOOKED', 'ALLOCATED'] } };
      if (Array.isArray(selectedShipmentIds) && selectedShipmentIds.length > 0) {
        queryFilter.shipmentId = { $in: selectedShipmentIds };
      }

      const rawShipments = await Shipment.find(queryFilter).session(session);

      candidatesToUse = rawShipments
        .filter(s => {
          const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));
          return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
        })
        .map(s => ({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId,
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority
        }));
    }

    // Run core domain optimizer using authoritative vehicle specifications
    const optResult = generateLoadPlan({
      truck: authTruck,
      route: trip.route,
      shipments: candidatesToUse,
      currentLoad: [],
      config: config || {}
    });

    // Determine version number
    const lastPlan = await LoadPlan.findOne({ tripId }).sort({ version: -1 }).session(session);
    const nextVersion = lastPlan ? lastPlan.version + 1 : 1;

    // Supersede older unapproved plans
    if (lastPlan && lastPlan.status === 'GENERATED') {
      lastPlan.status = 'SUPERSEDED';
      lastPlan.auditLog.push({
        action: 'SUPERSEDED',
        performedBy: req.user?.username || 'system',
        timestamp: new Date(),
        notes: `Superseded by new version ${nextVersion}`,
        version: lastPlan.version
      });
      await lastPlan.save({ session });
    }

    const loadPlanId = `LP-${tripId}-v${nextVersion}-${Date.now()}`;
    const newPlan = new LoadPlan({
      loadPlanId,
      trip: trip._id,
      tripId,
      vehicleId: trip.vehicleId,
      routeId: trip.routeId,
      version: nextVersion,
      optimizerVersion: optResult.algorithmVersion,
      strategyUsed: optResult.loadPlan.strategyUsed,
      generatedAt: new Date(),
      objectiveScore: optResult.objectiveScore,
      scoreBreakdown: optResult.scoreBreakdown,
      volumeUtilization: optResult.overallVolumeUtilization,
      weightUtilization: optResult.overallWeightUtilization,
      peakUtilization: {
        volume: optResult.peakVolumeUtilization,
        weight: optResult.peakWeightUtilization
      },
      segmentUtilization: optResult.segmentUtilization,
      unassignedShipments: optResult.unassignedShipments,
      warnings: optResult.warnings,
      explanation: optResult.explanation,
      status: 'GENERATED',
      isImmutable: false,
      auditLog: [{
        action: 'GENERATED',
        performedBy: req.user?.username || 'manager',
        timestamp: new Date(),
        notes: `Generated ${optResult.assignments.length} assignments via ${optResult.loadPlan.strategyUsed}`,
        version: nextVersion
      }]
    });
    await newPlan.save({ session });

    // Save assignments
    const savedAssignments = [];
    for (const a of optResult.assignments) {
      const aDx = Number(a.dimensions?.dx ?? a.dx ?? a.dimensions?.length ?? a.length ?? 0);
      const aDy = Number(a.dimensions?.dy ?? a.dy ?? a.dimensions?.width ?? a.width ?? 0);
      const aDz = Number(a.dimensions?.dz ?? a.dz ?? a.dimensions?.height ?? a.height ?? 0);
      const assignDoc = new LoadAssignment({
        loadPlan: newPlan._id,
        loadPlanId: newPlan.loadPlanId,
        shipmentId: a.shipmentId,
        bookingId: a.bookingId,
        customer: a.customer || '',
        priority: a.priority,
        fragile: a.fragile,
        stackable: a.stackable,
        segmentRange: a.segmentRange,
        loadingSequence: a.loadingSequence,
        unloadingSequence: a.unloadingSequence,
        dimensions: {
          dx: aDx,
          dy: aDy,
          dz: aDz,
          length: aDx,
          width: aDy,
          height: aDz
        },
        dx: aDx,
        dy: aDy,
        dz: aDz,
        length: aDx,
        width: aDy,
        height: aDz,
        volume: a.volume,
        weight: a.weight,
        orientation: a.orientation,
        position: a.position,
        obstructionScore: a.obstructionScore || 0,
        status: 'PROPOSED'
      });
      await assignDoc.save({ session });
      savedAssignments.push(assignDoc);
    }

    if (tx) await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `Load plan v${nextVersion} generated successfully`,
      loadPlan: newPlan,
      assignments: savedAssignments,
      unassigned: optResult.unassignedShipments,
      optimizationResult: optResult
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('generateTripLoadPlan error:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get load plan by tripId (or specific version)
 * @route   GET /api/trips/:tripId/load-plan
 */
export const getTripLoadPlan = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { version, loadPlanId } = req.query;

    const filter = { tripId };
    if (loadPlanId) filter.loadPlanId = loadPlanId;
    if (version) filter.version = parseInt(version);

    const loadPlan = await LoadPlan.findOne(filter).sort({ version: -1 });
    if (!loadPlan) return res.status(404).json({ success: false, message: 'Load plan not found.' });

    const assignments = await LoadAssignment.find({ loadPlanId: loadPlan.loadPlanId }).sort({ loadingSequence: 1 });
    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route');

    const authTruck = trip ? resolveAuthoritativeTruck(trip, trip.vehicle) : null;
    const currentStop = trip?.currentStop || 'Chennai';

    // Authoritative physical load calculation
    const physicalOnboard = assignments.filter(a =>
      a.physicalStatus === 'ONBOARD' || a.status === 'LOADED' || a.status === 'IN_TRANSIT'
    );
    const onboardVol = physicalOnboard.reduce((s, a) => s + (a.volume || 0), 0);
    const onboardWt = physicalOnboard.reduce((s, a) => s + (a.weight || 0), 0);

    const loadPlanObj = loadPlan.toObject ? loadPlan.toObject() : loadPlan;
    res.json({
      success: true,
      loadPlan: loadPlanObj,
      assignments,
      ...loadPlanObj,
      assignedCount: assignments.length,
      trip: trip ? trip.toObject() : null,
      vehicle: authTruck,
      currentStop,
      currentPhysicalLoad: {
        packagesCount: trip?.actualLoadSnapshot?.packagesCount ?? physicalOnboard.length,
        usedVolume: trip?.actualLoadSnapshot?.usedVolume ?? parseFloat(onboardVol.toFixed(2)),
        usedWeight: trip?.actualLoadSnapshot?.usedWeight ?? Math.round(onboardWt),
        loadedShipmentIds: trip?.actualLoadSnapshot?.loadedShipmentIds ?? physicalOnboard.map(a => a.shipmentId)
      },
      actualLoadSnapshot: trip?.actualLoadSnapshot || {
        usedVolume: parseFloat(onboardVol.toFixed(2)),
        usedWeight: Math.round(onboardWt),
        packagesCount: physicalOnboard.length,
        loadedShipmentIds: physicalOnboard.map(a => a.shipmentId)
      },
      peakVolumeUtilization: loadPlanObj.peakUtilization?.volume || loadPlanObj.volumeUtilization || 0,
      peakWeightUtilization: loadPlanObj.peakUtilization?.weight || loadPlanObj.weightUtilization || 0
    });
  } catch (error) {
    console.error('getTripLoadPlan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve a load plan version (with optimistic locking)
 * @route   POST /api/trips/:tripId/load-plan/:loadPlanId/approve
 */
export const approveTripLoadPlan = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;
    let targetLoadPlanId = req.params.loadPlanId || req.body.loadPlanId;
    const { expectedVersion, notes } = req.body;

    const trip = await Trip.findOne({ tripId }).session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
      throw { status: 400, message: `Cannot approve load plan: Trip ${tripId} is already ${trip.status}.` };
    }

    let plan = null;
    if (targetLoadPlanId) {
      plan = await LoadPlan.findOne({ loadPlanId: targetLoadPlanId, tripId }).session(session);
    }
    if (!plan) {
      plan = await LoadPlan.findOne({ tripId }).sort({ version: -1, createdAt: -1 }).session(session);
    }

    if (!plan) {
      // Auto-generate plan from candidates if not yet in DB
      const fullTrip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
      if (!fullTrip || !fullTrip.vehicle || !fullTrip.route) {
        throw { status: 404, message: `Cannot auto-generate load plan: Trip vehicle or route missing.` };
      }

      const rawShipments = await Shipment.find({
        status: { $in: ['DRAFT', 'PENDING', 'BOOKED', 'ALLOCATED'] }
      }).session(session);

      const route = fullTrip.route;
      const stops = route.stopsDetails?.length > 1
        ? route.stopsDetails.map(s => s.locationName)
        : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

      const candidatesToUse = rawShipments
        .filter(s => {
          const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));
          return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
        })
        .map(s => ({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId,
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority
        }));

      const optResult = generateLoadPlan({
        truck: fullTrip.vehicle,
        route: fullTrip.route,
        shipments: candidatesToUse,
        currentLoad: [],
        config: {}
      });

      const vehicleId = fullTrip.vehicleId || fullTrip.vehicle?.vehicleId;
      const routeId = fullTrip.routeId || fullTrip.route?.routeId;
      const nextVersion = 1;
      const genLoadPlanId = `LP-${tripId}-v${nextVersion}-${Date.now()}`;
      plan = new LoadPlan({
        loadPlanId: genLoadPlanId,
        trip: fullTrip._id,
        tripId,
        vehicleId,
        routeId,
        organizationId: fullTrip.organizationId,
        logisticsCompanyName: fullTrip.logisticsCompanyName || '',
        version: nextVersion,
        status: 'UNDER_REVIEW',
        generatedAt: new Date(),
        volumeUtilization: optResult.overallVolumeUtilization || optResult.loadPlan?.volumeUtilization || 0,
        weightUtilization: optResult.overallWeightUtilization || optResult.loadPlan?.weightUtilization || 0,
        peakUtilization: {
          volume: optResult.peakVolumeUtilization || optResult.loadPlan?.peakVolumeUtilization || 0,
          weight: optResult.peakWeightUtilization || optResult.loadPlan?.peakWeightUtilization || 0
        },
        objectiveScore: optResult.objectiveScore || optResult.loadPlan?.objectiveScore || 0,
        scoreBreakdown: optResult.scoreBreakdown || {},
        segmentUtilization: optResult.segmentUtilization || [],
        unassignedShipments: optResult.unassignedShipments || [],
        warnings: optResult.warnings || [],
        explanation: optResult.explanation || '',
        strategyUsed: optResult.strategyUsed || optResult.loadPlan?.strategyUsed || 'Priority-LIFO-Density',
        auditLog: [{
          action: 'GENERATED',
          performedBy: req.user?.username || 'manager',
          timestamp: new Date(),
          notes: `Auto-generated ${optResult.assignments.length} assignments before approval`,
          version: nextVersion
        }]
      });
      await plan.save({ session });

      for (const a of optResult.assignments) {
        const assignDoc = new LoadAssignment({
          loadPlan: plan._id,
          loadPlanId: plan.loadPlanId,
          shipmentId: a.shipmentId,
          bookingId: a.bookingId,
          customer: a.customer || '',
          priority: a.priority,
          fragile: a.fragile,
          stackable: a.stackable,
          segmentRange: a.segmentRange,
          loadingSequence: a.loadingSequence,
          unloadingSequence: a.unloadingSequence,
          dimensions: {
            length: a.dimensions?.length || 0,
            width: a.dimensions?.width || 0,
            height: a.dimensions?.height || 0
          },
          volume: a.volume,
          weight: a.weight,
          orientation: a.orientation,
          position: a.position,
          obstructionScore: a.obstructionScore || 0,
          status: 'PROPOSED'
        });
        await assignDoc.save({ session });
      }
    }

    const loadPlanId = plan.loadPlanId;

    // Optimistic locking check
    if (expectedVersion !== undefined && plan.version !== expectedVersion) {
      throw {
        status: 409,
        message: `Concurrency Conflict: Plan has been modified to version ${plan.version} (expected ${expectedVersion}). Please review latest version.`
      };
    }

    if (plan.status === 'APPROVED') {
      return res.json({ success: true, message: 'Plan already approved', loadPlan: plan });
    }

    const now = new Date();

    // 1. Supersede any other approved plans on this trip
    await LoadPlan.updateMany(
      { tripId, loadPlanId: { $ne: loadPlanId }, status: 'APPROVED' },
      {
        $set: { status: 'SUPERSEDED' },
        $push: {
          auditLog: {
            action: 'SUPERSEDED',
            performedBy: req.user?.username || 'manager',
            timestamp: now,
            notes: `Superseded by approval of ${loadPlanId}`
          }
        }
      },
      { session }
    );

    // 2. Mark this plan as APPROVED & LOCKED
    plan.status = 'APPROVED';
    plan.isImmutable = true;
    plan.approvedBy = req.user?._id;
    plan.approvedByUsername = req.user?.username || 'manager';
    plan.approvedAt = now;
    plan.lockedAt = now;
    plan.auditLog.push({
      action: 'APPROVED',
      performedBy: req.user?.username || 'manager',
      timestamp: now,
      notes: notes || 'Load plan reviewed, approved, and locked by logistics manager.',
      version: plan.version
    });
    await plan.save({ session });

    // 3. Atomically update all assigned shipments and bookings to LOCKED & ALLOCATED
    let assignments = await LoadAssignment.find({ loadPlanId }).session(session);

    if (assignments.length === 0 && req.body.assignments && req.body.assignments.length > 0) {
      for (const a of req.body.assignments) {
        const assignDoc = new LoadAssignment({
          loadPlan: plan._id,
          loadPlanId: plan.loadPlanId,
          shipmentId: a.shipmentId,
          bookingId: a.bookingId || a.shipmentId,
          customer: a.customer || a.shipperId || '',
          priority: a.priority || 'STANDARD',
          fragile: Boolean(a.fragile),
          stackable: a.stackable !== false,
          segmentRange: a.segmentRange || {
            fromStop: a.pickupStop || a.pickup || a.fromStop || 'Chennai',
            toStop: a.deliveryStop || a.delivery || a.toStop || 'Bangalore'
          },
          loadingSequence: a.loadingSequence || 0,
          unloadingSequence: a.unloadingSequence || 0,
          dimensions: {
            length: a.dimensions?.length || a.dx || a.length || 1.2,
            width: a.dimensions?.width || a.dy || a.width || 1.0,
            height: a.dimensions?.height || a.dz || a.height || 1.2
          },
          volume: a.volume || 1.0,
          weight: a.weight || 500,
          orientation: a.orientation || 'XYZ',
          position: a.position || { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 },
          status: 'ASSIGNED'
        });
        await assignDoc.save({ session });
      }
      assignments = await LoadAssignment.find({ loadPlanId }).session(session);
    }

    for (const assign of assignments) {
      const fromStop = assign.segmentRange?.fromStop || 'Chennai';
      const isOriginCurrent = norm(fromStop) === norm(trip.currentStop || 'Chennai');
      const physStatus = isOriginCurrent ? 'READY_TO_LOAD' : 'WAITING_AT_ORIGIN';

      assign.status = 'ASSIGNED';
      assign.physicalStatus = physStatus;
      await assign.save({ session });

      if (assign.shipmentId) {
        await Shipment.updateOne(
          { shipmentId: assign.shipmentId },
          {
            $set: {
              status: 'LOCKED',
              allocationStatus: 'LOCKED',
              physicalStatus: physStatus,
              isLocked: true,
              lockedAt: now,
              allocatedTripId: trip.tripId,
              allocatedLoadPlanId: plan.loadPlanId,
              allocatedVehicleId: trip.vehicleId,
              allocatedAt: now,
              vehicleId: trip.vehicleId,
              assignedVehicleId: trip.vehicleId,
              assignedTripId: trip.tripId
            }
          },
          { session }
        );
      }
      if (assign.bookingId) {
        await Booking.updateOne(
          { $or: [{ bookingId: assign.bookingId }, { shipmentId: assign.shipmentId }] },
          {
            $set: {
              status: 'LOCKED',
              allocationStatus: 'LOCKED',
              isLocked: true,
              lockedAt: now,
              allocatedTripId: trip.tripId,
              allocatedLoadPlanId: plan.loadPlanId,
              allocatedVehicleId: trip.vehicleId,
              allocatedAt: now,
              vehicleId: trip.vehicleId,
              assignedVehicleId: trip.vehicleId,
              assignedTripId: trip.tripId
            }
          },
          { session }
        );
      }
    }

    // 4. Update Trip status to READY_FOR_DISPATCH
    trip.status = 'READY_FOR_DISPATCH';
    trip.activeLoadPlanId = plan.loadPlanId;
    await trip.save({ session });

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Load Plan v${plan.version} approved and locked successfully! Trip ${trip.tripId} is READY_FOR_DISPATCH.`,
      loadPlan: plan,
      trip
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('approveTripLoadPlan error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Explicitly unlock and release cargo allocations on a trip for re-optimization
 * @route   POST /api/trips/:tripId/load-plan/unlock
 */
export const unlockTripLoadPlan = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;
    const trip = await Trip.findOne({ tripId }).session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
      throw { status: 400, message: `Cannot unlock load plan: Trip ${tripId} is already in state '${trip.status}'.` };
    }

    const now = new Date();

    // 1. Release all locked consignments belonging to this trip
    await Shipment.updateMany(
      { allocatedTripId: trip.tripId },
      {
        $set: {
          status: 'BOOKED',
          allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
          physicalStatus: 'WAITING_AT_ORIGIN',
          isLocked: false,
          lockedAt: null,
          allocatedTripId: null,
          allocatedLoadPlanId: null,
          allocatedVehicleId: null,
          allocatedAt: null,
          assignedTripId: null,
          assignedVehicleId: null,
          vehicleId: null
        }
      },
      { session }
    );

    await Booking.updateMany(
      { allocatedTripId: trip.tripId },
      {
        $set: {
          status: 'PENDING',
          allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
          isLocked: false,
          lockedAt: null,
          allocatedTripId: null,
          allocatedLoadPlanId: null,
          allocatedVehicleId: null,
          allocatedAt: null,
          assignedTripId: null,
          assignedVehicleId: 'UNASSIGNED',
          vehicleId: 'UNASSIGNED'
        }
      },
      { session }
    );

    // 2. Mark existing load plans for this trip as SUPERSEDED
    await LoadPlan.updateMany(
      { tripId, status: { $in: ['APPROVED', 'LOCKED', 'ACTIVE'] } },
      {
        $set: { status: 'SUPERSEDED', isImmutable: false },
        $push: {
          auditLog: {
            action: 'SUPERSEDED',
            performedBy: req.user?.username || 'manager',
            timestamp: now,
            notes: 'Load plan unlocked by logistics manager for re-optimization.'
          }
        }
      },
      { session }
    );

    // 3. Reset Trip status back to PLANNED
    trip.status = 'PLANNED';
    trip.activeLoadPlanId = null;
    await trip.save({ session });

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Load plan unlocked successfully for Trip ${tripId}. Consignments are returned to the Candidate Pool.`,
      trip
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('unlockTripLoadPlan error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Reject a load plan version
 * @route   POST /api/trips/:tripId/load-plan/:loadPlanId/reject
 */
export const rejectTripLoadPlan = async (req, res) => {
  try {
    const { tripId, loadPlanId } = req.params;
    const { reason } = req.body;

    const plan = await LoadPlan.findOne({ loadPlanId, tripId });
    if (!plan) return res.status(404).json({ success: false, message: 'Load plan not found.' });

    if (plan.isImmutable) {
      return res.status(400).json({ success: false, message: 'Cannot reject immutable load plan.' });
    }

    plan.status = 'REJECTED';
    plan.auditLog.push({
      action: 'REJECTED',
      performedBy: req.user?.username || 'manager',
      timestamp: new Date(),
      notes: reason || 'Rejected by logistics manager.'
    });
    await plan.save();

    res.json({ success: true, message: 'Load plan rejected', loadPlan: plan });
  } catch (error) {
    console.error('rejectTripLoadPlan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Dispatch trip (locks approved load plan immutably and starts transit)
 * @route   POST /api/trips/:tripId/dispatch
 */
export const dispatchPlannedTrip = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    // Verify trip has an APPROVED or LOCKED load plan
    const approvedPlan = await LoadPlan.findOne({
      tripId,
      status: { $in: ['APPROVED', 'LOCKED', 'ACTIVE'] }
    }).session(session);

    if (!approvedPlan) {
      throw { status: 400, message: `Cannot dispatch Trip ${tripId}: No APPROVED load plan found. Please generate and approve a load plan first.` };
    }

    // 1. Lock load plan as ACTIVE and IMMUTABLE
    approvedPlan.status = 'ACTIVE';
    approvedPlan.isImmutable = true;
    approvedPlan.auditLog.push({
      action: 'ACTIVE',
      performedBy: req.user?.username || 'dispatcher',
      timestamp: new Date(),
      notes: `Trip dispatched. Load plan v${approvedPlan.version} is now immutable.`
    });
    await approvedPlan.save({ session });

    // 2. Fetch and transition all allocated cargo to IN_TRANSIT
    const assignments = await LoadAssignment.find({ loadPlanId: approvedPlan.loadPlanId }).session(session);
    const assignedShipmentIds = assignments.map(a => a.shipmentId).filter(Boolean);
    const assignedBookingIds = assignments.map(a => a.bookingId).filter(Boolean);

    const now = new Date();

    if (assignedShipmentIds.length > 0) {
      await Shipment.updateMany(
        { $or: [{ shipmentId: { $in: assignedShipmentIds } }, { allocatedTripId: trip.tripId }] },
        {
          $set: {
            status: 'IN_TRANSIT',
            allocationStatus: 'IN_TRANSIT',
            isLocked: true,
            lockedAt: now,
            allocatedTripId: trip.tripId,
            allocatedVehicleId: trip.vehicleId,
            allocatedLoadPlanId: approvedPlan.loadPlanId,
            loadedAt: now
          }
        },
        { session }
      );
    }

    if (assignedBookingIds.length > 0) {
      await Booking.updateMany(
        { $or: [{ bookingId: { $in: assignedBookingIds } }, { allocatedTripId: trip.tripId }] },
        {
          $set: {
            status: 'IN_TRANSIT',
            allocationStatus: 'IN_TRANSIT',
            isLocked: true,
            lockedAt: now,
            allocatedTripId: trip.tripId,
            allocatedVehicleId: trip.vehicleId,
            allocatedLoadPlanId: approvedPlan.loadPlanId,
            loadedAt: now
          }
        },
        { session }
      );
    }

    // 3. Mark trip status as IN_TRANSIT with activeLoadPlanId and actualLoadSnapshot
    trip.status = 'IN_TRANSIT';
    trip.activeLoadPlanId = approvedPlan.loadPlanId;
    trip.actualDeparture = now;
    trip.startedAt = now;
    trip.actualLoadSnapshot = {
      usedVolume: approvedPlan.volumeUtilization || 0,
      usedWeight: approvedPlan.weightUtilization || 0,
      packagesCount: assignments.length,
      loadedShipmentIds: assignedShipmentIds
    };
    await trip.save({ session });

    // 4. Mark vehicle as IN_TRANSIT
    const vehicle = await Vehicle.findOne({ vehicleId: trip.vehicleId }).session(session);
    if (vehicle) {
      vehicle.transitStatus = 'IN_TRANSIT';
      vehicle.activeTripId = trip.tripId;
      vehicle.tripStartedAt = now;
      await vehicle.save({ session });
    }

    // 5. Ensure TripStops are initialized
    const existingStops = await TripStop.find({ tripId }).session(session);
    if (existingStops.length > 0) {
      await TripStop.updateOne({ tripId, sequence: 1 }, { verificationStatus: 'COMPLETED', actualArrival: now }, { session });
      if (existingStops.length > 1) {
        await TripStop.updateOne({ tripId, sequence: 2 }, { verificationStatus: 'READY' }, { session });
      }
    }

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Trip ${tripId} successfully dispatched! ${assignments.length} consignments are IN_TRANSIT on Truck ${trip.vehicleId}.`,
      trip,
      loadPlan: approvedPlan,
      assignedCount: assignments.length
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('dispatchPlannedTrip error:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Preview dynamic re-optimization for remaining route (In-memory, 0 DB mutations)
 * @route   POST /api/trips/:tripId/reoptimize/preview
 */
export const previewDynamicReoptimizationController = async (req, res) => {
  const { tripId } = req.params;
  const { additionalCandidateShipmentIds, reason } = req.body;

  try {
    const { computeDynamicReoptimization } = await import('../services/dynamicReoptimizationService.js');
    const result = await computeDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds,
      reason: reason || 'Manager re-optimization simulation'
    });

    res.json({
      success: true,
      preview: true,
      message: 'Dynamic re-optimization simulation computed in-memory.',
      ...result
    });
  } catch (error) {
    console.error('previewDynamicReoptimizationController error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Dynamic re-optimization preview failed.'
    });
  }
};

/**
 * @desc    Apply dynamic re-optimization creating a persistent new version of LoadPlan
 * @route   POST /api/trips/:tripId/reoptimize/apply
 */
export const applyDynamicReoptimizationController = async (req, res) => {
  const { tripId } = req.params;
  const { additionalCandidateShipmentIds, autoApprove, reason } = req.body;

  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { applyDynamicReoptimization } = await import('../services/dynamicReoptimizationService.js');
    const result = await applyDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds,
      autoApprove: autoApprove ?? false,
      reason: reason || 'Dynamic downstream capacity optimization',
      performedBy: req.user?.username || 'manager',
      session
    });

    if (tx) await session.commitTransaction();

    res.status(201).json(result);
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('applyDynamicReoptimizationController error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to apply dynamic re-optimization.'
    });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Cancel a planned or ready trip before dispatch
 * @route   POST /api/trips/:tripId/cancel
 */
export const cancelTripController = async (req, res) => {
  const { tripId } = req.params;
  const { reason } = req.body;

  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const trip = await Trip.findOne({ tripId }).session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
      throw { status: 400, message: `Cannot cancel trip in '${trip.status}' status. Only PLANNED or READY_FOR_DISPATCH trips can be cancelled.` };
    }

    const now = new Date();
    trip.status = 'CANCELLED';
    trip.timelineAudit.push({
      event: 'TRIP_CANCELLED',
      timestamp: now,
      performedBy: req.user?.username || 'manager',
      details: { reason: reason || 'Cancelled by manager before dispatch' }
    });
    await trip.save({ session });

    // Cancel associated LoadPlans
    await LoadPlan.updateMany(
      { tripId },
      {
        $set: { status: 'CANCELLED' },
        $push: {
          auditLog: {
            action: 'CANCELLED',
            performedBy: req.user?.username || 'manager',
            timestamp: now,
            notes: `Trip cancelled: ${reason || 'Cancelled before dispatch'}`
          }
        }
      },
      { session }
    );

    // Release allocated assignments back to PENDING/BOOKED
    const assignments = await LoadAssignment.find({
      loadPlanId: { $regex: new RegExp(`^LP-${tripId}`, 'i') }
    }).session(session);

    for (const a of assignments) {
      a.status = 'CANCELLED';
      await a.save({ session });

      if (a.shipmentId) {
        await Shipment.updateOne(
          { shipmentId: a.shipmentId },
          { status: 'PENDING' },
          { session }
        );
      }
      if (a.bookingId) {
        await Booking.updateOne(
          { bookingId: a.bookingId },
          { vehicleId: 'UNASSIGNED', status: 'PENDING' },
          { session }
        );
      }
    }

    // Free up vehicle if bound to this trip
    if (trip.vehicleId) {
      await Vehicle.updateOne(
        { vehicleId: trip.vehicleId, activeTripId: tripId },
        { transitStatus: 'Idle', activeTripId: '' },
        { session }
      );
    }

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Trip ${tripId} has been successfully cancelled and all cargo released.`,
      trip
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('cancelTripController error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to cancel trip.'
    });
  } finally {
    session.endSession();
  }
};

