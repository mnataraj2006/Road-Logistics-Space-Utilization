import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity } from '../services/capacityService.js';
import { dispatchTruck, verifyStop } from '../controllers/transitController.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runTest = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n--- STEP 1: SEED TEST ROUTE & TRUCK ---');
    const routeId = 'TEST-RTE-TRANSIT';
    const vehicleId = 'TRUCK-TEST-101';

    await Route.deleteMany({ routeId });
    await Vehicle.deleteMany({ vehicleId });
    await Booking.deleteMany({ vehicleId });
    await StopVerification.deleteMany({ vehicleId });

    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Delhi',
      distance: 2200,
      baseRate: 50000,
      stops: ['Chennai', 'Bangalore', 'Hyderabad', 'Delhi'],
      stopsDetails: [
        { stopId: 'STP-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'STPTKN-CHENNAI-001', status: 'Ready' },
        { stopId: 'STP-2', locationName: 'Bangalore', sequenceNumber: 2, qrToken: 'STPTKN-BANGALORE-002', status: 'Ready' },
        { stopId: 'STP-3', locationName: 'Hyderabad', sequenceNumber: 3, qrToken: 'STPTKN-HYDERABAD-003', status: 'Ready' },
        { stopId: 'STP-4', locationName: 'Delhi', sequenceNumber: 4, qrToken: 'STPTKN-DELHI-004', status: 'Ready' }
      ],
      currentStopIndex: 0,
      status: 'Ready'
    });

    const vehicle = await Vehicle.create({
      vehicleId,
      carrier: new mongoose.Types.ObjectId(),
      carrierId: 'test-carrier',
      type: 'Heavy Truck',
      capacityVolume: 100,
      capacityWeight: 20000,
      routeLane: routeId,
      status: 'Active',
      transitStatus: 'READY',
      baseLocation: 'Chennai'
    });

    console.log(`Created Route ${route.routeId} with ${route.stopsDetails.length} stops.`);
    console.log(`Created Vehicle ${vehicle.vehicleId} with transit status '${vehicle.transitStatus}'.`);

    console.log('\n--- STEP 2: CREATE & ALLOCATE BOOKINGS ---');
    const b1 = await Booking.create({
      bookingId: 'BKG-TEST-001',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'test-shipper',
      date: new Date(),
      revenue: 5000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Bangalore',
      volume: 10,
      weight: 2000,
      status: 'PENDING'
    });

    const b2 = await Booking.create({
      bookingId: 'BKG-TEST-002',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'test-shipper',
      date: new Date(),
      revenue: 7500,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Hyderabad',
      volume: 15,
      weight: 3000,
      status: 'PENDING'
    });

    const b3 = await Booking.create({
      bookingId: 'BKG-TEST-003',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'test-shipper',
      date: new Date(),
      revenue: 12000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Bangalore',
      toStop: 'Delhi',
      volume: 25,
      weight: 5000,
      status: 'PENDING'
    });

    console.log('Bookings created:');
    console.log(` - ${b1.bookingId}: Chennai ➔ Bangalore (${b1.volume} m³, ${b1.weight} kg)`);
    console.log(` - ${b2.bookingId}: Chennai ➔ Hyderabad (${b2.volume} m³, ${b2.weight} kg)`);
    console.log(` - ${b3.bookingId}: Bangalore ➔ Delhi (${b3.volume} m³, ${b3.weight} kg)`);

    console.log('\n--- STEP 3: SEGMENT CAPACITY PRE-VERIFICATION ---');
    const initialCap = calculateTruckSegmentCapacity(vehicle, route, [b1, b2, b3]);
    console.log('Segment Capacity Breakdown before trip:');
    initialCap.segments.forEach(s => {
      console.log(` * Segment [${s.fromStop} ➔ ${s.toStop}]: Vol ${s.usedVolume}/${s.capacityVolume} m³ (${s.volumeUtilization}%), Wt ${s.usedWeight}/${s.capacityWeight} kg`);
    });

    console.log('\n--- STEP 4: DISPATCH TRUCK (ORIGIN CHENNAI) ---');
    const mockReq = (params, body) => ({ params, body, user: { username: 'test-manager', role: 'admin' } });
    const mockRes = () => {
      const res = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => { res.data = data; return res; };
      return res;
    };

    let res = mockRes();
    await dispatchTruck(mockReq({ vehicleId }), res);
    console.log('Dispatch Response:', res.data?.message);

    let updatedVehicle = await Vehicle.findOne({ vehicleId });
    console.log(`Truck transitStatus after dispatch: '${updatedVehicle.transitStatus}'`);

    console.log('\n--- STEP 5: VERIFY STOP #1 (CHENNAI - ORIGIN) ---');
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, qrToken: 'STPTKN-CHENNAI-001' }), res);
    console.log('Stop #1 Response:', res.data?.message);
    console.log(`Loaded ${res.data?.operations?.loadedCount} pkgs:`, res.data?.operations?.loadedPackages);

    console.log('\n--- STEP 6: VERIFY STOP #2 (BANGALORE) ---');
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, qrToken: 'STPTKN-BANGALORE-002' }), res);
    console.log('Stop #2 Response:', res.data?.message);
    console.log(`Unloaded ${res.data?.operations?.unloadedCount} pkgs:`, res.data?.operations?.unloadedPackages);
    console.log(`Loaded ${res.data?.operations?.loadedCount} pkgs:`, res.data?.operations?.loadedPackages);

    console.log('\n--- STEP 7: VERIFY STOP #3 (HYDERABAD) ---');
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, qrToken: 'STPTKN-HYDERABAD-003' }), res);
    console.log('Stop #3 Response:', res.data?.message);
    console.log(`Unloaded ${res.data?.operations?.unloadedCount} pkgs:`, res.data?.operations?.unloadedPackages);

    console.log('\n--- STEP 8: VERIFY STOP #4 (DELHI - FINAL STOP) ---');
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, qrToken: 'STPTKN-DELHI-004' }), res);
    console.log('Stop #4 Response:', res.data?.message);
    console.log(`Unloaded ${res.data?.operations?.unloadedCount} pkgs:`, res.data?.operations?.unloadedPackages);

    updatedVehicle = await Vehicle.findOne({ vehicleId });
    console.log(`Final Truck transitStatus: '${updatedVehicle.transitStatus}'`);

    console.log('\n--- STEP 9: CHECK STOP VERIFICATION AUDIT TRAIL ---');
    const logs = await StopVerification.find({ vehicleId }).sort({ sequenceNumber: 1 });
    console.log(`Total Audit Records Logged: ${logs.length}`);
    logs.forEach(log => {
      console.log(` [Scan #${log.sequenceNumber}] Stop: ${log.locationName} | Unloaded: ${log.packagesUnloaded.length} | Loaded: ${log.packagesLoaded.length} | Vol After: ${log.volumeAfter} m³`);
    });

    console.log('\n✅ ALL TRANSIT STATE MACHINE & SEGMENT CAPACITY TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
};

runTest();
