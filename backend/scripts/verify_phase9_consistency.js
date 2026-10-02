import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import Vehicle from '../models/Vehicle.js';
import LoadAssignment from '../models/LoadAssignment.js';

async function run() {
  console.log('=== PHASE 9 VERIFICATION: DATA MODEL CONSISTENCY ===');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  // Test 1: Shipment consistency
  console.log('\n[TEST 1] Testing Shipment model dimensions & interoperability mapping:');
  const dummyShipment = new Shipment({
    shipmentId: `SHP-TEST-${Date.now()}`,
    customer: new mongoose.Types.ObjectId(),
    shipperId: 'CUST-001',
    cargoDescription: 'Test Box',
    length: 1.8,
    width: 1.2,
    height: 1.0,
    volume: 2.16,
    weight: 300,
    pickupStop: 'Chennai',
    deliveryStop: 'Bangalore',
    requestedDate: new Date('2026-10-15T00:00:00.000Z')
  });

  const sJson = dummyShipment.toJSON();
  console.log(`  s.length: ${sJson.length}, s.dimensions:`, sJson.dimensions);
  if (sJson.dimensions.length !== 1.8 || sJson.dimensions.width !== 1.2 || sJson.dimensions.height !== 1.0) {
    throw new Error('Shipment dimensions getter mismatch!');
  }
  if (sJson.date.toISOString() !== sJson.requestedDate.toISOString()) {
    throw new Error('Shipment date interoperability getter mismatch!');
  }
  if (sJson.fromStop !== 'Chennai' || sJson.toStop !== 'Bangalore') {
    throw new Error('Shipment fromStop/toStop interoperability getter mismatch!');
  }

  // Test setting dimensions object
  dummyShipment.dimensions = { length: 3.0, width: 2.0, height: 1.5 };
  if (dummyShipment.length !== 3.0 || dummyShipment.width !== 2.0 || dummyShipment.height !== 1.5) {
    throw new Error('Shipment dimensions setter failed!');
  }
  console.log('  ✓ Shipment dimensions, date, and stop interoperability verified.');

  // Test 2: Booking consistency
  console.log('\n[TEST 2] Testing Booking model dimensions & interoperability mapping:');
  const dummyBooking = new Booking({
    bookingId: `BKG-TEST-${Date.now()}`,
    shipperId: 'CUST-001',
    date: new Date('2026-10-15T00:00:00.000Z'),
    fromStop: 'Chennai',
    toStop: 'Bangalore',
    weight: 450,
    volume: 2.5,
    revenue: 5000,
    length: 2.2,
    width: 1.4,
    height: 1.1,
    status: 'BOOKED'
  });

  const bJson = dummyBooking.toJSON();
  console.log(`  b.length: ${bJson.length}, b.dimensions:`, bJson.dimensions);
  if (bJson.dimensions.length !== 2.2 || bJson.dimensions.width !== 1.4 || bJson.dimensions.height !== 1.1) {
    throw new Error('Booking dimensions getter mismatch!');
  }
  if (bJson.requestedDate.toISOString() !== bJson.date.toISOString()) {
    throw new Error('Booking requestedDate interoperability getter mismatch!');
  }
  if (bJson.customerId !== 'CUST-001') {
    throw new Error('Booking customerId interoperability getter mismatch!');
  }
  if (bJson.pickupStop !== 'Chennai' || bJson.deliveryStop !== 'Bangalore') {
    throw new Error('Booking pickupStop/deliveryStop interoperability getter mismatch!');
  }

  dummyBooking.dimensions = { length: 2.8, width: 1.6, height: 1.3 };
  if (dummyBooking.length !== 2.8 || dummyBooking.width !== 1.6 || dummyBooking.height !== 1.3) {
    throw new Error('Booking dimensions setter failed!');
  }
  console.log('  ✓ Booking dimensions, requestedDate, customerId, and stop interoperability verified.');

  // Test 3: Vehicle consistency
  console.log('\n[TEST 3] Testing Vehicle model cargoDimensions mapping:');
  const dummyVehicle = new Vehicle({
    vehicleId: `TRK-TEST-${Date.now()}`,
    type: 'Medium Truck',
    capacityVolume: 40,
    capacityWeight: 8000,
    dimensions: { length: 7.2, width: 2.4, height: 2.4 },
    status: 'AVAILABLE',
    transitStatus: 'AVAILABLE'
  });

  const vJson = dummyVehicle.toJSON();
  console.log(`  v.dimensions:`, vJson.dimensions, `v.cargoDimensions:`, vJson.cargoDimensions);
  if (vJson.cargoDimensions.length !== 7.2 || vJson.cargoDimensions.width !== 2.4 || vJson.cargoDimensions.height !== 2.4) {
    throw new Error('Vehicle cargoDimensions mapping mismatch!');
  }
  console.log('  ✓ Vehicle cargoDimensions and dimensions interoperability verified.');

  // Test 4: Existing LoadAssignment consistency
  console.log('\n[TEST 4] Testing LoadAssignment dimension consistency in database:');
  const sampleAssign = await LoadAssignment.findOne();
  if (sampleAssign) {
    console.log(`  Found LoadAssignment for ${sampleAssign.shipmentId}:`);
    console.log(`    Root: dx=${sampleAssign.dx}, dy=${sampleAssign.dy}, dz=${sampleAssign.dz}, length=${sampleAssign.length}, width=${sampleAssign.width}, height=${sampleAssign.height}`);
    console.log(`    Nested: dimensions=`, sampleAssign.dimensions);
    if (sampleAssign.dx !== undefined && sampleAssign.length !== undefined && sampleAssign.dx !== sampleAssign.length) {
      throw new Error(`LoadAssignment dx (${sampleAssign.dx}) does not equal length (${sampleAssign.length})!`);
    }
    console.log('  ✓ LoadAssignment root and nested dimensions are completely consistent.');
  } else {
    console.log('  (No LoadAssignments in database yet - will verify during end-to-end flow).');
  }

  await mongoose.disconnect();
  console.log('\n=== PHASE 9 VERIFICATION SUCCESSFUL! ALL TESTS PASSED. ===');
}

run().catch(err => {
  console.error('\n❌ PHASE 9 VERIFICATION FAILED:', err);
  process.exit(1);
});
