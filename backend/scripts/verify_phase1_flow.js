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
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}: ${res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function verifyPhase1() {
  console.log('=== PHASE 1 VERIFICATION: Customer Booking -> Manager Candidate -> Optimizer ===');

  // Step 1: Customer login
  console.log('\n[1] Logging in as customer...');
  const custRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'demo-customer',
      password: 'password123'
    })
  });
  const custToken = custRes.token;
  console.log('Customer logged in successfully:', custRes.username);

  // Step 2: Search capacity on Chennai -> Bangalore
  console.log('\n[2] Searching capacity...');
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  const searchRes = await req(`${BASE_URL}/capacity/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: targetDateStr,
      volume: 1.5,
      weight: 350
    })
  });

  const results = searchRes.results || [];
  console.log(`Found ${results.length} available truck(s) with sufficient capacity.`);
  if (results.length === 0) {
    throw new Error('No available trucks found in capacity search.');
  }

  const selectedTruck = results[0];
  console.log(`Selected truck: ${selectedTruck.vehicleId}, Route: ${selectedTruck.routeId}`);

  // Step 3: Book truck capacity
  console.log('\n[3] Booking truck capacity...');
  const bookRes = await req(`${BASE_URL}/capacity/book`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      vehicleId: selectedTruck.vehicleId,
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: targetDateStr,
      volume: 1.5,
      weight: 350,
      length: 1.5,
      width: 1.0,
      height: 1.0,
      cargoDescription: 'Phase 1 Verification Electronics'
    })
  });

  console.log('Booking response:', bookRes);
  const { bookingId, shipmentId } = bookRes;
  console.log(`Created Booking: ${bookingId}, Shipment: ${shipmentId}`);

  // Step 4: Login as manager
  console.log('\n[4] Logging in as logistics manager...');
  const mgrRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'dev-manager',
      password: 'Manager@2026!'
    })
  });
  const mgrToken = mgrRes.token;
  console.log('Manager logged in successfully:', mgrRes.username);

  // Step 5: Find manager trips
  console.log('\n[5] Fetching manager trips...');
  const trips = await req(`${BASE_URL}/trips`, {
    headers: { Authorization: `Bearer ${mgrToken}` }
  });
  console.log(`Found ${trips.length} trip(s).`);

  let targetTrip = trips.find(t => 
    ['PLANNED', 'READY_FOR_DISPATCH'].includes(t.status) &&
    (t.route?.routeId === selectedTruck.routeId || t.routeId === selectedTruck.routeId || t.vehicleId === selectedTruck.vehicleId)
  );

  if (!targetTrip) {
    console.log('No existing PLANNED trip found. Creating a PLANNED trip for truck and route...');
    const newTripRes = await req(`${BASE_URL}/trips`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mgrToken}` },
      body: JSON.stringify({
        vehicleId: selectedTruck.vehicleId,
        routeId: selectedTruck.route.routeId,
        plannedDeparture: new Date(Date.now() + 86400000).toISOString()
      })
    });
    targetTrip = newTripRes.trip || newTripRes;
    console.log(`Created new PLANNED trip: ${targetTrip.tripId}`);
  }

  console.log(`Testing with Trip: ${targetTrip.tripId} (Route: ${targetTrip.routeId || targetTrip.route?.routeId}, Status: ${targetTrip.status})`);

  // Step 6: Fetch candidate shipments for the trip
  console.log('\n[6] Fetching candidate shipments for trip...');
  const candRes = await req(`${BASE_URL}/trips/${targetTrip.tripId}/candidates`, {
    headers: { Authorization: `Bearer ${mgrToken}` }
  });

  const candidates = candRes.candidates || candRes.candidateShipments || [];
  console.log(`Total candidate shipments found: ${candidates.length}`);
  
  const foundShipment = candidates.find(c => c.shipmentId === shipmentId);
  if (!foundShipment) {
    console.error('Candidate shipment IDs:', candidates.map(c => c.shipmentId));
    throw new Error(`CRITICAL FAILURE: Booked shipment ${shipmentId} NOT found in candidate list for Trip ${targetTrip.tripId}!`);
  }

  console.log('SUCCESS! Found booked shipment in manager candidates:', {
    shipmentId: foundShipment.shipmentId,
    pickup: foundShipment.pickup,
    delivery: foundShipment.delivery,
    volume: foundShipment.volume,
    weight: foundShipment.weight,
    dimensions: foundShipment.dimensions
  });

  // Step 7: Run optimizer preview with this shipment
  console.log('\n[7] Running 3D optimizer preview on Trip with candidate shipment...');
  const optRes = await req(`${BASE_URL}/trips/${targetTrip.tripId}/optimize/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({
      selectedShipmentIds: [shipmentId]
    })
  });

  const optData = optRes.optimizationResult || optRes.loadPlan || optRes;
  console.log('Optimizer Result Status: SUCCESS');
  console.log('Assignments count:', optData.assignments?.length || 0);

  const placedItem = (optData.assignments || []).find(a => a.shipmentId === shipmentId);
  if (!placedItem) {
    console.error('Unassigned shipments:', optData.unassignedShipments);
    throw new Error(`Optimizer rejected placement of shipment ${shipmentId}`);
  }

  console.log('SUCCESS! Shipment successfully placed in 3D trailer space by optimizer:');
  console.log({
    shipmentId: placedItem.shipmentId,
    position: placedItem.position,
    dimensions: placedItem.dimensions || { dx: placedItem.dx, dy: placedItem.dy, dz: placedItem.dz },
    orientation: placedItem.orientation
  });

  console.log('\n>>> PHASE 1 COMPLETE & 100% VERIFIED <<<\n');
}

verifyPhase1().catch(err => {
  console.error('\n*** PHASE 1 VERIFICATION FAILED ***');
  console.error(err.data || err.message);
  process.exit(1);
});
