import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import Route from '../models/Route.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

// Helper to dynamically calculate and update the transit state of a vehicle based on elapsed time since tripStartedAt
const updateLiveTransitState = async (vehicle) => {
  if (vehicle.transitStatus === 'Idle' || !vehicle.routeLane || !vehicle.tripStartedAt) {
    return;
  }

  const route = await Route.findOne({ routeId: vehicle.routeLane });
  if (!route || !route.stopsDetails || route.stopsDetails.length === 0) {
    return;
  }

  const stops = route.stopsDetails.map(s => s.locationName);
  const totalStops = stops.length;
  if (totalStops <= 1) return;

  const elapsedMs = Date.now() - new Date(vehicle.tripStartedAt).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // Speed assumptions
  const averageSpeed = 60; // 60 km/h
  const stopBuffer = 0.5;  // 30 mins buffer per stop
  const totalDistance = route.distance || 100;
  
  // Calculate segments
  const numSegments = totalStops - 1;
  const segmentDistance = totalDistance / numSegments;
  const segmentTravelTime = segmentDistance / averageSpeed;

  const stopTimes = [];
  for (let j = 0; j < totalStops; j++) {
    if (j === 0) {
      stopTimes.push({
        arrival: 0,
        departure: stopBuffer,
        name: stops[j]
      });
    } else if (j === totalStops - 1) {
      const arrival = j * segmentTravelTime + (j - 1) * stopBuffer;
      stopTimes.push({
        arrival,
        departure: Infinity,
        name: stops[j]
      });
    } else {
      const arrival = j * segmentTravelTime + (j - 1) * stopBuffer;
      const departure = arrival + stopBuffer;
      stopTimes.push({
        arrival,
        departure,
        name: stops[j]
      });
    }
  }

  const finalArrival = stopTimes[totalStops - 1].arrival;

  if (elapsedHours >= finalArrival) {
    // 1. Trip is complete! Arrived at final destination stop.
    vehicle.transitStatus = 'Idle';
    vehicle.currentStop = '';
    vehicle.currentRouteIndex = 0;
    vehicle.tripStartedAt = null;
    await vehicle.save();

    // Mark all In Transit bookings as Completed, and update payments
    const bookingsToUnload = await Booking.find({
      vehicleId: vehicle.vehicleId,
      status: 'In Transit'
    });

    const unloadPromises = bookingsToUnload.map(async (bkg) => {
      bkg.status = 'Completed';
      bkg.deliveredAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (finalArrival * 60 * 60 * 1000));
      if (!bkg.loadedAt) {
        bkg.loadedAt = vehicle.tripStartedAt;
      }
      await bkg.save();

      const payment = await Payment.findOne({ bookingId: bkg.bookingId });
      if (payment) {
        payment.status = 'PaidOut';
        await payment.save();
      }
    });
    await Promise.all(unloadPromises);

    // Mark all stops on the route as Completed
    route.stopsDetails.forEach(s => {
      s.status = 'Completed';
      if (!s.actualArrival) s.actualArrival = new Date(new Date(vehicle.tripStartedAt).getTime() + (finalArrival * 60 * 60 * 1000));
      if (!s.completedAt) s.completedAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (finalArrival * 60 * 60 * 1000));
    });
    route.currentStopIndex = totalStops;
    await route.save();
    
    // Also release driver if assigned
    if (vehicle.assignedDriverId) {
      await User.findOneAndUpdate(
        { username: vehicle.assignedDriverId, role: 'driver' },
        { driverStatus: 'AVAILABLE' }
      );
    }
    return;
  }

  // Find where the truck is currently based on elapsedHours
  let currentStopName = '';
  let currentStatus = 'In Transit';
  let currentRouteIdx = 0;

  for (let j = 0; j < totalStops; j++) {
    const { arrival, departure, name } = stopTimes[j];
    
    // Check if At Stop j
    if (elapsedHours >= arrival && elapsedHours < departure) {
      currentStatus = 'At Stop';
      currentStopName = name;
      currentRouteIdx = j;
      break;
    }
    
    // Check if In Transit between stop j and j+1
    if (j < totalStops - 1) {
      const nextArrival = stopTimes[j + 1].arrival;
      if (elapsedHours >= departure && elapsedHours < nextArrival) {
        currentStatus = 'In Transit';
        currentStopName = '';
        currentRouteIdx = j; // we are transit from j to j+1
        break;
      }
    }
  }

  // Update vehicle transit states in memory/db if changed
  let stateChanged = false;
  if (vehicle.transitStatus !== currentStatus) {
    vehicle.transitStatus = currentStatus;
    stateChanged = true;
  }
  if (vehicle.currentStop !== currentStopName) {
    vehicle.currentStop = currentStopName;
    stateChanged = true;
  }
  if (vehicle.currentRouteIndex !== currentRouteIdx) {
    vehicle.currentRouteIndex = currentRouteIdx;
    stateChanged = true;
  }

  if (stateChanged) {
    await vehicle.save();
  }

  // Manage Bookings/Cargo dynamically as vehicle moves:
  // - Any booking that is In Transit, but its destination was passed/reached, should be marked Completed.
  // - Any booking that is Pending, but its origin was passed/reached, should be marked In Transit.
  
  // Calculate which stop indices have been reached/completed
  const arrivedStopNames = []; // stops we have arrived at or departed
  
  for (let j = 0; j < totalStops; j++) {
    const { arrival, name } = stopTimes[j];
    if (elapsedHours >= arrival) {
      arrivedStopNames.push(name.toLowerCase());
    }
  }

  // 1. Unload cargo: if booking is In Transit on this vehicle, and destination is in arrivedStopNames
  const bookingsToComplete = await Booking.find({
    vehicleId: vehicle.vehicleId,
    status: 'In Transit',
    toStop: { $in: arrivedStopNames.map(name => new RegExp('^' + name + '$', 'i')) }
  });

  if (bookingsToComplete.length > 0) {
    const completePromises = bookingsToComplete.map(async (bkg) => {
      bkg.status = 'Completed';
      const stopIdx = stops.findIndex(name => name.toLowerCase() === bkg.toStop.toLowerCase());
      const destArrival = stopIdx !== -1 ? stopTimes[stopIdx].arrival : finalArrival;
      bkg.deliveredAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (destArrival * 60 * 60 * 1000));
      if (!bkg.loadedAt) {
        const fromIdx = stops.findIndex(name => name.toLowerCase() === bkg.fromStop.toLowerCase());
        const origArrival = fromIdx !== -1 ? stopTimes[fromIdx].arrival : 0;
        bkg.loadedAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (origArrival * 60 * 60 * 1000));
      }
      await bkg.save();

      const payment = await Payment.findOne({ bookingId: bkg.bookingId });
      if (payment) {
        payment.status = 'PaidOut';
        await payment.save();
      }
    });
    await Promise.all(completePromises);
  }

  // 2. Load cargo: if booking is Pending on this vehicle, and origin is in arrivedStopNames
  const bookingsToTransit = await Booking.find({
    vehicleId: vehicle.vehicleId,
    status: 'Pending',
    fromStop: { $in: arrivedStopNames.map(name => new RegExp('^' + name + '$', 'i')) }
  });

  if (bookingsToTransit.length > 0) {
    const transitPromises = bookingsToTransit.map(async (bkg) => {
      bkg.status = 'In Transit';
      const stopIdx = stops.findIndex(name => name.toLowerCase() === bkg.fromStop.toLowerCase());
      const origArrival = stopIdx !== -1 ? stopTimes[stopIdx].arrival : 0;
      bkg.loadedAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (origArrival * 60 * 60 * 1000));
      await bkg.save();
    });
    await Promise.all(transitPromises);
  }

  // Update Route Stops details status
  let routeChanged = false;
  for (let j = 0; j < totalStops; j++) {
    const stopDetails = route.stopsDetails[j];
    const { arrival, departure } = stopTimes[j];
    
    let newStopStatus = 'Upcoming';
    if (elapsedHours >= departure) {
      newStopStatus = 'Completed';
    } else if (elapsedHours >= arrival) {
      newStopStatus = 'Ready'; 
    }
    
    if (stopDetails.status !== newStopStatus) {
      stopDetails.status = newStopStatus;
      if (newStopStatus === 'Ready' && !stopDetails.plannedArrival) {
        stopDetails.plannedArrival = new Date(new Date(vehicle.tripStartedAt).getTime() + (arrival * 60 * 60 * 1000));
      }
      if (newStopStatus === 'Completed') {
        if (!stopDetails.actualArrival) stopDetails.actualArrival = new Date(new Date(vehicle.tripStartedAt).getTime() + (arrival * 60 * 60 * 1000));
        if (!stopDetails.completedAt) stopDetails.completedAt = new Date(new Date(vehicle.tripStartedAt).getTime() + (departure === Infinity ? arrival : departure) * 60 * 60 * 1000);
      }
      routeChanged = true;
    }
  }

  // Sync route currentStopIndex
  let currentIdx = 0;
  for (let j = 0; j < totalStops; j++) {
    if (elapsedHours >= stopTimes[j].arrival) {
      currentIdx = j + 1;
    }
  }
  if (route.currentStopIndex !== currentIdx) {
    route.currentStopIndex = currentIdx;
    routeChanged = true;
  }

  if (routeChanged) {
    await route.save();
  }
};

