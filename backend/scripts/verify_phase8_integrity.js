import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';

const API_BASE = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== PHASE 8 VERIFICATION: FOREIGN REFERENCE INTEGRITY ===');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  // Login Manager
  const mgrRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev-manager', password: 'Manager@2026!' })
  });
  const mgrData = await mgrRes.json();
  const mgrToken = mgrData.data?.token || mgrData.token;

  // Test 1: Try deleting a vehicle referenced by an active trip
  console.log('\n[TEST 1] Attempt to delete vehicle referenced by active trip:');
  const activeTrip = await Trip.findOne({ status: { $in: ['PLANNED', 'READY_FOR_DISPATCH', 'IN_TRANSIT'] } });
  if (!activeTrip) {
    throw new Error('No active trip found in database to test.');
  }
  const refVehicleId = activeTrip.vehicleId;
  console.log(`  Target Vehicle: ${refVehicleId} (referenced by Trip ${activeTrip.tripId} status: ${activeTrip.status})`);

  const delVehRes = await fetch(`${API_BASE}/vehicles/${refVehicleId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mgrToken}` }
  });
  const delVehData = await delVehRes.json();

  if (delVehRes.status === 400 && delVehData.message?.includes('currently referenced')) {
    console.log(`  ✓ BLOCKED AS EXPECTED (HTTP 400): ${delVehData.message}`);
  } else {
    throw new Error(`Referential integrity failed! Expected HTTP 400, got ${delVehRes.status}: ${JSON.stringify(delVehData)}`);
  }

  // Verify vehicle is still in DB
  const stillExistsVeh = await Vehicle.findOne({ vehicleId: refVehicleId });
  if (!stillExistsVeh) {
    throw new Error(`CRITICAL: Referenced vehicle ${refVehicleId} was deleted!`);
  }
  console.log('  ✓ Vehicle verified preserved in database.');

  // Test 2: Try deleting a route referenced by an active vehicle or trip
  console.log('\n[TEST 2] Attempt to delete route referenced by active vehicle or trip:');
  const refRouteId = activeTrip.routeId;
  console.log(`  Target Route: ${refRouteId} (referenced by Trip ${activeTrip.tripId})`);

  const delRouteRes = await fetch(`${API_BASE}/routes/${refRouteId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mgrToken}` }
  });
  const delRouteData = await delRouteRes.json();

  if (delRouteRes.status === 400 && (delRouteData.message?.includes('scheduled on this route') || delRouteData.message?.includes('assigned to this route'))) {
    console.log(`  ✓ BLOCKED AS EXPECTED (HTTP 400): ${delRouteData.message}`);
  } else {
    throw new Error(`Referential integrity failed! Expected HTTP 400, got ${delRouteRes.status}: ${JSON.stringify(delRouteData)}`);
  }

  // Verify route is still in DB
  const stillExistsRoute = await Route.findOne({ routeId: refRouteId });
  if (!stillExistsRoute) {
    throw new Error(`CRITICAL: Referenced route ${refRouteId} was deleted!`);
  }
  console.log('  ✓ Route verified preserved in database.');

  // Test 3: Standalone vehicle creation and deletion
  console.log('\n[TEST 3] Standalone unreferenced vehicle lifecycle:');
  const tempVehId = `TRK-TEMP-${Date.now()}`;
  const createVehRes = await fetch(`${API_BASE}/vehicles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgrToken}`
    },
    body: JSON.stringify({
      vehicleId: tempVehId,
      vehicleType: 'Small Truck',
      maxWeightCapacity: 2000,
      maxVolumeCapacity: 15,
      cargoDimensions: { length: 4.0, width: 2.0, height: 1.8 }
    })
  });
  if (!createVehRes.ok) {
    throw new Error(`Failed to create temp vehicle: ${await createVehRes.text()}`);
  }
  console.log(`  Created unreferenced vehicle ${tempVehId}`);

  const delTempVehRes = await fetch(`${API_BASE}/vehicles/${tempVehId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mgrToken}` }
  });
  const delTempVehData = await delTempVehRes.json();
  if (delTempVehRes.ok && delTempVehData.success) {
    console.log(`  ✓ Unreferenced vehicle deleted cleanly: ${delTempVehData.message}`);
  } else {
    throw new Error(`Failed to delete unreferenced vehicle: ${JSON.stringify(delTempVehData)}`);
  }

  // Test 4: Standalone route creation and deletion
  console.log('\n[TEST 4] Standalone unreferenced route lifecycle:');
  const tempRouteId = `RT-TEMP-${Date.now()}`;
  const createRouteRes = await fetch(`${API_BASE}/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgrToken}`
    },
    body: JSON.stringify({
      routeId: tempRouteId,
      source: 'Salem',
      destination: 'Trichy',
      stops: ['Namakkal'],
      distance: 140,
      baseRate: 2500
    })
  });
  if (!createRouteRes.ok) {
    throw new Error(`Failed to create temp route: ${await createRouteRes.text()}`);
  }
  console.log(`  Created unreferenced route ${tempRouteId}`);

  const delTempRouteRes = await fetch(`${API_BASE}/routes/${tempRouteId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mgrToken}` }
  });
  const delTempRouteData = await delTempRouteRes.json();
  if (delTempRouteRes.ok) {
    console.log(`  ✓ Unreferenced route deleted cleanly: ${delTempRouteData.message}`);
  } else {
    throw new Error(`Failed to delete unreferenced route: ${JSON.stringify(delTempRouteData)}`);
  }

  await mongoose.disconnect();
  console.log('\n=== PHASE 8 VERIFICATION SUCCESSFUL! ALL TESTS PASSED. ===');
}

run().catch(err => {
  console.error('\n❌ PHASE 8 VERIFICATION FAILED:', err);
  process.exit(1);
});
