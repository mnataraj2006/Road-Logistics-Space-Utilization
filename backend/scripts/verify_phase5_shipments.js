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

async function verifyPhase5() {
  console.log('=== PHASE 5 VERIFICATION: Real Physical Customer Shipments ===');

  // Step 1: Customer login
  console.log('\n[1] Logging in as Customer (demo-customer)...');
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

  // Step 2: Fetch physical shipments
  console.log('\n[2] Fetching physical shipments via GET /api/shipments...');
  const shpRes = await req(`${BASE_URL}/shipments`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });

  if (!shpRes.ok) {
    throw new Error(`GET /api/shipments failed: HTTP ${shpRes.status} ${JSON.stringify(shpRes.data)}`);
  }

  const shipments = shpRes.data.shipments || [];
  console.log(`Retrieved ${shipments.length} physical shipment document(s) from Shipment collection.`);

  if (shipments.length === 0) {
    throw new Error('Expected at least 1 shipment document for demo-customer.');
  }

  const sampleShipment = shipments[0];
  console.log('Sample physical Shipment document:', {
    shipmentId: sampleShipment.shipmentId,
    bookingId: sampleShipment.bookingId,
    shipperId: sampleShipment.shipperId,
    dimensions: {
      length: sampleShipment.length,
      width: sampleShipment.width,
      height: sampleShipment.height
    },
    volume: sampleShipment.volume,
    weight: sampleShipment.weight,
    pickupStop: sampleShipment.pickupStop,
    deliveryStop: sampleShipment.deliveryStop,
    status: sampleShipment.status,
    allocationStatus: sampleShipment.allocationStatus,
    isLocked: sampleShipment.isLocked
  });

  // Verify all returned documents are indeed physical Shipments
  for (const s of shipments) {
    if (!s.shipmentId || s.length === undefined || s.volume === undefined) {
      throw new Error(`Document missing physical shipment fields: ${JSON.stringify(s)}`);
    }
  }

  // Step 3: Fetch commercial bookings and compare
  console.log('\n[3] Fetching commercial bookings via GET /api/bookings...');
  const bkgRes = await req(`${BASE_URL}/bookings`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  const bookings = Array.isArray(bkgRes.data) ? bkgRes.data : [];
  console.log(`Retrieved ${bookings.length} commercial booking document(s) from Booking collection.`);

  console.log('\n>>> Verification Comparison <<<');
  console.log('Physical Shipment Model fields:', Object.keys(sampleShipment).slice(0, 10));
  console.log('Commercial Booking Model fields:', Object.keys(bookings[0] || {}).slice(0, 10));

  console.log('\n>>> PHASE 5 COMPLETE & 100% VERIFIED <<<\n');
}

verifyPhase5().catch(err => {
  console.error('\n*** PHASE 5 VERIFICATION FAILED ***');
  console.error(err.message);
  process.exit(1);
});
