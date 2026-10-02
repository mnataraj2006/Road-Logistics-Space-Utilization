const BASE_URL = 'http://127.0.0.1:5000/api';

async function req(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function verifyPhase3() {
  console.log('=== PHASE 3 VERIFICATION: RBAC Security on Vehicles & Routes ===');

  // Step 1: Customer login
  console.log('\n[1] Logging in as Customer...');
  const custRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'demo-customer',
      password: 'password123'
    })
  });
  if (!custRes.ok) throw new Error('Customer login failed');
  const custToken = custRes.data.token;
  console.log('Customer logged in successfully.');

  // Step 2: Manager login
  console.log('\n[2] Logging in as Manager...');
  const mgrRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'dev-manager',
      password: 'Manager@2026!'
    })
  });
  if (!mgrRes.ok) throw new Error('Manager login failed');
  const mgrToken = mgrRes.data.token;
  console.log('Manager logged in successfully.');

  const testVehicleId = `TRK-RBAC-${Date.now()}`;
  const testRouteId = `RTE-RBAC-${Date.now()}`;

  // Step 3: Customer attempts to CREATE vehicle
  console.log('\n[3] Testing: Customer attempts POST /api/vehicles...');
  const custCreateVeh = await req(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      vehicleId: testVehicleId,
      type: '32 ft Truck',
      capacityVolume: 80,
      capacityWeight: 15000
    })
  });
  console.log(`Customer POST /api/vehicles returned: HTTP ${custCreateVeh.status}`);
  if (custCreateVeh.status === 403) {
    console.log('SUCCESS! Customer vehicle creation properly blocked with HTTP 403 Forbidden.');
  } else {
    throw new Error(`CRITICAL RBAC FAILURE: Customer was able to create vehicle (HTTP ${custCreateVeh.status})!`);
  }

  // Step 4: Customer attempts to DELETE vehicle
  console.log('\n[4] Testing: Customer attempts DELETE /api/vehicles/TRK-001...');
  const custDeleteVeh = await req(`${BASE_URL}/vehicles/TRK-001`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` }
  });
  console.log(`Customer DELETE /api/vehicles returned: HTTP ${custDeleteVeh.status}`);
  if (custDeleteVeh.status === 403) {
    console.log('SUCCESS! Customer vehicle deletion properly blocked with HTTP 403 Forbidden.');
  } else {
    throw new Error(`CRITICAL RBAC FAILURE: Customer was able to delete vehicle (HTTP ${custDeleteVeh.status})!`);
  }

  // Step 5: Customer attempts to CREATE route
  console.log('\n[5] Testing: Customer attempts POST /api/routes...');
  const custCreateRte = await req(`${BASE_URL}/routes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      routeId: testRouteId,
      source: 'Chennai',
      destination: 'Trichy',
      distance: 330,
      stops: ['Chennai', 'Villupuram', 'Trichy']
    })
  });
  console.log(`Customer POST /api/routes returned: HTTP ${custCreateRte.status}`);
  if (custCreateRte.status === 403) {
    console.log('SUCCESS! Customer route creation properly blocked with HTTP 403 Forbidden.');
  } else {
    throw new Error(`CRITICAL RBAC FAILURE: Customer was able to create route (HTTP ${custCreateRte.status})!`);
  }

  // Step 6: Customer attempts to DELETE route
  console.log('\n[6] Testing: Customer attempts DELETE /api/routes/CHN-BLR-EXP...');
  const custDeleteRte = await req(`${BASE_URL}/routes/CHN-BLR-EXP`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${custToken}` }
  });
  console.log(`Customer DELETE /api/routes returned: HTTP ${custDeleteRte.status}`);
  if (custDeleteRte.status === 403) {
    console.log('SUCCESS! Customer route deletion properly blocked with HTTP 403 Forbidden.');
  } else {
    throw new Error(`CRITICAL RBAC FAILURE: Customer was able to delete route (HTTP ${custDeleteRte.status})!`);
  }

  // Step 7: Manager performs permitted CREATE vehicle
  console.log('\n[7] Testing: Manager creates vehicle...');
  const mgrCreateVeh = await req(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({
      vehicleId: testVehicleId,
      type: '32 ft Truck',
      capacityVolume: 80,
      capacityWeight: 15000,
      dimensions: { length: 9.8, width: 2.45, height: 2.8 }
    })
  });
  if (!mgrCreateVeh.ok) throw new Error(`Manager vehicle creation failed: ${JSON.stringify(mgrCreateVeh.data)}`);
  console.log(`SUCCESS! Manager created vehicle ${testVehicleId} (HTTP ${mgrCreateVeh.status}).`);

  // Step 8: Manager performs permitted CREATE route
  console.log('\n[8] Testing: Manager creates route...');
  const mgrCreateRte = await req(`${BASE_URL}/routes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({
      routeId: testRouteId,
      source: 'Chennai',
      destination: 'Trichy',
      distance: 330,
      baseRate: 150,
      stops: ['Chennai', 'Villupuram', 'Trichy'],
      stopsDetails: [
        { stopId: 'STP-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: `QR-1-${Date.now()}` },
        { stopId: 'STP-2', locationName: 'Villupuram', sequenceNumber: 2, qrToken: `QR-2-${Date.now()}` },
        { stopId: 'STP-3', locationName: 'Trichy', sequenceNumber: 3, qrToken: `QR-3-${Date.now()}` }
      ]
    })
  });
  if (!mgrCreateRte.ok) throw new Error(`Manager route creation failed: ${JSON.stringify(mgrCreateRte.data)}`);
  console.log(`SUCCESS! Manager created route ${testRouteId} (HTTP ${mgrCreateRte.status}).`);

  // Step 9: Cleanup created test vehicle & route via Manager
  console.log('\n[9] Cleaning up test assets via Manager...');
  const delVeh = await req(`${BASE_URL}/vehicles/${testVehicleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${mgrToken}` }
  });
  console.log(`Manager DELETE vehicle returned: HTTP ${delVeh.status}`);

  const delRte = await req(`${BASE_URL}/routes/${testRouteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${mgrToken}` }
  });
  console.log(`Manager DELETE route returned: HTTP ${delRte.status}`);

  console.log('\n>>> PHASE 3 COMPLETE & 100% VERIFIED <<<\n');
}

verifyPhase3().catch(err => {
  console.error('\n*** PHASE 3 VERIFICATION FAILED ***');
  console.error(err.message);
  process.exit(1);
});