// @desc    Get all vehicles
// @route   GET /api/vehicles
// @access  Private
export const getVehicles = async (req, res) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'carrier') {
      filter.carrierId = req.user.username;
    }
    const vehicles = await Vehicle.find(filter);
    for (let vehicle of vehicles) {
      await updateLiveTransitState(vehicle);
    }
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vehicle by ID
// @route   GET /api/vehicles/:id
// @access  Private
export const getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    // Access validation for carriers
    if (req.user && req.user.role === 'carrier' && vehicle.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied to this vehicle resource' });
    }
    await updateLiveTransitState(vehicle);
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get vehicle space utilization analytics
// @route   GET /api/vehicles/analytics/utilization
// @access  Private
export const getVehicleUtilization = async (req, res) => {
  try {
    let filter = { status: 'Active' };
    if (req.user && req.user.role === 'carrier') {
      filter.carrierId = req.user.username;
    }
    const vehicles = await Vehicle.find(filter);
    for (let vehicle of vehicles) {
      await updateLiveTransitState(vehicle);
    }
    const routes = await Route.find({});
    const routeMap = new Map(routes.map(r => [r.routeId, r]));

    // Aggregate bookings grouped by vehicle, route, and date
    const dailyStats = await Booking.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: { 
            vehicleId: '$vehicleId', 
            routeId: '$routeId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } 
          },
          totalVolume: { $sum: '$volume' },
          totalWeight: { $sum: '$weight' },
          bookingsCount: { $sum: 1 }
        }
      }
    ]);

    const analytics = vehicles.map(vehicle => {
      const vehicleId = vehicle.vehicleId;
      const vehicleStats = dailyStats.filter(s => s._id.vehicleId === vehicleId);
      
      let totalTrips = vehicleStats.length;
      let sumVolPercent = 0;
      let sumWtPercent = 0;
      let underutilizedTrips = 0;

      vehicleStats.forEach(stat => {
        const volPercent = (stat.totalVolume / vehicle.capacityVolume) * 100;
        const MathWt = vehicle.capacityWeight > 0 ? vehicle.capacityWeight : 20000;
        const wtPercent = (stat.totalWeight / MathWt) * 100;
        
        sumVolPercent += volPercent;
        sumWtPercent += wtPercent;

        if (volPercent < 75) {
          underutilizedTrips++;
        }
      });

      const avgVolumeUtilization = totalTrips > 0 ? parseFloat((sumVolPercent / totalTrips).toFixed(1)) : 0;
      const avgWeightUtilization = totalTrips > 0 ? parseFloat((sumWtPercent / totalTrips).toFixed(1)) : 0;
      const underutilizationRate = totalTrips > 0 ? parseFloat((underutilizedTrips / totalTrips * 100).toFixed(1)) : 0;

      let routeId = 'Unknown';
      if (vehicleStats.length > 0) {
        routeId = vehicleStats[0]._id.routeId || 'Unknown';
      }
      const rDetails = routeMap.get(routeId);
      const routeLane = rDetails ? `${rDetails.source} → ${rDetails.destination}` : 'Inactive Lane';

      return {
        vehicleId,
        type: vehicle.type,
        capacityVolume: vehicle.capacityVolume,
        capacityWeight: vehicle.capacityWeight,
        status: vehicle.status,
        totalTrips,
        avgVolumeUtilization,
        avgWeightUtilization,
        underutilizationRate,
        routeLane,
        statusLevel: avgVolumeUtilization >= 80 ? 'Optimal' : avgVolumeUtilization >= 65 ? 'Moderate' : 'Underutilized'
      };
    });

    res.json(analytics);
  } catch (error) {
    console.error('Utilization aggregation error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new vehicle
// @route   POST /api/vehicles
// @access  Private
export const createVehicle = async (req, res) => {
  const { vehicleId, type, capacityVolume, capacityWeight, status, routeLane, ratePerCbm, ratePerKg, baseLocation, assignedDriverId } = req.body;

  try {
    const exists = await Vehicle.findOne({ vehicleId });
    if (exists) {
      return res.status(400).json({ message: 'Vehicle already exists' });
    }

    const carrier = req.body.carrier || req.user._id;
    const carrierId = req.body.carrierId || req.user.username;

    // Validate driver if provided
    if (assignedDriverId) {
      const driver = await User.findOne({ username: assignedDriverId, role: 'driver', carrierId });
      if (!driver) {
        return res.status(400).json({ message: 'Driver not found or does not belong to your carrier account.' });
      }
      if (driver.driverStatus === 'INACTIVE') {
        return res.status(400).json({ message: 'This driver account is currently inactive.' });
      }
      // Check if driver is already on another active trip
      const activeTripVeh = await Vehicle.findOne({ assignedDriverId, transitStatus: { $ne: 'Idle' } });
      if (activeTripVeh) {
        return res.status(400).json({ message: 'Driver is already assigned to another active trip.' });
      }
    }

    const vehicle = new Vehicle({
      vehicleId,
      type,
      capacityVolume,
      capacityWeight,
      status: status || 'Active',
      carrier,
      carrierId,
      routeLane: routeLane || '',
      baseLocation: baseLocation || '',
      ratePerCbm: ratePerCbm !== undefined ? Number(ratePerCbm) : 150,
      ratePerKg: ratePerKg !== undefined ? Number(ratePerKg) : 5,
      assignedDriverId: assignedDriverId || ''
    });

    const savedVehicle = await vehicle.save();
    res.status(201).json(savedVehicle);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a vehicle
// @route   DELETE /api/vehicles/:id
// @access  Private
export const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    // Validate carrier owns the resource
    if (req.user && req.user.role === 'carrier' && vehicle.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Vehicle.deleteOne({ vehicleId: req.params.id });
    res.json({ message: 'Vehicle removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a vehicle
// @route   PUT /api/vehicles/:id
// @access  Private
export const updateVehicle = async (req, res) => {
  const { type, capacityVolume, capacityWeight, status, routeLane, ratePerCbm, ratePerKg, baseLocation, assignedDriverId } = req.body;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Access validation for carriers
    if (req.user && req.user.role === 'carrier' && vehicle.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate driver if provided
    if (assignedDriverId !== undefined) {
      if (assignedDriverId) {
        const driver = await User.findOne({ username: assignedDriverId, role: 'driver', carrierId: vehicle.carrierId });
        if (!driver) {
          return res.status(400).json({ message: 'Driver not found or does not belong to your carrier account.' });
        }
        if (driver.driverStatus === 'INACTIVE') {
          return res.status(400).json({ message: 'This driver account is currently inactive.' });
        }
        // Check if driver is already on another active trip
        const activeTripVeh = await Vehicle.findOne({ assignedDriverId, transitStatus: { $ne: 'Idle' } });
        if (activeTripVeh && activeTripVeh.vehicleId !== vehicle.vehicleId) {
          return res.status(400).json({ message: 'Driver is already assigned to another active trip.' });
        }
        vehicle.assignedDriverId = assignedDriverId;
      } else {
        vehicle.assignedDriverId = '';
      }
    }

    if (type !== undefined) vehicle.type = type;
    if (capacityVolume !== undefined) vehicle.capacityVolume = Number(capacityVolume);
    if (capacityWeight !== undefined) vehicle.capacityWeight = Number(capacityWeight);
    if (status !== undefined) vehicle.status = status;
    if (routeLane !== undefined) vehicle.routeLane = routeLane;
    if (baseLocation !== undefined) vehicle.baseLocation = baseLocation;
    if (ratePerCbm !== undefined) vehicle.ratePerCbm = Number(ratePerCbm);
    if (ratePerKg !== undefined) vehicle.ratePerKg = Number(ratePerKg);

    const updatedVehicle = await vehicle.save();
    res.json(updatedVehicle);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update vehicle transit state and handle cargo unloading
// @route   POST /api/vehicles/:id/transit-state
// @access  Private
export const updateVehicleTransitState = async (req, res) => {
  const { action, stopName, routeIndex } = req.body;
  const vehicleId = req.params.id;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

    // Auth check: Carrier who owns it OR Driver who is assigned to it
    const isOwner = req.user && req.user.role === 'carrier' && vehicle.carrierId === req.user.username;
    const isAssignedDriver = req.user && req.user.role === 'driver' && vehicle.assignedDriverId === req.user.username;

    if (!isOwner && !isAssignedDriver) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to update transit states for this vehicle.' });
    }

    if (action === 'start-trip') {
      vehicle.transitStatus = 'In Transit';
      vehicle.currentStop = '';
      vehicle.currentRouteIndex = 0;
      vehicle.tripStartedAt = new Date();
      await vehicle.save();

      // Update driver status to ON_TRIP
      if (vehicle.assignedDriverId) {
        await User.findOneAndUpdate(
          { username: vehicle.assignedDriverId, role: 'driver' },
          { driverStatus: 'ON_TRIP' }
        );
      }

      // Find all bookings with status 'Pending' for this vehicle for today/future
      // Transition them to 'In Transit'
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      await Booking.updateMany(
        { vehicleId, status: 'Pending', date: { $gte: todayStart } },
        { status: 'In Transit' }
      );

      return res.json({ message: 'Trip started successfully.', vehicle });
    }

    if (action === 'arrive-stop') {
      vehicle.transitStatus = 'At Stop';
      vehicle.currentStop = stopName;
      vehicle.currentRouteIndex = routeIndex;
      await vehicle.save();

      return res.json({ message: `Arrived at stop ${stopName}.`, vehicle });
    }

    if (action === 'depart-stop') {
      // Find all bookings currently In Transit on this vehicle where destination (toStop) matches the stop they arrived at
      const bookingsToUnload = await Booking.find({
        vehicleId,
        status: 'In Transit',
        toStop: vehicle.currentStop
      });

      // Mark them as Completed (unloaded) and release their payments
      const bulkUnloadPromises = bookingsToUnload.map(async (bkg) => {
        bkg.status = 'Completed';
        await bkg.save();

        // Also release payment corresponding to this booking
        const payment = await Payment.findOne({ bookingId: bkg.bookingId });
        if (payment) {
          payment.status = 'PaidOut';
          await payment.save();
        }
      });
      await Promise.all(bulkUnloadPromises);

      // Check if this is the final stop of the route. If so, end the trip (set to Idle)
      const route = await Route.findOne({ routeId: vehicle.routeLane });
      const isFinalStop = route && route.stops && route.stops.length > 0
        ? route.stops[route.stops.length - 1] === vehicle.currentStop
        : true;

      if (isFinalStop) {
        vehicle.transitStatus = 'Idle';
        vehicle.currentStop = '';
        vehicle.currentRouteIndex = 0;
      } else {
        vehicle.transitStatus = 'In Transit';
      }

      await vehicle.save();
      return res.json({ 
        message: `Departed stop. Unloaded ${bookingsToUnload.length} shipments and released payouts.`,
        vehicle 
      });
    }

    return res.status(400).json({ message: 'Invalid transit action.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify current stop using QR token, process unloads & loads, recalculate capacity
// @route   POST /api/vehicles/:id/verify-stop
// @access  Private
export const verifyStop = async (req, res) => {
  const { qrToken } = req.body;
  const vehicleId = req.params.id;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    // Auth check: Carrier who owns it OR Driver who is assigned to it
    const isOwner = req.user && req.user.role === 'carrier' && vehicle.carrierId === req.user.username;
    const isAssignedDriver = req.user && req.user.role === 'driver' && vehicle.assignedDriverId === req.user.username;

    if (!isOwner && !isAssignedDriver) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to verify stops for this vehicle.' });
    }

    if (vehicle.transitStatus === 'Idle' || !vehicle.routeLane) {
      return res.status(400).json({ message: 'No active trip is associated with this vehicle.' });
    }

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    if (!route) return res.status(404).json({ message: 'Active route not found.' });

    // Find the stop by QR token
    const stopIndex = route.stopsDetails.findIndex(s => s.qrToken === qrToken);
    if (stopIndex === -1) {
      return res.status(400).json({ message: 'Invalid or expired stop QR.' });
    }

    const stop = route.stopsDetails[stopIndex];

    // Enforce sequence: cannot verify future stops out of order
    if (stopIndex !== route.currentStopIndex) {
      const expectedStop = route.stopsDetails[route.currentStopIndex];
      return res.status(400).json({
        message: `Stop out of sequence. Please complete ${expectedStop.locationName} first.`
      });
    }

    if (stop.status === 'Completed') {
      return res.status(400).json({ message: 'This stop has already been completed.' });
    }

    // Mark stop as verified/completed and processing
    stop.status = 'Completed';
    stop.actualArrival = new Date();
    stop.completedAt = new Date();

    // 1. Process Planned Unloads (bookings In Transit with toStop matching current stop name)
    const bookingsToUnload = await Booking.find({
      vehicleId,
      status: 'In Transit',
      toStop: stop.locationName
    });

    const unloadPromises = bookingsToUnload.map(async (bkg) => {
      bkg.status = 'Completed';
      await bkg.save();

      // Release payment corresponding to this booking
      const payment = await Payment.findOne({ bookingId: bkg.bookingId });
      if (payment) {
        payment.status = 'PaidOut';
        await payment.save();
      }
    });
    await Promise.all(unloadPromises);

    // 2. Process Planned Loads (bookings Pending starting at this stop name)
    const bookingsToLoad = await Booking.find({
      vehicleId,
      status: 'Pending',
      fromStop: stop.locationName
    });

    const loadPromises = bookingsToLoad.map(async (bkg) => {
      bkg.status = 'In Transit';
      await bkg.save();
    });
    await Promise.all(loadPromises);

    // 3. Update route progress index
    route.currentStopIndex += 1;
    const isFinalStop = route.currentStopIndex === route.stopsDetails.length;

    if (isFinalStop) {
      vehicle.transitStatus = 'Idle';
      vehicle.currentStop = '';
      vehicle.currentRouteIndex = 0;
      route.status = 'Completed';

      // Set assigned driver status back to AVAILABLE
      if (vehicle.assignedDriverId) {
        await User.findOneAndUpdate(
          { username: vehicle.assignedDriverId, role: 'driver' },
          { driverStatus: 'AVAILABLE' }
        );
      }
    } else {
      vehicle.transitStatus = 'At Stop';
      vehicle.currentStop = stop.locationName;
      vehicle.currentRouteIndex = route.currentStopIndex;
      // Mark next stop as Ready
      route.stopsDetails[route.currentStopIndex].status = 'Ready';
    }

    await route.save();
    await vehicle.save();

    res.json({
      success: true,
      message: `Stop ${stop.locationName} verified. Unloaded ${bookingsToUnload.length} shipments and loaded ${bookingsToLoad.length} shipments.`,
      vehicle,
      route,
      unloadedCount: bookingsToUnload.length,
      loadedCount: bookingsToLoad.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Accept a load optimization recommendation during active transit
// @route   POST /api/vehicles/:id/accept-load
// @access  Private
export const acceptLoadRecommendation = async (req, res) => {
  const { bookingId } = req.body;
  const vehicleId = req.params.id;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    // Carrier auth check
    if (req.user && req.user.role === 'carrier' && vehicle.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (vehicle.transitStatus === 'Idle' || !vehicle.routeLane) {
      return res.status(400).json({ message: 'Vehicle does not have an active trip.' });
    }

    // Retrieve booking
    const booking = await Booking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ message: 'Booking/Shipment not found.' });

    if (booking.status !== 'Pending') {
      return res.status(400).json({ message: 'This shipment is no longer available for assignment.' });
    }

    const remainingInTransit = await Booking.find({
      vehicleId,
      status: 'In Transit'
    });
    const currentWeight = remainingInTransit.reduce((sum, b) => sum + (b.weight || 0), 0);
    const currentVolume = remainingInTransit.reduce((sum, b) => sum + (b.volume || 0), 0);

    if (currentWeight + booking.weight > vehicle.capacityWeight) {
      return res.status(400).json({ message: 'Planned load weight exceeds available truck capacity.' });
    }
    if (currentVolume + booking.volume > vehicle.capacityVolume) {
      return res.status(400).json({ message: 'Planned load volume exceeds available truck capacity.' });
    }

    // Assign vehicle to booking and transition status to In Transit
    booking.vehicle = vehicle._id;
    booking.vehicleId = vehicleId;
    booking.status = 'In Transit';
    await booking.save();

    res.json({
      success: true,
      message: `Load ${bookingId} successfully accepted and onboarded.`,
      booking
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dynamic load recommendations for a vehicle's remaining route and capacity
// @route   GET /api/vehicles/:id/recommendations
// @access  Private
export const getVehicleRecommendations = async (req, res) => {
  const vehicleId = req.params.id;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    await updateLiveTransitState(vehicle);

    if (vehicle.transitStatus === 'Idle' || !vehicle.routeLane) {
      return res.json({ recommendations: [], availableWeight: vehicle.capacityWeight, occupiedWeight: 0 });
    }

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    if (!route) return res.status(404).json({ message: 'Active route not found.' });

    // Remaining stops from currentStopIndex
    const remainingStops = route.stopsDetails.slice(route.currentStopIndex).map(s => s.locationName.toLowerCase());

    // Find all remaining in transit bookings to get current weight
    const remainingInTransit = await Booking.find({
      vehicleId,
      status: 'In Transit'
    });
    const currentWeight = remainingInTransit.reduce((sum, b) => sum + (b.weight || 0), 0);
    const availableWeight = vehicle.capacityWeight - currentWeight;

    // Fetch unassigned bookings
    const unassigned = await Booking.find({ status: 'Pending' });

    // Filter those compatible with remaining route stops
    const recommendations = unassigned.filter(bkg => {
      const fromIdx = remainingStops.indexOf(bkg.fromStop.toLowerCase());
      const toIdx = remainingStops.indexOf(bkg.toStop.toLowerCase());

      // Must pick up at or after current location, and deliver further down the route, and fit in capacity
      return fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx && bkg.weight <= availableWeight;
    });

    res.json({
      recommendations,
      availableWeight,
      occupiedWeight: currentWeight
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get the active trip details for the logged-in driver
// @route   GET /api/vehicles/driver/active-trip
// @access  Private (Driver only)
export const getActiveDriverTrip = async (req, res) => {
  if (!req.user || req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Access denied: Only drivers can query active trips.' });
  }

  try {
    const vehicle = await Vehicle.findOne({ 
      assignedDriverId: req.user.username,
      transitStatus: { $ne: 'Idle' }
    });

    if (!vehicle) {
      return res.json({ vehicle: null, route: null, bookings: [] });
    }

    await updateLiveTransitState(vehicle);

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    const bookings = await Booking.find({ vehicleId: vehicle.vehicleId, status: 'In Transit' });

    res.json({ vehicle, route, bookings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get completed trip bookings for driver history
// @route   GET /api/vehicles/driver/history
// @access  Private (Driver only)
export const getDriverTripHistory = async (req, res) => {
  if (!req.user || req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Access denied: Only drivers can query history.' });
  }

  try {
    const vehicles = await Vehicle.find({ assignedDriverId: req.user.username });
    for (let vehicle of vehicles) {
      await updateLiveTransitState(vehicle);
    }
    const vehicleIds = vehicles.map(v => v.vehicleId);

    const completedBookings = await Booking.find({
      vehicleId: { $in: vehicleIds },
      status: 'Completed'
    }).sort({ date: -1 });

    res.json(completedBookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

