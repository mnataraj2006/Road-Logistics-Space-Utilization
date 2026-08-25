import crypto from 'crypto';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity, getRemainingCapacityForTruck } from '../services/capacityService.js';

/**
 * Dispatch truck for trip start. Loads origin packages, leaves future pickup packages as WAITING_FOR_PICKUP.
 * @route POST /api/transit/dispatch/:vehicleId
 */
export const dispatchTruck = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    if (vehicle.status !== 'Active') {
      return res.status(400).json({ message: 'Vehicle is not in Active status.' });
    }

    if (!vehicle.routeLane || vehicle.routeLane === 'Inactive Lane') {
      return res.status(400).json({ message: 'Vehicle has no assigned route lane.' });
    }

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    if (!route || !route.stopsDetails || route.stopsDetails.length < 2) {
      return res.status(400).json({ message: 'Assigned route has invalid stop details.' });
    }

    const tripId = `TRIP-${Date.now()}`;
    const originStopName = route.stopsDetails[0].locationName;

    // Update Vehicle state to DISPATCHED / IN_TRANSIT
    vehicle.transitStatus = 'IN_TRANSIT';
    vehicle.currentStop = '';
    vehicle.currentRouteIndex = 0;
    vehicle.tripStartedAt = new Date();
    vehicle.activeTripId = tripId;
    await vehicle.save();

    // Fetch all active bookings assigned to this vehicle
    const activeBookings = await Booking.find({
      vehicleId,
      status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP'] }
    });

    const loadedPackages = [];
    const waitingPackages = [];

    // Process pickup status for trip start
    const updatePromises = activeBookings.map(async (bkg) => {
      const isOriginPickup = bkg.fromStop && bkg.fromStop.toLowerCase() === originStopName.toLowerCase();
      
      if (isOriginPickup) {
        bkg.status = 'IN_TRANSIT';
        bkg.loadedAt = new Date();
        loadedPackages.push(bkg);
      } else {
        bkg.status = 'WAITING_FOR_PICKUP';
        waitingPackages.push(bkg);
      }
      return bkg.save();
    });

    await Promise.all(updatePromises);

    // Update Route stop states
    route.stopsDetails[0].status = 'Completed';
    route.stopsDetails[0].actualArrival = new Date();
    route.stopsDetails[0].completedAt = new Date();

    if (route.stopsDetails[1]) {
      route.stopsDetails[1].status = 'Ready';
      route.stopsDetails[1].plannedArrival = new Date();
    }
    route.currentStopIndex = 0;
    await route.save();

    // Calculate capacity summary
    const capacitySummary = await getRemainingCapacityForTruck(vehicleId);

    res.json({
      success: true,
      message: `Truck ${vehicleId} dispatched on route ${route.routeId}. Loaded ${loadedPackages.length} packages at origin (${originStopName}). ${waitingPackages.length} packages set to WAITING_FOR_PICKUP for downstream stops.`,
      vehicle,
      tripId,
      originStop: originStopName,
      nextExpectedStop: route.stopsDetails[1] ? route.stopsDetails[1].locationName : '',
      loadedCount: loadedPackages.length,
      waitingCount: waitingPackages.length,
      capacitySummary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Server-side QR Stop Verification with 9-Point Security Check
 * @route POST /api/transit/verify-stop
 */
export const verifyStop = async (req, res) => {
  const { vehicleId, qrToken } = req.body;

  if (!vehicleId || !qrToken) {
    return res.status(400).json({
      success: false,
      message: 'Both vehicleId and qrToken are required for verification.'
    });
  }

  try {
    // 1. Check Vehicle exists
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: `Vehicle '${vehicleId}' not found.` });
    }

    // 2. Check Vehicle active status
    if (vehicle.status !== 'Active') {
      return res.status(400).json({ success: false, message: `Vehicle '${vehicleId}' is inactive or out of service.` });
    }

    // 3. Check Route assignment
    if (!vehicle.routeLane || vehicle.routeLane === 'Inactive Lane') {
      return res.status(400).json({ success: false, message: `Vehicle '${vehicleId}' has no route assigned.` });
    }

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    if (!route || !route.stopsDetails || route.stopsDetails.length === 0) {
      return res.status(404).json({ success: false, message: 'Assigned route missing stop configuration.' });
    }

    // 4 & 5. Verify QR token exists on assigned route
    const stopIndex = route.stopsDetails.findIndex(s => s.qrToken === qrToken);
    if (stopIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stop QR token. Token does not belong to the truck\'s assigned route.'
      });
    }

    const targetStop = route.stopsDetails[stopIndex];

    // 8 & 9. Verify trip active status
    if (vehicle.transitStatus === 'READY' || vehicle.transitStatus === 'Idle' || vehicle.transitStatus === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: `Vehicle '${vehicleId}' does not have an active trip in transit.`
      });
    }

    // 7. Check if stop already verified (Duplicate scan protection)
    if (targetStop.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: `Stop '${targetStop.locationName}' has already been verified.`
      });
    }

    // 6. Check sequential stop order (Expected next stop validation)
    // Next expected index is currentRouteIndex + 1 (since currentRouteIndex is last verified stop index)
    const expectedNextIndex = vehicle.currentRouteIndex + 1;
    if (stopIndex !== expectedNextIndex) {
      const expectedStopName = route.stopsDetails[expectedNextIndex]
        ? route.stopsDetails[expectedNextIndex].locationName
        : 'Unknown';
      return res.status(400).json({
        success: false,
        message: `Invalid stop. Expected ${expectedStopName}. Scanned ${targetStop.locationName}.`
      });
    }

    // Capacity BEFORE operations
    const activeBookingsBefore = await Booking.find({
      vehicleId,
      status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
    });
    const capBefore = calculateTruckSegmentCapacity(vehicle, route, activeBookingsBefore);

    // Transition vehicle to AT_STOP
    vehicle.transitStatus = 'AT_STOP';
    vehicle.currentStop = targetStop.locationName;
    await vehicle.save();

    // STEP A: UNLOAD PACKAGES (Delivery stop == current stop)
    const bookingsToUnload = await Booking.find({
      vehicleId,
      status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] },
      toStop: { $regex: new RegExp('^' + targetStop.locationName + '$', 'i') }
    });

    const unloadedDetails = [];
    const unloadPromises = bookingsToUnload.map(async (bkg) => {
      bkg.status = 'DELIVERED';
      bkg.deliveredAt = new Date();
      await bkg.save();

      unloadedDetails.push({
        bookingId: bkg.bookingId,
        volume: bkg.volume,
        weight: bkg.weight,
        shipperId: bkg.shipperId,
        fromStop: bkg.fromStop,
        toStop: bkg.toStop
      });

      // Release payment escrow to carrier
      const payment = await Payment.findOne({ bookingId: bkg.bookingId });
      if (payment) {
        payment.status = 'PaidOut';
        await payment.save();
      }
    });
    await Promise.all(unloadPromises);

    // STEP B: LOAD PACKAGES (Pickup stop == current stop)
    const bookingsToLoad = await Booking.find({
      vehicleId,
      status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP'] },
      fromStop: { $regex: new RegExp('^' + targetStop.locationName + '$', 'i') }
    });

    const loadedDetails = [];
    const loadPromises = bookingsToLoad.map(async (bkg) => {
      bkg.status = 'IN_TRANSIT';
      bkg.loadedAt = new Date();
      await bkg.save();

      loadedDetails.push({
        bookingId: bkg.bookingId,
        volume: bkg.volume,
        weight: bkg.weight,
        shipperId: bkg.shipperId,
        fromStop: bkg.fromStop,
        toStop: bkg.toStop
      });
    });
    await Promise.all(loadPromises);

    // Capacity AFTER operations
    const activeBookingsAfter = await Booking.find({
      vehicleId,
      status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT', 'WAITING_FOR_PICKUP'] }
    });
    const capAfter = calculateTruckSegmentCapacity(vehicle, route, activeBookingsAfter);

    // Update stop state in Route
    targetStop.status = 'Completed';
    targetStop.actualArrival = new Date();
    targetStop.completedAt = new Date();

    // Advance sequence index
    vehicle.currentRouteIndex = stopIndex;
    route.currentStopIndex = stopIndex;

    const isFinalStop = stopIndex === route.stopsDetails.length - 1;

    let nextStopName = '';
    if (isFinalStop) {
      // Final stop reached! Verify all bookings delivered
      const remainingUndelivered = await Booking.find({
        vehicleId,
        status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] }
      });

      // Auto-unload any remaining items at final stop
      if (remainingUndelivered.length > 0) {
        for (const bkg of remainingUndelivered) {
          bkg.status = 'DELIVERED';
          bkg.deliveredAt = new Date();
          await bkg.save();
        }
      }

      vehicle.transitStatus = 'COMPLETED';
      vehicle.currentStop = targetStop.locationName;
      vehicle.activeTripId = '';
      route.status = 'Completed';
    } else {
      // Transition back to IN_TRANSIT for segment travel
      vehicle.transitStatus = 'IN_TRANSIT';
      vehicle.currentStop = '';
      const nextStop = route.stopsDetails[stopIndex + 1];
      if (nextStop) {
        nextStop.status = 'Ready';
        nextStopName = nextStop.locationName;
      }
    }

    await route.save();
    await vehicle.save();

    // Create Audit History Record
    const auditRecord = new StopVerification({
      vehicleId,
      routeId: route.routeId,
      stopId: targetStop.stopId,
      locationName: targetStop.locationName,
      sequenceNumber: targetStop.sequenceNumber,
      timestamp: new Date(),
      verificationMethod: 'QR',
      packagesUnloaded: unloadedDetails,
      packagesLoaded: loadedDetails,
      volumeBefore: capBefore.usedVolume,
      volumeAfter: capAfter.usedVolume,
      weightBefore: capBefore.usedWeight,
      weightAfter: capAfter.usedWeight
    });
    await auditRecord.save();

    res.json({
      success: true,
      message: 'STOP VERIFIED',
      verificationId: auditRecord._id,
      vehicleId,
      stop: targetStop.locationName,
      arrivalTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      operations: {
        unloadedCount: unloadedDetails.length,
        unloaded: unloadedDetails,
        loadedCount: loadedDetails.length,
        loaded: loadedDetails
      },
      capacityAfter: {
        capacityVolume: vehicle.capacityVolume,
        usedVolume: capAfter.usedVolume,
        remainingVolume: capAfter.remainingVolume,
        capacityWeight: vehicle.capacityWeight,
        usedWeight: capAfter.usedWeight,
        remainingWeight: capAfter.remainingWeight,
        volumeUtilizationPercent: capAfter.volumeUtilizationPercent,
        weightUtilizationPercent: capAfter.weightUtilizationPercent
      },
      nextStop: nextStopName,
      transitStatus: vehicle.transitStatus,
      isFinalStop
    });
  } catch (error) {
    console.error('Stop verification server error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get active transits
 * @route GET /api/transit/active
 */
export const getActiveTransits = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      transitStatus: { $in: ['READY', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP'] }
    });

    const activeList = await Promise.all(vehicles.map(async (v) => {
      const route = await Route.findOne({ routeId: v.routeLane });
      const cap = await getRemainingCapacityForTruck(v.vehicleId);

      let nextStop = '';
      if (route && route.stopsDetails && route.stopsDetails.length > v.currentRouteIndex + 1) {
        nextStop = route.stopsDetails[v.currentRouteIndex + 1].locationName;
      }

      const activeBookings = await Booking.find({
        vehicleId: v.vehicleId,
        status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] }
      });

      return {
        vehicleId: v.vehicleId,
        type: v.type,
        routeId: v.routeLane,
        transitStatus: v.transitStatus,
        currentStop: v.currentStop || (route && route.stopsDetails ? route.stopsDetails[v.currentRouteIndex]?.locationName : 'Depot'),
        nextStop,
        currentRouteIndex: v.currentRouteIndex,
        totalStops: route && route.stopsDetails ? route.stopsDetails.length : 0,
        loadedPackagesCount: activeBookings.length,
        capacity: cap
      };
    }));

    res.json(activeList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get transit status & LIFO loading sequence recommendation for a truck
 * @route GET /api/transit/:vehicleId/status
 */
export const getVehicleTransitStatus = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    const capacity = await getRemainingCapacityForTruck(vehicleId);

    const loadedBookings = await Booking.find({
      vehicleId,
      status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] }
    });

    const deliveredBookings = await Booking.find({
      vehicleId,
      status: { $in: ['DELIVERED', 'Completed'] }
    });

    // Determine LIFO Recommended Loading Sequence (rear to front)
    // Packages going to further destinations are loaded deeper (first/front)
    const stopsOrder = new Map(
      (route && route.stopsDetails ? route.stopsDetails : []).map((s, idx) => [s.locationName.toLowerCase(), idx])
    );

    const recommendedLoadingSequence = [...loadedBookings].sort((a, b) => {
      const destIdxA = stopsOrder.get((a.toStop || '').toLowerCase()) || 0;
      const destIdxB = stopsOrder.get((b.toStop || '').toLowerCase()) || 0;
      // Higher destination stop index loaded first (deeper in truck)
      return destIdxB - destIdxA;
    }).map((bkg, index) => ({
      positionNumber: index + 1,
      bookingId: bkg.bookingId,
      volume: bkg.volume,
      weight: bkg.weight,
      fromStop: bkg.fromStop,
      toStop: bkg.toStop,
      positionLabel: index === 0 ? 'Deepest (Front)' : index === loadedBookings.length - 1 ? 'Rear (Door)' : `Middle ${index + 1}`
    }));

    let nextStop = '';
    if (route && route.stopsDetails && route.stopsDetails.length > vehicle.currentRouteIndex + 1) {
      nextStop = route.stopsDetails[vehicle.currentRouteIndex + 1].locationName;
    }

    res.json({
      vehicleId,
      type: vehicle.type,
      transitStatus: vehicle.transitStatus,
      currentStop: vehicle.currentStop,
      currentRouteIndex: vehicle.currentRouteIndex,
      nextStop,
      tripStartedAt: vehicle.tripStartedAt,
      activeTripId: vehicle.activeTripId,
      route: route ? {
        routeId: route.routeId,
        source: route.source,
        destination: route.destination,
        stops: route.stopsDetails
      } : null,
      loadedPackagesCount: loadedBookings.length,
      deliveredPackagesCount: deliveredBookings.length,
      capacity,
      recommendedLoadingSequence
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get stop verification audit log history for a vehicle
 * @route GET /api/transit/:vehicleId/history
 */
export const getStopVerificationHistory = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const history = await StopVerification.find({ vehicleId }).sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Generate secure unpredictbale QR token for a route stop
 * @route POST /api/routes/:routeId/stops/:stopId/generate-qr
 */
export const generateStopQrToken = async (req, res) => {
  const { routeId, stopId } = req.params;

  try {
    const route = await Route.findOne({ routeId });
    if (!route) return res.status(404).json({ message: 'Route not found.' });

    const stop = route.stopsDetails.find(s => s.stopId === stopId);
    if (!stop) return res.status(404).json({ message: 'Stop not found on route.' });

    stop.qrToken = `STPTKN-${crypto.randomBytes(16).toString('hex')}`;
    await route.save();

    res.json({
      success: true,
      message: `Generated new secure QR token for stop ${stop.locationName}.`,
      stopId,
      locationName: stop.locationName,
      qrToken: stop.qrToken
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
