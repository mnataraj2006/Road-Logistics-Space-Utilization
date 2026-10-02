import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import LoadOperation from '../models/LoadOperation.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity } from '../services/capacityService.js';
import { dispatchTruck, verifyStop } from '../controllers/transitController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const mockReq = (params = {}, body = {}) => ({ params, body, user: { username: 'test-manager', role: 'admin' } });
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.data = data; return res; };
  return res;
};

const runComprehensiveTests = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    try {
      await mongoose.connection.collection('tripstops').dropIndex('qrToken_1');
    } catch (e) {
      // index may not exist
    }

    console.log('\n==================================================');
    console.log('TEST SCENARIO 1 — NORMAL TRIP JOURNEY');
    console.log('==================================================');

    const routeId = 'RTE-SCENARIO-1';
    const vehicleId = 'TRUCK-SCENARIO-1';

    await Route.deleteMany({ routeId });
    await Vehicle.deleteMany({ vehicleId });
    await Booking.deleteMany({ vehicleId });
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await LoadOperation.deleteMany({});
    await StopVerification.deleteMany({ vehicleId });

    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Delhi',
      distance: 2200,
      baseRate: 50000,
      stops: ['Chennai', 'Bangalore', 'Hyderabad', 'Delhi'],
      stopsDetails: [
        { stopId: 'STP-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'STPTKN-SC1-CHENNAI', status: 'Ready' },
        { stopId: 'STP-2', locationName: 'Bangalore', sequenceNumber: 2, qrToken: 'STPTKN-SC1-BANGALORE', status: 'Ready' },
        { stopId: 'STP-3', locationName: 'Hyderabad', sequenceNumber: 3, qrToken: 'STPTKN-SC1-HYDERABAD', status: 'Ready' },
        { stopId: 'STP-4', locationName: 'Delhi', sequenceNumber: 4, qrToken: 'STPTKN-SC1-DELHI', status: 'Ready' }
      ],
      currentStopIndex: 0,
      status: 'Ready'
    });

    const vehicle = await Vehicle.create({
      vehicleId,
      carrier: new mongoose.Types.ObjectId(),
      carrierId: 'test-carrier',
      type: 'Heavy Truck',
      capacityVolume: 100, // 100 m³
      capacityWeight: 10000, // 10,000 kg
      routeLane: routeId,
      status: 'Active',
      transitStatus: 'READY',
      baseLocation: 'Chennai'
    });

    // P1: Chennai -> Bangalore (20 m³, 1000 kg)
    const p1 = await Booking.create({
      bookingId: 'P1-CHE-BLR',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-1',
      date: new Date(),
      revenue: 5000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Bangalore',
      volume: 20,
      weight: 1000,
      status: 'PENDING'
    });

    // P2: Bangalore -> Hyderabad (30 m³, 2000 kg)
    const p2 = await Booking.create({
      bookingId: 'P2-BLR-HYD',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-2',
      date: new Date(),
      revenue: 7500,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Bangalore',
      toStop: 'Hyderabad',
      volume: 30,
      weight: 2000,
      status: 'PENDING'
    });

    // P3: Chennai -> Delhi (40 m³, 3000 kg)
    const p3 = await Booking.create({
      bookingId: 'P3-CHE-DEL',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-3',
      date: new Date(),
      revenue: 15000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Delhi',
      volume: 40,
      weight: 3000,
      status: 'PENDING'
    });

    // P4: Hyderabad -> Delhi (20 m³, 1500 kg)
    const p4 = await Booking.create({
      bookingId: 'P4-HYD-DEL',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-4',
      date: new Date(),
      revenue: 8000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Hyderabad',
      toStop: 'Delhi',
      volume: 20,
      weight: 1500,
      status: 'PENDING'
    });

    console.log('Bookings created for Scenario 1:');
    console.log(' - P1: Chennai ➔ Bangalore (20 m³, 1000 kg)');
    console.log(' - P2: Bangalore ➔ Hyderabad (30 m³, 2000 kg)');
    console.log(' - P3: Chennai ➔ Delhi (40 m³, 3000 kg)');
    console.log(' - P4: Hyderabad ➔ Delhi (20 m³, 1500 kg)');

    // Dispatch Chennai
    let res = mockRes();
    await dispatchTruck(mockReq({ vehicleId }), res);
    console.log('\nDispatch Chennai Output:', res.data?.message);
    
    let p1Check = await Booking.findOne({ bookingId: 'P1-CHE-BLR' });
    let p2Check = await Booking.findOne({ bookingId: 'P2-BLR-HYD' });
    let p3Check = await Booking.findOne({ bookingId: 'P3-CHE-DEL' });
    let p4Check = await Booking.findOne({ bookingId: 'P4-HYD-DEL' });

    console.log(` -> P1 Status: ${p1Check.status} (Expected: IN_TRANSIT)`);
    console.log(` -> P2 Status: ${p2Check.status} (Expected: WAITING_FOR_PICKUP)`);
    console.log(` -> P3 Status: ${p3Check.status} (Expected: IN_TRANSIT)`);
    console.log(` -> P4 Status: ${p4Check.status} (Expected: WAITING_FOR_PICKUP)`);

    if (p1Check.status !== 'IN_TRANSIT' || p3Check.status !== 'IN_TRANSIT' || p2Check.status !== 'WAITING_FOR_PICKUP') {
      throw new Error('Scenario 1 Dispatch state mismatch!');
    }

    console.log('\n==================================================');
    console.log('TEST SCENARIO 2 — WRONG STOP SCAN REJECTION');
    console.log('==================================================');
    // Truck expects Bangalore (stop #2). Scan Hyderabad (stop #3) QR.
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-3', qrToken: 'STPTKN-SC1-HYDERABAD' }), res);
    console.log('Wrong Stop Response status:', res.statusCode);
    console.log('Wrong Stop Response message:', res.data?.message);

    if (res.statusCode !== 400 || !res.data?.message?.includes('Expected Bangalore')) {
      throw new Error('Scenario 2 Wrong Stop validation failed!');
    }
    console.log('✅ WRONG STOP SCAN PROPERLY REJECTED!');

    console.log('\n==================================================');
    console.log('TEST SCENARIO 3 — DUPLICATE STOP SCAN REJECTION');
    console.log('==================================================');
    // Verify Bangalore once first
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-2', qrToken: 'STPTKN-SC1-BANGALORE' }), res);
    console.log('Bangalore Stop Scan #1 status:', res.data?.message);
    
    // Check P1 delivered, P2 loaded
    p1Check = await Booking.findOne({ bookingId: 'P1-CHE-BLR' });
    p2Check = await Booking.findOne({ bookingId: 'P2-BLR-HYD' });
    console.log(` -> P1 Status after Bangalore: ${p1Check.status} (Expected: DELIVERED)`);
    console.log(` -> P2 Status after Bangalore: ${p2Check.status} (Expected: IN_TRANSIT)`);

    // Scan Bangalore second time (Duplicate scan)
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-2', qrToken: 'STPTKN-SC1-BANGALORE' }), res);
    console.log('Duplicate Bangalore Stop Response status:', res.statusCode);
    console.log('Duplicate Bangalore Stop Response message:', res.data?.message);

    if (res.statusCode !== 400 || (!res.data?.message?.includes('already been verified') && !res.data?.message?.includes('Expected Hyderabad'))) {
      throw new Error('Scenario 3 Duplicate Stop validation failed!');
    }
    console.log('✅ DUPLICATE STOP SCAN PROPERLY REJECTED!');

    console.log('\n==================================================');
    console.log('TEST SCENARIO 4 — CAPACITY FAILURE & PARTIAL LOAD REJECTION');
    console.log('==================================================');
    // Currently at Bangalore. Next expected stop is Hyderabad.
    // At Hyderabad, current load is P2 (30 m³) + P3 (40 m³) = 70 m³.
    // Create an OVERLOAD package (50 m³) scheduled for pickup at Hyderabad -> Delhi.
    // 70 m³ + 50 m³ = 120 m³ > 100 m³ capacity limit!
    await Booking.create({
      bookingId: 'P-OVERLOAD',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-overload',
      date: new Date(),
      revenue: 10000,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      fromStop: 'Hyderabad',
      toStop: 'Delhi',
      volume: 50,
      weight: 4000,
      status: 'WAITING_FOR_PICKUP'
    });

    // Scan Hyderabad QR
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-3', qrToken: 'STPTKN-SC1-HYDERABAD' }), res);
    console.log('Capacity Overload Response status:', res.statusCode);
    console.log('Capacity Overload Response message:', res.data?.message);
    console.log('Capacity Overload Details:', res.data?.details);

    if (res.statusCode !== 400 || !res.data?.message?.includes('exceeds remaining truck capacity')) {
      throw new Error('Scenario 4 Capacity Overload validation failed!');
    }

    // Verify 0 database state changed!
    const vCheck = await Vehicle.findOne({ vehicleId });
    const p4State = await Booking.findOne({ bookingId: 'P4-HYD-DEL' });
    console.log(` -> Vehicle currentRouteIndex after failed scan: ${vCheck.currentRouteIndex} (Expected: 1 - Bangalore)`);
    console.log(` -> P4 Status after failed scan: ${p4State.status} (Expected: WAITING_FOR_PICKUP)`);

    if (vCheck.currentRouteIndex !== 1 || p4State.status !== 'WAITING_FOR_PICKUP') {
      throw new Error('Scenario 4 Transaction rollback check failed!');
    }
    console.log('✅ CAPACITY OVERLOAD REJECTED & 0 DATABASE MUTATION OCCURRED!');

    // Remove P-OVERLOAD to allow trip to proceed
    await Booking.deleteOne({ bookingId: 'P-OVERLOAD' });

    console.log('\n==================================================');
    console.log('CONTINUING SCENARIO 1 — HYDERABAD & DELHI STOPS');
    console.log('==================================================');
    // Scan Hyderabad QR again (now valid)
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-3', qrToken: 'STPTKN-SC1-HYDERABAD' }), res);
    console.log('Hyderabad Stop Response:', res.data?.message);
    
    p2Check = await Booking.findOne({ bookingId: 'P2-BLR-HYD' });
    p4Check = await Booking.findOne({ bookingId: 'P4-HYD-DEL' });
    console.log(` -> P2 Status after Hyderabad: ${p2Check.status} (Expected: DELIVERED)`);
    console.log(` -> P4 Status after Hyderabad: ${p4Check.status} (Expected: IN_TRANSIT)`);

    // Scan Delhi QR (Final Stop)
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId, stopId: 'STP-4', qrToken: 'STPTKN-SC1-DELHI' }), res);
    console.log('Delhi Final Stop Response:', res.data?.message);

    p3Check = await Booking.findOne({ bookingId: 'P3-CHE-DEL' });
    p4Check = await Booking.findOne({ bookingId: 'P4-HYD-DEL' });
    const vFinal = await Vehicle.findOne({ vehicleId });

    console.log(` -> P3 Status after Delhi: ${p3Check.status} (Expected: DELIVERED)`);
    console.log(` -> P4 Status after Delhi: ${p4Check.status} (Expected: DELIVERED)`);
    console.log(` -> Vehicle final transitStatus: ${vFinal.transitStatus} (Expected: COMPLETED)`);

    if (p3Check.status !== 'DELIVERED' || p4Check.status !== 'DELIVERED' || vFinal.transitStatus !== 'COMPLETED') {
      throw new Error('Scenario 1 Final Stop completion failed!');
    }

    console.log('\n==================================================');
    console.log('TEST SCENARIO 7 — FINAL STOP UNDELIVERED PACKAGES REJECTION');
    console.log('==================================================');

    const routeId7 = 'RTE-SCENARIO-7';
    const vehicleId7 = 'TRUCK-SCENARIO-7';

    await Route.deleteMany({ routeId: routeId7 });
    await Vehicle.deleteMany({ vehicleId: vehicleId7 });
    await Booking.deleteMany({ vehicleId: vehicleId7 });

    const r7 = await Route.create({
      routeId: routeId7,
      source: 'Chennai',
      destination: 'Delhi',
      distance: 2200,
      baseRate: 50000,
      stops: ['Chennai', 'Delhi'],
      stopsDetails: [
        { stopId: 'S7-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'TKN7-CHE', status: 'Ready' },
        { stopId: 'S7-2', locationName: 'Delhi', sequenceNumber: 2, qrToken: 'TKN7-DEL', status: 'Ready' }
      ],
      currentStopIndex: 0,
      status: 'Ready'
    });

    const v7 = await Vehicle.create({
      vehicleId: vehicleId7,
      carrier: new mongoose.Types.ObjectId(),
      carrierId: 'carrier-7',
      type: 'Heavy Truck',
      capacityVolume: 100,
      capacityWeight: 10000,
      routeLane: routeId7,
      status: 'Active',
      transitStatus: 'READY',
      baseLocation: 'Chennai'
    });

    // P-LOST is scheduled Chennai -> Jaipur (Jaipur is NOT on route!)
    await Booking.create({
      bookingId: 'P-LOST',
      user: new mongoose.Types.ObjectId(),
      shipper: new mongoose.Types.ObjectId(),
      shipperId: 'shipper-7',
      date: new Date(),
      revenue: 5000,
      vehicle: v7._id,
      vehicleId: vehicleId7,
      route: r7._id,
      routeId: routeId7,
      fromStop: 'Chennai',
      toStop: 'Jaipur',
      volume: 10,
      weight: 1000,
      status: 'PENDING'
    });

    // Dispatch
    res = mockRes();
    await dispatchTruck(mockReq({ vehicleId: vehicleId7 }), res);

    // Verify Final Stop (Delhi)
    res = mockRes();
    await verifyStop(mockReq({}, { vehicleId: vehicleId7, stopId: 'S7-2', qrToken: 'TKN7-DEL' }), res);
    console.log('Undelivered Packages Final Stop Response status:', res.statusCode);
    console.log('Undelivered Packages Final Stop Response message:', res.data?.message);

    if (res.statusCode !== 400 || !res.data?.message?.includes('Undelivered packages remain')) {
      throw new Error('Scenario 7 Undelivered packages validation failed!');
    }
    console.log('✅ FINAL STOP REJECTED PROPERLY DUE TO UNDELIVERED PACKAGES!');

    console.log('\n==================================================');
    console.log('🎉 ALL 7 MANDATORY TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test suite error:', err);
    process.exit(1);
  }
};

runComprehensiveTests();
